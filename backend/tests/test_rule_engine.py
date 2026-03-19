"""Tests for the deterministic rule engine."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.models.entities import FindingMethod, OverlayFlags
from backend.services.zone_parser import parse_zone_string
from backend.services.rule_engine import get_base_standards, detect_overlays, get_overlay_findings
from backend.services.adu_engine import assess_adu_feasibility


class TestR1Standards:
    def test_r1_setbacks(self):
        zone = parse_zone_string("R1-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        by_type = {f.finding_type: f for f in findings}

        assert by_type["front_setback"].value == 20
        assert by_type["front_setback"].unit == "ft"
        assert by_type["interior_side_setback"].value == 5
        assert by_type["rear_setback"].value == 15

    def test_r1_height(self):
        zone = parse_zone_string("R1-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        by_type = {f.finding_type: f for f in findings}

        assert by_type["max_height"].value == 33
        assert by_type["max_stories"].value == 2

    def test_r1_rfar_small_lot(self):
        zone = parse_zone_string("R1-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        by_type = {f.finding_type: f for f in findings}

        assert by_type["rfar"].value == 0.45
        assert by_type["max_floor_area"].value == 2700.0

    def test_r1_rfar_large_lot(self):
        zone = parse_zone_string("R1-1")
        findings = get_base_standards(zone, lot_area_sqft=9000)

        by_type = {f.finding_type: f for f in findings}

        assert by_type["rfar"].value == 0.40
        assert by_type["max_floor_area"].value == 3600.0

    def test_r1_all_findings_have_evidence(self):
        zone = parse_zone_string("R1-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        for f in findings:
            assert len(f.evidence) > 0, f"Finding {f.finding_type} has no evidence"

    def test_r1_all_findings_have_confidence(self):
        zone = parse_zone_string("R1-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        for f in findings:
            if f.method != FindingMethod.NOT_EVALUATED:
                assert f.confidence > 0, f"Finding {f.finding_type} has zero confidence"


class TestR2Standards:
    def test_r2_setbacks(self):
        zone = parse_zone_string("R2-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        by_type = {f.finding_type: f for f in findings}

        assert by_type["front_setback"].value == 15  # Different from R1!
        assert by_type["rear_setback"].value == 15


class TestOutOfScope:
    def test_non_residential_returns_not_evaluated(self):
        zone = parse_zone_string("C2-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        # Out-of-scope zones now return informational findings (zone classification,
        # lot area, approximate defaults) all marked NOT_EVALUATED with low confidence
        assert len(findings) >= 1
        # All dimensional defaults should be NOT_EVALUATED
        for f in findings:
            if f.finding_type in ("front_setback", "interior_side_setback", "rear_setback", "max_height", "max_stories"):
                assert f.method == FindingMethod.NOT_EVALUATED
                assert f.confidence <= 0.30

    def test_hillside_returns_not_evaluated(self):
        zone = parse_zone_string("R1H-1")
        findings = get_base_standards(zone, lot_area_sqft=6000)

        assert len(findings) == 1
        assert findings[0].method == FindingMethod.NOT_EVALUATED
        assert "hillside" in findings[0].reason


class TestOverlays:
    def test_hillside_detection(self):
        zone = parse_zone_string("R1H-1")
        flags = detect_overlays(zone)
        assert flags.hillside is True

    def test_overlay_findings_generated(self):
        flags = OverlayFlags(hillside=True, hpoz=True)
        findings = get_overlay_findings(flags)

        types = {f.finding_type for f in findings}
        assert "overlay_hillside" in types
        assert "overlay_hpoz" in types


class TestADU:
    def test_r1_adu_eligible(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_eligibility"].value is True

    def test_adu_state_setbacks(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_side_setback"].value == 4
        assert by_type["adu_rear_setback"].value == 4

    def test_adu_size_guarantee(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_size_guarantee"].value == 800

    def test_adu_impact_fee_requires_target_size(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_impact_fee_exempt"].method == FindingMethod.NOT_EVALUATED
        assert "target_sqft_unknown" in by_type["adu_impact_fee_exempt"].reason

    def test_adu_impact_fee_exempt_when_target_is_small(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(zone, 6000, flags, target_sqft=740)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_impact_fee_exempt"].value is True

    def test_adu_transit_height_bonus(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags(toc_tier=2)
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_max_height"].value == 18  # Transit bonus

    def test_adu_uses_envelope_area_when_available(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(
            zone,
            6000,
            flags,
            envelope_area_sqft=700,
            target_sqft=750,
        )

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_physically_feasible"].value is False

    def test_adu_hpoz_blocker(self):
        zone = parse_zone_string("R1-1")
        flags = OverlayFlags(hpoz=True)
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert "adu_blocker_hpoz" in by_type

    def test_commercial_zone_not_eligible(self):
        zone = parse_zone_string("C2-1")
        flags = OverlayFlags()
        findings = assess_adu_feasibility(zone, 6000, flags)

        by_type = {f.finding_type: f for f in findings}
        assert by_type["adu_eligibility"].value is False
