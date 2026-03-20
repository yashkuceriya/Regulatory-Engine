"""
Geometry engine — Shapely setback envelope computation.
Parcel polygon + setback values → buildable envelope GeoJSON.

NOTE: Parcel geometry from ArcGIS is in EPSG:4326 (degrees).
We must project to a local CRS (EPSG:2229, CA State Plane Zone 5, feet)
for accurate setback computation in feet, then project back to 4326.
"""
from __future__ import annotations

import logging
from typing import Optional

from backend.models.entities import Evidence, FindingMethod, RegulatoryFinding

logger = logging.getLogger(__name__)

try:
    from pyproj import Transformer
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union

    HAS_GIS = True
    # EPSG:2229 = CA State Plane Zone 5 (feet) — matches LA area
    to_stateplane = Transformer.from_crs("EPSG:4326", "EPSG:2229", always_xy=True)
    to_wgs84 = Transformer.from_crs("EPSG:2229", "EPSG:4326", always_xy=True)
except ImportError:
    HAS_GIS = False
    logger.warning("shapely/pyproj not installed — geometry engine disabled")


def compute_buildable_envelope(
    parcel_geojson: dict,
    setbacks: dict,
) -> Optional[dict]:
    """
    Compute the buildable envelope by insetting parcel polygon by setback values.

    This uses a simplified approach: uniform buffer with the minimum setback,
    then a secondary buffer for the difference. For more precise per-side
    setbacks, a production system would identify front/side/rear edges.

    Args:
        parcel_geojson: GeoJSON geometry of the parcel
        setbacks: Dict with keys 'front', 'side', 'rear' in feet

    Returns:
        GeoJSON Feature of the buildable envelope, or None if computation fails
    """
    if not HAS_GIS:
        logger.error("Cannot compute envelope — GIS libraries not available")
        return None

    try:
        # Parse the parcel geometry
        if "geometry" in parcel_geojson:
            geom_data = parcel_geojson["geometry"]
        else:
            geom_data = parcel_geojson

        parcel = shape(geom_data)

        if not parcel.is_valid:
            parcel = parcel.buffer(0)  # Fix invalid geometry

        # Project to State Plane (feet) for accurate distance computation
        parcel_sp = _transform_geom(parcel, to_stateplane)

        # Apply setbacks as negative buffer
        # Simplified: use minimum setback first, then adjust
        front = setbacks.get("front", 20)
        side = setbacks.get("side", 5)
        rear = setbacks.get("rear", 15)

        # Use the minimum setback for initial inset
        min_setback = min(front, side, rear)
        envelope = parcel_sp.buffer(-min_setback)

        if envelope.is_empty:
            logger.warning("Setback inset produced empty geometry — lot too small")
            return None

        # Apply additional inset for larger setbacks.
        # 0.3 weighting: front setback is typically only one edge, so we apply
        # 30% of the difference as uniform buffer to approximate the asymmetric
        # inset without per-edge geometry analysis. Production would identify
        # actual front/side/rear edges from street-facing azimuth.
        if front > min_setback:
            additional = (front - min_setback) * 0.3
            envelope = envelope.buffer(-additional)

        if envelope.is_empty:
            logger.warning("Additional setback inset produced empty geometry")
            return None

        # Handle MultiPolygon from buffer operations on complex geometries
        from shapely.geometry import MultiPolygon, Polygon
        if isinstance(envelope, MultiPolygon):
            # Take the largest polygon from the MultiPolygon
            largest = max(envelope.geoms, key=lambda g: g.area)
            logger.info(
                "Buffer produced MultiPolygon (%d parts), using largest (%.0f sqft)",
                len(envelope.geoms), largest.area,
            )
            envelope = largest

        if not isinstance(envelope, Polygon) or envelope.is_empty:
            logger.warning("Envelope is not a valid Polygon after processing")
            return None

        # Project back to WGS84
        envelope_wgs = _transform_geom(envelope, to_wgs84)

        # Validate the output geometry
        geojson_geom = mapping(envelope_wgs)
        if geojson_geom.get("type") not in ("Polygon", "MultiPolygon"):
            logger.warning("Envelope geometry type unexpected: %s", geojson_geom.get("type"))
            return None

        coords = geojson_geom.get("coordinates", [])
        if not coords or (isinstance(coords[0], list) and len(coords[0]) < 4):
            logger.warning("Envelope has too few coordinates to form a valid polygon")
            return None

        # Compute areas for the finding
        parcel_area_sqft = parcel_sp.area
        envelope_area_sqft = envelope.area if not envelope.is_empty else 0

        return {
            "type": "Feature",
            "geometry": geojson_geom,
            "properties": {
                "type": "buildable_envelope",
                "parcel_area_sqft": round(parcel_area_sqft, 1),
                "envelope_area_sqft": round(envelope_area_sqft, 1),
                "coverage_pct": round(
                    (envelope_area_sqft / parcel_area_sqft * 100)
                    if parcel_area_sqft > 0 else 0,
                    1,
                ),
                "setbacks_applied": setbacks,
            },
        }

    except Exception as e:
        logger.error("Geometry computation failed: %s", e, exc_info=True)
        return None


def compute_lot_area_sqft(parcel_geojson: dict) -> Optional[float]:
    """
    Compute lot area in square feet from parcel GeoJSON.
    Projects to State Plane for accurate area in feet.
    """
    if not HAS_GIS:
        return None

    try:
        geom_data = parcel_geojson.get("geometry", parcel_geojson)
        parcel = shape(geom_data)
        if not parcel.is_valid:
            parcel = parcel.buffer(0)
        parcel_sp = _transform_geom(parcel, to_stateplane)
        return round(parcel_sp.area, 1)
    except Exception as e:
        logger.error("Lot area computation failed: %s", e)
        return None


def get_envelope_finding(
    parcel_geojson: dict,
    setbacks: dict,
    *,
    is_default_setbacks: bool = False,
) -> RegulatoryFinding:
    """Compute buildable envelope and wrap it in a RegulatoryFinding."""
    envelope = compute_buildable_envelope(parcel_geojson, setbacks)

    if envelope is None:
        return RegulatoryFinding(
            finding_type="buildable_envelope",
            value=None,
            method=FindingMethod.NOT_EVALUATED,
            confidence=0.0,
            reason="geometry_computation_failed",
        )

    confidence = 0.60 if is_default_setbacks else 0.75
    assumptions = [
        "Uniform setback applied (simplified — production would identify front/side/rear edges)",
        f"Setbacks: front={setbacks.get('front')}ft, side={setbacks.get('side')}ft, rear={setbacks.get('rear')}ft",
    ]
    if is_default_setbacks:
        assumptions.insert(0, "Default setbacks used — zone-specific rules not yet modeled. Envelope is approximate.")

    return RegulatoryFinding(
        finding_type="buildable_envelope",
        value=envelope,
        method=FindingMethod.CALCULATION,
        confidence=confidence,
        evidence=[
            Evidence(
                source_type="calculation",
                source_locator="Shapely buffer inset on EPSG:2229-projected parcel polygon",
            ),
        ],
        assumptions=assumptions,
    )


def _transform_geom(geom, transformer):
    """Transform a Shapely geometry using a pyproj Transformer."""
    from shapely.ops import transform as shapely_transform
    return shapely_transform(transformer.transform, geom)
