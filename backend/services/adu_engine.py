"""
ADU feasibility engine — State law governs (preempts local LA rules).
Determines ADU buildability, height, setbacks, and blockers.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from backend.models.entities import (
    Evidence,
    FindingMethod,
    OverlayFlags,
    RegulatoryFinding,
    ZoneComponents,
)

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).parent.parent / "data"

with open(_DATA_DIR / "adu_rules.json") as f:
    ADU_RULES = json.load(f)

STATE = ADU_RULES["state_minimums"]
ELIGIBLE_ZONES = set(ADU_RULES["eligible_zones"])
BLOCKERS = ADU_RULES["blockers"]


def assess_adu_feasibility(
    zone: ZoneComponents,
    lot_area_sqft: Optional[float],
    overlay_flags: OverlayFlags,
    *,
    envelope_area_sqft: Optional[float] = None,
    target_sqft: Optional[float] = None,
) -> list[RegulatoryFinding]:
    """
    Determine ADU feasibility for a parcel.

    State ADU law (AB 2221, SB 897, AB 976, SB 1211) preempts local.
    Where state law is more permissive, STATE LAW WINS.
    """
    findings: list[RegulatoryFinding] = []
    proposed_sqft = float(target_sqft) if target_sqft is not None else None

    # Step 1: Zone eligibility
    if zone.base_zone not in ELIGIBLE_ZONES:
        findings.append(RegulatoryFinding(
            finding_type="adu_eligibility",
            value=False,
            method=FindingMethod.LOOKUP,
            confidence=0.95,
            reason=f"Zone {zone.base_zone} not eligible for ADU",
            evidence=[_state_evidence("Gov. Code §66314 — Eligible zones")],
        ))
        return findings

    findings.append(RegulatoryFinding(
        finding_type="adu_eligibility",
        value=True,
        method=FindingMethod.LOOKUP,
        confidence=0.95,
        evidence=[_state_evidence("Gov. Code §66314 — ADU permitted in residential zones")],
    ))

    # Step 2: Height
    if overlay_flags.toc_tier and overlay_flags.toc_tier >= 1:
        height = STATE["height_near_transit_ft"]
        findings.append(RegulatoryFinding(
            finding_type="adu_max_height",
            value=height,
            unit="ft",
            method=FindingMethod.LOOKUP,
            confidence=0.95,
            evidence=[
                _state_evidence(STATE["height_transit_source"]),
                Evidence(
                    source_type="gis_layer",
                    source_locator=f"TOC Tier {overlay_flags.toc_tier} — within ½ mile of major transit stop",
                ),
            ],
            assumptions=["TOC tier detected — transit height bonus applies"],
        ))
    else:
        height = STATE["height_standard_ft"]
        findings.append(RegulatoryFinding(
            finding_type="adu_max_height",
            value=height,
            unit="ft",
            method=FindingMethod.LOOKUP,
            confidence=0.90,
            evidence=[_state_evidence(STATE["height_standard_source"])],
        ))

    # Step 3: Setbacks (state law — 4ft max)
    findings.append(RegulatoryFinding(
        finding_type="adu_side_setback",
        value=STATE["side_setback_ft"],
        unit="ft",
        method=FindingMethod.LOOKUP,
        confidence=0.95,
        evidence=[_state_evidence(STATE["setback_source"])],
        assumptions=[STATE["setback_note"]],
    ))

    findings.append(RegulatoryFinding(
        finding_type="adu_rear_setback",
        value=STATE["rear_setback_ft"],
        unit="ft",
        method=FindingMethod.LOOKUP,
        confidence=0.95,
        evidence=[_state_evidence(STATE["setback_source"])],
    ))

    # Step 4: Size guarantee (800 sqft regardless of FAR/lot)
    adu_size = STATE["max_size_guarantee_sqft"]
    findings.append(RegulatoryFinding(
        finding_type="adu_size_guarantee",
        value=adu_size,
        unit="sqft",
        method=FindingMethod.LOOKUP,
        confidence=0.95,
        evidence=[_state_evidence(STATE["max_size_guarantee_source"])],
        assumptions=[STATE["max_size_guarantee_note"]],
    ))

    # Step 5: Physical feasibility check
    target_for_fit = proposed_sqft or adu_size
    if envelope_area_sqft is not None:
        feasible = envelope_area_sqft >= target_for_fit
        findings.append(RegulatoryFinding(
            finding_type="adu_physically_feasible",
            value=feasible,
            method=FindingMethod.CALCULATION,
            confidence=0.90 if feasible else 0.80,
            evidence=[
                Evidence(
                    source_type="calculation",
                    source_locator=(
                        f"Buildable envelope {envelope_area_sqft:.0f} sqft vs "
                        f"target ADU {target_for_fit:.0f} sqft"
                    ),
                ),
            ],
            assumptions=[
                "Uses approximate buildable envelope geometry from setback inset",
                "Front-setback exceptions and detached ADU placement nuances are not separately modeled",
            ],
        ))
    elif lot_area_sqft is not None:
        # Without usable geometry, fall back to a conservative lot-area heuristic.
        min_lot_for_adu = max(1200.0, target_for_fit + 400.0)
        feasible = lot_area_sqft >= min_lot_for_adu

        findings.append(RegulatoryFinding(
            finding_type="adu_physically_feasible",
            value=feasible,
            method=FindingMethod.CALCULATION,
            confidence=0.70 if feasible else 0.60,
            evidence=[
                Evidence(
                    source_type="calculation",
                    source_locator=(
                        f"Lot area {lot_area_sqft:.0f} sqft vs "
                        f"heuristic minimum ~{min_lot_for_adu:.0f} sqft"
                    ),
                ),
            ],
            assumptions=[
                "Heuristic fallback only — production should rely on parcel geometry and placement options",
                "Target size defaults to the 800 sqft state guarantee when no project input is provided",
            ],
        ))

    # Step 6: Parking
    findings.append(RegulatoryFinding(
        finding_type="adu_parking_replacement",
        value=False,
        unit="required",
        method=FindingMethod.LOOKUP,
        confidence=0.95,
        evidence=[_state_evidence(STATE["parking_source"])],
        assumptions=[STATE["parking_note"]],
    ))

    # Step 7: Impact fees
    findings.append(RegulatoryFinding(
        finding_type="adu_impact_fee_exempt",
        value=(
            proposed_sqft <= STATE["impact_fee_exempt_sqft"]
            if proposed_sqft is not None
            else None
        ),
        method=(
            FindingMethod.LOOKUP
            if proposed_sqft is not None
            else FindingMethod.NOT_EVALUATED
        ),
        confidence=0.95 if proposed_sqft is not None else 0.0,
        evidence=[_state_evidence(STATE["impact_fee_source"])],
        assumptions=[STATE["impact_fee_note"]],
        reason=(
            None if proposed_sqft is not None else
            "target_sqft_unknown: Need proposed ADU size to evaluate impact fee exemption"
        ),
    ))

    # Step 8: Blockers
    blocker_findings = _check_adu_blockers(overlay_flags)
    findings.extend(blocker_findings)

    return findings


def _check_adu_blockers(flags: OverlayFlags) -> list[RegulatoryFinding]:
    """Check for overlay conditions that block or require review for ADU."""
    findings: list[RegulatoryFinding] = []

    if flags.fault_zone:
        b = BLOCKERS["fault_zone"]
        findings.append(RegulatoryFinding(
            finding_type="adu_blocker_fault_zone",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=b["reason"],
            evidence=[Evidence(
                source_type="gis_layer",
                source_locator="Alquist-Priolo Fault Zone — additional setback may apply",
            )],
            assumptions=[b["note"]],
        ))

    if flags.hpoz:
        b = BLOCKERS["hpoz"]
        findings.append(RegulatoryFinding(
            finding_type="adu_blocker_hpoz",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=b["reason"],
            evidence=[Evidence(
                source_type="lamc_section",
                source_locator="LAMC §12.20.3 — HPOZ design review for ADU",
            )],
            assumptions=[b["note"]],
        ))

    if flags.coastal:
        b = BLOCKERS["coastal"]
        findings.append(RegulatoryFinding(
            finding_type="adu_blocker_coastal",
            value=True,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason=b["reason"],
            assumptions=[b["note"]],
        ))

    return findings


def _state_evidence(source: str) -> Evidence:
    return Evidence(
        source_type="state_law",
        source_locator=source,
    )
