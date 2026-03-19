"""
Cover Regulatory Engine — FastAPI application.
Main entry point for the backend API.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.services.pipeline import assess_address
from backend.services.config import JURISDICTIONS, SETTINGS
from backend.services.llm_service import enrich_assessment
from backend.services.chat_service import stream_chat_response
from backend.services.feedback_service import save_feedback, get_feedback_stats
from backend.services.http_client import close_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

# Load LAMC chunks at startup
_LAMC_CHUNKS: dict = {}
_lamc_path = Path(__file__).parent / "data" / "lamc_chunks.json"
if _lamc_path.exists():
    _LAMC_CHUNKS = json.loads(_lamc_path.read_text())
    logger.info("Loaded %d LAMC chunks", len(_LAMC_CHUNKS))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Cover Regulatory Engine starting up")
    yield
    logger.info("Shutting down — closing HTTP client")
    await close_client()


app = FastAPI(
    title="Cover Regulatory Engine",
    description=(
        "For a given residential parcel in LA City, "
        "what can I confidently build — and why?"
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — driven by CORS_ORIGINS env var (comma-separated) or defaults to localhost
_cors_origins = [o.strip() for o in SETTINGS.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class AssessRequest(BaseModel):
    address: str
    building_type: Optional[str] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    target_sqft: Optional[int] = None


class HealthResponse(BaseModel):
    status: str
    version: str


class FeedbackRequest(BaseModel):
    address: str
    finding_type: str
    vote: Literal["up", "down"]
    comment: Optional[str] = None


class ChatRequest(BaseModel):
    question: str
    assessment_context: dict
    history: Optional[list[dict]] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", version="0.1.0")


@app.get("/health/deep")
async def health_deep():
    """Deep health check — tests upstream API connectivity."""
    import httpx
    checks = {}
    async with httpx.AsyncClient(timeout=5) as client:
        for name, url in [
            ("geocoder", "https://maps.lacity.org/lahub/rest/services/centerlineLocator/GeocodeServer?f=json"),
            ("parcel", "https://public.gis.lacounty.gov/public/rest/services/LACounty_Cache/LACounty_Parcel/MapServer/0?f=json"),
        ]:
            try:
                r = await client.get(url)
                checks[name] = "ok" if r.status_code == 200 else f"status_{r.status_code}"
            except Exception as e:
                checks[name] = f"error: {type(e).__name__}"
    checks["llm"] = "configured" if SETTINGS.ANTHROPIC_API_KEY else "not_configured"
    checks["lamc_chunks"] = f"{len(_LAMC_CHUNKS)} loaded"
    all_ok = all(v == "ok" for k, v in checks.items() if k not in ("llm", "lamc_chunks"))
    return {"status": "ok" if all_ok else "degraded", "checks": checks}


@app.post("/api/assess")
async def assess(request: AssessRequest):
    """
    Main endpoint: Address → BuildabilityAssessment.

    Returns structured findings with confidence scores, LAMC citations,
    setback geometry, and ADU feasibility — all with evidence trail.
    """
    addr = request.address.strip() if request.address else ""
    if len(addr) < 5 or len(addr) > 200:
        raise HTTPException(status_code=400, detail="Please provide a valid street address (5-200 characters).")
    if not re.match(r'^[a-zA-Z0-9\s,.#\'-]+$', addr):
        raise HTTPException(status_code=400, detail="Address contains invalid characters.")

    logger.info("Assessment requested for: %s", addr)

    try:
        result = await asyncio.wait_for(
            assess_address(addr, target_sqft=request.target_sqft),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        logger.error("Pipeline timeout after 45s for: %s", addr)
        raise HTTPException(
            status_code=504,
            detail="Assessment timed out — external data sources may be slow. Please try again.",
        )

    if not result.success:
        raise HTTPException(
            status_code=422,
            detail={
                "failed_step": result.failed_step,
                "message": result.error_message,
            },
        )

    # Enrich with LLM if available (with timeout so it doesn't block response)
    if result.assessment:
        try:
            enrichment = await asyncio.wait_for(enrich_assessment(result.assessment), timeout=15.0)
        except asyncio.TimeoutError:
            logger.warning("LLM enrichment timed out for %s — returning without summaries", addr)
            enrichment = None
        if enrichment:
            for bta in result.assessment.assessments:
                bt = bta.building_type.value.lower()
                summary_key = f"{bt}_summary"
                if summary_key in enrichment:
                    bta.summary = enrichment[summary_key]
            # Wire through additional enrichment fields
            if "overall_recommendation" in enrichment:
                result.assessment.overall_recommendation = enrichment["overall_recommendation"]
            if "edge_cases" in enrichment:
                result.assessment.edge_cases = enrichment["edge_cases"]

    return result.assessment


@app.get("/api/lamc-chunks")
async def lamc_chunks(sections: Optional[str] = None):
    """
    Return LAMC text chunks for regulatory reasoning display.
    Optional: ?sections=12.08.C.2,12.08.C.3 to filter.
    """
    if sections:
        keys = [s.strip() for s in sections.split(",")]
        return {k: v for k, v in _LAMC_CHUNKS.items() if k in keys}
    return _LAMC_CHUNKS


@app.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest):
    """Store user feedback on individual findings."""
    row_id = await save_feedback(
        address=request.address,
        finding_type=request.finding_type,
        vote=request.vote,
        comment=request.comment,
    )
    return {"id": row_id, "status": "saved"}


@app.get("/api/feedback/stats")
async def feedback_stats():
    """Return aggregate feedback statistics."""
    return await get_feedback_stats()


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Conversational follow-up about assessment results.
    Returns SSE stream of Claude responses grounded in the assessment.
    Includes input validation and content guardrails.
    """
    # Input validation
    if not request.question or len(request.question.strip()) < 2:
        raise HTTPException(status_code=400, detail="Please provide a question.")
    if len(request.question) > 2000:
        raise HTTPException(status_code=400, detail="Question too long. Please keep under 2000 characters.")
    if not request.assessment_context:
        raise HTTPException(status_code=400, detail="Assessment context is required for grounded responses.")

    return StreamingResponse(
        stream_chat_response(
            question=request.question.strip(),
            assessment_context=request.assessment_context,
            history=request.history,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/jurisdictions")
async def jurisdictions():
    """Return supported and planned jurisdictions with their status."""
    return [
        {
            "id": jid,
            "name": j.name,
            "status": j.status,
            "supported_zones": j.supported_zones,
            "has_zoning": bool(j.zoning),
            "has_parcel": bool(j.parcel),
        }
        for jid, j in JURISDICTIONS.items()
    ]


@app.get("/api/demo-addresses")
async def demo_addresses():
    """
    Return suggested demo addresses for testing.
    Each showcases a different engine capability.
    """
    return [
        {
            "address": "5432 Coliseum St Los Angeles CA 90016",
            "scenario": "Standard R1-1",
            "expected": "Full setbacks, RFAR, height, buildable envelope. All HIGH confidence.",
        },
        {
            "address": "1234 S Norton Ave Los Angeles CA 90019",
            "scenario": "HPOZ Overlay (R3)",
            "expected": "Historic preservation overlay detected. Review required.",
        },
        {
            "address": "1000 Vine St Los Angeles CA 90038",
            "scenario": "Near transit (potential TOC)",
            "expected": "May detect TOC tier. ADU height bumped to 18ft if near transit.",
        },
        {
            "address": "2800 Woodstock Rd Los Angeles CA 90046",
            "scenario": "Hillside area",
            "expected": "Hillside flag. All numeric standards NOT_EVALUATED.",
        },
        {
            "address": "232 N Crescent Dr Beverly Hills CA 90210",
            "scenario": "Outside city limits",
            "expected": "Outside LA City. Pipeline stops at boundary check.",
        },
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
