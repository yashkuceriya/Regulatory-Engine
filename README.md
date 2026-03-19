# Regulatory Engine

> **For a given residential parcel in Southern California, what can I confidently build — and why?**

A full-stack buildability assessment engine that takes a street address and returns a structured, evidence-backed regulatory analysis in seconds — including SFR standards, ADU feasibility, buildable envelope geometry, overlay risk screening, and Cover-specific project intelligence.

Built for [Cover](https://buildcover.com) — the technology company that designs, permits, manufactures, and installs custom backyard homes (ADUs) across Southern California.

---

## Why This Exists

Cover's first step with every customer: **"Provide your address → we determine if an ADU is legal at the site."**

Today that's manual — someone checks ZIMAS, cross-references LAMC, reads CP-7150 tables, checks overlay maps. Takes 30-60 minutes per inquiry.

This engine does it in **under 5 seconds**, with every finding citing the specific regulation.

---

## Architecture

```
Address → Geocode → Boundary Gate → Parcel → Zoning → Rule Engine → ADU Engine → Geometry → LLM Enrichment → Assessment
```

**9-step pipeline**, fully async, with timing telemetry on every step.

| Layer | Approach | Why |
|-------|----------|-----|
| **Rule Engine** | Deterministic (CP-7150 + LAMC) | Regulatory compliance needs reproducibility |
| **LLM (Claude)** | Enrichment only | Explains and summarizes, never overrides rules |
| **Geometry** | Shapely + pyproj | Projected coordinate math for accurate sqft |
| **GIS Data** | 4 official ArcGIS REST APIs | Real-time data, not stale snapshots |

### Multi-Jurisdiction Design

The config registry includes endpoints for **LA City** (active), **Orange County**, **San Diego**, and **Long Beach** (planned). Adding a new city = new endpoints + zone parser rules + rule tables. The pipeline itself doesn't change.

```
GET /api/jurisdictions → [
  { "name": "LA City", "status": "active", "supported_zones": ["R1","R2","RD","RS","RE","RA"] },
  { "name": "Orange County", "status": "planned" },
  { "name": "San Diego", "status": "planned" },
  { "name": "Long Beach", "status": "planned" }
]
```

---

## Key Features

### Assessment Engine
- **R1/R2 Standards**: Setbacks, height, stories, RFAR/FAR — all from CP-7150 with LAMC citations
- **State ADU Law**: SB 897, AB 2221, SB 1211, Gov Code §66314 — preempts local where more permissive
- **Overlay Detection**: Hillside, HPOZ, TOC, coastal, fire zone, fault zone, specific plans
- **Buildable Envelope**: Shapely polygon inset → GeoJSON with sqft calculation
- **Confidence Scoring**: Per-finding with evidence trail

### Cover Business Intelligence
- **Cover Fit Score** (0-100): Composite viability across 5 dimensions
- **Unit Recommendation**: S1 Studio / S2 One-Bedroom / Custom based on buildable area
- **ROI Calculator**: Monthly rental ($3/sqft LA rate), annual income, payback period, property value increase
- **Permit Timeline**: Weeks estimate based on overlay complexity
- **Site Visit Checklist**: Auto-generated from assessment findings

### User Features
- **Guided Wizard**: 3-step flow with map pin-drop
- **3D Building Envelope**: Isometric SVG with SFR + ADU placement
- **PDF Export**: Printable report with citations table
- **Assessment History**: localStorage persistence, instant reload
- **Multi-Parcel Comparison**: Parallel assessment, side-by-side table
- **AI Chat**: Grounded in assessment data, with content guardrails (profanity, persona, off-topic filtering)

---

## Tech Stack

**Backend**: FastAPI, httpx, Shapely, pyproj, Pydantic, anthropic (AsyncAnthropic), aiosqlite
**Frontend**: React 18, TypeScript, MUI, Mapbox GL, Recharts, react-to-print, TanStack Query

---

## Quick Start

### Backend
```bash
cd cover-regulatory-engine
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# .env
echo 'ANTHROPIC_API_KEY=your-key' > .env
echo 'MAPBOX_TOKEN=your-token' >> .env

uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend && npm install

# .env
echo 'VITE_API_URL=http://localhost:8000' > .env
echo 'VITE_MAPBOX_TOKEN=your-token' >> .env

npm run dev  # → http://localhost:5173
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/assess` | Main assessment (address → full report) |
| GET | `/api/jurisdictions` | Supported + planned coverage |
| GET | `/api/demo-addresses` | Test parcels |
| POST | `/api/chat` | AI chat (SSE stream) |
| POST | `/api/feedback` | Finding feedback |
| GET | `/api/lamc-chunks` | Regulatory text |

---

## Demo

1. Click **"5432 Coliseum St"** → assessment runs in ~2s
2. See: map, lot donut, confidence score, overlay matrix, 3D envelope
3. Scroll to: **Cover Fit Score (85)**, S2 recommendation, **$2,250/mo rental income**
4. **Export PDF** → printable report
5. **Compare** → 2 addresses side-by-side
6. **AI chat** → "Can I build an ADU?" → cited answer

---

## Documentation

| File | Contents |
|------|----------|
| `PROJECT_LOG.md` | Architecture decisions with reasoning |
| `COVER_RESEARCH.md` | Cover company analysis |
| `COMPETITIVE_LANDSCAPE.md` | Market comparison (FutureLot, Deepblocks, Canibuild, Symbium, GreenLite) |
| `NEXT_STEPS.md` | Strategic roadmap |
