"""
Configuration and endpoint URLs for Cover Regulatory Engine.

Multi-jurisdiction architecture: each jurisdiction has its own set of
GIS endpoints. LA City is the first and deepest implementation.
The engine is designed to expand to any SoCal city by adding a new
JurisdictionConfig entry.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


# ---------------------------------------------------------------------------
# Jurisdiction-aware endpoint registry
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class JurisdictionConfig:
    """GIS endpoints + metadata for a single jurisdiction."""
    name: str
    geocoder: str
    parcel: str
    zoning: str
    boundary: str | None = None  # Optional — not all cities have a boundary layer
    supported_zones: list[str] = field(default_factory=list)
    status: str = "active"  # active | planned | beta


# LA City — deepest implementation (R1/R2 + ADU + overlays + geometry)
LA_CITY = JurisdictionConfig(
    name="LA City",
    geocoder=(
        "https://maps.lacity.org/lahub/rest/services/centerlineLocator"
        "/GeocodeServer/findAddressCandidates"
    ),
    parcel=(
        "https://public.gis.lacounty.gov/public/rest/services"
        "/LACounty_Cache/LACounty_Parcel/MapServer/0/query"
    ),
    zoning=(
        "https://services5.arcgis.com/7nsPwEMP38bSkCjy/arcgis/rest/services"
        "/Zoning/FeatureServer/15/query"
    ),
    boundary=(
        "https://maps.lacity.org/lahub/rest/services"
        "/Boundaries/MapServer/7/query"
    ),
    supported_zones=["R1", "R2", "RD", "RS", "RE", "RA"],
    status="active",
)

# CA Statewide — active (parcel data via CA Statewide Parcels + state ADU rules)
CA_STATEWIDE = JurisdictionConfig(
    name="CA Statewide",
    geocoder="https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
    parcel="https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0/query",
    zoning="",
    supported_zones=["State ADU Rules"],
    status="active",
)

# San Diego — active via statewide parcels + state ADU rules
SAN_DIEGO = JurisdictionConfig(
    name="San Diego",
    geocoder="https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
    parcel="https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0/query",
    zoning="",
    supported_zones=["State ADU Rules"],
    status="active",
)

# Santa Monica — active via statewide parcels + state ADU rules
SANTA_MONICA = JurisdictionConfig(
    name="Santa Monica",
    geocoder="https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
    parcel="https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0/query",
    zoning="",
    supported_zones=["State ADU Rules"],
    status="active",
)

# Orange County — planned (local zoning not yet integrated)
ORANGE_COUNTY = JurisdictionConfig(
    name="Orange County",
    geocoder="https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
    parcel="https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0/query",
    zoning="",
    supported_zones=["State ADU Rules"],
    status="planned",
)

# Long Beach — planned (local zoning not yet integrated)
LONG_BEACH = JurisdictionConfig(
    name="Long Beach",
    geocoder="https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
    parcel="https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/CA_Statewide_Parcels_Public_view/FeatureServer/0/query",
    zoning="",
    supported_zones=["State ADU Rules"],
    status="planned",
)

# Registry — all known jurisdictions
JURISDICTIONS: dict[str, JurisdictionConfig] = {
    "la_city": LA_CITY,
    "ca_statewide": CA_STATEWIDE,
    "san_diego": SAN_DIEGO,
    "santa_monica": SANTA_MONICA,
    "orange_county": ORANGE_COUNTY,
    "san_diego": SAN_DIEGO,
    "long_beach": LONG_BEACH,
}

# ---------------------------------------------------------------------------
# Backward-compatible ENDPOINTS (used by current LA-focused pipeline)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class APIEndpoints:
    """Legacy endpoints — delegates to LA_CITY config."""
    GEOCODER: str = LA_CITY.geocoder
    PARCEL: str = LA_CITY.parcel
    ZONING: str = LA_CITY.zoning
    CITY_BOUNDARY: str = LA_CITY.boundary or ""


ENDPOINTS = APIEndpoints()


@dataclass
class Settings:
    """App configuration — env vars with sensible defaults."""

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite+aiosqlite:///./regulatory.db"
    )

    # API keys
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    MAPBOX_TOKEN: str = os.getenv("MAPBOX_TOKEN", "")

    # Geocoder settings
    GEOCODE_MIN_SCORE: float = 75.0
    GEOCODE_MAX_CANDIDATES: int = 5

    # HTTP client
    HTTP_TIMEOUT: float = 12.0
    HTTP_RETRIES: int = 1

    # Standard CRS — normalize everything to WGS84
    STANDARD_CRS: str = "EPSG:4326"

    # CORS — comma-separated origins, or "*" for wide open (dev only)
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:5174,http://localhost:3000"
    )

    # LLM
    LLM_MODEL: str = os.getenv("LLM_MODEL", "claude-sonnet-4-6")


SETTINGS = Settings()
