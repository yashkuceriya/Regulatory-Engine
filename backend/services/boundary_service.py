"""
City boundary check — Boundaries MapServer/7.
Gates all downstream zoning calls: if outside LA City, stop early.

NOTE: This layer is in EPSG:3857 (Web Mercator). The inSR parameter does not
reliably reproject on this server, so we convert to native CRS before querying.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from pyproj import Transformer

from backend.models.entities import JurisdictionObservation
from .config import ENDPOINTS
from .http_client import arcgis_query

logger = logging.getLogger(__name__)

_to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)


async def check_city_boundary(lat: float, lon: float) -> JurisdictionObservation:
    """
    Point-in-polygon test against LA City boundaries.

    Args:
        lat: Latitude (WGS84)
        lon: Longitude (WGS84)

    Returns:
        JurisdictionObservation with inside_city_boundary flag
    """
    # Convert to Web Mercator (native CRS of this layer)
    x, y = _to_3857.transform(lon, lat)

    params = {
        "geometry": f"{x},{y}",
        "geometryType": "esriGeometryPoint",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "CITY",
        "returnGeometry": "false",
        "f": "json",
    }

    data = await arcgis_query(ENDPOINTS.CITY_BOUNDARY, params, ensure_4326=False)
    features = data.get("features", [])

    # If features returned, point is inside the LA City boundary polygon.
    # The CITY field = "IN" for inside.
    inside = len(features) > 0

    if inside:
        props = features[0].get("attributes", {})
        city_val = str(props.get("CITY", "")).strip().upper()
        # "IN" means inside LA City limits
        if city_val and city_val != "IN":
            logger.warning(
                "Boundary returned CITY='%s' — unexpected value. "
                "Treating as outside jurisdiction.",
                city_val,
            )
            inside = False

    logger.info(
        "Boundary check at (%.6f, %.6f): inside_city=%s",
        lat, lon, inside,
    )

    return JurisdictionObservation(
        inside_city_boundary=inside,
        source_url=ENDPOINTS.CITY_BOUNDARY,
        retrieval_ts=datetime.now(tz=timezone.utc),
    )
