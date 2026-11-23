# Backend API contract (v1)

This is the **contract implemented by the React frontend**. The backend must implement it exactly. All routes are under `/api`. Requests and responses are JSON unless otherwise stated. Do not silently rename keys.

## Data shapes

The five **concept IDs** are fixed by the assignment, not generated examples: `pythagoras`, `circle`, `series`, `photosynthesis`, `matter`.

### DiagramResult

```json
{
  "id": "pythagoras",
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 400 260\">...</svg>",
  "checks": {
    "svg_parse": { "passed": true, "reason": "Parsed as SVG XML" },
    "bounds": { "passed": true, "reason": "All measured content is inside viewBox" },
    "labels": { "passed": true, "reason": "One title and four text labels" },
    "animation": { "passed": true, "reason": "SMIL animateMotion detected" },
    "safety": { "passed": true, "reason": "No scripts or external references" }
  },
  "usage": {
    "model": "ACTUAL_MODEL_ID_FROM_API",
    "inputTokens": 450,
    "outputTokens": 1300,
    "estimatedCostUsd": 0.00085
  },
  "retryCount": 0,
  "validationRetryCount": 0,
  "apiRetryCount": 0,
  "generatedAt": "2026-11-23T12:00:00.000Z",
  "error": null
}
```

**The numbers above are an API shape illustration only, not actual runs or prices.** Never paste these values into a real `results.json`. Every check must be computed by backend code. `usage` fields can be `null` if not reported; never invent token counts, costs, or retries. A failed result may have `svg: null` if rendering would be unsafe. `retryCount` must equal `validationRetryCount + apiRetryCount`; store all attempts' tokens/cost, not only the last attempt. Any provider rate-limit backoffs count as API retries. An SVG is approved automatically by **no one**: review is a separate human action.

### Review

```json
{
  "conceptId": "pythagoras",
  "status": "pending",
  "note": "",
  "updatedAt": "2026-11-23T12:01:00.000Z"
}
```

`status` must be one of `pending`, `approved`, `rejected`. `note` is always a string, max 1000 characters. `updatedAt` is assigned by the backend.

## Routes

### GET /api/health

Response `200`:

```json
{ "status": "ok" }
```

Never report `ok` if the application cannot use its required persistent storage; optionally add extra diagnostic keys.

### GET /api/diagrams

Response `200`:

```json
{ "results": [] }
```

Return only **genuinely generated, persisted** `DiagramResult` objects (0–5 entries, maximum one latest result for each concept). No model API call may occur here. Frontend calls this only when the reviewer selects **Sync saved results**.

### POST /api/diagrams/generate

Request:

```json
{ "conceptId": "pythagoras" }
```

Response `200`:

```json
{
  "result": "THE_ACTUAL_DiagramResult_OBJECT",
  "review": "THE_ACTUAL_Review_OBJECT"
}
```

**The quoted placeholders indicate object locations, not literal strings.** Return two JSON objects, following the schemas above. `result.id` must match requested `conceptId`. Generate ONE concept per request. Call the Gemini model once; if any check fails, retry generation at most once with specific failure reasons. For 429/503, backoff and retry provider requests up to 3 times (track `apiRetryCount`). Record all attempts' usage where available, save result and validation diagnostics, reset that diagram's previous review to `pending` atomically on regeneration, and return the new `Review`. If both validation attempts fail, save a failed result with measured checks and a readable `error`; if an API/provider call fails permanently and there is no result, return an HTTP error and retain the prior result.

Errors: `400` invalid concept; `429` rate limit exhausted; `503` provider unavailable; `500` persistence/internal error; `504` provider timeout. Error shape:

```json
{ "error": { "code": "PROVIDER_UNAVAILABLE", "message": "Gemini is temporarily unavailable. Please retry later." } }
```

Do not leak raw provider secrets, prompts containing secrets, stack traces, or internal DB credentials. Limit request duration to a documented upper bound. Never accept arbitrary prompt text from the client; the canonical concept prompts live in backend config.

### GET /api/reviews

Response `200`:

```json
{ "reviews": [] }
```

Array of persisted `Review` records, one per concept if saved; no localStorage or mock storage. The frontend invokes this once after mounting.

### PUT /api/diagrams/:conceptId/review

Request:

```json
{ "status": "approved", "note": "Clear and scientifically correct." }
```

Response `200`:

```json
{
  "review": {
    "conceptId": "pythagoras",
    "status": "approved",
    "note": "Clear and scientifically correct.",
    "updatedAt": "2026-11-23T12:04:00.000Z"
  }
}
```

Validate `conceptId`, `status`, and `note`. Reject attempts to approve results whose five checks have not all passed. Reject review requests when there is no generated diagram (`404`). Persist to durable storage before returning success. Prefer a DB transaction with current `generationId` or `version` to reject stale review writes (HTTP `409`) when concurrent regeneration occurs; if adopting versioning, extend this frontend/API consistently. Notes are only saved when **Save note** or **Approve/Reject** is clicked; show unsaved state while typing. Status must survive refresh / server restart / new browser.

Errors: `400` validation, `404` missing diagram, `409` stale generation or failed-check approval, `500` database error. Use the same error shape.

## Server output and static `results.json`

- The project's **root** `results.json` is imported into the initial client bundle. The page can display its five diagrams **without a diagram API call on first render**.
- This ZIP ships with an empty `results.json` because **no Gemini credentials or verified generated results were provided**. Empty means not generated, never fabricated.
- After generating all five concepts with the real backend, export the five latest persisted results to root `results.json`, then build/deploy the frontend so all five load immediately for a fresh reviewer.
- `npm run build` also copies that committed snapshot to `dist/results.json` for direct inspection and downloading.
- At runtime, Generate changes a single result on screen, caches the **real API response** in the current browser, and persists it on the backend. Sync saved results loads the latest persisted server results. A separate device needs Sync to see post-deploy changes until the static snapshot is rebuilt.
- Do not write to Vercel/Render ephemeral filesystem and assume it is permanent storage. Use persistent database (e.g. Postgres or reliable persistent disk) for diagram records and reviews.
- A static bundle cannot magically reflect later server changes on every fresh device without a network call; keep the assignment's no-AI-API-on-load guarantee by prebuilding the five real results.

## Safety, validation and retry requirements

1. Parse SVG as XML with entity expansion and DTD/external resources disabled; reject malformed XML.
2. Compute actual element bounds (including text, paths, transforms and stroke widths) relative to the root `viewBox`. Where animation moves elements, inspect relevant frames/keyframe extrema. Do not merely check whether `viewBox` exists. A geometry renderer/headless browser can measure transformed bounding boxes.
3. Require at least one non-empty SVG `<title>` AND at least three visible non-empty `<text>` labels.
4. Require an actual SMIL animation element (`animate`, `animateMotion`, `animateTransform`) or CSS keyframes *used by* an element, not just a string containing the word "animate".
5. Custom security check: disallow script tags, event-handler attributes, `foreignObject`, external images/fonts/styles/imports, nonlocal `href` / `xlink:href`, `javascript:`/`data:` URLs where unsafe, and unsafe `url(...)`; sanitize to a strict SVG allowlist. Only permit the safe SVG features necessary for the animation.
6. Each check must be an independent backend function, with pass/fail plus a human-readable reason. Store the full validation log.
7. Log model ID, input/output tokens, cost estimate with source prices, provider retries, validation retries, and generation timestamp. No estimated default or fake success.
8. Use env `GEMINI_API_KEY` and `GEMINI_MODEL`; choose an actually available free-tier model compatible with the assignment. Check provider model availability, do not assume suggested names remain accessible.
9. Retries on 429/503 use exponential backoff with jitter (`Retry-After` when present); cap at three provider retries. The single validation retry is independent and explains the failure to the model.
10. Frontend's SVG preview uses an isolated `sandbox` iframe, CSP, and no scripts, but **backend validation is still mandatory**.

## Compatibility checklist

- [ ] All endpoints return the exact keys and object/array types above.
- [ ] Each of the five IDs maps to the exact prescribed concept text.
- [ ] Generation never calls Gemini from the browser.
- [ ] `GET /api/diagrams` and `GET /api/reviews` never trigger AI work.
- [ ] Review/notes still exist after refresh, server restart and second-browser access.
- [ ] `results.json` contains five verifiable, genuine generated results before final deployment.
- [ ] 429/503 errors and invalid SVGs are tested and logged.
- [ ] Failed/unsafe SVG is not silently marked approved.
- [ ] No secrets or invented usage numbers in the frontend, commits, README or live responses.
