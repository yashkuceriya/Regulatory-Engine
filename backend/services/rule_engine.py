"""
Deterministic rule engine — CP-7150 lookup + LAMC citations.
Zone string + lot area → RegulatoryFinding[] with confidence scores.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from backend.models.entities import (
    BuildingType,
    Evidence,
    FindingMethod,
    OverlayFlags,
    RegulatoryFinding,
    ZoneComponents,
)

logger = logging.getLogger(__name__)

# Load rule data at module level
_DATA_DIR = Path(__file__).parent.parent / "data"


def _load_json(filename: str) -> dict:
    with open(_DATA_DIR / filename) as f:
        return json.load(f)


RULE_FRAGMENTS = _load_json("rule_fragments.json")
ADU_RULES = _load_json("adu_rules.json")


# ---------------------------------------------------------------------------
# Base standards engine
# ---------------------------------------------------------------------------

def get_base_standards(
    zone: ZoneComponents,
    lot_area_sqft: Optional[float],
) -> list[RegulatoryFinding]:
    """
    Look up base zone standards from CP-7150 rule fragments.

    For R1: setbacks, height, RFAR (with lot area threshold).
    For R2: setbacks, height, FAR.
    For non-R1/R2: returns not_evaluated.
    """
    base = zone.base_zone

    if base not in RULE_FRAGMENTS:
        return _out_of_scope_findings(zone, lot_area_sqft)

    # Check for variation zones — flag, don't compute
    if zone.variation and zone.variation in ("V", "V1", "V2", "V3", "F", "R"):
        return [RegulatoryFinding(
            finding_type="base_standards",
            value=None,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=f"r1_variation_zone_not_modeled: {zone.raw} has variation {zone.variation}",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator=f"LAMC §12.08 C.5(b)-(d) — {zone.variation} variation",
            )],
        )]

    # Check hillside — completely different rules
    if zone.hillside:
        return [RegulatoryFinding(
            finding_type="base_standards",
            value=None,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="hillside_not_checked: Hillside zones have completely different FAR, height, and setback rules",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC §12.21 C.10 — Baseline Hillside Ordinance",
            )],
        )]

    rules = RULE_FRAGMENTS[base]
    findings: list[RegulatoryFinding] = []
    lamc = rules["lamc_section"]

    # Front setback
    findings.append(RegulatoryFinding(
        finding_type="front_setback",
        value=rules["front_setback_ft"],
        unit="ft",
        rule_id=f"{base}.front_setback",
        method=FindingMethod.LOOKUP,
        confidence=0.85,
        evidence=[
            Evidence(
                source_type="pdf_table",
                source_locator="CP-7150 Table 1a — Front Yard Setback",
            ),
            Evidence(
                source_type="lamc_section",
                source_locator=f"LAMC §{lamc} C.2",
            ),
        ],
        assumptions=[rules.get("front_setback_note", "")],
    ))

    # Side setback
    side_val = rules["interior_side_setback_ft"]
    findings.append(RegulatoryFinding(
        finding_type="interior_side_setback",
        value=side_val,
        unit="ft",
        rule_id=f"{base}.side_setback",
        method=FindingMethod.LOOKUP,
        confidence=0.85,
        evidence=[
            Evidence(source_type="pdf_table", source_locator="CP-7150 Table 1a — Side Yard Setback"),
            Evidence(source_type="lamc_section", source_locator=f"LAMC §{lamc} C.3"),
        ],
        assumptions=[rules.get("side_setback_note", "")],
    ))

    # Rear setback
    findings.append(RegulatoryFinding(
        finding_type="rear_setback",
        value=rules["rear_setback_ft"],
        unit="ft",
        rule_id=f"{base}.rear_setback",
        method=FindingMethod.LOOKUP,
        confidence=0.85,
        evidence=[
            Evidence(source_type="pdf_table", source_locator="CP-7150 Table 1a — Rear Yard Setback"),
            Evidence(source_type="lamc_section", source_locator=f"LAMC §{lamc} C.4"),
        ],
    ))

    # Max height
    hd = zone.height_district or "1"
    hd_rules = RULE_FRAGMENTS.get("height_districts", {}).get(hd, {})
    height = hd_rules.get("max_height_ft", rules.get("max_height_ft", 33))
    stories = hd_rules.get("max_stories", rules.get("max_stories", 2))

    # Non-standard height districts (2, 3, 4) → not_evaluated
    if hd in ("2", "3", "4"):
        findings.append(RegulatoryFinding(
            finding_type="max_height",
            value=None,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=f"height_district_{hd}_not_modeled",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator=f"LAMC §12.21.1 — Height District {hd}",
            )],
        ))
    else:
        findings.append(RegulatoryFinding(
            finding_type="max_height",
            value=height,
            unit="ft",
            rule_id=f"hd.{hd}.max_height",
            method=FindingMethod.LOOKUP,
            confidence=0.90,
            evidence=[
                Evidence(source_type="pdf_table", source_locator=f"CP-7150 Table 2 — Height District {hd}"),
                Evidence(source_type="lamc_section", source_locator="LAMC §12.21.1"),
            ],
        ))

        findings.append(RegulatoryFinding(
            finding_type="max_stories",
            value=stories,
            unit="stories",
            rule_id=f"hd.{hd}.max_stories",
            method=FindingMethod.LOOKUP,
            confidence=0.90,
            evidence=[
                Evidence(source_type="pdf_table", source_locator=f"CP-7150 Table 2 — Height District {hd}"),
            ],
        ))

    # FAR / RFAR
    if base == "R1":
        _add_r1_far(findings, rules, lot_area_sqft, lamc)
    elif base == "R2":
        _add_r2_far(findings, rules, hd)

    # Parking
    if "parking_spaces" in rules:
        findings.append(RegulatoryFinding(
            finding_type="parking",
            value=rules["parking_spaces"],
            unit="spaces",
            rule_id=f"{base}.parking",
            method=FindingMethod.LOOKUP,
            confidence=0.85,
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC §12.21 A.4 — Parking Requirements",
            )],
            assumptions=[rules.get("parking_note", "")],
        ))

    # Encroachment plane — flag only
    if "encroachment_plane" in rules:
        ep = rules["encroachment_plane"]
        findings.append(RegulatoryFinding(
            finding_type="encroachment_plane",
            value={"start_height_ft": ep["start_height_ft"], "angle_degrees": ep["angle_degrees"]},
            method=FindingMethod.LOOKUP,
            confidence=0.80,
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC §12.08 C.5(a) — Residential Floor Area Encroachment Plane",
            )],
            assumptions=[ep["note"]],
        ))

    return findings


def _add_r1_far(
    findings: list[RegulatoryFinding],
    rules: dict,
    lot_area_sqft: Optional[float],
    lamc: str,
):
    """Compute RFAR for R1 zone — depends on lot size."""
    if lot_area_sqft is None:
        findings.append(RegulatoryFinding(
            finding_type="rfar",
            value=None,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="lot_area_unknown: Cannot compute RFAR without lot area",
        ))
        return

    threshold = rules["rfar_small_lot"]["threshold_sqft"]
    if lot_area_sqft <= threshold:
        factor = rules["rfar_small_lot"]["factor"]
        desc = rules["rfar_small_lot"]["description"]
    else:
        factor = rules["rfar_large_lot"]["factor"]
        desc = rules["rfar_large_lot"]["description"]

    max_floor_area = lot_area_sqft * factor

    findings.append(RegulatoryFinding(
        finding_type="rfar",
        value=factor,
        unit="ratio",
        rule_id="R1.rfar",
        method=FindingMethod.LOOKUP,
        confidence=0.85,
        evidence=[
            Evidence(source_type="pdf_table", source_locator="CP-7150 Table 1a — RFAR"),
            Evidence(source_type="lamc_section", source_locator=f"LAMC §{lamc} C.5"),
        ],
        assumptions=[desc],
    ))

    findings.append(RegulatoryFinding(
        finding_type="max_floor_area",
        value=round(max_floor_area, 1),
        unit="sqft",
        rule_id="R1.max_floor_area",
        method=FindingMethod.CALCULATION,
        confidence=0.85,
        evidence=[
            Evidence(source_type="pdf_table", source_locator="CP-7150 Table 1a — RFAR"),
            Evidence(source_type="lamc_section", source_locator=f"LAMC §{lamc} C.5"),
        ],
        assumptions=[f"Computed as lot_area ({lot_area_sqft:.0f} sqft) × RFAR ({factor})"],
    ))


def _add_r2_far(findings: list[RegulatoryFinding], rules: dict, hd: str):
    """Add FAR finding for R2 zone."""
    far_data = rules.get("far", {})
    far_val = far_data.get(f"hd{hd}", far_data.get("hd1", 3.0))

    findings.append(RegulatoryFinding(
        finding_type="far",
        value=far_val,
        unit="ratio",
        rule_id="R2.far",
        method=FindingMethod.LOOKUP,
        confidence=0.85,
        evidence=[
            Evidence(source_type="pdf_table", source_locator=f"CP-7150 Table 2 — FAR HD{hd}"),
            Evidence(source_type="lamc_section", source_locator="LAMC §12.21.1"),
        ],
    ))


# Zone category descriptions for out-of-scope zones
_ZONE_INFO: dict[str, dict] = {
    "C1": {"category": "Limited Commercial", "lamc": "12.14", "residential_allowed": True,
            "note": "Permits residential use. May allow mixed-use or multi-family residential development."},
    "C1.5": {"category": "Limited Commercial", "lamc": "12.14.5", "residential_allowed": True,
              "note": "Permits residential. Allows multi-family and mixed-use development."},
    "C2": {"category": "Commercial", "lamc": "12.14", "residential_allowed": True,
            "note": "Permits all residential uses including multi-family. Common zone for parking lot redevelopment into mixed-use housing."},
    "C4": {"category": "Commercial", "lamc": "12.16", "residential_allowed": True,
            "note": "Permits residential use. Allows same uses as R4 (multiple dwellings)."},
    "C5": {"category": "Commercial", "lamc": "12.17", "residential_allowed": False,
            "note": "Limited to commercial uses. Residential not typically permitted."},
    "CM": {"category": "Commercial Manufacturing", "lamc": "12.17.5", "residential_allowed": False,
            "note": "Commercial manufacturing zone. Residential generally not permitted by right but may be possible through zone changes or specific plans."},
    "CR": {"category": "Commercial-Residential", "lamc": "12.14.7", "residential_allowed": True,
            "note": "Permits mixed-use residential/commercial. Designed to encourage housing above ground-floor commercial."},
    "CW": {"category": "Commercial-Warehouse", "lamc": "12.14.8", "residential_allowed": False,
            "note": "Warehouse/commercial zone. Residential not permitted by right."},
    "M1": {"category": "Limited Industrial", "lamc": "12.17.6", "residential_allowed": False,
            "note": "Light industrial. Residential not permitted. May be eligible for zone change under city housing initiatives."},
    "M2": {"category": "Light Industrial", "lamc": "12.18", "residential_allowed": False,
            "note": "Light industrial. Residential not permitted by right."},
    "M3": {"category": "Heavy Industrial", "lamc": "12.19", "residential_allowed": False,
            "note": "Heavy industrial. Residential not permitted."},
    "PF": {"category": "Public Facilities", "lamc": "12.04.09", "residential_allowed": False,
            "note": "Public facilities zone (government, infrastructure). Residential not permitted."},
    "PB": {"category": "Parking Building", "lamc": "12.12.2.5", "residential_allowed": False,
            "note": "Parking building zone. May be candidate for adaptive reuse or zone change for housing."},
    "OS": {"category": "Open Space", "lamc": "12.04.05", "residential_allowed": False,
            "note": "Open space — parks, recreation, conservation. Residential not permitted."},
    "A1": {"category": "Agriculture", "lamc": "12.05", "residential_allowed": True,
            "note": "Agriculture zone. Single-family homes permitted. ADU may be feasible under state law."},
    "A2": {"category": "Agriculture", "lamc": "12.06", "residential_allowed": True,
            "note": "Light agriculture zone. Single-family homes permitted. ADU may be feasible."},
    "R3": {"category": "Multiple Dwelling", "lamc": "12.10", "residential_allowed": True,
            "note": "Multiple dwelling zone. Apartments and condos permitted. Density controlled by lot area."},
    "R4": {"category": "Multiple Dwelling", "lamc": "12.11", "residential_allowed": True,
            "note": "Multiple dwelling zone. Higher density than R3. Apartments, hotels."},
    "R5": {"category": "Multiple Dwelling", "lamc": "12.12", "residential_allowed": True,
            "note": "Highest residential density. Unlimited density (limited by FAR and height district)."},
    "RD": {"category": "Restricted Density Multiple Dwelling", "lamc": "12.09.5", "residential_allowed": True,
            "note": "Restricted density multi-family. Duplexes and small apartments."},
    "RS": {"category": "Suburban", "lamc": "12.07.01", "residential_allowed": True,
            "note": "Suburban residential zone. Single-family homes with larger lot minimums."},
    "RE": {"category": "Residential Estate", "lamc": "12.07.01", "residential_allowed": True,
            "note": "Residential estate zone. Very large lot single-family. ADU feasible under state law."},
    "RA": {"category": "Suburban/Agricultural", "lamc": "12.07", "residential_allowed": True,
            "note": "Suburban agricultural zone. Single-family homes and some agriculture. ADU feasible."},
}


def _out_of_scope_findings(
    zone: ZoneComponents,
    lot_area_sqft: float | None,
) -> list[RegulatoryFinding]:
    """
    Return informative findings for zones outside the R1/R2 rule engine scope.
    Instead of a bare 'not in scope' message, provide zone classification,
    whether residential use is allowed, and development potential guidance.
    """
    base = zone.base_zone
    # Normalize base for lookup (e.g., RD1.5 → RD)
    lookup_key = base
    if base.startswith("RD"):
        lookup_key = "RD"
    elif base.startswith("C") and base not in _ZONE_INFO:
        lookup_key = "C2"  # default commercial info

    info = _ZONE_INFO.get(lookup_key)

    findings: list[RegulatoryFinding] = []

    if info:
        # Zone classification finding
        findings.append(RegulatoryFinding(
            finding_type="zone_classification",
            value={
                "base_zone": base,
                "category": info["category"],
                "residential_allowed": info["residential_allowed"],
                "height_district": zone.height_district or "1",
                "note": info["note"],
            },
            method=FindingMethod.LOOKUP,
            confidence=0.80,
            reason=f"zone_classified: {base} is {info['category']}. "
                   f"{'Residential use IS permitted' if info['residential_allowed'] else 'Residential use NOT permitted by right'}.",
            evidence=[
                Evidence(
                    source_type="lamc_section",
                    source_locator=f"LAMC §{info['lamc']} — {info['category']} Zone",
                ),
                _cp7150_evidence(),
            ],
        ))

        # Lot area finding if available
        if lot_area_sqft and lot_area_sqft > 0:
            findings.append(RegulatoryFinding(
                finding_type="lot_area",
                value=round(lot_area_sqft, 1),
                unit="sqft",
                method=FindingMethod.LOOKUP,
                confidence=0.80,
                reason=f"Parcel lot area: {lot_area_sqft:,.0f} sqft ({lot_area_sqft / 43560:.2f} acres)",
            ))

        # Default setbacks so the frontend can always render diagrams
        setback_defaults = _DEFAULT_SETBACKS.get(lookup_key, _DEFAULT_SETBACKS.get("_default"))
        setback_evidence = Evidence(
            source_type="lamc_section",
            source_locator=f"LAMC §{info['lamc']} — approximate default setbacks for {info['category']}",
        )
        findings.append(RegulatoryFinding(
            finding_type="front_setback",
            value=setback_defaults["front"],
            unit="ft",
            rule_id=f"{base}.front_setback.default",
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.30,
            reason=f"approximate default — not computed from zone-specific rules",
            evidence=[setback_evidence],
            assumptions=[
                f"Default setback for {info['category']} zone — verify against specific plan requirements",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))
        findings.append(RegulatoryFinding(
            finding_type="interior_side_setback",
            value=setback_defaults["side"],
            unit="ft",
            rule_id=f"{base}.side_setback.default",
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.30,
            reason=f"approximate default — not computed from zone-specific rules",
            evidence=[setback_evidence],
            assumptions=[
                f"Default setback for {info['category']} zone",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))
        findings.append(RegulatoryFinding(
            finding_type="rear_setback",
            value=setback_defaults["rear"],
            unit="ft",
            rule_id=f"{base}.rear_setback.default",
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.30,
            reason=f"approximate default — not computed from zone-specific rules",
            evidence=[setback_evidence],
            assumptions=[
                f"Default setback for {info['category']} zone",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))

        # Default height
        height_defaults = _DEFAULT_HEIGHT.get(lookup_key, _DEFAULT_HEIGHT.get("_default"))
        findings.append(RegulatoryFinding(
            finding_type="max_height",
            value=height_defaults["height"],
            unit="ft",
            rule_id=f"{base}.max_height.default",
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator=f"LAMC §{info['lamc']} — height limit for {info['category']}",
            )],
            assumptions=[
                f"Approximate height for {info['category']} zone, HD {zone.height_district or '1'}",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))
        findings.append(RegulatoryFinding(
            finding_type="max_stories",
            value=height_defaults["stories"],
            unit="stories",
            rule_id=f"{base}.max_stories.default",
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator=f"LAMC §{info['lamc']} — stories limit for {info['category']}",
            )],
            assumptions=["Outside R1/R2 engine scope — verify with architect"],
        ))

        # Development potential guidance
        if info["residential_allowed"]:
            findings.append(RegulatoryFinding(
                finding_type="development_potential",
                value="residential_eligible",
                method=FindingMethod.NOT_EVALUATED,
                confidence=0.50,
                reason=(
                    f"Residential development is permitted in {base} ({info['category']}). "
                    f"Detailed FAR/density standards for this zone are not yet fully modeled — "
                    f"refer to LAMC §{info['lamc']} for specific requirements. "
                    f"{'ADU may be feasible under state law (Gov. Code §66314).' if lookup_key in ('RD', 'RS', 'RE', 'RA', 'R3', 'R4', 'R5', 'A1', 'A2') else ''}"
                ),
                evidence=[Evidence(
                    source_type="lamc_section",
                    source_locator=f"LAMC §{info['lamc']}",
                )],
            ))
        else:
            findings.append(RegulatoryFinding(
                finding_type="development_potential",
                value="residential_not_permitted",
                method=FindingMethod.NOT_EVALUATED,
                confidence=0.60,
                reason=(
                    f"Residential development is NOT permitted by right in {base} ({info['category']}). "
                    f"Options may include: zone change application, specific plan amendment, "
                    f"or adaptive reuse ordinance (if applicable). "
                    f"Refer to LAMC §{info['lamc']}."
                ),
                evidence=[Evidence(
                    source_type="lamc_section",
                    source_locator=f"LAMC §{info['lamc']}",
                )],
            ))
    else:
        # Unknown zone — still provide default setbacks/height for visualization
        findings.append(RegulatoryFinding(
            finding_type="zone_classification",
            value={"base_zone": base, "height_district": zone.height_district or "unknown"},
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=f"zone_not_recognized: {zone.raw} — zone '{base}' is not in the rule database. "
                   f"Verify zoning at planning.lacity.gov/zoning.",
            evidence=[_cp7150_evidence()],
        ))

        if lot_area_sqft and lot_area_sqft > 0:
            findings.append(RegulatoryFinding(
                finding_type="lot_area",
                value=round(lot_area_sqft, 1),
                unit="sqft",
                method=FindingMethod.LOOKUP,
                confidence=0.80,
                reason=f"Parcel lot area: {lot_area_sqft:,.0f} sqft ({lot_area_sqft / 43560:.2f} acres)",
            ))

        # Default setbacks/height even for unknown zones
        defaults = _DEFAULT_SETBACKS["_default"]
        height_def = _DEFAULT_HEIGHT["_default"]
        default_evidence = Evidence(
            source_type="lamc_section",
            source_locator="LAMC — conservative default setbacks (zone not fully classified)",
        )
        findings.append(RegulatoryFinding(
            finding_type="front_setback", value=defaults["front"], unit="ft",
            method=FindingMethod.NOT_EVALUATED, confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[default_evidence],
            assumptions=[
                "Conservative default — zone-specific rules not available",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))
        findings.append(RegulatoryFinding(
            finding_type="interior_side_setback", value=defaults["side"], unit="ft",
            method=FindingMethod.NOT_EVALUATED, confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[default_evidence],
            assumptions=[
                "Conservative default — zone-specific rules not available",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))
        findings.append(RegulatoryFinding(
            finding_type="rear_setback", value=defaults["rear"], unit="ft",
            method=FindingMethod.NOT_EVALUATED, confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[default_evidence],
            assumptions=[
                "Conservative default — zone-specific rules not available",
                "Outside R1/R2 engine scope — verify with architect",
            ],
        ))
        findings.append(RegulatoryFinding(
            finding_type="max_height", value=height_def["height"], unit="ft",
            method=FindingMethod.NOT_EVALUATED, confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[default_evidence],
            assumptions=["Outside R1/R2 engine scope — verify with architect"],
        ))
        findings.append(RegulatoryFinding(
            finding_type="max_stories", value=height_def["stories"], unit="stories",
            method=FindingMethod.NOT_EVALUATED, confidence=0.30,
            reason="approximate default — not computed from zone-specific rules",
            evidence=[default_evidence],
            assumptions=["Outside R1/R2 engine scope — verify with architect"],
        ))

    return findings


# Default setback values by zone category (conservative approximations)
_DEFAULT_SETBACKS: dict[str, dict] = {
    "C1": {"front": 10, "side": 5, "rear": 15},
    "C1.5": {"front": 10, "side": 5, "rear": 15},
    "C2": {"front": 10, "side": 5, "rear": 15},
    "C4": {"front": 10, "side": 5, "rear": 15},
    "C5": {"front": 5, "side": 0, "rear": 0},
    "CM": {"front": 5, "side": 0, "rear": 0},
    "CR": {"front": 10, "side": 5, "rear": 15},
    "CW": {"front": 5, "side": 0, "rear": 0},
    "M1": {"front": 5, "side": 0, "rear": 0},
    "M2": {"front": 5, "side": 0, "rear": 0},
    "M3": {"front": 5, "side": 0, "rear": 0},
    "PF": {"front": 15, "side": 5, "rear": 15},
    "PB": {"front": 10, "side": 5, "rear": 10},
    "OS": {"front": 15, "side": 10, "rear": 15},
    "A1": {"front": 25, "side": 10, "rear": 25},
    "A2": {"front": 25, "side": 10, "rear": 25},
    "R3": {"front": 15, "side": 5, "rear": 15},
    "R4": {"front": 15, "side": 5, "rear": 15},
    "R5": {"front": 15, "side": 5, "rear": 15},
    "RD": {"front": 20, "side": 5, "rear": 15},
    "RS": {"front": 25, "side": 10, "rear": 25},
    "RE": {"front": 25, "side": 10, "rear": 25},
    "RA": {"front": 25, "side": 10, "rear": 25},
    "_default": {"front": 15, "side": 5, "rear": 15},
}

# Default height values by zone category
_DEFAULT_HEIGHT: dict[str, dict] = {
    "C1": {"height": 45, "stories": 3},
    "C1.5": {"height": 45, "stories": 3},
    "C2": {"height": 45, "stories": 3},
    "C4": {"height": 45, "stories": 3},
    "C5": {"height": 75, "stories": 6},
    "CM": {"height": 45, "stories": 3},
    "CR": {"height": 45, "stories": 3},
    "CW": {"height": 45, "stories": 3},
    "M1": {"height": 45, "stories": 3},
    "M2": {"height": 75, "stories": 6},
    "M3": {"height": 75, "stories": 6},
    "PF": {"height": 45, "stories": 3},
    "PB": {"height": 45, "stories": 3},
    "OS": {"height": 30, "stories": 2},
    "A1": {"height": 36, "stories": 2},
    "A2": {"height": 36, "stories": 2},
    "R3": {"height": 45, "stories": 3},
    "R4": {"height": 45, "stories": 3},
    "R5": {"height": 45, "stories": 3},
    "RD": {"height": 33, "stories": 2},
    "RS": {"height": 33, "stories": 2},
    "RE": {"height": 36, "stories": 2},
    "RA": {"height": 36, "stories": 2},
    "_default": {"height": 45, "stories": 3},
}


def _cp7150_evidence() -> Evidence:
    return Evidence(
        source_type="pdf_table",
        source_locator="CP-7150 Zoning Code Summary — planning.lacity.gov",
    )


# ---------------------------------------------------------------------------
# Overlay flag engine
# ---------------------------------------------------------------------------

def detect_overlays(zone: ZoneComponents) -> OverlayFlags:
    """
    Detect overlay conditions from parsed zone components.
    Week 1: detect and flag — don't compute overlay rules.

    Implemented overlays (detected from zone string parsing):
      - hillside: detected via -H suffix on zone string
      - hpoz: detected via HPOZ in suffix_flags
      - specific_plan: detected via SP in suffix_flags

    Planned / not yet implemented (require external GIS layers):
      - toc: Transit Oriented Communities tier — needs Metro GTFS proximity query
      - coastal: Coastal Zone — needs Coastal Commission boundary layer
      - fire_zone_1: Very High Fire Hazard Severity Zone — needs CAL FIRE / LAFD layer
      - fault_zone: Alquist-Priolo fault zone — needs CGS fault zone layer

    The ``unscreened_overlays`` field on the returned OverlayFlags lists
    overlays that were NOT checked, so the frontend can avoid showing
    "All Constraints Clear" for constraints that were never evaluated.
    """
    flags = OverlayFlags()

    # Hillside: -H suffix
    if zone.hillside:
        flags.hillside = True

    # HPOZ: detected from zone string or supplementary layer
    # In week 1, we detect from suffix_flags
    for flag in zone.suffix_flags:
        flag_upper = flag.upper()
        if "HPOZ" in flag_upper:
            flags.hpoz = True
        if "SP" in flag_upper:
            flags.specific_plan = flag

    # Record which overlays were NOT screened so the frontend knows
    flags.unscreened_overlays = ["coastal", "fire_zone_1", "fault_zone"]

    return flags


def get_overlay_findings(flags: OverlayFlags) -> list[RegulatoryFinding]:
    """Generate not_evaluated findings for each detected overlay."""
    findings: list[RegulatoryFinding] = []

    if flags.hillside:
        findings.append(RegulatoryFinding(
            finding_type="overlay_hillside",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="overlay_hillside_not_modeled: Hillside area has completely different FAR, height, and setback rules",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC §12.21 C.10 — Baseline Hillside Ordinance (BHO)",
            )],
        ))

    if flags.hpoz:
        findings.append(RegulatoryFinding(
            finding_type="overlay_hpoz",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="overlay_hpoz_not_modeled: Historic Preservation Overlay Zone requires design review",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC §12.20.3 — Historic Preservation Overlay Zone",
            )],
        ))

    if flags.toc_tier is not None:
        findings.append(RegulatoryFinding(
            finding_type="overlay_toc",
            value=flags.toc_tier,
            unit="tier",
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=f"overlay_toc_tier_{flags.toc_tier}_not_modeled: TOC density bonus rules not computed in week 1",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="Transit Oriented Communities (TOC) Guidelines",
            )],
        ))

    if flags.coastal:
        findings.append(RegulatoryFinding(
            finding_type="overlay_coastal",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="overlay_coastal_not_modeled: Coastal Commission review may be required",
        ))

    if flags.fire_zone_1:
        findings.append(RegulatoryFinding(
            finding_type="overlay_fire_zone",
            value=True,
            method=FindingMethod.LOOKUP,
            confidence=0.90,
            reason="fire_resistant_materials_required",
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC Fire Zone 1 — Fire-resistant materials required",
            )],
        ))

    if flags.fault_zone:
        findings.append(RegulatoryFinding(
            finding_type="overlay_fault_zone",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="overlay_fault_zone_not_modeled: 50ft setback from fault line may apply",
        ))

    if flags.specific_plan:
        findings.append(RegulatoryFinding(
            finding_type="overlay_specific_plan",
            value=flags.specific_plan,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=f"specific_plan_not_modeled: {flags.specific_plan}",
        ))

    return findings
