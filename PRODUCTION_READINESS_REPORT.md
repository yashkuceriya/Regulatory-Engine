# Cover Regulatory Engine — Production Readiness Report

**Date:** March 17, 2026
**Scope:** Full codebase audit (backend + frontend) and deployment research

---

## Executive Summary

The Cover Regulatory Engine is architecturally sound with a well-structured 8-step pipeline, deterministic rule engine, and clean separation of concerns. However, the audit identified **26 backend issues** and **40+ frontend issues** that need attention before production deployment. The most critical gaps are around async race conditions, input validation, incomplete field wiring, and missing error boundaries.

**Deployment recommendation:** Railway with Postgres (not Supabase) — simplest path, ~$20–35/month, full FastAPI support, built-in PostGIS.

---

## 1. Backend Audit — Critical Issues

### 1.1 Race Condition in HTTP Client (http_client.py)
The global `_client` variable in `get_client()` has no locking. Two concurrent requests can both see `_client is None` and create duplicate clients. **Fix:** Add `asyncio.Lock()` around initialization.

### 1.2 Race Condition in Feedback Service (feedback_service.py)
Same pattern — `_initialized` flag checked without a lock. Two concurrent requests can both attempt table creation. **Fix:** Add `asyncio.Lock()` around `_ensure_table()`.

### 1.3 Retry Logic Bug (http_client.py)
The loop iterates `range(1, HTTP_RETRIES + 2)` but the final `raise httpx.HTTPError(...)` after the loop is unreachable dead code. The loop's own `raise` on the last attempt always fires first. Not a correctness bug, but confusing. **Fix:** Simplify loop bounds and remove dead code.

### 1.4 LLM JSON Parsing Fragile (llm_service.py)
`text.split("```json")[1]` can throw `IndexError` if Claude returns unexpected format. The broad `except Exception` catch masks the real issue. **Fix:** Add explicit `IndexError` + `json.JSONDecodeError` handling with diagnostic logging.

### 1.5 No Input Length Validation on Feedback (feedback_service.py)
The `comment` field has no length cap. A malicious user could submit megabytes of text, bloating the database. **Fix:** Add `len(comment) <= 5000` validation.

---

## 2. Backend Audit — High Issues

### 2.1 `overall_recommendation` and `edge_cases` Never Populated
These `BuildabilityAssessment` fields exist in the model but are never set by the pipeline. `enrich_assessment()` in `llm_service.py` can produce them, but is only called in `main.py`'s `/api/assess` endpoint — not in the pipeline itself. The wiring in `main.py` (lines 163–176) does connect them, but only if the LLM enrichment succeeds. **Status:** Partially wired. If Anthropic key is missing, these fields stay empty with no indication to the user.

### 2.2 `pipeline_timing` Type Mismatch (entities.py)
Declared as `dict[str, float]` but values are `int` (milliseconds from `_tock()`). Minor but could cause serialization surprises. **Fix:** Change to `dict[str, int]`.

### 2.3 Jurisdiction Type Hint Wrong (assessment.py)
Parameter typed as `Optional[dict]` when it should be `Optional[JurisdictionObservation]`. Loses type safety. **Fix:** Use the proper type.

### 2.4 Zone Parser Silent Failure (zone_parser.py)
Unparseable zone strings return a fallback with `suffix_flags=["PARSE_FAILED"]` instead of raising. Downstream code doesn't check for this flag, so invalid zones get processed as if valid. **Fix:** Either raise or ensure downstream code checks the flag.

### 2.5 Geometry Engine Magic Numbers (geometry_engine.py)
The 0.3 weighting factor for front setback adjustment is undocumented and arbitrary. For production, this needs documentation at minimum, or proper edge detection. **Fix:** Add comments explaining the heuristic and lower the confidence score for heuristic-based envelopes.

### 2.6 Verdict Logic Ignores Finding Values (assessment.py)
`_compute_verdict()` only checks method and confidence — not actual values. A finding with `adu_eligibility=False` and `confidence=0.95` gets verdict `ALLOWED`. **Fix:** Check critical finding values (eligibility, feasibility) when computing verdict.

---

## 3. Backend Audit — Medium Issues

- **LLM model hardcoded** (`claude-sonnet-4-6`) — make configurable via env var
- **Census geocoder URL hardcoded** — make configurable
- **Zoning buffer sizes arbitrary** (15m and 50m) — document rationale
- **RFAR no validation for lot_area ≤ 0** — add guard
- **ADU heuristic confidence too high** (0.70) for a rough estimate — lower to 0.50
- **Chat guardrails bypassable** with unicode tricks or extra spaces — normalize input
- **Boundary service CITY field check fragile** — only checks for "IN"
- **Inconsistent log levels** — some fallback scenarios logged as WARNING instead of INFO
- **datetime.utcnow() vs datetime.now(tz=UTC)** — inconsistent across files

---

## 4. Frontend Audit — Critical Issues

### 4.1 No React Error Boundary
`App.tsx` has no Error Boundary. Any unhandled error in a child component crashes the entire app with a white screen. **Fix:** Wrap main content in an ErrorBoundary component.

### 4.2 Race Condition in AssessmentWizard Map (AssessmentWizard.tsx)
Map initialization uses `setTimeout(200ms)` which can race with unmount/remount. Multiple map instances can leak. **Fix:** Use `useRef` to track pending timeouts and cancel in cleanup.

### 4.3 Uncleared Event Listeners (AssessmentWizard.tsx)
Map click and dragend listeners are never removed. Remounting stacks duplicate listeners, causing duplicate geocoding calls. **Fix:** Store listener refs and unbind in cleanup.

### 4.4 `any` Types (Multiple files)
`ChatPanel.tsx`, `AssessmentWizard.tsx`, `App.tsx` use `any` for map refs and demo address data. Bypasses all type safety. **Fix:** Replace with proper types.

---

## 5. Frontend Audit — High Issues

- **CoverFitAnalysis NaN propagation** — `lotArea * 0.55` when `lotArea=0` gives NaN through ROI calculator
- **ChatPanel empty assistant bubble** — blank message added before streaming starts
- **localStorage quota not handled** (useAssessmentHistory) — silent data loss on quota exceeded
- **No request deduplication** — user can spam the assess button
- **MapPanel silent failure** — invalid Mapbox token shows nothing instead of error state
- **CompareView no request timeout** — Promise.allSettled can hang forever

---

## 6. Frontend Audit — Medium/Low Issues

- **No loading skeleton states** — abrupt layout shifts (bad CLS)
- **Hardcoded colors everywhere** — not using MUI theme consistently
- **Missing accessibility** — SVG charts lack aria-labels; low contrast text (#7a6e65 on #f5f0eb fails WCAG AA)
- **No offline detection** — no banner when network drops
- **No confirmation on "Clear All" history** — one-click data loss
- **SetbackDiagram no scale clamping** — extreme aspect ratios break rendering
- **No client-side rate limiting** — users can spam expensive API calls

---

## 7. Production Deployment — Railway vs Supabase

### Railway (Recommended)

| Aspect | Details |
|--------|---------|
| **Pricing** | $5/mo hobby, $20/mo pro (includes usage credits) |
| **FastAPI support** | Native — deploy from GitHub, auto-detect |
| **Postgres** | One-click provision, PostGIS supported |
| **SSL** | Automatic LetsEncrypt on custom domains |
| **CI/CD** | Git-push deploys, PR previews, one-click rollback |
| **Env vars** | Encrypted at rest, injected at runtime |
| **Estimated cost** | $20–35/month for this app |

### Supabase (Not Recommended Alone)

Supabase **cannot host FastAPI** — Edge Functions are TypeScript/Deno only. You'd need Railway (or Render/Fly.io) for the backend anyway, creating unnecessary complexity and double billing ($25/mo Supabase + $15–30/mo Railway = $40–55/mo). Only worth it if you specifically need Supabase Auth or Realtime features.

### Recommended Architecture

```
React Frontend ──→ Railway Service 1 (static build)
                   ↓ /api/* proxy
FastAPI Backend ──→ Railway Service 2 (Gunicorn + Uvicorn)
                   ↓ DATABASE_URL
PostgreSQL ───────→ Railway Postgres (PostGIS enabled)
                   ↓ REDIS_URL (optional)
Redis ────────────→ Railway Redis (for rate limiting)
```

**External APIs:** ArcGIS REST (free), Anthropic Claude (pay-per-token), Mapbox (free tier 25K/mo)

---

## 8. Production Hardening Checklist

### Must-Have (Before Launch)

- [ ] Fix async race conditions (http_client, feedback_service)
- [ ] Add React Error Boundary
- [ ] Add input validation on feedback comment length
- [ ] Fix verdict logic to check finding values
- [ ] Add rate limiting (SlowAPI + Redis) — 10/min for Claude calls, 50/min for ArcGIS
- [ ] Tighten CORS to production domain only
- [ ] Migrate SQLite → Railway Postgres
- [ ] Set up environment variables (Anthropic key, Mapbox token)
- [ ] Create domain-restricted Mapbox token
- [ ] Add `/health` endpoint monitoring (Uptime Robot, free tier)
- [ ] Wire `overall_recommendation` properly (handle missing API key gracefully)

### Should-Have (First Month)

- [ ] Add Sentry error tracking (free tier: 5K errors/mo)
- [ ] Add structured JSON logging
- [ ] Fix all `any` types in frontend
- [ ] Add loading skeletons for layout stability
- [ ] Add offline detection banner
- [ ] Add request deduplication (disable button during mutation)
- [ ] Fix map cleanup / event listener leaks
- [ ] Document geometry engine heuristics
- [ ] Add confirmation dialog for "Clear All" history

### Nice-to-Have (Quarter 1)

- [ ] Accessibility audit (WCAG AA compliance)
- [ ] Dark mode support
- [ ] Extract hardcoded colors to MUI theme
- [ ] Add client-side rate limiting
- [ ] Add E2E smoke tests against live ArcGIS APIs
- [ ] Add chat guardrail input normalization (unicode/spacing tricks)
- [ ] Add PostGIS spatial queries (replace in-memory Shapely for scale)

---

## 9. Migration Path: SQLite → Postgres

1. **Provision Postgres on Railway** (one click)
2. **Enable PostGIS:** `CREATE EXTENSION postgis;`
3. **Create schema** — feedback table matches current SQLite structure
4. **Export existing data:** `sqlite3 feedback.db .dump > dump.sql`
5. **Transform SQL** — change AUTOINCREMENT → SERIAL, test with pgloader
6. **Update config.py** — read `DATABASE_URL` from env, switch from aiosqlite to asyncpg
7. **Validate** — compare row counts, spot-check data

---

## 10. Cost Estimate

| Component | Monthly Cost |
|-----------|-------------|
| Railway Pro (backend + frontend) | $20–30 |
| Railway Postgres | Included in credits |
| Railway Redis (rate limiting) | $5–10 |
| Anthropic Claude API | $0.50–20 (usage-based) |
| Mapbox | Free (under 25K requests) |
| ArcGIS REST | Free |
| Sentry | Free (5K errors) |
| Domain | ~$1 (annual amortized) |
| **Total** | **$26–61/month** |

---

## Summary of Findings

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Backend | 5 | 6 | 9 | 5 |
| Frontend | 4 | 6 | 10 | 10+ |
| **Total** | **9** | **12** | **19** | **15+** |

The codebase is solid for a POC. To reach production, focus on the 9 critical issues first (estimated 2–3 days), then the 12 high issues (another 2–3 days). The remaining medium/low items can be addressed iteratively post-launch.
