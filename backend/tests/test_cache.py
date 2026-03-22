"""Tests for pipeline caching."""
import time
import pytest
from unittest.mock import AsyncMock, patch

from backend.services.pipeline import _cache, _cache_key, _CACHE_TTL


def test_cache_key_normalization():
    """Same address with different casing/spacing should produce same key."""
    assert _cache_key("123 Main St", None) == _cache_key("  123 main st  ", None)
    assert _cache_key("123 Main St", 800) == _cache_key("123 main st", 800)
    assert _cache_key("123 Main St", None) != _cache_key("123 Main St", 800)


def test_cache_key_different_addresses():
    """Different addresses should produce different keys."""
    assert _cache_key("123 Main St", None) != _cache_key("456 Oak Ave", None)
