# Task Notes

This file is for temporary task-specific findings. It can be cleared between tasks.

## Current Task

Dockerized full pipeline run with Python 3.12.

## CI Lint Fix

- Updated `python-tests.yml` so ruff formatting and lint failures now fail the workflow instead of being masked by `tee`/`echo`.
- Kept the step summary output while preserving the non-zero exit code from ruff.
- Added a small regression test that proves the shell pattern returns `1` for a failing command and `0` for passing commands.
- Formatted the Python files that CI had flagged and added Ruff per-file ignores for the intentional `sys.path.insert` scripts.

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
