"""
Geocoder service — City centerlineLocator with Census TIGER fallback.
Converts street address → (lat, lon, match_score, normalized_address).
"""
from __future__ import annotations

import logging

import httpx

from backend.models.entities import GeocodeResult
from .config import ENDPOINTS, SETTINGS
from .http_client import arcgis_query

logger = logging.getLogger(__name__)

_WEB_MERCATOR_WKIDS = {3857, 102100, 102113}

try:
    from pyproj import Transformer
    _to_4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
except ImportError:
    _to_4326 = None


async def geocode_address(address: str) -> GeocodeResult:
    """
    Geocode an LA address using the City centerline locator.

    Args:
        address: Free-text street address, e.g. "1234 Sunset Blvd Los Angeles CA"

    Returns:
        GeocodeResult with lat/lon, match score, and normalized address

    Raises:
        ValueError: If no candidate meets the minimum score threshold
    """
    params = {
        "Single Line Input": address,
        "maxLocations": SETTINGS.GEOCODE_MAX_CANDIDATES,
        "outFields": "*",
        "outSR": "4326",
        "f": "json",
    }

    data = await arcgis_query(
        ENDPOINTS.GEOCODER,
        params,
        ensure_4326=False,
    )

    candidates = data.get("candidates", [])

    if not candidates:
        logger.warning("No geocode candidates for: %s", address)
        raise ValueError(f"No geocode candidates found for address: {address}")

    # Take highest-scoring candidate
    best = max(candidates, key=lambda c: c.get("score", 0))
    score = best.get("score", 0)

    if score < SETTINGS.GEOCODE_MIN_SCORE:
        logger.warning(
            "Best geocode score %.1f below threshold %.1f for: %s",
            score, SETTINGS.GEOCODE_MIN_SCORE, address,
        )
        raise ValueError(
            f"Geocode confidence too low ({score:.0f}). "
            f"Best match: {best.get('address', 'unknown')}. "
            f"Minimum required: {SETTINGS.GEOCODE_MIN_SCORE}"
        )

    location = best.get("location", {})
    spatial_reference = (
        location.get("spatialReference")
        or best.get("attributes", {}).get("spatialReference")
        or data.get("spatialReference")
    )
    lon, lat = _normalize_to_wgs84(location, spatial_reference)

    return GeocodeResult(
        latitude=lat,
        longitude=lon,
        match_score=score,
        address_normalized=best.get("address", address),
        source="city_centerline",
    )


async def geocode_with_fallback(address: str) -> GeocodeResult:
    """
    Try city geocoder first, fall back to Census TIGER if it fails.

    Falls back on:
    - HTTP/transport errors (service down)
    - "No candidates found" (service returned empty results)

    Does NOT fall back on low-confidence scores — that means the service
    found something but isn't sure, and Census could silently shift the parcel.
    """
    try:
        return await geocode_address(address)
    except httpx.HTTPError as e:
        logger.warning("City geocoder HTTP error, trying Census fallback: %s", e)
        return await _census_geocode(address)
    except ValueError as e:
        if "No geocode candidates" in str(e):
            logger.warning("City geocoder returned no candidates, trying Census: %s", e)
            return await _census_geocode(address)
        if "Geocode confidence too low" in str(e):
            # Low-confidence from city geocoder — try Census as it may
            # resolve parking lots and other non-standard addresses better
            logger.warning("City geocoder low confidence, trying Census fallback: %s", e)
            return await _census_geocode(address)
        raise


async def _census_geocode(address: str) -> GeocodeResult:
    """
    Fallback: US Census Bureau geocoder (free, no API key).
    """
    from .http_client import get_client

    client = await get_client()
    resp = await client.get(
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
        params={
            "address": address,
            "benchmark": "Public_AR_Current",
            "format": "json",
        },
    )
    resp.raise_for_status()
    data = resp.json()

    matches = data.get("result", {}).get("addressMatches", [])
    if not matches:
        raise ValueError(f"Census geocoder also found no match for: {address}")

    best = matches[0]
    coords = best.get("coordinates", {})

    return GeocodeResult(
        latitude=coords.get("y", 0),
        longitude=coords.get("x", 0),
        match_score=70.0,  # Census fallback — lower confidence than city geocoder
        address_normalized=best.get("matchedAddress", address),
        source="census_tiger",
    )


def _normalize_to_wgs84(location: dict, spatial_reference: dict | None) -> tuple[float, float]:
    """Normalize ArcGIS geocoder coordinates to WGS84 lon/lat."""
    if "x" not in location or "y" not in location:
        raise ValueError("Geocoder candidate missing coordinates")

    x = float(location["x"])
    y = float(location["y"])

    wkid = None
    if spatial_reference:
        wkid = spatial_reference.get("latestWkid") or spatial_reference.get("wkid")

    if wkid in (None, 4326):
        return x, y

    if int(wkid) in _WEB_MERCATOR_WKIDS and _to_4326 is not None:
        lon, lat = _to_4326.transform(x, y)
        return lon, lat

    if int(wkid) in _WEB_MERCATOR_WKIDS:
        logger.warning("pyproj not installed; returning raw Web Mercator coordinates")
        return x, y

    logger.warning("Unexpected geocoder spatial reference wkid=%s; returning raw coordinates", wkid)
    return x, y
