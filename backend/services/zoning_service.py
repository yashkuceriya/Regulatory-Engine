"""
Zoning service — City Planning Zoning FeatureServer/15.
Spatial query → ZoningObservation with parsed zone components.

NOTE: This layer is in EPSG:2229 (CA State Plane, feet). Point queries with
inSR=4326 do not reliably reproject, so we use an envelope geometry instead.
The zoning field is named "Zoning" (not ZONE_CMPLT).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from backend.models.entities import ZoningObservation
from .config import ENDPOINTS
from .http_client import arcgis_query
from .zone_parser import parse_zone_string

logger = logging.getLogger(__name__)

# Buffer in degrees (~30 meters) for the envelope around the geocoded point.
# Wider buffer helps catch zoning for parking lots and large parcels where
# the geocoded point may not fall precisely within the zoning polygon.
_BUFFER_DEG = 0.0003


async def lookup_zoning(lat: float, lon: float) -> ZoningObservation:
    """
    Spatial query on City Planning zoning layer for a given point.

    Uses an envelope geometry rather than a point because the service's
    CRS reprojection (inSR=4326 → native EPSG:2229) is unreliable for
    point-in-polygon tests.

    Args:
        lat: Latitude (WGS84)
        lon: Longitude (WGS84)

    Returns:
        ZoningObservation with zoning_string, category, and parsed components

    Raises:
        ValueError: If no zoning data found
    """
    params = {
        "where": "1=1",
        "geometry": (
            f'{{"xmin":{lon - _BUFFER_DEG},"ymin":{lat - _BUFFER_DEG},'
            f'"xmax":{lon + _BUFFER_DEG},"ymax":{lat + _BUFFER_DEG}}}'
        ),
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "Zoning,CATEGORY",
        "returnGeometry": "false",
        "f": "json",
        "inSR": "4326",
        "outSR": "4326",
        "resultRecordCount": "5",
    }

    data = await arcgis_query(ENDPOINTS.ZONING, params)
    features = data.get("features", [])

    if not features:
        # Retry with a larger buffer
        logger.warning(
            "No zoning at (%.6f, %.6f), retrying with wider buffer", lat, lon,
        )
        return await _lookup_wider_buffer(lat, lon)

    attrs = _pick_best_feature(features, lat, lon).get("attributes", {})

    # The field is named "Zoning" in this service
    zoning_string = (
        attrs.get("Zoning")
        or attrs.get("ZONE_CMPLT")
        or attrs.get("ZONING")
        or attrs.get("Zone_Class")
        or ""
    )

    if not zoning_string:
        raise ValueError(
            f"Zoning feature found but no zone string at ({lat:.6f}, {lon:.6f}). "
            f"Available fields: {list(attrs.keys())}"
        )

    category = attrs.get("CATEGORY", attrs.get("category", ""))
    components = parse_zone_string(zoning_string)

    logger.info(
        "Zoning at (%.6f, %.6f): %s → base=%s, hd=%s, hillside=%s",
        lat, lon, zoning_string,
        components.base_zone, components.height_district, components.hillside,
    )

    return ZoningObservation(
        zoning_string=zoning_string,
        category=category,
        zone_components=components,
        source_url=ENDPOINTS.ZONING,
        retrieval_ts=datetime.now(tz=timezone.utc),
    )


async def _lookup_wider_buffer(lat: float, lon: float) -> ZoningObservation:
    """Retry zoning query with a wider buffer (~50m)."""
    wide_buffer = 0.0005

    params = {
        "where": "1=1",
        "geometry": (
            f'{{"xmin":{lon - wide_buffer},"ymin":{lat - wide_buffer},'
            f'"xmax":{lon + wide_buffer},"ymax":{lat + wide_buffer}}}'
        ),
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "Zoning,CATEGORY",
        "returnGeometry": "false",
        "f": "json",
        "inSR": "4326",
        "outSR": "4326",
        "resultRecordCount": "5",
    }

    data = await arcgis_query(ENDPOINTS.ZONING, params)
    features = data.get("features", [])

    if not features:
        raise ValueError(
            f"No zoning data found at ({lat:.6f}, {lon:.6f}) even with wider buffer. "
            "Parcel may be in an unzoned area or right-of-way."
        )

    attrs = _pick_best_feature(features, lat, lon).get("attributes", {})
    zoning_string = (
        attrs.get("Zoning")
        or attrs.get("ZONE_CMPLT")
        or attrs.get("ZONING")
        or ""
    )

    if not zoning_string:
        raise ValueError("Zoning feature found via buffer but no zone string")

    components = parse_zone_string(zoning_string)

    logger.info(
        "Zoning (wide buffer) at (%.6f, %.6f): %s",
        lat, lon, zoning_string,
    )

    return ZoningObservation(
        zoning_string=zoning_string,
        category=attrs.get("CATEGORY", ""),
        zone_components=components,
        source_url=ENDPOINTS.ZONING,
        retrieval_ts=datetime.now(tz=timezone.utc),
    )


def _pick_best_feature(features: list[dict], lat: float, lon: float) -> dict:
    """
    Pick the most relevant zoning feature when multiple intersect the
    query envelope.  Prefer features whose zone string is non-empty and
    that are not right-of-way / open-space placeholders.  Among those,
    log a warning when multiple distinct zones are present (split-zoned).
    """
    _ROW_ZONES = {"", "PF", "OS"}  # right-of-way / open-space placeholders

    candidates = []
    for f in features:
        a = f.get("attributes", {})
        z = a.get("Zoning") or a.get("ZONE_CMPLT") or a.get("ZONING") or ""
        if z.strip().upper() not in _ROW_ZONES:
            candidates.append((f, z.strip().upper()))

    if not candidates:
        # All features were ROW/OS — fall back to first raw feature
        # but still return it so the pipeline can classify the zone
        return features[0]

    # Warn if the parcel sits on multiple distinct zones
    distinct = {z for _, z in candidates}
    if len(distinct) > 1:
        logger.warning(
            "Split-zoned parcel at (%.6f, %.6f): %s — picking best match",
            lat, lon, distinct,
        )

    # Prefer the most specific/useful zone: residential > commercial > other
    def _zone_priority(item: tuple) -> int:
        _, z = item
        base = z.split("-")[0] if "-" in z else z
        # Remove bracket prefixes like [Q]
        import re
        base = re.sub(r"\[[^\]]*\]", "", base).strip()
        if base.startswith("R"):
            return 0  # residential — highest priority
        if base.startswith("C"):
            return 1  # commercial
        if base.startswith("M"):
            return 2  # industrial
        return 3  # other

    candidates.sort(key=_zone_priority)
    return candidates[0][0]
