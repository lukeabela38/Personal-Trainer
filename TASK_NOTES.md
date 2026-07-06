# Task Notes

This file is for temporary task-specific findings. It can be cleared between tasks.

## Current Task

Set up durable context files to reduce repeated repo analysis.

## Findings

- The repo already had an `AGENTS.md` with commands, architecture, testing, environment, and workflow rules — merged those into a new AGENTS.md with the template structure preserved on top.
- All 15 Python source files, 7 scripts, 6 wrappers, 14 tests, and 15 site files were inspected during onboarding.
- The project has well-documented canonical docs in `docs/` — 7 markdown files covering charter, contracts, MCP, agent onboarding, handoff, and board execution order.
- No linter/formatter/typechecker config exists — just `unittest` for testing.

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
