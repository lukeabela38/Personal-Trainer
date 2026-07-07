# Task Notes

This file is for temporary task-specific findings. It can be cleared between tasks.

## Current Task

Issues 25, 26, 27, and 28: broad UI pass across progress, strength, speed, and dashboard views.

## Findings

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
