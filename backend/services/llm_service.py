"""
LLM synthesis layer — Claude enriches structured findings with
plain-English summaries, edge case flags, and cited explanations.

Architecture: Hybrid, not LLM-first. The LLM NEVER contradicts or
overrides the rule engine. It only enriches and explains.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from backend.models.entities import BuildabilityAssessment
from .config import SETTINGS

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> Optional[dict]:
    """
    Extract a JSON object from LLM output that may contain markdown fences
    or surrounding prose.

    Handles:
    - ```json ... ``` fenced blocks
    - ``` ... ``` fenced blocks (no language tag)
    - Raw JSON with leading/trailing text
    - Plain JSON with no wrapper
    """
    # 1. Try stripping markdown code fences (```json ... ``` or ``` ... ```)
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if fence_match:
        candidate = fence_match.group(1).strip()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # 2. Try parsing the whole text directly
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # 3. Try to find the first { ... } block (greedy match for outermost braces)
    brace_match = re.search(r"\{.*\}", text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    # All attempts failed
    return None


SYSTEM_PROMPT = """You are an LA zoning code expert. You receive structured regulatory findings
produced by a deterministic rule engine, plus supporting LAMC text. Your job:

1. Produce a plain-English summary per building type (SFR, ADU)
2. Flag any edge cases in the findings that warrant architect review
3. Explain any NOT_EVALUATED items and what the architect needs to check
4. NEVER contradict or override the rule engine findings
5. Every claim must cite the specific LAMC section or finding source

Respond in JSON matching this schema:
{
  "sfr_summary": "Plain-English summary of what can be built (SFR)",
  "adu_summary": "Plain-English summary of ADU feasibility",
  "edge_cases": ["List of edge cases requiring architect review"],
  "not_evaluated_explanations": [
    {"item": "name", "explanation": "what architect needs to check", "reference": "LAMC §..."}
  ],
  "overall_recommendation": "1-2 sentence overall recommendation"
}

Be concise, professional, and always cite specific LAMC sections or state law references."""


async def enrich_assessment(
    assessment: BuildabilityAssessment,
) -> Optional[dict]:
    """
    Call Claude to produce plain-English enrichment of the assessment.

    Returns enrichment dict or None if LLM is unavailable/fails.
    """
    if not SETTINGS.ANTHROPIC_API_KEY:
        logger.warning("No ANTHROPIC_API_KEY — skipping LLM enrichment")
        return None

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=SETTINGS.ANTHROPIC_API_KEY)

        # Build context for the LLM
        context = _build_llm_context(assessment)

        response = await client.messages.create(
            model=SETTINGS.LLM_MODEL,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(context, default=str)}],
        )

        # Parse JSON response
        if not response.content:
            logger.warning("LLM returned empty response")
            return None
        text = response.content[0].text

        enrichment = _extract_json(text)
        if enrichment is None:
            logger.warning(
                "LLM returned unparseable response (first 200 chars): %s",
                text[:200],
            )
            return None

        logger.info("LLM enrichment successful")
        return enrichment

    except Exception as e:
        logger.error("LLM enrichment failed: %s", e)
        return None


def _build_llm_context(assessment: BuildabilityAssessment) -> dict:
    """Build the context payload for the LLM call."""
    context = {
        "address": assessment.address,
        "parcel": {},
        "zoning": {},
        "findings_by_type": {},
        "overlay_flags": {},
    }

    if assessment.parcel:
        context["parcel"] = {
            "apn": assessment.parcel.apn,
            "lot_area_sqft": assessment.parcel.lot_area_sqft,
        }

    if assessment.zoning:
        context["zoning"] = {
            "zoning_string": assessment.zoning.zoning_string,
            "category": assessment.zoning.category,
        }
        if assessment.zoning.zone_components:
            context["zoning"]["base_zone"] = assessment.zoning.zone_components.base_zone
            context["zoning"]["height_district"] = assessment.zoning.zone_components.height_district
            context["zoning"]["hillside"] = assessment.zoning.zone_components.hillside

    for bta in assessment.assessments:
        findings_list = []
        for f in bta.findings:
            findings_list.append({
                "type": f.finding_type,
                "value": f.value if not isinstance(f.value, dict) else "[geometry]",
                "unit": f.unit,
                "method": f.method.value,
                "confidence": f.confidence,
                "reason": f.reason,
                "citations": [e.source_locator for e in f.evidence],
            })
        context["findings_by_type"][bta.building_type.value] = {
            "verdict": bta.verdict.value,
            "findings": findings_list,
        }

    context["overlay_flags"] = assessment.overlay_flags.model_dump()

    return context
