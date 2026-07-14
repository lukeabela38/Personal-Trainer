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
# Dev server + tunnel for mobile testing (e.g. barcode scanner #154)
# Requires cloudflared (brew install cloudflared) or falls back to Docker
./scripts/serve_site.sh --live --tunnel

# Portable Docker-only equivalent:
docker compose up site -d                           # serve dist/ on port 4173
docker compose up tunnel -d                          # cloudflared tunnel to localhost
docker compose logs tunnel | grep trycloudflare      # get public URL
docker compose run --rm qr "<url>" /app/dist/qr.png  # generate QR code (saves to ./dist/qr.png)

# Prefer Docker for Python 3.12 runs. Use local Python only as a fallback if Docker is unavailable.

# Run package tests in the Python 3.12 container
docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v"

# Run a single test file in the Python 3.12 container
docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m unittest personal_trainer.tests.test_recommendation -v"

# Run root-level script tests in the Python 3.12 container
docker compose run --rm app sh -c "python3 -m unittest discover -s tests -v"

# Serve the static site locally
./scripts/serve_site.sh

# Build site artifacts from example data in the Python 3.12 container
docker compose run --rm app python3 scripts/build_site_artifacts.py

# Full pipeline: live sources -> snapshot -> site
docker compose run --rm app python3 scripts/daily_snapshot_runner.py

# Run CLI entrypoints directly
docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m personal_trainer.cli personal_trainer/examples/snapshot-ready.json"
docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m personal_trainer.snapshot_cli personal_trainer/examples/sources-ready.json"
docker compose run --rm app sh -c "PYTHONPATH=personal_trainer/src python3 -m personal_trainer.live_cli personal_trainer/examples/sources-ready.json"
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

## Linting

- **ruff** is configured in `personal_trainer/pyproject.toml` under `[tool.ruff]`
- Install: `pip install "personal_trainer.[lint]"` or `pip install ruff`
- Run: `ruff check src tests` and `ruff format --check src tests` from `personal_trainer/`
- Rules selected: F (pyflakes), E/W (pycodestyle), I (isort), UP (pyupgrade), TID (tidy-imports)
- E501 (line length) is ignored — handled by ruff formatter at 120 chars
- Scripts (`scripts/`) with `sys.path.insert` pattern are exempt from E402

## CI / PR Review Pipeline

Three workflows in `.github/workflows/`:

| Workflow | Trigger | Purpose |
|---|---|---|
| `python-tests.yml` | Push to main, any PR | Lint (ruff format + check), package unit tests, script integration tests |
| `pr-review.yml` | PR events (`pull_request_target`) | Auto-label by area (`.github/labeler.yml`), size-based labels (xs/s/m/l/xl), branch name convention check |
| `pages.yml` | Push to main (path-filtered) | Build static site & deploy to GitHub Pages |

Contributors should follow `.github/PULL_REQUEST_TEMPLATE.md` and use issue templates in `.github/ISSUE_TEMPLATE/`.

## Non-conventions

- No formatter or typechecker beyond ruff is required.

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
- When reporting live external data, treat every result as time-stamped and source-specific; do not generalize from stale artifacts or older runs, and re-run the source command before claiming current state changed.

## Project Board

- See `docs/board-execution-order.md` for wave order
- See `docs/agent-onboarding.md` for card rules and MCP wrapper testing protocol
