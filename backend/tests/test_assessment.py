"""Tests for assessment verdict computation."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.models.entities import FindingMethod, OverlayFlags, RegulatoryFinding, Verdict
from backend.services.assessment import _compute_verdict


def _finding(
    finding_type: str,
    *,
    value,
    method: FindingMethod,
    confidence: float,
    reason: str | None = None,
) -> RegulatoryFinding:
    return RegulatoryFinding(
        finding_type=finding_type,
        value=value,
        method=method,
        confidence=confidence,
        reason=reason,
    )


def test_partial_evaluation_is_flagged():
    verdict = _compute_verdict(
        [
            _finding(
                "front_setback",
                value=20,
                method=FindingMethod.LOOKUP,
                confidence=0.85,
            ),
            _finding(
                "max_height",
                value=None,
                method=FindingMethod.NOT_EVALUATED,
                confidence=0.0,
                reason="height_district_2_not_modeled",
            ),
        ],
        OverlayFlags(),
    )

    assert verdict == Verdict.FLAGGED


def test_toc_overlay_is_flagged():
    verdict = _compute_verdict(
        [
            _finding(
                "adu_max_height",
                value=18,
                method=FindingMethod.LOOKUP,
                confidence=0.95,
            ),
        ],
        OverlayFlags(toc_tier=2),
    )

    assert verdict == Verdict.FLAGGED


def test_adu_ineligible_is_flagged():
    verdict = _compute_verdict(
        [
            _finding(
                "adu_eligibility",
                value=False,
                method=FindingMethod.LOOKUP,
                confidence=0.95,
                reason="Zone C2 not eligible for ADU",
            ),
        ],
        OverlayFlags(),
    )

    assert verdict == Verdict.FLAGGED
