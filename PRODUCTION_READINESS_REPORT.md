# Production Readiness Report

**Updated:** March 20, 2026

## Resolved

| Issue | Resolution |
|-------|-----------|
| HTTP client race condition | `asyncio.Lock()` on `get_client()` |
| Feedback service race + input validation | Lock on `_ensure_table()`, 5K char limit |
| LLM JSON parsing fragile | `_extract_json()` handles fences, brace blocks, malformed output |
| No error boundary | `ErrorBoundary` wraps app shell |
| No rate limiting | In-memory per-IP: 10 assess/min, 20 chat/min |
| CORS hardcoded | `CORS_ORIGINS` env var, defaults to localhost |
| Feedback DB path | `FEEDBACK_DB_PATH` env var |
| Pipeline hangs on slow APIs | 45s pipeline timeout, 15s LLM timeout, 12s HTTP timeout |
| Verdict allows on unevaluated findings | `CRITICAL_FINDING_TYPES` check forces FLAGGED |
| Zone parse failure silent | Pipeline appends `zone_parse` error, assessment degraded |
| Out-of-scope zones given fake confidence | NOT_EVALUATED + 0.30 confidence on defaults |
| Overlay "All Clear" when unscreened | `unscreened_overlays` field, UI shows partial screening |
| TOC not implemented | Real GIS query via LA City Planning ArcGIS |
| LLM model hardcoded | `LLM_MODEL` env var |
| pipeline_timing type mismatch | `dict[str, int]` matches `_tock()` return |
| Golden tests break CI | `@pytest.mark.integration`, skipped by default |

## Remaining (non-blocking)

| Issue | Severity | Notes |
|-------|----------|-------|
| Geometry 0.3 weight is approximate | Low | Documented; production needs per-edge analysis |
| `any` types in Mapbox/Recharts callbacks | Low | Unavoidable with those APIs |
| No auth on API endpoints | Medium | OK for demo; production needs API keys or network isolation |
| Feedback on SQLite | Medium | Fine for single-instance; Postgres for multi-instance |
| No structured logging (JSON) | Low | Stdout logging works for Railway; add JSON formatter for aggregators |

## Deploy

- **Frontend:** Vercel — `vercel.json` configured
- **Backend:** Railway — `railway.json` configured, healthcheck on `/health`
- **Env vars needed:** `ANTHROPIC_API_KEY`, `MAPBOX_TOKEN`, `CORS_ORIGINS`, `VITE_API_URL`, `VITE_MAPBOX_TOKEN`
