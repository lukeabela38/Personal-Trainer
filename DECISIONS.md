# Decision Log

Record stable technical decisions that future agents should preserve.

## 2026-07-06 — Snapshot Contract Separates Source Collection from Recommendation

Decision:

- Source payloads (Garmin, Hevy, Cronometer, manual) are kept in their raw shapes until the snapshot normalization layer consumes them.
- The recommendation engine reads only the normalized snapshot, never raw source payloads.

Reason:

- Keeps the recommendation logic stable even when source shapes change.
- Makes testing easier — you can test recommendation with a synthetic snapshot without running live sources.
- The snapshot contract (`docs/data-snapshot-contract.md`) becomes the single source of truth for data shape.

Implications:

- Adding a new source means writing a normalization function in `snapshot.py` and extending the contract.
- The recommendation engine never needs to change when a source adapter changes its internal shape.

## 2026-07-06 — Rule-Based Recommendation (No ML/Scoring Model)

Decision:

- The daily recommendation uses explicit decision rules in `recommendation.py`, not a learned model or weighted scoring system.
- Priority order: recovery > nutrition_repair > table_tennis_readiness > power_and_athleticism > aerobic_quality > aerobic_base > strength_progression.

Reason:

- Transparent and debuggable — each recommendation can be traced to a specific rule and snapshot field.
- The athlete's context is well-defined enough that explicit rules capture the decision logic.
- Avoids the complexity of maintaining a scoring model with only one user.

Implications:

- Adding new decision factors means adding new rules, not retraining.
- Confidence levels are derived from data quality, not statistical uncertainty.
- The rules live in `recommendation.py` and must stay consistent with the daily recommendation contract (`docs/daily-recommendation-contract.md`).

## 2026-07-06 — Static Site, No Backend Server

Decision:

- The browser UI is a static site (HTML/CSS/JS) served from GitHub Pages.
- No backend server, no database, no API endpoints.
- All data is pre-rendered into JSON files during the build step.

Reason:

- Zero hosting cost on GitHub Pages.
- No server to maintain, secure, or scale.
- The daily pipeline already captures and normalizes data — the site just renders the result.

Implications:

- Real-time data is not possible — the site reflects the last build.
- All data filtering and formatting happens in the build scripts, not in the browser.
- GitHub Pages deployment is triggered by pushes to `main` that change `site/**`.

## 2026-07-06 — MCP Wrappers for Live Source Access

Decision:

- Live data sources are accessed through MCP (Model Context Protocol) wrapper scripts in `scripts/wrappers/`.
- Each wrapper starts an MCP server via stdio, calls tools via JSON-RPC, and emits a normalized payload to stdout.
- Direct API access (e.g., `garminconnect` library) is available as a fallback but MCP is the primary path.

Reason:

- MCP provides a standardized interface to diverse data sources.
- Wrappers are independent and testable in isolation.
- Credentials and secrets stay out of the repository — they live in `.env` or macOS Keychain.

Implications:

- MCP server startup latency on first call (uvx/npx cache).
- Stream buffer limits must be raised for large responses (handled in `scripts/mcp_client.py`).
- Wrapper scripts must never emit secrets to stdout.

## 2026-07-06 — `unittest` Only, No Third-Party Test Framework

Decision:

- All tests use `unittest` from the Python standard library.
- No pytest, no plugins, no coverage tools.

Reason:

- Zero additional dependencies for testing.
- Sufficient for the project's test complexity.
- Avoids configuration overhead.

Implications:

- All test classes extend `unittest.TestCase`.
- Test discovery requires the `-v` flag for verbose output; no pytest fixtures or markers available.

## 2026-07-09 — File-Mapping Guardrail for Source Changes

Decision:

- When source files change, CI must verify that the corresponding test surface changes in the same PR.
- The current guardrail checks three common paths: Python package code, script code, and site JavaScript.

Reason:

- Prevents source-only changes from slipping through with no test updates.
- Keeps the rule simple enough to enforce automatically without introducing a full coverage stack.
- Works well with the repo's narrow card style and existing `unittest`/Node test setup.

Implications:

- Source changes to `personal_trainer/src/personal_trainer/*.py` must include a change under `personal_trainer/tests/`.
- Source changes to `scripts/**/*.py` must include a change under `tests/`.
- Source changes to `site/**/*.js` must include a change under `tests/frontend/`.
- This guardrail complements the existing `unittest`-only decision rather than replacing it.

## 2026-07-09 — Snapshot Fuzzing and Golden Files for Core Contracts

Decision:

- Core snapshot and recommendation contracts should be protected by both fuzz-style mutation tests and golden-file regression tests.
- Fuzz tests should probe invalid shapes and partial inputs.
- Golden files should freeze a small number of representative recommendation outputs.

Reason:

- Fuzzing catches brittle edge cases and missing validation.
- Golden files catch unintended behavior drift in the daily recommendation output.
- The combination is hard to game without actually exercising the contract.

Implications:

- Changes to snapshot or recommendation rules should update or add both a mutation test and a golden case.
- Golden fixtures should stay small and representative rather than trying to cover every possible day.

## 2026-07-10 — No Service Worker For The Static Site

Decision:

- The static site should not use a service worker.
- The registration script and cache logic were removed rather than replaced with a more complex caching strategy.

Reason:

- The worker was effectively network-only and added maintenance overhead without meaningful offline value.
- GitHub Pages already provides the delivery model this app needs.
- Removing the worker reduces cache-debugging risk while the site continues to change quickly.

Implications:

- The site relies on normal browser and CDN caching instead of a custom worker.
- Pages and dist builds should not copy or register `sw.js`.
- If offline support becomes a real product need later, it should be added intentionally as a new decision rather than resurrecting dead worker code.

## 2026-07-13 — Runtime Artifacts Stay Out Of Git

Decision:

- Files generated during local runs or CI runs should not be committed to GitHub.
- Commit source files, templates, and intentional fixtures; ignore logs and build outputs that can be regenerated.

Reason:

- Keeps the repository focused on source-of-truth inputs instead of ephemeral outputs.
- Reduces noise in PRs and avoids accidental drift between committed artifacts and regenerated ones.
- Makes it clearer which files are authoritative versus disposable.

Implications:

- Generated runtime artifacts should be added to `.gitignore` where practical.
- If a generated file currently needs to be versioned, that should be a deliberate exception with an explicit follow-up decision.

## 2026-07-13 — CI Auto-Formats Before Ruff Check

Decision:

- The CI lint job should run `ruff format` before `ruff check` so formatting drift is normalized before linting.

Reason:

- Prevents CI from failing on pure formatting issues when the repo uses Ruff as the formatter.
- Keeps the lint signal focused on actual rule violations after formatting has been applied.

Implications:

- CI will rewrite files in the ephemeral runner before linting them.
- Contributors still SHOULD format locally before pushing, but formatting-only drift will no longer block the PR by itself.
