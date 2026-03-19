"""
Core data entities for Cover Regulatory Engine.
Names match Cover's PRD exactly: ParcelObservation, ZoningObservation, etc.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, computed_field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    NOT_EVALUATED = "NOT_EVALUATED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


class FindingMethod(str, Enum):
    LOOKUP = "lookup"
    CALCULATION = "calculation"
    LLM_SYNTHESIS = "llm_synthesis"
    NOT_EVALUATED = "not_evaluated"


class BuildingType(str, Enum):
    SFR = "SFR"          # Single Family Residential
    ADU = "ADU"          # Accessory Dwelling Unit
    GUEST_HOUSE = "GUEST_HOUSE"


class Verdict(str, Enum):
    ALLOWED = "ALLOWED"
    FLAGGED = "FLAGGED"
    NOT_EVALUATED = "NOT_EVALUATED"


# ---------------------------------------------------------------------------
# Observation entities (raw data from APIs)
# ---------------------------------------------------------------------------

class ParcelObservation(BaseModel):
    """Raw parcel data from LA County Parcel MapServer/0."""
    ain: Optional[str] = None
    apn: Optional[str] = None
    situs_full_address: Optional[str] = None
    lot_area_sqft: Optional[float] = None
    geometry: Optional[dict] = None  # GeoJSON
    source_url: str
    retrieval_ts: datetime = Field(default_factory=datetime.utcnow)
    raw_response_hash: Optional[str] = None

    def compute_hash(self, raw_response: dict) -> str:
        h = hashlib.sha256(
            json.dumps(raw_response, sort_keys=True).encode()
        ).hexdigest()
        self.raw_response_hash = h
        return h


class ZoningObservation(BaseModel):
    """Raw zoning data from City Planning Zoning FeatureServer/15."""
    zoning_string: str              # e.g. "R1-1", "R2-1", "R1H-1"
    category: Optional[str] = None
    zone_components: Optional[ZoneComponents] = None
    source_url: str
    retrieval_ts: datetime = Field(default_factory=datetime.utcnow)


class JurisdictionObservation(BaseModel):
    """Result of city boundary check from Boundaries MapServer/7."""
    inside_city_boundary: bool
    source_url: str
    retrieval_ts: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Zone string parser output
# ---------------------------------------------------------------------------

class ZoneComponents(BaseModel):
    """Parsed components of an LA zoning string."""
    raw: str                                    # Original string, e.g. "R1-1"
    base_zone: str                              # R1, R2, C1, etc.
    height_district: Optional[str] = None       # 1, 1L, 1VL, 1XL, 2, 3, 4
    hillside: bool = False                      # -H suffix
    variation: Optional[str] = None             # V, V2, F, R, H (R1 variations)
    suffix_flags: list[str] = Field(default_factory=list)  # Other suffixes


# Fix forward reference
ZoningObservation.model_rebuild()


# ---------------------------------------------------------------------------
# Evidence & findings (rule engine output)
# ---------------------------------------------------------------------------

class Evidence(BaseModel):
    """Audit trail item attached to every RegulatoryFinding."""
    source_type: str                 # "gis_layer", "pdf_table", "lamc_section", "state_law"
    source_locator: str              # URL + layer ID, or PDF page, or LAMC section
    retrieval_ts: Optional[datetime] = None
    excerpt_pointer: Optional[str] = None  # Brief description of what was used


class RegulatoryFinding(BaseModel):
    """Single regulatory constraint or determination."""
    finding_type: str                # e.g. "front_setback", "max_height", "rfar", "adu_feasible"
    value: Any                       # Numeric, bool, GeoJSON, etc.
    unit: Optional[str] = None       # "ft", "sqft", "stories", "percent", etc.
    rule_id: Optional[str] = None    # Key into rule_fragments.json
    method: FindingMethod
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = 0.0          # 0.0 to 1.0
    assumptions: list[str] = Field(default_factory=list)
    reason: Optional[str] = None     # For not_evaluated findings

    @computed_field
    @property
    def confidence_level(self) -> ConfidenceLevel:
        if self.method == FindingMethod.NOT_EVALUATED:
            return ConfidenceLevel.NOT_EVALUATED
        if self.confidence >= 0.95:
            return ConfidenceLevel.HIGH
        if self.confidence >= 0.80:
            return ConfidenceLevel.MEDIUM
        return ConfidenceLevel.REVIEW_REQUIRED


# ---------------------------------------------------------------------------
# Overlay flags
# ---------------------------------------------------------------------------

class OverlayFlags(BaseModel):
    """Detected overlay conditions — flagged, not computed in week 1."""
    hillside: bool = False
    hpoz: bool = False
    toc_tier: Optional[int] = None   # 1-4, or None
    coastal: bool = False
    fire_zone_1: bool = False
    fault_zone: bool = False
    specific_plan: Optional[str] = None
    unscreened_overlays: list[str] = Field(
        default_factory=lambda: ["coastal", "fire_zone_1", "fault_zone"],
        description="Overlays that were NOT actually checked — frontend should not show these as clear.",
    )


# ---------------------------------------------------------------------------
# Assessment (assembled response)
# ---------------------------------------------------------------------------

class BuildingTypeAssessment(BaseModel):
    """Assessment for a single building type (SFR, ADU, etc.)."""
    building_type: BuildingType
    verdict: Verdict
    findings: list[RegulatoryFinding] = Field(default_factory=list)
    overlay_warnings: list[str] = Field(default_factory=list)
    summary: Optional[str] = None  # Plain-English from LLM

    @computed_field
    @property
    def composite_confidence(self) -> float:
        evaluated = [
            f.confidence for f in self.findings
            if f.method != FindingMethod.NOT_EVALUATED
        ]
        return min(evaluated) if evaluated else 0.0


class BuildabilityAssessment(BaseModel):
    """Top-level assessment for a parcel — the main API response."""
    address: str
    parcel: Optional[ParcelObservation] = None
    zoning: Optional[ZoningObservation] = None
    jurisdiction: Optional[JurisdictionObservation] = None
    overlay_flags: OverlayFlags = Field(default_factory=OverlayFlags)
    assessments: list[BuildingTypeAssessment] = Field(default_factory=list)
    buildable_envelope: Optional[dict] = None  # GeoJSON
    citations: list[Evidence] = Field(default_factory=list)
    pipeline_errors: list[dict] = Field(default_factory=list)
    overall_recommendation: Optional[str] = None
    edge_cases: list[str] = Field(default_factory=list)
    pipeline_timing: dict[str, float] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Pipeline types
# ---------------------------------------------------------------------------

class GeocodeResult(BaseModel):
    """Output of geocoder service."""
    latitude: float
    longitude: float
    match_score: float
    address_normalized: str
    source: str = "city_centerline"


class PipelineResult(BaseModel):
    """Full pipeline output — wraps everything."""
    success: bool
    assessment: Optional[BuildabilityAssessment] = None
    failed_step: Optional[str] = None
    error_message: Optional[str] = None
