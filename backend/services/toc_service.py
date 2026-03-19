"""
TOC (Transit Oriented Communities) tier lookup via LA City Planning ArcGIS layer.
Returns tier 1-4 for parcels in TOC Incentive Areas, or None if outside.
"""
from __future__ import annotations

import logging
from typing import Optional

from .http_client import arcgis_query

logger = logging.getLogger(__name__)

TOC_LAYER_URL = (
    "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services"
    "/TOC_Incentive_Areas/FeatureServer/0/query"
)


async def detect_toc_tier(lat: float, lng: float) -> Optional[int]:
    """
    Query the LA TOC Incentive Areas layer and return tier (1-4) or None.

    Uses the same arcgis_query pattern as other service modules.
    Returns None (and logs a warning) if the service is unreachable.
    """
    try:
        data = await arcgis_query(
            TOC_LAYER_URL,
            params={
                "geometry": f"{lng},{lat}",
                "geometryType": "esriGeometryPoint",
                "spatialRel": "esriSpatialRelIntersects",
                "outFields": "*",
                "returnGeometry": "false",
            },
        )

        features = data.get("features", [])
        if not features:
            logger.info("No TOC area found for (%.6f, %.6f)", lat, lng)
            return None

        attrs = features[0].get("attributes", {})

        # The tier field name may vary -- check common variants
        tier = (
            attrs.get("Tier")
            or attrs.get("TOC_Tier")
            or attrs.get("tier")
            or attrs.get("toc_tier")
            or attrs.get("TIER")
        )

        if tier is not None:
            tier = int(tier)
            if 1 <= tier <= 4:
                logger.info("TOC Tier %d detected for (%.6f, %.6f)", tier, lat, lng)
                return tier
            logger.warning("Unexpected TOC tier value: %s", tier)
            return None

        # If no recognized tier field, log available fields for debugging
        logger.warning(
            "TOC feature found but no tier field recognized. Available fields: %s",
            list(attrs.keys()),
        )
        return None

    except Exception:
        logger.warning("TOC tier lookup failed for (%.6f, %.6f)", lat, lng, exc_info=True)
        return None
