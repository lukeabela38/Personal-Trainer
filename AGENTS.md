# Agent Instructions

## Working Principles

- Do not perform full-repo analysis by default.
- First read `AGENTS.md`, `ARCHITECTURE.md`, `REPO_MAP.md`, and any relevant module docs.
- Inspect only files directly relevant to the task.
- Before opening additional unrelated files, identify why they are needed.
- Prefer tests, interfaces, types, and module entry points before reading implementation details.
- Avoid loading large files unless necessary.
- Do not paste or duplicate large source files into notes.
- Keep findings compact and durable.

## Context Strategy

Use this priority order when starting a task:

1. `AGENTS.md`
2. `REPO_MAP.md`
3. `ARCHITECTURE.md`
4. Relevant module docs, if any
5. Relevant tests
6. Relevant implementation files

## Task Workflow

1. Identify the likely module or feature area.
2. Read only the relevant context files.
3. Inspect the smallest useful set of source files.
4. Produce a short investigation summary before making changes.
5. Make targeted changes.
6. Run the narrowest relevant tests first.
7. Update `TASK_NOTES.md` with temporary task findings.
8. Update durable docs only if new stable knowledge was discovered.

## Investigation Summary Format

Before coding, write a short summary:

```md
## Investigation Summary

- Task:
- Relevant area:
- Files inspected:
- Relevant functions/classes:
- Suspected issue:
- Planned changes:
- Tests to run:
```

Keep it under 200 words.

## Documentation Update Rules

Update `ARCHITECTURE.md`, `REPO_MAP.md`, or `DECISIONS.md` only when the information is durable and useful for future tasks.

Do not add:

- temporary debugging notes
- speculative assumptions
- one-off task details
- long stack traces
- large code snippets

Put temporary notes in `TASK_NOTES.md`.

## Code Change Rules

- Keep changes scoped to the task.
- Do not refactor unrelated code.
- Do not change public APIs unless explicitly required.
- If public API behavior changes, update related tests and docs.
- Follow existing style and conventions.
- Prefer minimal, well-tested fixes.

## When More Context Is Needed

Before expanding scope, state:

```md
Need to inspect additional files because:
- ...
```

Then inspect only the named files.

---

## Commands (run from repo root)

```bash
# All Python commands need PYTHONPATH set to the package src dir
PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v

# Run a single test file
PYTHONPATH=personal_trainer/src python3 -m unittest personal_trainer.tests.test_recommendation -v

# Run root-level script tests (separate test dir, different PYTHONPATH)
python3 -m unittest discover -s tests -v

# Serve the static site locally
./scripts/serve_site.sh

# Build site artifacts from example data
python3 ./scripts/build_site_artifacts.py

# Full pipeline: live sources -> snapshot -> site
python3 ./scripts/daily_snapshot_runner.py --sources-file personal_trainer/examples/snapshot-ready.json

# Run CLI entrypoints directly
PYTHONPATH=personal_trainer/src python3 -m personal_trainer.cli personal_trainer/examples/snapshot-ready.json
PYTHONPATH=personal_trainer/src python3 -m personal_trainer.snapshot_cli personal_trainer/examples/sources-ready.json
PYTHONPATH=personal_trainer/src python3 -m personal_trainer.live_cli personal_trainer/examples/sources-ready.json
```

## Architecture

- **Package source:** `personal_trainer/src/personal_trainer/` (requires `PYTHONPATH=personal_trainer/src`)
- **Three entrypoints** defined in `personal_trainer/pyproject.toml`: `personal-trainer` (CLI), `personal-trainer-snapshot`, `personal-trainer-live`
- **Data flow:** Source payloads (Garmin, Hevy, Cronometer, manual) -> `build_snapshot()` in `snapshot.py` -> `build_daily_recommendation()` in `recommendation.py`
- **Operational scripts:** `scripts/` - `live_sources.py` (merge per-source commands), `daily_snapshot_runner.py` (full pipeline), `build_site_artifacts.py` (snapshot->static site)
- **Static site:** `site/` (HTML/CSS/JS), deployed to GitHub Pages from `main` when `site/**` changes
- **Hatchling** build backend, Python >=3.11, dependency: `playwright`

## Testing

- Framework: **`unittest`** (stdlib) - no pytest. All test classes extend `unittest.TestCase`.
- Test locations: `personal_trainer/tests/` (package tests) and `tests/` (script integration tests)
- Tests use `EXAMPLES_DIR` pattern: `Path(__file__).resolve().parents[1] / "examples"`
- Live-source tests save/restore `PERSONAL_TRAINER_SOURCES_FILE` and `PERSONAL_TRAINER_SOURCES_COMMAND` env vars
- `personal_trainer/tests/test_live_sources_script.py` subprocesses `scripts/live_sources.py` - heavier integration test
- No linter, formatter, or typechecker config exists (no ruff, flake8, mypy, etc.)

## Environment

- `.env` is gitignored; see `.env.example` for vars
- `PERSONAL_TRAINER_SOURCES_FILE` - path to merged JSON export (default: `personal_trainer/examples/sources-ready.json`)
- `PERSONAL_TRAINER_SOURCES_COMMAND` - alternative: command that prints merged JSON to stdout
- Per-source command env vars: `PERSONAL_TRAINER_{GARMIN,HEVY,CRONOMETER,MANUAL}_COMMAND`
- Example payloads in `personal_trainer/examples/`: `sources-ready.json`, `snapshot-ready.json`

## Canonical Docs (read these first for new work)

- `docs/performance-os-charter.md` - mission, tradeoff rules, athlete context
- `docs/data-snapshot-contract.md` - normalized snapshot shape and freshness rules
- `docs/daily-recommendation-contract.md` - priority options, decision rules, check-in triggers
- `docs/mcp-integrations.md` - MCP server setup, env vars, wrapper scripts
- `docs/agent-onboarding.md` - card rules, MCP wrapper testing protocol, commit checklist
- `docs/handoff-guide.md` - current architecture and where to start
- `docs/board-execution-order.md` - wave order (contracts -> adapters -> recommendation -> UI -> deployment)

## Workflow Rules

- Reviewable work must be a PR on a feature branch, not a direct commit to `main`
- Keep cards narrow: one behavior, one source adapter, or one page per card
- Do not combine contract changes with UI work unless the card is explicitly about integration
- Avoid committing personal raw data, API keys, tokens, or `.garminconnect` files

## Project Board

- See `docs/board-execution-order.md` for wave order
- See `docs/agent-onboarding.md` for card rules and MCP wrapper testing protocol
