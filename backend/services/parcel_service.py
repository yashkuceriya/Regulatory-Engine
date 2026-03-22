"""
Parcel lookup service — LA County Parcel MapServer/0.
Spatial query with a point → returns ParcelObservation with full evidence.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from backend.models.entities import ParcelObservation
from .config import ENDPOINTS
from .http_client import arcgis_query

logger = logging.getLogger(__name__)


async def lookup_parcel(lat: float, lon: float) -> ParcelObservation:
    """
    Spatial query on LA County parcel layer for a given point.

    Always passes inSR=4326, outSR=4326 — never rely on default CRS.

    Args:
        lat: Latitude (WGS84)
        lon: Longitude (WGS84)

    Returns:
        ParcelObservation with AIN, APN, situs address, geometry, and evidence

    Raises:
        ValueError: If no parcel found at the given point
    """
    params = {
        "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "true",
        "f": "json",
        "inSR": "4326",
        "outSR": "4326",
        # Geocoded points often land on street centerlines (between parcels)
        # or in the middle of large lots like parking lots. Use a wider buffer
        # to reliably intersect the target parcel polygon.
        "distance": "30",
        "units": "esriSRUnit_Meter",
    }

    data = await arcgis_query(ENDPOINTS.PARCEL, params)
    features = data.get("features", [])

    if not features:
        logger.warning("No parcel found at (%.6f, %.6f)", lat, lon)
        raise ValueError(
            f"No parcel found at coordinates ({lat:.6f}, {lon:.6f}). "
            "Point may be in a park, water body, or right-of-way."
        )

    # If multiple parcels returned, pick smallest area (most specific)
    if len(features) > 1:
        logger.info("Multiple parcels found (%d), selecting smallest area", len(features))
        selected = features[0]
        min_area = float("inf")
        for f in features:
            attrs = f.get("attributes", {})
            area = attrs.get("SitusArea") or attrs.get("ShapeArea") or attrs.get("Shape__Area")
            if area and float(area) < min_area:
                min_area = float(area)
                selected = f
    else:
        selected = features[0]

    props = selected.get("attributes", {})
    raw_geometry = selected.get("geometry")
    # Convert ArcGIS rings format to GeoJSON
    geometry = _arcgis_to_geojson(raw_geometry)

    # Extract lot area — try multiple field names
    lot_area = None
    for field in ["SitusArea", "ShapeArea", "Shape__Area", "LotSize", "LOT_AREA"]:
        val = props.get(field)
        if val is not None:
            try:
                lot_area = float(val)
                break
            except (ValueError, TypeError):
                continue

    observation = ParcelObservation(
        ain=str(props.get("AIN", props.get("ain", ""))),
        apn=str(props.get("APN", props.get("apn", ""))),
        situs_full_address=_build_situs_address(props),
        lot_area_sqft=lot_area,
        geometry=geometry,
        source_url=ENDPOINTS.PARCEL,
        retrieval_ts=datetime.now(tz=timezone.utc),
    )

    # Compute response hash for evidence trail
    observation.compute_hash(selected)

    return observation


def _arcgis_to_geojson(geom: dict | None) -> dict | None:
    """Convert ArcGIS JSON geometry (rings) to GeoJSON Polygon."""
    if not geom:
        return None
    rings = geom.get("rings")
    if rings:
        return {
            "type": "Polygon",
            "coordinates": rings,
        }
    # Already GeoJSON or unknown format
    if "type" in geom:
        return geom
    return None


CA_STATEWIDE_PARCELS = "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0/query"


async def lookup_parcel_statewide(lat: float, lon: float) -> ParcelObservation:
    """
    Fallback parcel lookup using CA Statewide Parcels layer.
    Works for any California address outside LA City.
    """
    params = {
        "geometry": f"{lon - 0.001},{lat - 0.001},{lon + 0.001},{lat + 0.001}",
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "PARCEL_APN,SITE_ADDR,SITE_CITY,COUNTYNAME,Shape__Area",
        "returnGeometry": "true",
        "f": "json",
        "inSR": "4326",
        "outSR": "4326",
    }

    data = await arcgis_query(CA_STATEWIDE_PARCELS, params)
    features = data.get("features", [])

    if not features:
        raise ValueError(f"No parcel found at ({lat:.6f}, {lon:.6f}) in CA statewide data.")

    # Pick smallest parcel (most specific)
    selected = min(features, key=lambda f: f.get("attributes", {}).get("Shape__Area", float("inf")))
    props = selected.get("attributes", {})
    geometry = _arcgis_to_geojson(selected.get("geometry"))

    # Shape__Area from CA statewide layer is in CA Albers sq meters (EPSG:3310)
    # Convert to sqft: 1 sq meter = 10.7639 sqft
    lot_area = None
    area_val = props.get("Shape__Area")
    if area_val:
        try:
            area_sqm = float(area_val)
            lot_area = area_sqm * 10.7639  # sq meters → sqft
        except (ValueError, TypeError):
            pass

    addr = props.get("SITE_ADDR", "")
    city = props.get("SITE_CITY", "")
    situs = f"{addr}, {city}" if addr and city else addr or city or "Unknown"

    observation = ParcelObservation(
        ain="",
        apn=str(props.get("PARCEL_APN", "")),
        situs_full_address=situs,
        lot_area_sqft=lot_area,
        geometry=geometry,
        source_url=CA_STATEWIDE_PARCELS,
        retrieval_ts=datetime.now(tz=timezone.utc),
    )
    observation.compute_hash(selected)
    return observation


def _build_situs_address(props: dict) -> str:
    """Assemble situs address from parcel properties."""
    parts = []
    for field in [
        "SitusHouseNo", "SitusHouseNoSuffix", "SitusDirection", "SitusFraction",
        "SitusStreet", "SitusStreetName", "SitusStreetSuffix", "SitusCity",
        "SitusZIP", "SitusZipCode",
    ]:
        val = props.get(field) or props.get(field.upper(), "")
        if val and str(val).strip():
            parts.append(str(val).strip())

    if parts:
        return " ".join(parts)

    # Fallback: try combined fields
    return props.get("SitusFullAddress", props.get("SITUS", "Unknown address"))
