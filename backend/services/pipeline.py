"""
Pipeline orchestrator — the main entry point.
Address → Geocode → Boundary → Parcel → Zoning → Rules → ADU → Geometry → Assessment.

On any step failure: returns partial result with failed_step + reason.
Logs every outbound HTTP call for evidence trail.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from backend.models.entities import (
    BuildabilityAssessment,
    JurisdictionObservation,
    OverlayFlags,
    PipelineResult,
)
from .config import ENDPOINTS
from .geocoder import geocode_with_fallback
from .boundary_service import check_city_boundary
from .parcel_service import lookup_parcel
from .zoning_service import lookup_zoning
from .zone_parser import is_in_scope, is_residential
from .rule_engine import get_base_standards, detect_overlays, get_overlay_findings
from .toc_service import detect_toc_tier
from .adu_engine import assess_adu_feasibility
from .geometry_engine import compute_lot_area_sqft, get_envelope_finding
from .assessment import assemble_assessment

logger = logging.getLogger(__name__)

# Simple TTL cache for assessment results (avoids re-hitting GIS APIs for same address)
_cache: dict[str, tuple[float, PipelineResult]] = {}
_CACHE_TTL = 3600  # 1 hour
_CACHE_MAX = 100   # max cached assessments


def _cache_key(address: str, target_sqft: Optional[float]) -> str:
    return f"{address.strip().lower()}|{target_sqft or ''}"


def _tick() -> float:
    """Return a monotonic timestamp for timing."""
    return time.monotonic()


def _tock(t0: float) -> int:
    """Return elapsed ms since t0."""
    return round((_tick() - t0) * 1000)


async def assess_address(address: str, *, target_sqft: Optional[float] = None) -> PipelineResult:
    """
    Full pipeline: address string → BuildabilityAssessment.

    Steps run in sequence (each depends on the previous):
    1. Geocode address → (lat, lon)
    2. Check city boundary → inside/outside
    3. Lookup parcel → ParcelObservation
    4. Lookup zoning → ZoningObservation
    5. Run rule engine → SFR findings
    6. Detect overlays → overlay flags + findings
    7. Compute geometry → buildable envelope
    8. Run ADU engine → ADU findings
    9. Assemble → BuildabilityAssessment
    """
    # Check cache first
    ck = _cache_key(address, target_sqft)
    if ck in _cache:
        cached_time, cached_result = _cache[ck]
        if time.monotonic() - cached_time < _CACHE_TTL:
            logger.info("Cache hit for: %s", address)
            return cached_result
        else:
            del _cache[ck]

    pipeline_start = _tick()
    errors: list[dict] = []
    timing: dict[str, int] = {}

    # --- Step 1: Geocode ---
    t0 = _tick()
    try:
        geocode = await geocode_with_fallback(address)
        lat, lon = geocode.latitude, geocode.longitude
        timing["geocode"] = _tock(t0)
        logger.info(
            "Geocoded '%s' → (%.6f, %.6f) score=%.0f source=%s",
            address, lat, lon, geocode.match_score, geocode.source,
        )
    except Exception as e:
        timing["geocode"] = _tock(t0)
        return PipelineResult(
            success=False, failed_step="geocode", error_message=str(e),
        )

    # --- Step 2: City boundary check ---
    t0 = _tick()
    try:
        jurisdiction = await check_city_boundary(lat, lon)
        timing["boundary"] = _tock(t0)
        if not jurisdiction.inside_city_boundary:
            assessment = BuildabilityAssessment(
                address=address,
                jurisdiction=jurisdiction,
                pipeline_errors=[{
                    "step": "boundary",
                    "message": "Parcel is outside LA City limits. Zoning data not available.",
                }],
            )
            return PipelineResult(success=True, assessment=assessment)
    except Exception as e:
        timing["boundary"] = _tock(t0)
        logger.warning("Boundary check failed: %s — proceeding anyway", e)
        jurisdiction = None
        errors.append({"step": "boundary", "message": str(e)})

    # --- Step 3: Parcel lookup ---
    t0 = _tick()
    try:
        parcel = await lookup_parcel(lat, lon)
        timing["parcel"] = _tock(t0)
    except Exception as e:
        timing["parcel"] = _tock(t0)
        logger.warning("Parcel lookup failed: %s — continuing with degraded data", e)
        # Create a minimal parcel so the pipeline can continue
        from backend.models.entities import ParcelObservation
        parcel = ParcelObservation(
            source_url=ENDPOINTS.PARCEL,
            situs_full_address=address,
        )
        errors.append({"step": "parcel_lookup", "message": str(e)})

    # Compute lot area from geometry if not in attributes
    lot_area = parcel.lot_area_sqft
    if lot_area is None and parcel.geometry:
        lot_area = compute_lot_area_sqft(parcel.geometry)
        if lot_area:
            parcel.lot_area_sqft = lot_area
            logger.info("Computed lot area from geometry: %.0f sqft", lot_area)

    # --- Step 4: Zoning lookup ---
    t0 = _tick()
    try:
        zoning = await lookup_zoning(lat, lon)
        timing["zoning"] = _tock(t0)
    except Exception as e:
        timing["zoning"] = _tock(t0)
        logger.warning("Zoning lookup failed: %s — continuing with unknown zone", e)
        from backend.models.entities import ZoningObservation
        from .zone_parser import parse_zone_string
        zoning = ZoningObservation(
            zoning_string="UNKNOWN",
            category="Unknown",
            zone_components=parse_zone_string("UNKNOWN"),
            source_url=ENDPOINTS.ZONING,
        )
        errors.append({"step": "zoning_lookup", "message": str(e)})

    zone = zoning.zone_components
    if zone is None:
        # Parse failed — create minimal components so pipeline can proceed
        from .zone_parser import parse_zone_string
        zone = parse_zone_string(zoning.zoning_string)
        zoning.zone_components = zone

    # Guard: detect zone parse failure and flag the assessment
    if (
        zone.base_zone in ("PARSE_FAILED", "UNKNOWN", "")
        or "PARSE_FAILED" in (zone.suffix_flags or [])
    ):
        logger.warning(
            "Zone parsing failed or produced unusable result for '%s' — "
            "assessment will be degraded",
            zoning.zoning_string,
        )
        errors.append({
            "step": "zone_parse",
            "message": f"Could not parse zone string '{zoning.zoning_string}' into "
                       f"usable components (base_zone={zone.base_zone}). "
                       f"Assessment findings may be incomplete.",
        })

    # --- Step 5: Rule engine ---
    t0 = _tick()
    sfr_findings = get_base_standards(zone, lot_area)
    timing["rules"] = _tock(t0)

    # --- Step 6: Overlay detection ---
    t0 = _tick()
    overlay_flags = detect_overlays(zone)

    # TOC tier lookup (non-blocking — returns None on failure)
    toc_tier = await detect_toc_tier(lat, lon)
    if toc_tier is not None:
        overlay_flags.toc_tier = toc_tier
        # Remove "toc" from unscreened list since we successfully checked it
        if "toc" in overlay_flags.unscreened_overlays:
            overlay_flags.unscreened_overlays.remove("toc")

    overlay_findings = get_overlay_findings(overlay_flags)
    timing["overlays"] = _tock(t0)

    # --- Step 7: Geometry (buildable envelope) ---
    t0 = _tick()
    buildable_envelope = None
    envelope_area_sqft = None
    if parcel.geometry:
        # Try to extract setbacks from SFR findings (R1/R2 zones)
        setbacks = _extract_setbacks(sfr_findings)
        using_defaults = False

        # For non-R1/R2 zones, skip envelope generation — the engine
        # did not model these zones so producing geometry would overstate
        # certainty. The frontend handles the "no envelope" case gracefully.

        if setbacks:
            envelope_finding = get_envelope_finding(
                parcel.geometry, setbacks, is_default_setbacks=using_defaults,
            )
            sfr_findings.append(envelope_finding)
            if envelope_finding.value:
                buildable_envelope = envelope_finding.value
                envelope_area_sqft = (
                    envelope_finding.value.get("properties", {}).get("envelope_area_sqft")
                )
                # Flag approximate envelopes so the frontend can display a warning
                if using_defaults and "properties" in buildable_envelope:
                    buildable_envelope["properties"]["is_approximate"] = True
    timing["geometry"] = _tock(t0)

    # --- Step 8: ADU engine ---
    t0 = _tick()
    adu_findings = assess_adu_feasibility(
        zone,
        lot_area,
        overlay_flags,
        envelope_area_sqft=envelope_area_sqft,
        target_sqft=target_sqft,
    )
    timing["adu"] = _tock(t0)

    # --- Step 9: Assemble ---
    t0 = _tick()
    assessment = assemble_assessment(
        address=address,
        parcel=parcel,
        zoning=zoning,
        jurisdiction=jurisdiction,
        sfr_findings=sfr_findings,
        adu_findings=adu_findings,
        overlay_findings=overlay_findings,
        overlay_flags=overlay_flags,
        buildable_envelope=buildable_envelope,
    )
    assessment.pipeline_errors = errors
    timing["assembly"] = _tock(t0)
    timing["total"] = _tock(pipeline_start)
    assessment.pipeline_timing = timing

    logger.info(
        "Pipeline complete for '%s' in %dms — steps: %s",
        address, timing["total"],
        ", ".join(f"{k}={v}ms" for k, v in timing.items() if k != "total"),
    )

    result = PipelineResult(success=True, assessment=assessment)

    # Store in cache (evict oldest if at capacity)
    if len(_cache) >= _CACHE_MAX:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    _cache[ck] = (time.monotonic(), result)

    return result


def _default_setbacks_for_zone(zone) -> Optional[dict]:
    """
    Return conservative default setbacks for zones outside R1/R2 scope.
    These are approximate minimums so we can still produce a buildable
    envelope visualization. The finding will note these are defaults.
    """
    base = zone.base_zone
    if base in ("R3", "R4", "R5"):
        # Multi-family residential — LAMC typical minimums
        return {"front": 15, "side": 5, "rear": 15}
    if base.startswith("RD"):
        return {"front": 20, "side": 5, "rear": 15}
    if base in ("RS", "RE", "RA"):
        return {"front": 25, "side": 10, "rear": 25}
    if base in ("C1", "C1.5", "C2", "C4", "CR"):
        # Commercial zones that allow residential — no required setback
        # from street, but side/rear if abutting residential
        return {"front": 10, "side": 5, "rear": 15}
    if base in ("C5", "CM", "CW", "M1", "M2", "M3"):
        # Commercial/industrial — minimal setbacks
        return {"front": 5, "side": 0, "rear": 0}
    if base in ("PF", "PB", "OS"):
        # Public/parking/open space — use residential defaults
        return {"front": 15, "side": 5, "rear": 15}
    if base in ("A1", "A2"):
        return {"front": 25, "side": 10, "rear": 25}
    # Unknown zone — use conservative residential defaults
    return {"front": 20, "side": 5, "rear": 15}


def _extract_setbacks(findings: list) -> Optional[dict]:
    """Extract setback values from findings for geometry computation."""
    setbacks = {}
    for f in findings:
        if f.finding_type == "front_setback" and f.value is not None:
            setbacks["front"] = f.value
        elif f.finding_type == "interior_side_setback" and f.value is not None:
            setbacks["side"] = f.value
        elif f.finding_type == "rear_setback" and f.value is not None:
            setbacks["rear"] = f.value

    if len(setbacks) >= 3:
        return setbacks
    return None
