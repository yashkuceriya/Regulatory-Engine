"""Tests for zone string parser."""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.services.zone_parser import parse_zone_string, is_residential, is_in_scope


def test_standard_r1():
    z = parse_zone_string("R1-1")
    assert z.base_zone == "R1"
    assert z.height_district == "1"
    assert z.hillside is False
    assert z.variation is None


def test_r1_hillside():
    z = parse_zone_string("R1H-1")
    assert z.base_zone == "R1"
    assert z.height_district == "1"
    assert z.hillside is True


def test_r1_variation():
    z = parse_zone_string("R1V2-1")
    assert z.base_zone == "R1"
    assert z.variation == "V2"
    assert z.hillside is False


def test_r2():
    z = parse_zone_string("R2-1")
    assert z.base_zone == "R2"
    assert z.height_district == "1"


def test_rd_zone():
    z = parse_zone_string("RD2-1")
    assert z.base_zone == "RD2"
    assert z.height_district == "1"


def test_height_district_1l():
    z = parse_zone_string("R1-1L")
    assert z.base_zone == "R1"
    assert z.height_district == "1L"


def test_height_district_1vl():
    z = parse_zone_string("R1-1VL")
    assert z.base_zone == "R1"
    assert z.height_district == "1VL"


def test_q_prefix():
    z = parse_zone_string("[Q]R1-1")
    assert z.base_zone == "R1"
    assert "Q" in z.suffix_flags


def test_rw_variation():
    z = parse_zone_string("R1RW-1")
    assert z.base_zone == "R1"
    assert z.variation == "RW"
    assert z.height_district == "1"


def test_multiple_bracket_flags():
    z = parse_zone_string("[Q] [CPIO] R1-1-HPOZ")
    assert z.base_zone == "R1"
    assert "Q" in z.suffix_flags
    assert "CPIO" in z.suffix_flags
    assert "HPOZ" in z.suffix_flags


def test_is_residential():
    assert is_residential(parse_zone_string("R1-1")) is True
    assert is_residential(parse_zone_string("R2-1")) is True
    assert is_residential(parse_zone_string("C2-1")) is False


def test_is_in_scope():
    assert is_in_scope(parse_zone_string("R1-1")) is True
    assert is_in_scope(parse_zone_string("R2-1")) is True
    assert is_in_scope(parse_zone_string("R3-1")) is False
    assert is_in_scope(parse_zone_string("C2-1")) is False


def test_parse_failure_graceful():
    z = parse_zone_string("UNKNOWN_ZONE_STRING")
    assert z.base_zone is not None  # Should not crash
