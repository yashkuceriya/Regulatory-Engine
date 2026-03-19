"""Tests for geocoder coordinate normalization."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.services.geocoder import _normalize_to_wgs84


def test_normalize_passthrough_wgs84():
    lon, lat = _normalize_to_wgs84(
        {"x": -118.35, "y": 34.02},
        {"wkid": 4326},
    )

    assert lon == -118.35
    assert lat == 34.02


def test_normalize_web_mercator_origin():
    lon, lat = _normalize_to_wgs84(
        {"x": 0, "y": 0},
        {"wkid": 3857},
    )

    assert lon == 0
    assert lat == 0


def test_missing_coordinates_raise():
    with pytest.raises(ValueError):
        _normalize_to_wgs84({}, {"wkid": 4326})
