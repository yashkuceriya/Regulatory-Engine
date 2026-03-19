"""
Assessment assembler — combines all findings into a BuildabilityAssessment.
Groups by building type, computes composite confidence, attaches evidence chain.
"""
from __future__ import annotations

import logging
from typing import Optional

from backend.models.entities import (
    BuildabilityAssessment,
    BuildingType,
    BuildingTypeAssessment,
    Evidence,
    FindingMethod,
    OverlayFlags,
    ParcelObservation,
    RegulatoryFinding,
    Verdict,
    ZoningObservation,
)

logger = logging.getLogger(__name__)


def assemble_assessment(
    address: str,
    parcel: Optional[ParcelObservation],
    zoning: Optional[ZoningObservation],
    jurisdiction: Optional[dict],
    sfr_findings: list[RegulatoryFinding],
    adu_findings: list[RegulatoryFinding],
    overlay_findings: list[RegulatoryFinding],
    overlay_flags: OverlayFlags,
    buildable_envelope: Optional[dict] = None,
) -> BuildabilityAssessment:
    """
    Assemble all findings into a structured BuildabilityAssessment.

    Groups findings by building type (SFR, ADU).
    Computes per-type verdict and composite confidence.
    Attaches full evidence chain for auditability.
    """

    # Build SFR assessment
    sfr_all = sfr_findings + overlay_findings
    sfr_verdict = _compute_verdict(sfr_all, overlay_flags)
    sfr_warnings = _collect_warnings(overlay_findings)

    sfr_assessment = BuildingTypeAssessment(
        building_type=BuildingType.SFR,
        verdict=sfr_verdict,
        findings=sfr_all,
        overlay_warnings=sfr_warnings,
    )

    # Build ADU assessment
    adu_verdict = _compute_verdict(adu_findings, overlay_flags)
    adu_warnings = _collect_adu_warnings(adu_findings)

    adu_assessment = BuildingTypeAssessment(
        building_type=BuildingType.ADU,
        verdict=adu_verdict,
        findings=adu_findings,
        overlay_warnings=adu_warnings,
    )

    # Collect all citations
    all_evidence: list[Evidence] = []
    for finding in sfr_all + adu_findings:
        all_evidence.extend(finding.evidence)

    # Deduplicate evidence by source_locator
    seen = set()
    unique_evidence = []
    for e in all_evidence:
        if e.source_locator not in seen:
            seen.add(e.source_locator)
            unique_evidence.append(e)

    return BuildabilityAssessment(
        address=address,
        parcel=parcel,
        zoning=zoning,
        jurisdiction=jurisdiction,
        overlay_flags=overlay_flags,
        assessments=[sfr_assessment, adu_assessment],
        buildable_envelope=buildable_envelope,
        citations=unique_evidence,
    )


CRITICAL_FINDING_TYPES = frozenset({
    "front_setback",
    "rear_setback",
    "interior_side_setback",
    "max_height",
    "max_stories",
    "rfar",
    "max_floor_area",
})


def _compute_verdict(
    findings: list[RegulatoryFinding],
    flags: OverlayFlags,
) -> Verdict:
    """Determine overall verdict for a building type."""
    # If any overlay is flagged, verdict is FLAGGED
    if (
        flags.hillside
        or flags.hpoz
        or flags.coastal
        or flags.fault_zone
        or flags.specific_plan is not None
        or flags.toc_tier is not None
    ):
        return Verdict.FLAGGED

    if not findings:
        return Verdict.NOT_EVALUATED

    # Material blockers or partial evaluations should never present as ALLOWED.
    if any(_is_material_blocker(f) for f in findings):
        return Verdict.FLAGGED

    evaluated = [f for f in findings if f.method != FindingMethod.NOT_EVALUATED]
    not_evaluated = [f for f in findings if f.method == FindingMethod.NOT_EVALUATED]

    if not evaluated:
        return Verdict.NOT_EVALUATED

    if not_evaluated:
        return Verdict.FLAGGED

    # Safety check: if any critical constraint was not actually evaluated,
    # never claim ALLOWED — the assessment is incomplete.
    if any(
        f.finding_type in CRITICAL_FINDING_TYPES
        and f.method == FindingMethod.NOT_EVALUATED
        for f in findings
    ):
        logger.warning(
            "Critical finding(s) not evaluated — forcing FLAGGED verdict"
        )
        return Verdict.FLAGGED

    if any(f.confidence < 0.80 for f in evaluated):
        return Verdict.FLAGGED

    return Verdict.ALLOWED


def _is_material_blocker(finding: RegulatoryFinding) -> bool:
    """Identify findings that should prevent an ALLOWED verdict."""
    if finding.value is True and finding.finding_type.startswith("adu_blocker_"):
        return True

    if finding.finding_type in {"adu_eligibility", "adu_physically_feasible"}:
        return finding.value is False

    return False


def _collect_warnings(overlay_findings: list[RegulatoryFinding]) -> list[str]:
    """Extract human-readable warnings from overlay findings."""
    warnings = []
    for f in overlay_findings:
        if f.reason:
            warnings.append(f.reason)
    return warnings


def _collect_adu_warnings(adu_findings: list[RegulatoryFinding]) -> list[str]:
    """Extract ADU-specific warnings."""
    warnings = []
    for f in adu_findings:
        if f.finding_type.startswith("adu_blocker_"):
            warnings.append(f.reason or f.finding_type)
    return warnings
