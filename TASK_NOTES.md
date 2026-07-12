# Task Notes

This file is for temporary task-specific findings. It can be cleared between tasks.

## Current Task

Add a deployment log artifact for live preview runs so the build output can be inspected after deployment.

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
- The smoke step polls the live Pages URL after deployment until the dashboard content appears, then verifies `favicon.svg` is served.
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
- Added small static fixtures for `site/history/index.json`, `site/history/2026-07-02.json`, `site/history/exercises/_gains.json`, and `site/favicon.svg` so the pages load without noisy 404s.
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
- Local `python3 scripts/build_site_artifacts.py` publishes `favicon.svg` plus `strength/index.html` and `speed/index.html`; the Docker build path here still leaves those files out of `dist/`.
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
