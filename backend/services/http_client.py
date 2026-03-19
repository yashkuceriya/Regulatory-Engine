"""
Shared HTTP client for ArcGIS REST API calls.
Handles retries, timeouts, logging, and CRS normalization.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

import httpx

from .config import SETTINGS

logger = logging.getLogger(__name__)

# Shared async client — reuse across requests for connection pooling
_client: Optional[httpx.AsyncClient] = None
_client_lock = asyncio.Lock()


async def get_client() -> httpx.AsyncClient:
    """Get or create the shared async HTTP client (thread-safe)."""
    global _client
    async with _client_lock:
        if _client is None or _client.is_closed:
            _client = httpx.AsyncClient(
                timeout=httpx.Timeout(SETTINGS.HTTP_TIMEOUT),
                follow_redirects=True,
                headers={"User-Agent": "CoverRegulatoryEngine/1.0"},
            )
    return _client


async def arcgis_query(
    url: str,
    params: dict[str, Any],
    *,
    ensure_4326: bool = True,
) -> dict:
    """
    Execute an ArcGIS REST query with standard parameters.

    Always normalizes CRS to EPSG:4326 unless told otherwise.
    Logs endpoint, timing, and status for evidence trail.
    """
    # Always enforce CRS normalization
    if ensure_4326:
        params.setdefault("inSR", "4326")
        params.setdefault("outSR", "4326")

    params.setdefault("f", "json")

    client = await get_client()

    for attempt in range(1, SETTINGS.HTTP_RETRIES + 2):
        start = time.monotonic()
        try:
            resp = await client.get(url, params=params)
            elapsed_ms = (time.monotonic() - start) * 1000

            logger.info(
                "ArcGIS query: %s | status=%d | time=%.0fms | attempt=%d",
                url.split("/")[-2] + "/" + url.split("/")[-1],
                resp.status_code,
                elapsed_ms,
                attempt,
            )

            resp.raise_for_status()
            data = resp.json()

            # Check for ArcGIS-level errors
            if "error" in data:
                error_msg = data["error"].get("message", "Unknown ArcGIS error")
                logger.error("ArcGIS error: %s", error_msg)
                raise httpx.HTTPStatusError(
                    error_msg,
                    request=resp.request,
                    response=resp,
                )

            return data

        except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
            if attempt <= SETTINGS.HTTP_RETRIES:
                logger.warning("Retry %d/%d for %s: %s", attempt, SETTINGS.HTTP_RETRIES, url, e)
                continue
            raise

    # Should not reach here, but just in case
    raise httpx.HTTPError(f"All {SETTINGS.HTTP_RETRIES + 1} attempts failed for {url}")


async def close_client():
    """Close the HTTP client — call on shutdown."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
