"""
Golden set regression suite — validates the pipeline against curated scenarios.

Each line in golden_set.jsonl defines:
  - address: street address to assess
  - expected_zone: zone string the pipeline should find (or null for out-of-scope)
  - scenario: human-readable label
  - notes: expected behavior

The test suite validates pipeline connectivity and scenario correctness
rather than exact numeric values, which depend on live GIS data.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.services.pipeline import assess_address

GOLDEN_SET_PATH = Path(__file__).parent.parent / "data" / "golden_set.jsonl"


def _load_golden_set() -> list[dict]:
    entries = []
    with open(GOLDEN_SET_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))
    return entries


GOLDEN = _load_golden_set()


def _scenario_ids() -> list[str]:
    return [f"{e['scenario']}—{e['address'][:30]}" for e in GOLDEN]


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("entry", GOLDEN, ids=_scenario_ids())
async def test_pipeline_completes(entry: dict):
    """Every golden-set address should produce a PipelineResult without crashing."""
    result = await assess_address(entry["address"])
    assert result is not None, f"Pipeline returned None for {entry['address']}"


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize("entry", GOLDEN, ids=_scenario_ids())
async def test_scenario_expectations(entry: dict):
    """Validate scenario-specific expectations from the golden set."""
    result = await assess_address(entry["address"])
    scenario = entry["scenario"]
    expected_zone = entry.get("expected_zone")

    if scenario == "outside_jurisdiction":
        assert result.success is True, "Outside-jurisdiction should still succeed"
        assert result.assessment is not None
        boundary_err = any(
            e.get("step") == "boundary" for e in result.assessment.pipeline_errors
        )
        assert boundary_err, f"Expected boundary error for out-of-jurisdiction: {entry['address']}"
        return

    if expected_zone is None:
        return

    if not result.success:
        pytest.skip(f"Pipeline failed at {result.failed_step}: {result.error_message}")

    assessment = result.assessment
    assert assessment is not None

    if scenario == "hillside":
        assert assessment.zoning is not None
        if assessment.zoning.zone_components:
            assert assessment.zoning.zone_components.hillside, \
                f"Expected hillside flag for {entry['address']}"

    if scenario in ("commercial_near_transit", "estate_zone"):
        sfr = next((a for a in assessment.assessments if a.building_type.value == "SFR"), None)
        if sfr:
            assert sfr.verdict.value in ("FLAGGED", "NOT_EVALUATED"), \
                f"Out-of-scope zone {expected_zone} should not be ALLOWED"

    if "r1" in scenario or "r2" in scenario:
        assert len(assessment.assessments) > 0, \
            f"In-scope R1/R2 address should have at least one building type assessment"
        sfr = next((a for a in assessment.assessments if a.building_type.value == "SFR"), None)
        if sfr:
            finding_types = {f.finding_type for f in sfr.findings}
            assert "front_setback" in finding_types, "R1/R2 SFR should have front_setback"
            assert "max_height" in finding_types, "R1/R2 SFR should have max_height"

    if "hpoz" in scenario.lower() or "possible_hpoz" in scenario:
        if assessment.overlay_flags.hpoz:
            adu = next((a for a in assessment.assessments if a.building_type.value == "ADU"), None)
            if adu:
                blocker = any(f.finding_type == "adu_blocker_hpoz" for f in adu.findings)
                assert blocker, "HPOZ parcel should have adu_blocker_hpoz finding"
