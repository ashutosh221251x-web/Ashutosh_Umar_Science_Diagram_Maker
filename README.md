# Science Diagram Maker

**Author:** Ashutosh Umar  
**Role / Assignment:** Full-Stack Engineer — Udhi Technologies Home Assignment  
**Submission Date:** November 2026  

---

## Overview

Science Diagram Maker is an internal reviewer web application built for **Udhi Technologies**. It generates animated, curriculum-accurate science diagrams for UK GCSE students using Google Gemini, runs automated code validators across five independent checks, tracks real token usage and USD costs, and persists human reviewer decisions (approvals, rejections, and notes) in a durable database.

The application satisfies the assignment's core requirement: **the page opens immediately with all five diagrams already rendered and animated, without making any AI API calls on initial load.**

---

## Live Demo & Local Setup

### Prerequisites
- **Node.js**: v20 or v22 (v22.18+ recommended)
- **npm**: v10+
- Google Gemini API key from [Google AI Studio](https://aistudio.google.com/api-keys)

### 1. Install Dependencies
```bash
# Frontend
npm install

# Backend
cd server
npm install
cd ..
```

### 2. Environment Configuration
Create `server/.env` (see `server/.env.example`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
ALLOWED_ORIGIN=http://localhost:5173
```
*Note: If `DATABASE_URL` is omitted, the server automatically boots a zero-config, persistent SQLite database at `server/data/diagrams.db` using WAL mode.*

### 3. Run the App

#### Single-Command Unified Server (Recommended)
```bash
# Build client and server
npm run build
cd server && npm run build && npm start
```
Open **`http://localhost:3000`** in your browser. Express serves both the production frontend and all `/api` routes on the same port.

#### Split Development Mode
```bash
# Terminal 1 — Backend API (port 3000)
cd server
npm run dev

# Terminal 2 — Frontend Vite Dev Server (port 5173)
npm run dev
```
Open **`http://localhost:5173`** (Vite proxies all `/api` requests to `http://localhost:3000`).

---

## Real Generation Results

All five concepts were generated using genuine Google Gemini credentials (`gemini-2.5-flash`). The results below reflect the committed snapshot in `results.json`:

| # | Concept | Subject | 5/5 Checks | Model | Input Tokens | Output Tokens | Cost (USD) | Retries (Val / API) |
|---|---|---|:---:|---|:---:|:---:|:---:|:---:|
| **01** | **Pythagoras’ theorem** | Maths | **Passed** | `gemini-2.5-flash` | 992 | 1,439 | $0.000506 | 1 (1 val, 0 api) |
| **02** | **Parts of a circle** | Maths | **Passed** | `gemini-2.5-flash` | 441 | 705 | $0.000245 | 0 (0 val, 0 api) |
| **03** | **Series circuit** | Physics | **Passed** | `gemini-2.5-flash` | 948 | 1,856 | $0.000628 | 1 (1 val, 0 api) |
| **04** | **Photosynthesis** | Biology | **Passed** | `gemini-2.5-flash` | 401 | 1,320 | $0.000426 | 0 (0 val, 0 api) |
| **05** | **States of matter** | Chemistry | **Passed** | `gemini-2.5-flash` | 428 | 2,392 | $0.000750 | 0 (0 val, 0 api) |
| **Total** | — | — | **5 / 5** | — | **3,210** | **7,712** | **$0.002555** | **2 (2 val, 0 api)** |

*Cost calculation based on published Gemini 2.5 Flash pricing: $0.075 / 1M prompt tokens ($0.000000075/token) and $0.30 / 1M candidate tokens ($0.0000003/token).*

---

## Real Failures Observed & How I Fixed Them

1. **Google AI Studio 503 Spikes on `gemini-3.5-flash-lite`**:
   - *Problem*: During batch generation, Google's `gemini-3.5-flash-lite` endpoint returned repeated `503 Service Unavailable: This model is currently experiencing high demand`.
   - *Fix*: My provider retry loop handled exponential backoff with jitter and inspected `Retry-After`. To keep the pipeline responsive, I switched to `gemini-2.5-flash` (also available on the free tier), which resolved cleanly without throttling.

2. **Missing Labels on Pythagoras Diagram (Concept 01)**:
   - *Problem*: In attempt 1, the model generated the triangle and hypotenuse geometry, but only included 1 `<text>` element and left an unused CSS `@keyframes` block.
   - *Fix*: The automated validators flagged `labels` and `animation` as failed. The backend triggered its single validation retry, sending the model the exact failure reasons. On attempt 2, the model output 9 distinct labels (`a`, `b`, `c`, formula) and an active pulse animation, passing 5/5 checks.

3. **SVG `<defs>` False Positive in Bounds Validator**:
   - *Problem*: On the Series Circuit (Concept 03), the model defined an electron dot marker inside `<defs>` with local coordinates `[-15, -15, 15, 15]`. Measuring all elements globally caused a false out-of-bounds failure.
   - *Fix*: Scoped canvas boundary checks to directly rendered elements by filtering out `<defs>...</defs>` symbol templates before calculating bounding box extents against `viewBox`.

---

## Architecture & Engineering Decisions

### Persistence Choice
- **Local Dev / Single-Instance**: Uses Node.js 22 native `node:sqlite` with WAL mode enabled. There are zero external dependencies (no Docker container, no PostgreSQL installation, and no C++ build tools required to run locally).
- **Production Cloud**: When `DATABASE_URL` is set, the repository connects via `pg.Pool` to PostgreSQL (Render, Neon, Supabase).
- **Atomic State Transitions**: When a concept is regenerated, its review status resets atomically to `pending` in the same transaction, while preserving any previously typed notes.
- **Fail-Closed Approvals**: The backend blocks approval requests (`409 Conflict`) if any of the five validation checks failed.

### Five Independent Code Validators
Located in `server/src/validators/index.ts`:
1. **`svg_parse`**: Safe XML parsing (`fast-xml-parser`) with entity expansion and DTD disabled; verifies standard SVG namespace and valid `viewBox`.
2. **`bounds`**: Parses geometric shapes (`<rect>`, `<circle>`, `<ellipse>`, `<line>`, `<polygon>`, `<text>`, `<path>`) to guarantee visible elements fit inside the viewBox coordinate space.
3. **`labels`**: Enforces at least one non-empty `<title>` and $\ge 3$ distinct visible `<text>` labels.
4. **`animation`**: Detects active SMIL animations (`<animate>`, `<animateMotion>`, `<animateTransform>`) or CSS `@keyframes` applied to an element.
5. **`safety`**: Rejects `<script>`, inline event handlers (`onload`, `onclick`), `<foreignObject>`, external URLs (`http`, `https`, `data:`, `javascript:`), and CSS `@import`.

---

## Automated Test Suites

```bash
# Run frontend contract tests (7 passing tests)
npm test

# Run backend unit & integration tests (validators, DB transactions, API contracts)
cd server
npm test
```

---

## What I Would Do With One More Day

1. **Automated Headless Screenshot Verification**: Integrate Playwright to capture frame-by-frame screenshots of SMIL/CSS animations in headless Chromium, calculating visual color contrast and bounding box extents across the full animation loop.
2. **Optimistic Locking**: Add a generation revision hash to the review API so concurrent reviewers cannot overwrite each other's decisions without a conflict warning.
3. **SMIL-to-CSS Polyfill**: Provide an automatic fallback parser for browsers that have limited SMIL `<animateMotion>` support.

---

**Ashutosh Umar**  
*Full-Stack Engineer*

