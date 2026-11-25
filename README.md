# FloodLoop AI — Maharashtra Flood Watch

A mobile-first, PWA-ready web application for **Maharashtra-wide waterlogging awareness, crowdsourced flood reporting, and safe route prediction** using Next.js (App Router), TypeScript, Tailwind CSS, and zero paid APIs.

> **Important**: All hotspot coordinates, elevation values, and `baseVulnerability` scores in `data/hotspots.json` are **estimated** for demonstration purposes. They should be verified and replaced with authoritative data from MCGM/BMC, IMD, state irrigation departments, and municipal corporation GIS portals before production use.

---

## Features

### 1. Maharashtra Map (`react-leaflet` + OpenStreetMap)
- Centered on `STATE_CENTER (19.7515, 75.7139)` zoom 7, bounded to Maharashtra (`SW 15.6°N 72.6°E / NE 22.1°N 80.9°E`).
- **12-city quick-jump** dropdown (Mumbai, Thane, Pune, Nashik, Nagpur, Kolhapur, Sangli, Ratnagiri, Chiplun, Chh. Sambhajinagar, Nanded, Chandrapur) that `flyTo` at zoom 12.
- **Zoom-based clustering**: City aggregated circles (worst risk colour + count) at `zoom < 10`; individual coloured hotspot circles with hazard badges at `zoom ≥ 10`.
- User GPS blue dot, flood report markers with 300m verified zone overlays, safe/rejected route polylines, and 4-level risk legend.

### 2. Live Weather + Weighted Risk Engine (`Open-Meteo`)
- `fetchWeatherForHotspots(hotspots)` — single batched request for all 35 hotspots (10-minute cache), handles both single-object and array response shapes.
- `Asia/Kolkata` hour lookup via `Intl.DateTimeFormat` (timezone bug fixed).
- **Hazard-type risk formulas**:
  - `urban_waterlogging`: current rain + 6h rain + base vulnerability
  - `river_flood`: 24h + 3-day rain weighted heavily (river floods lag upstream rain)
  - `ghat_landslide`: 24h rain + slope vulnerability
- **Region-selective Simulate heavy rain** toggle: `Off | All | Mumbai MMR | Pune | Konkan | Western Maharashtra | Marathwada | Vidarbha | North Maharashtra`
- **Statewide summary card**: counts per risk level, 7-region coloured breakdown bar, top 5 riskiest hotspots.

### 3. Crowdsourced Photo Flood Reporting
- Capture/upload photo → compress to ~150px / ≤20KB thumbnail → AI analysis via `/api/analyze`.
- `/api/analyze` hardened: 4MB file limit, `image/*` MIME check, 10 req/10 min per-IP rate limit. Demo mode includes `"no flooding visible"` variant.
- `/api/reports` (GET/POST): Vercel KV / Upstash Redis when configured, in-memory server array fallback; max 200 reports, 24h TTL, `~150px` thumbnails.
- Client polls `/api/reports` every 30 seconds (cross-tab shared reports).
- `localStorage` used as offline cache (hydration-safe — loaded inside `useEffect`).

### 4. Flood-Safe Route Prediction
- `/api/geocode` proxies Nominatim with Maharashtra viewbox (`72.6,22.1,80.9,15.6`), `countrycodes=in`, proper `User-Agent`, 1 req/sec throttle, 10-min cache.
- OSRM routing (`overview=full&geometries=geojson`) with 200m geometry interpolation so thin hotspots on highways are never skipped.
- 500m perpendicular detour waypoint generated when all OSRM routes pass through High/Severe zones.
- **Hazard-typed avoidance messages**: `"Avoided Chiplun (river flood)"`, `"Avoided Kasara Ghat (landslide risk)"`.
- Explicit error + Retry button on OSRM failure/timeout (no silent fallback).

### 5. Marathi-First i18n (`मराठी | EN | हिंदी`)
- Language auto-detected from `navigator.language`; Marathi first in switcher.
- Full translations for all UI, risk levels, hazard types, emergency numbers, and new river flood / ghat landslide precautions.
- **Maharashtra emergency numbers**: State Disaster Control `112 / 1070`, NDRF `011-24363260`, BMC `1916`, Police `100`, Fire `101`.

---

## Hotspot Coverage (35 Estimated Locations)

| Region | Key Hotspots |
|---|---|
| Mumbai MMR | Hindmata, Andheri Subway, Milan Subway, Sion, Kurla-Mithi, Dadar TT, Thane Kopri, Kalyan-Ulhas, Nallasopara, Panvel |
| Pune | Nala Stop, Bhide Pul, Sinhagad Road, Sangamwadi, Tamhini Ghat |
| Konkan | Chiplun Market, Mahad Bazaar, Ratnagiri Kajali, Kashedi Ghat, Amboli Ghat |
| Western Maharashtra | Kolhapur Rajaram Weir, Sangli Irwin Bridge, Karad Sangam, Solapur Sina |
| North Maharashtra | Nashik Ramkund, Kasara Ghat, Malshej Ghat, Jalgaon-Tapi |
| Marathwada | Chh. Sambhajinagar Kham, Nanded Godavari, Parbhani-Latur |
| Vidarbha | Nagpur Nag River, Nagpur Ambazari, Chandrapur Irai |

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (optional)
cp .env.example .env.local
# Edit .env.local if you want live Gemini vision analysis or Upstash Redis

# 3. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | No | Gemini Vision for `/api/analyze`. Without it, Demo mode with realistic mock results (including "no flooding visible"). |
| `KV_REST_API_URL` | No | Vercel KV REST URL for shared persistent reports. |
| `KV_REST_API_TOKEN` | No | Vercel KV token. |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL (alternative to Vercel KV). |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis token. |

---

## Future Scope (AWS Production Architecture)

| Service | Purpose |
|---|---|
| **AWS Bedrock / Amazon Rekognition** | Scalable flood photo classification, depth estimation, false-report filtering |
| **Amazon Location Service** | Enterprise geocoding, real-time traffic-aware safe routing across Maharashtra |
| **Amazon DynamoDB** | Persistent geo-indexed store for all 36 district flood reports and historical waterlogging telemetry |
| **Amazon SNS** | Real-time push/SMS alerts to commuters subscribed to specific talukas or railway corridors |
| **IoT Ultrasonic Sensors** | Water-level sensors on municipal drains, subways, and river ghats streaming via AWS IoT Core |
| **AWS Lambda + EventBridge** | Automated dam-discharge ingestion from CWC/irrigation portals, triggering risk-score recomputation |
