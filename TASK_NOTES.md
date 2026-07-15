# Task Notes

This file is for temporary task-specific findings. It can be cleared between tasks.

## 2026-07-14 Strength Analytics Toggle

- The strength page now groups the summary strip, hero note, and highlight cards into a dedicated `#strength-analytics` section.
- A localStorage-backed toggle (`personal-trainer:strength-show-analytics`) collapses that analytics block so the workout history and exercise data can take visual priority.
- The browser smoke test now checks both the toggle state and its persistence across reloads.

## 2026-07-13 Hevy Exercise Catalog Externalized

- `site/history/exercises/index.json` now holds the shared Hevy template-id catalog with names and categories.
- `site/strength.js` loads that catalog before rendering so `findTemplateId()` no longer hardcodes the mapping in-module.
- `scripts/build_site_artifacts.py` uses the same catalog to emit `strength.json`, and the build test now verifies the shared lookup path.
- Validation passed with `python3 -m unittest tests.test_build_site_artifacts -v`, `node --test tests/frontend/frontend_helpers.test.js`, `npm run format:js:check`, and `git diff --check`.

## 2026-07-13 Hevy Catalog Auto-Discovery

- `scripts/strength_report.py` can now write a merged `history/exercises/index.json` alongside `strength.json` when the live Hevy strength command is available.
- `scripts/daily_snapshot_runner.py` passes that catalog output path through so live workout rows with `exerciseName` can append newly observed template IDs automatically.
- A Docker smoke run with a synthetic live Hevy row wrote `dist/history/exercises/index.json` containing the discovered `Incline Dumbbell Curl` entry.

## 2026-07-13 Hevy Discovery Window

- `scripts/wrappers/fetch_hevy_strength.py` now reads `PERSONAL_TRAINER_HEVY_STRENGTH_RECENT_DAYS`, defaulting to 30 locally.
- `.github/workflows/pages.yml` sets that window to 90 for the Pages build, so deployed catalog discovery scans deeper workout history than the local default.
- `personal_trainer/tests/test_script_entrypoints.py` now covers both the default window and the 90-day override.

## Current Task

Split food logging into its own dedicated page shell, keep the dashboard as a pointer to it, and wire the new page into the build and browser smoke coverage.

- The food form now lives on `site/food.html` with its own standalone script.
- The dashboard keeps a lightweight food CTA instead of the full input shell.
- The static build and browser smoke suite now know about the new page.
- The Food page now also pulls `dist/data/snapshot.json` to show a live nutrition summary, and it falls back to an explicit unavailable state instead of synthetic data.
- The live panel now leads with today's consumed macros, with targets shown underneath for context.
- `food.js` cache-bust version was bumped so the browser doesn’t reuse the previous module after the panel change.

Follow-up for the strength UI polish branch:

- `site/strength.js` now sorts exercise history before deriving modal stats, and the rest recommendation uses the latest set rather than the average rep count across the full history.
- Added a browser regression test that proves the modal shows `60-90 sec` for a latest 6-rep set instead of the older average-based interval.
- `npm run lint:js` and `npx playwright test tests/browser/site-smoke.test.js` both pass after the fix.

## 2026-07-13 Hevy Browser Window

- `site/hevy-live.js` now persists a browser-only recent-workout window in `localStorage` and passes it into the Hevy refresh path.
- The refresh path clears any stored browser Hevy overlay before fetching, so the next render has to repull instead of reusing stale live data.
- `site/strength.html` and `site/strength.js` expose that window so the user can change the lookback depth and see it reflected in the refresh status.
- The browser smoke suite now checks that the strength page renders the new window control from the built `dist/` bundle.
- The Pages workflow now uses the same 30-workout default as local, instead of overriding the window to 90 in CI.

## 2026-07-13 Source Independence Clarification

- The freshness panel now says `Per-source freshness` and adds explicit copy that each source is tracked independently.
- The aggregate badge now uses `All data fresh`, `Some sources stale or unavailable`, or `No data available` so Garmin, Hevy, Cronometer, and manual context stay separated.
- Added a dashboard smoke assertion for the new explanatory copy and refreshed the browser bundle with `docker compose run --rm app python3 scripts/build_site_artifacts.py`.
- Validation passed with `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:browser`.

## 2026-07-13 Page State Consolidation

- `scripts/build_site_artifacts.py` now emits `derived.page_states` for `food`, `strength`, and `speed`, and the derived page JSON includes a `page_state` field.
- `site/food.js`, `site/strength.js`, and `site/speed.js` now honor those page states so missing source data renders explicit unavailable states instead of prepopulated content.
- Added regression coverage in `tests/test_build_site_artifacts.py` for both fresh and missing page states.
- Added a browser smoke assertion that the published artifacts expose the same page-state kinds as the built snapshot.
- Validation passed with `docker compose run --rm -v "$PWD":/app -w /app app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest tests.test_build_site_artifacts -v"` and `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:browser`.

## 2026-07-13 Browser Runner Note

- `tests/browser/site-smoke.test.js` now includes a synthetic missing-state route test for food, strength, and speed.
- The Playwright Chromium launch in this environment aborted with `SIGABRT` before any assertions ran, so the new browser test could not be reverified here after the edit.
- `node --check tests/browser/site-smoke.test.js` passed, so the test file itself parses cleanly.
- The root cause was macOS sandboxing: Chromium failed with `bootstrap_check_in ... Permission denied (1100)` until the browser run was retried with elevated permissions.
- After rerunning with elevated permissions, `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/browser/site-smoke.test.js` passed all 9 tests against the Docker-served `dist/` output.

## 2026-07-13 CI Fix Follow-up

- The GitHub Actions JavaScript failure was just Prettier drift in `site/speed.js`, `site/strength.js`, `tests/browser/site-smoke.test.js`, and `tests/frontend/frontend_helpers.test.js`.
- The browser smoke failure came from stale committed `site/` fixtures: `site/data/snapshot.json`, `site/strength.json`, and `site/speed.json` were missing the new derived page-state fields that already existed in `dist/`.
- Local verification now passes with `npm run format:js:check` and `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/browser/site-smoke.test.js`.

## 2026-07-13 Dashboard Freshness Alignment

- `site/app.js` now classifies the dashboard import badge from the same source freshness data used by the per-source rows, instead of downgrading example snapshots just because `snapshot.source` is not `live`.
- Example snapshots with all tracked sources fresh now render the import badge as fresh, which keeps the banner and the row indicators aligned.
- Validation passed with `node --test tests/frontend/frontend_helpers.test.js`, `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/browser/site-smoke.test.js`, and `git diff --check`.

## 2026-07-13 Freshness Page-State Alignment

- The dashboard freshness panel now prefers `derived.page_states` for Garmin, Hevy, and Cronometer, with raw source objects only as a fallback for older snapshots.
- That change keeps the freshness rows green when the corresponding pages already have data, even if the legacy source arrays are sparse.
- Validation passed with `node --test tests/frontend/frontend_helpers.test.js`, a rebuilt `dist/`, and `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/browser/site-smoke.test.js`.

## 2026-07-13 Dashboard Renderability Fix

- `site/app.js` no longer drops example snapshots at load time just because `source !== "live"`.
- `loadFromUrl()` now renders any snapshot that has either live raw data or derived page states, which keeps the home page from falling back to the red `No data available` state when the pages are populated.
- Validation passed with a direct DOM probe of `#freshness-bar` plus `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/browser/site-smoke.test.js`.

## 2026-07-13 Cronometer Missing Fixture

- `personal_trainer/examples/snapshot-ready.json` now marks Cronometer as missing so the preview site can exercise the unavailable-food path.
- Manual context remains fresh in that fixture because it is a separate source from Cronometer and still contributes recovery context to the dashboard.
- Validation passed with a direct DOM probe of `#freshness-bar` plus `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npx playwright test tests/browser/site-smoke.test.js`.

## GitHub Agent Note

- `gh` can be authenticated locally but still fail against `api.github.com` in this environment.
- When that happens, use the GitHub app/MCP tools for PR metadata, check runs, and workflow logs instead of blocking on `gh`.
- Keep `gh auth status` as the quick local auth sanity check, but treat MCP as the reliable fallback for GitHub Actions inspection here.

## 2026-07-13 Freshness UI Consolidation

- The home page now renders a single consolidated freshness panel in the `#freshness-bar` area instead of a separate bar plus a duplicate freshness card in the expandable section stack.
- Each source row now maps freshness to a simple traffic-light state: fresh = green, stale/partial = orange, missing or empty = red.
- The empty dashboard state now shows the same consolidated freshness panel so the home page stays informative before a snapshot is loaded.
- `docker-compose.yml` now mounts `./personal_trainer`, `./scripts`, and `./site` into the `app` container so `docker compose run` regenerates `dist/` from the live working tree instead of baked image files.
- Validation passed with `npm run format:js:check` and `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 npm run test:browser`.

## 2026-07-13 Deploy Failure Debug

- The Pages deploy workflow was failing in `Prepare site output` because it always passed `--require-garmin-vo2max` to `scripts/daily_snapshot_runner.py`.
- That gate made the whole publish job abort when Garmin returned empty or unauthorized data, even though the site could still be built from the remaining sources.
- Removed the hard Garmin flag from `.github/workflows/pages.yml` so deploys can publish best-effort site artifacts instead of failing the entire Pages run.
- Validation passed with `docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v"`.

## 2026-07-13 Browser Smoke Sync

- `scripts/build_site_artifacts.py` now copies the `history/` subtree into `dist/`, which fixes the strength-page 404s in the built bundle.
- `site/speed.js` now renders a visible empty-state summary when Garmin bests are absent, so the page no longer hides its summary strip on a valid zero-data payload.

## 2026-07-13 Strength Tabs Refresh

- The strength page now ships a tabbed History/Exercises layout, with `site/strength.html` using `#strength-tabs`, `#history-panel`, and `#exercises-panel` as the core hooks.
- `scripts/build_site_artifacts.py` now includes `hevy.recent_workouts` in `strength.json`, so the served `dist/` bundle can render the workout timeline instead of only the exercise list.
- The browser smoke suite now treats the History tab as the default visible shell and verifies tab switching separately, which matches the intended hidden Exercises panel on first paint.
- Validation passed with `docker compose run --rm app python3 scripts/build_site_artifacts.py`, `python3 -m unittest tests.test_build_site_artifacts -v`, and `npx playwright test tests/browser/site-smoke.test.js`.
- The shared Hevy controls now live outside the tab panels, so the API key, refresh button, and window selector remain visible on both tabs.
- The shared Hevy toolbar now has a small live chip, helper copy, and a soft glow so it reads more like a featured control surface than a plain form block.
- The strength header now uses one shared stack for tabs and controls, with a unified frame and accent line so the page reads as a single control area instead of two separate boxes.
- The strength tabs now have a more prominent active state with lift, sheen, and a small indicator line so the navigation reads as a deliberate header system.
- The Hevy workout history cards were empty because both `scripts/wrappers/fetch_hevy.py` and `site/hevy-live.js` summarized workouts down to counts; both paths now keep nested `exercises` and `sets` so the history tab can render the actual workout contents.
- Added a browser regression in `tests/browser/site-smoke.test.js` that mocks a strength payload with nested workout exercises and verifies the History tab renders the workout title, exercise name, and set details.
- The strength page loader now treats the History/Exercises helper functions as required runtime dependencies, so the page no longer falls back to the unavailable shell when those helpers are missing.
- The mobile strength tab bar now stays on one horizontal row and scrolls sideways instead of wrapping into a cramped two-line layout.
- Validation passed with `docker compose run --rm app python3 scripts/build_site_artifacts.py` and `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174 npm run test:browser`.
- Rebuilt `dist/` from the current snapshot after those changes so the checked-in bundle and the served site matched.
- Validation passed with `docker compose run --rm -v "$PWD":/app -w /app app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest discover -s tests -v"`, `docker compose run --rm -v "$PWD":/app -w /app app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest tests.test_daily_snapshot_runner -v"`, `npm run format:js:check`, `npm run lint:js`, `node --test tests/frontend/*.test.js`, and `npm run test:browser`.

## 2026-07-13 Live Snapshot Only

- Removed browser-stored snapshot baselines from the dashboard and progress pages so those views no longer compare against persisted local snapshots.
- The dashboard/progress copy now treats the current live snapshot as the only source for rendered snapshot values.
- Hevy live pulling now paginates in batches of 10 instead of requesting an invalid `pageSize=30`, which restores the live source capture path.
- Validation passed with `docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest personal_trainer.tests.test_script_entrypoints -v"` and a fresh `docker compose run --rm app python3 scripts/daily_snapshot_runner.py --deploy-log-output dist/deploy-log.txt`.

## Progress Live-Only Fix

- Progress page date controls now prefer the live recent-day window from the current snapshot.
- Removed the archive/history fallback from the progress page so missing live data is reported instead of substituting generated history.
- Added coverage for the live recent-day range summary helper and kept the UI limited to live dates only.
- Snapshot builds now carry explicit source metadata so the dashboard can suppress example snapshots instead of rendering fake Today/nutrition values.
- Live progress summaries now include current VO2 max and recent strength-best counts so the section surfaces training progress, not only fueling changes.

## Pages Live Source Build

- Updated `.github/workflows/pages.yml` so the Pages job can use live source capture when repo secrets are configured and otherwise falls back to the committed snapshot fixture.
- Added workflow env defaults for the live source wrapper commands and secret env wiring so the job resolves the same live seams used locally when secrets are available.
- Updated the handoff and architecture docs so they describe the secret-aware Pages deployment path.

## Pages Constraint

- GitHub Actions does not have access to the local Garmin, Hevy, or Cronometer secrets used by the live wrappers.
- The Pages deployment must stay on the committed example snapshot until there is a supported secret-backed deployment path.

## Previous Task

Remove the static site service worker.

## Pages Smoke Coverage

- Added a post-deploy HTTP smoke step to `.github/workflows/pages.yml`.
- The smoke step polls the live Pages URL after deployment until the dashboard content appears, then verifies `favicon.png` is served.
- The workflow change is YAML-valid and keeps the scope limited to deployment verification.
- Hardened `scripts/daily_snapshot_runner.py` so Pages can skip optional Hevy/Garmin history overlays when the command env vars are not set, while keeping direct history scripts strict.
- Added regression coverage in `tests/test_daily_snapshot_runner.py` for the optional history-report skip path.
- Added a main-branch guard on the Pages deploy job so manual dispatches from feature branches do not hit the protected `github-pages` environment.

## Service Worker Removal

- Removed the page-level service worker registration from the site HTML.
- Deleted `site/sw.js` and `dist/sw.js`.
- Updated the build artifact copy list so `sw.js` is no longer published.
- Added a regression assertion that the built site does not recreate `sw.js`.

## Guardrail Coverage

- Added snapshot fuzz tests that mutate valid payloads and confirm schema validation still rejects bad shapes.
- Added golden-file regression checks for the ready, under-fueled, and recovery recommendation paths.
- Golden fixtures are stored as Python literals so they stay stdlib-only and work in the local Python 3.9 environment.
- Validation passed with `python3 -m unittest tests.test_testing_guardrails tests.test_snapshot_fuzz tests.test_recommendation_goldens -v`, `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/ci.yml').read_text(encoding='utf-8')); print('ok')"`, and `git diff --check`.
- Expanded the mutation matrix to cover more of the snapshot contract surface and added golden coverage for aerobic base, strength progression, power, and table tennis readiness.

## Browser Smoke Coverage

- Added `@playwright/test`, `playwright.config.js`, and `tests/browser/site-smoke.test.js`.
- Smoke checks cover the dashboard, strength, speed, and progress pages.
- Console capture now fails the suite on uncaught page errors or console errors.
- Added small static fixtures for `site/history/index.json`, `site/history/2026-07-02.json`, `site/history/exercises/_gains.json`, and `site/favicon.png` so the pages load without noisy 404s.
- Validation passed with `PLAYWRIGHT_USE_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 npm run test:browser`, `npm run format:js:check`, `npm run lint:js`, and `git diff --check`.

## Python Script Coverage

- Added `personal_trainer/tests/test_script_entrypoints.py` to cover the snapshot CLI, Garmin speed report, history artifact writer, manual wrapper, and Hevy strength wrapper.
- The new test module exercises both the CLI success/error paths, wrapper JSON output, and the file-writing path for the history generator.
- Fixed `scripts/generate_history.py` so `_merge_into_dist()` creates `dist/history/` before writing history snapshots.
- Validation passed with `python3 -m unittest personal_trainer.tests.test_script_entrypoints -v` and the Docker bind-mounted package test run for the same module.

## Frontend Helper Coverage

- Added a shared `site/data-helpers.js` module for the formatting and snapshot-reading helpers that were duplicated across the dashboard/progress pages.
- Exported the small pure helpers from `site/app.js`, `site/progress.js`, `site/speed.js`, and `site/strength.js` so they can be exercised in Node without a browser.
- Added `tests/frontend/frontend_helpers.test.js` using the Node test runner with stricter DOM/fetch stubs, edge-case `readNumber()` coverage, and a `saveGoals()`/`loadGoals()` round-trip assertion.
- Added a lightweight JS toolchain with Prettier first, then ESLint, plus a CI job in `.github/workflows/ci.yml` that runs both checks.
- Renamed the CI workflow to `.github/workflows/ci.yml` so the frontend and Python jobs sit under one workflow instead of a misnamed `python-tests.yml`.
- Fixed `formatSpeedValue()` so missing `rawValue` no longer coerces to `0`.
- Validation passed with `node --test tests/frontend/frontend_helpers.test.js`, `npm run format:js:check`, `npm run lint:js`, `node --check eslint.config.js`, and `git diff --check`.

## CI Lint Fix

- Updated `python-tests.yml` so ruff formatting and lint failures now fail the workflow instead of being masked by `tee`/`echo`.
- Kept the step summary output while preserving the non-zero exit code from ruff.
- Added a small regression test that proves the shell pattern returns `1` for a failing command and `0` for passing commands.
- Formatted the Python files that CI had flagged and added Ruff per-file ignores for the intentional `sys.path.insert` scripts.

## CI Concurrency

- Added workflow-level concurrency to `python-tests.yml` so only the latest run for a branch stays active.
- This should cancel stale pushes automatically and reduce CI noise during iteration.

## PR Review Branch Check

- Swapped the branch-name audit in `pr-review.yml` from a warning to a failing check.
- This makes non-conforming branch names block the PR review workflow instead of only surfacing a warning.

## Food Logging Shell

- Added a compact food logging shell with item, timestamp, timing tags, and a barcode placeholder.
- Food entries persist locally and render a short today summary so later fueling rules can reason about timing windows.
- Validation passed with `node --check site/app.js`, `git diff --check`, and `docker compose run --rm app python3 scripts/build_site_artifacts.py`.

## Milestone 1

- Built the daily guidance shell on the home screen so the recommendation is now presented as a compact focus card with next action, fueling, confidence, and check-in cues.
- Added a small rationale popover and macro target chips so the guidance is easier to scan without expanding the lower-detail dashboard sections.
- Validation passed with `node --check site/app.js` and `docker compose run --rm app python3 scripts/build_site_artifacts.py`.
- Cleaned up guidance copy so long recommendation fields render in sentence case instead of all-lowercase text.
- Removed confidence and check-in from the top `Today` tiles so they only appear in the rationale area.

## Findings

- Executed `docker compose run --rm app python3 scripts/daily_snapshot_runner.py --sources-file personal_trainer/examples/sources-ready.json`.
- The run completed successfully and wrote the published bundle to `dist/`.
- Generated artifacts include `dist/data/snapshot.json`, `dist/raw.json`, `dist/strength.json`, `dist/speed.json`, and the static site shell.
- The container image is already based on `python:3.12-slim-bookworm`, so no image changes were required for this run.
- Docker verification with the repo bind-mounted into `/app` passed for:
  - `tests.test_daily_snapshot_runner`
  - `tests.test_cronometer_wrapper`
  - `tests.test_garmin_wrapper`
  - `tests.test_garmin_speed_wrapper`
  - `python3 -m unittest discover -s tests -v`
  - `PYTHONPATH=personal_trainer/src python3 -m unittest personal_trainer.tests.test_hevy_adapter personal_trainer.tests.test_cronometer_adapter personal_trainer.tests.test_snapshot_assembler personal_trainer.tests.test_live_sources personal_trainer.tests.test_live_cli -v`
- Host-side `python3` is Python 3.9 here, so `tests.test_cronometer_wrapper` fails outside Docker because `datetime.UTC` is unavailable there.
- Updated the build docs to prefer Docker/Python 3.12 over local Python for agent runs.
- The Docker image now includes `nodejs`, `npm`, and `libatomic1` so the Hevy strength wrapper can launch `npx`-based MCP history pulls inside the container.
- Live Docker pipeline on 2026-07-07 completed successfully with real source data:
  - Garmin snapshot: `current_vo2max` 51.0, 10 recent activities, 10 recent runs
  - Hevy snapshot: 10 recent workouts, 5 recent bests
  - Cronometer snapshot: `calories_consumed` 1806.17, `calories_target` 1699.0
  - UI payload recommendation: `aerobic_quality`, confidence `medium`, check-in `yes`
  - History artifacts: `dist/strength.json` has 8 entries, `dist/speed.json` has 6 entries
- Bottom navigation was hidden on desktop because `site/styles.css` only displayed it below `768px`; changed it to display on all viewport widths and bumped stylesheet cache-busting query params to `?v=10`.
- Bottom navigation still vanished after page-to-page navigation in the browser, so `site/sw.js` and `dist/sw.js` were switched to network-only fetch handling and now call `clients.claim()` on activate; cache version bumped to `personal-trainer-v3` to flush older shell assets.
- Service worker registration URLs were also versioned to `./sw.js?v=3` on all pages so browsers re-fetch the updated worker script instead of reusing an older one.
- Speed artifacts were normalized during the site build so Garmin raw PR values now publish as readable paces and distances in `dist/speed.json`, and the Speed page goals now format any older raw localStorage values before rendering.
- The committed `dist/history/` snapshot archive was removed from the branch; the docs now point agents to `docker compose run --rm app python3 scripts/generate_history.py` when they need local history examples.

Garmin auth/session caching card from the project board.

- `scripts/wrappers/fetch_garmin.py` now prefers a reusable tokenstore (`GARMINTOKENS` or `~/.garminconnect`) before falling back to username/password login.
- After a password login, the Garmin wrapper persists fresh token files via `client.garth.dump(...)` so repeated runs can avoid re-authentication.
- Docker now mounts `./.cache/garmin` at `/app/.garminconnect` and sets `GARMINTOKENS=/app/.garminconnect` so the token cache survives container runs.
- Added regression coverage for cached-session and password-refresh Garmin login flows in `tests/test_garmin_wrapper.py`.
- Live Garmin auth attempt on 2026-07-07 returned `401 Unauthorized` from Garmin SSO, so the wrapper fell back to an empty payload instead of caching a session.
- Live Garmin verification after the fallback patch returned `current_vo2max: 51.0` and `vo2max_trend: stable` from the fresh run history payload.
- Live Garmin speed export now writes 6 running PR records to `dist/speed.json` using Garmin `typeId` normalization.
- Live Hevy export now writes 10 recent workouts and 5 recent bests to `dist/strength.json`.
- `scripts/daily_snapshot_runner.py` now overlays the live `strength.json` and `speed.json` reports after the snapshot-based site build so the published bundle keeps the fresh historical pages.
- The repo already had an `AGENTS.md` with commands, architecture, testing, environment, and workflow rules — merged those into a new AGENTS.md with the template structure preserved on top.
- All 15 Python source files, 7 scripts, 6 wrappers, 14 tests, and 15 site files were inspected during onboarding.
- The project has well-documented canonical docs in `docs/` — 7 markdown files covering charter, contracts, MCP, agent onboarding, handoff, and board execution order.
- No linter/formatter/typechecker config exists — just `unittest` for testing.
- `garminconnect.Garmin.login(tokenstore=...)` loads session tokens from a directory; `garth.Client.dump(dir)` writes `oauth1_token.json` and `oauth2_token.json`.
- Docker now needs to mount a Garmin token directory and set `GARMINTOKENS` so the cached session survives repeated `docker compose run` calls.
- Snapshot validation now rejects malformed athlete values and site/recommendation entrypoints validate before consuming snapshot JSON.
- Recommendation v1 now has an explicit `power_and_athleticism` branch when the athlete is in a strength-focused block and the strength trend is stable or improving.
- The UI now has a shared summary-strip pattern that can be reused across dashboard, progress, strength, and speed views without changing the underlying data model.
- Recommendation priority labels are now humanized in the dashboard, including the session-history tags, so snake_case values read like normal copy.

## Files Inspected

- All files under `personal_trainer/src/personal_trainer/` (15 files)
- All files under `scripts/` (8 py + 1 sh)
- All files under `scripts/wrappers/` (6 py)
- All files under `personal_trainer/tests/` (12 py)
- All files under `tests/` (2 py)
- All files under `site/` (15 files)
- All files under `docs/` (7 md)
- `personal_trainer/pyproject.toml`, `.env.example`, `.github/workflows/`

## Follow-ups

- None for this task.
## 2026-07-10

- Removed synthetic/example fallback wording from the history UI.
- Progress now infers live data from real recent-day activity and surfaces VO2/strength trend fields instead of reading as nutrition-only.
- Rebuilt `dist/` from the live snapshot pipeline; host `python3` is still 3.9 here, so live source wrappers for Garmin/Hevy fell back and produced an empty live snapshot.
- Progress page was trimmed back down to nutrition averages plus VO2 only; removed workouts/runs, weekly run distance, and Hevy strength trend tiles from the live summary and range summary.
- Playwright smoke now uses the empty dashboard shell as the readiness target because the no-fallback preview boots without a rendered freshness strip or summary stack.
- Browser smoke passed after rebuilding locally and serving `dist/` from `./scripts/serve_site.sh --skip-build` in the same shell context.
## 2026-07-12

- CI lint failure reproduced only when running Ruff from `personal_trainer/`, matching the workflow.
- `scripts/build_site_artifacts.py` and `scripts/wrappers/fetch_cronometer.py` were reformatted to satisfy that context.
- Root-level Ruff still differs on those files, but the CI job uses the package directory config and now passes there.

## 2026-07-12 Live coverage gate

- Added pipeline logging in live source capture and Garmin fetch so missing data surfaces in deploy logs.
- Added a strict Pages preflight that fails when Garmin/Hevy/Cronometer coverage is effectively empty after live capture.
- Pages workflow now enables the strict live coverage gate.
- Added daily runner coverage tests for both the success path and the fail-loud path.

## 2026-07-12 Import Status UI

- Added an explicit home-page import status banner above the existing freshness markers.
- The banner distinguishes live import success, live import failure, example snapshots, and generic unavailable states.
- Browser smoke now checks that the import status banner renders on the dashboard.

## 2026-07-12 Deployment Log Artifact

- The live snapshot runner now writes `dist/deploy-log.txt` alongside the published site bundle.
- The log file records the run mode, live capture command, captured live-source stderr, and the final build status.
- The generated file is served from the local preview bundle so it can be inspected during review.
- The dashboard Actions menu now includes an `Open deployment log` entry, and the browser smoke test opens the menu before checking it.

## 2026-07-13 Pipeline Logging Expansion

- The live source wrappers now emit plain-text logging for their own capture steps and fallback paths.
- `scripts/live_sources.py` forwards wrapper stderr so the runner log can include upstream capture messages instead of dropping them.
- `personal_trainer.recommendation` now logs the selected recommendation priority, confidence, and check-in state.

## 2026-07-13 Food Page Source Date

- The Food page now shows a live nutrition summary above the logging shell.
- The displayed Cronometer calories come from `cronometer.today.calories_consumed` in the live snapshot, not from a browser-side recalculation.
- Added a visible Cronometer day / snapshot date line so source-date mismatches are obvious during review.
- `site/` changes require rebuilding the app image before regenerating `dist/` because the Docker build bakes the site files into the image layer.

## 2026-07-13 Cronometer Consumed Macros

- Cronometer intake grams were being populated from `summary.macros`, which matched the target macro set instead of the consumed totals.
- The wrapper now reads `summary.consumed.protein_g`, `summary.consumed.carbs_g`, and `summary.consumed.fat_g` for the Food page live summary.
- Rebuilt the live snapshot after the fix so the Food page now reflects consumed macro grams instead of target grams.
## 2026-07-13

- Runtime-generated artifacts should not be committed. Added a repo-level convention for build outputs/logs and ignored `dist/speed.json` alongside the existing generated files.

## 2026-07-13 Task #141

- Added `site/manifest.webmanifest` for the installable mobile shell.
- Canonical site pages now link the manifest and reuse `favicon.png` as the app icon / apple touch icon.
- `scripts/build_site_artifacts.py` copies the manifest into `dist/`, and tests now cover both the generated file and direct serving in browser smoke.

## 2026-07-13 Strength Page Presentation Pass

- Strength now shows a personalized coaching note in the hero, a lead momentum tile in the summary strip, and lighter command-stack chrome.
- Exercise cards now emphasize the latest session first and de-emphasize the older best-ever metric.
- Workout history summaries now expose duration and exercise-count badges for quicker scanning on desktop and mobile.
