# Udhi home assignment — submission checklist

## Before declaring ready

- [ ] Deploy one working link with no setup or authentication required for the reviewer.
- [ ] Put `GEMINI_API_KEY` on the backend host only; no key in Git, frontend or `VITE_*`.
- [ ] Verify free Gemini model availability and record the real model identifier.
- [ ] Generate all five concepts with one initial model call per concept; validation retry at most once.
- [ ] Build actual code checks: parseable SVG XML, content entirely inside viewBox, `<title>` + 3 text labels, animation and one additional safety check.
- [ ] Confirm the model receives the original assignment text for all five concepts.
- [ ] Simulate bad SVG and 429/503 to verify retry behavior.
- [ ] Count and log provider and validation retries separately; show total.
- [ ] Log input tokens, output tokens, cost estimate and model for *every concept*; account for all generation attempts.
- [ ] Export genuine five results to root `results.json`, commit, build and redeploy.
- [ ] Open the deployed link in a new private browser with backend/API unreachable: all five **prebuilt diagrams** still display from the bundled snapshot.
- [ ] Press Generate on one concept with backend available: live call updates correct row, show error on genuine failure.
- [ ] Approve/Reject a diagram, type a note, click Save note, refresh, and verify the real saved review.
- [ ] Verify a second browser can retrieve persisted decisions; verify server restart retains them.
- [ ] Test SVG scripts/external references and out-of-bounds graphics are rejected by code.
- [ ] Record at least one actual failure and fix in README.
- [ ] Replace README results table with actual pass/fail/cost/retry numbers.
- [ ] State actual deployment, storage choice, one-more-day improvements, and AI tools used.
- [ ] Make incremental Git commits and be ready to explain every module.
- [ ] Submit live link + public/shared GitHub repo to the form before deadline.

## Sanity tests

- The frontend should still render the five concept rows with a disconnected server (clear error for failed review fetch; not a blank page).
- All successful review saves must show a server confirmation, not only local state changes.
- `GET /api/diagrams` and `GET /api/reviews` must never call Gemini.
- Approving a diagram with failed validation must be rejected by the backend.
- A new generation must reset stale prior approval to `pending`.
- Missing cost/tokens/retries must render as `—`, never `0` or a fictional number.
