# Architecture

## Overview

Personal performance system that ingests training, nutrition, strength, and recovery data from Garmin, Hevy, Cronometer, and manual check-in sources, normalizes them into a contract-validated snapshot, and produces daily training/nutrition/recovery recommendations. Results are rendered in a static browser UI deployed to GitHub Pages.

The long-term product direction is broader than the current implementation: it is intended to grow into an integrated coaching system with a durable ledger, direct food/workout logging, and feedback loops for performance and fueling. The current repo implements the first snapshot-first slice of that vision.

Three runtime modes:

1. **CLI** — load a snapshot JSON file and print a recommendation
2. **Snapshot CLI** — normalize source payloads into the snapshot contract
3. **Live CLI** — fetch live sources, build snapshot, and emit recommendation

A daily runner script (`scripts/daily_snapshot_runner.py`) chains source capture, snapshot build, and site artifact generation in one pass.

## Stack

- Language: Python >=3.11
- Backend: None (local Python scripts, no server)
- Frontend: Static HTML/CSS/JS (vanilla, no framework)
- Database: None today (JSON files only); future phases may add a SQL ledger and API
- Deployment: GitHub Pages (from `site/` and `dist/` artifacts)
- Live sources: MCP servers (Garmin, Hevy, Cronometer) via stdio JSON-RPC
- Build: Hatchling (package), shell scripts (site artifacts)
- Testing: `unittest` (stdlib)

## Main Components

### Python Package (`personal_trainer/src/personal_trainer/`)

- Location: `personal_trainer/src/personal_trainer/`
- Responsibility: Normalize source payloads, validate snapshot contracts, produce daily recommendations
- Main entry points:
  - `cli.py` — CLI that reads a snapshot JSON file and prints a recommendation
  - `snapshot_cli.py` — CLI that normalizes source payloads into a snapshot
  - `live_cli.py` — CLI that fetches live sources, builds snapshot, and recommends
- Key modules:
  - `snapshot.py` — `build_snapshot()` normalizes raw sources into the contract shape; includes validation
  - `recommendation.py` — `build_daily_recommendation()` applies rule-based decision logic
  - `live_sources.py` — loads per-source payloads from file or command env vars
  - `contracts.py` — typed dicts and literal types for the snapshot/recommendation contracts
  - `ingestion.py` — `SourceAdapter` protocol and `collect_source_payloads()`
  - `source_registry.py` — `CallableSourceAdapter` factory and adapter registry
  - `snapshot_assembler.py` — `build_snapshot_from_adapters()` for adapter-based workflows
  - `garmin_adapter.py`, `hevy_adapter.py`, `cronometer_adapter.py` — source adapter classes
- `live_smoke.py` — smoke test entrypoint that builds a snapshot from live fetchers

### Vision and Contracts

- `docs/global-vision.md` — top-level product vision for the integrated coach / nutritionist / ledger system
- `docs/performance-os-charter.md` — Luke-specific operating principles derived from the global vision
- `docs/data-snapshot-contract.md` — normalized snapshot shape used by the recommendation engine and UI
- `docs/daily-recommendation-contract.md` — decision contract for the daily recommendation output

### Wrapper Scripts (`scripts/wrappers/`)

- Location: `scripts/wrappers/`
- Responsibility: Call MCP server tools and emit per-source JSON payloads to stdout
- Files: `fetch_garmin.py`, `fetch_hevy.py`, `fetch_cronometer.py`, `fetch_manual.py`, `fetch_garmin_speed.py`, `fetch_hevy_strength.py`
- Shared client: `scripts/mcp_client.py` — reusable async MCP stdio client

### Pipeline Scripts (`scripts/`)

- Location: `scripts/`
- `live_sources.py` — merges per-source commands into one payload JSON
- `daily_snapshot_runner.py` — end-to-end capture, snapshot, and site artifact generation
- `build_site_artifacts.py` — builds `dist/` directory from one snapshot (copies site shell, emits data JSONs)
- `strength_report.py` — standalone strength report builder from Hevy history
- `speed_report.py` — standalone speed report builder from Garmin records
- `mcp_client.py` — shared async MCP stdio client used by all wrappers
- `serve_site.sh` — local static server

### Static Site (`site/`)

- Location: `site/`
- Responsibility: Browser UI for inspecting snapshots, strength PBs, speed records, progress
- Pages: `index.html` (snapshot viewer), `strength.html` (Hevy PBs/1RM), `speed.html` (Garmin running PBs), `progress.html` (change comparison)
- JS: Vanilla ES modules, no framework. Loads JSON from `data/snapshot.json`, `strength.json`, `speed.json`
- CSS: Dark theme with custom properties, responsive layout
- Deployment: GitHub Pages via `.github/workflows/pages.yml`, triggers on `site/**` changes

## Data Flow

1. Source payloads arrive from MCP wrappers (Garmin, Hevy, Cronometer, manual check-in) as JSON to stdout
2. `live_sources.py` (or `daily_snapshot_runner.py`) collects all four source payloads into one merged JSON object
3. `build_snapshot()` in `snapshot.py` normalizes each source into the contract shape, infers derived fields (data quality, constraints, conflicts), and validates the result
4. `build_daily_recommendation()` in `recommendation.py` reads the snapshot and applies decision rules (recovery > nutrition > table tennis > aerobic quality > aerobic base > strength progression)
5. `build_site_artifacts.py` copies the site shell and emits `data/snapshot.json`, `raw.json`, `strength.json`, `speed.json` to `dist/`
6. GitHub Pages serves `dist/` or `site/` as static files

## Boundaries

- Source adapters must emit raw payloads; normalization is the snapshot module's responsibility
- Recommendation logic reads the snapshot only — it never reads raw source payloads directly
- Site JS is read-only data rendering; all decision logic lives in Python
- Wrapper scripts must not leak secrets (credentials, tokens) into stdout
- Test files for the package live in `personal_trainer/tests/`; script integration tests live in `tests/`

## External Integrations

- **Garmin Connect** — accessed via MCP server (`garmin-mcp`) or direct `garminconnect` library
- **Hevy** — accessed via MCP server (`hevy-mcp`) with `HEVY_API_KEY`
- **Cronometer** — accessed via MCP server (`cronometer-api-mcp`)
- **GitHub Pages** — deployment target for the static site

## Target Direction

The current architecture is intentionally simple, but the target shape is:

- durable event ledger for all imported and direct-entry data
- SQL-backed query layer for historical analysis and app features
- API layer for writes, reads, and coaching interactions
- direct logging flows for meals and workouts
- rule-based guidance first, more adaptive guidance later

## Configuration

- `.env` (gitignored) — see `.env.example` for all vars
- `PERSONAL_TRAINER_SOURCES_FILE` — path to merged JSON export (default: `personal_trainer/examples/sources-ready.json`)
- `PERSONAL_TRAINER_SOURCES_COMMAND` — command that prints merged JSON to stdout
- Per-source env vars: `PERSONAL_TRAINER_{GARMIN,HEVY,CRONOMETER,MANUAL}_COMMAND`
- MCP server override vars: `PERSONAL_TRAINER_{GARMIN,HEVY,CRONOMETER}_MCP_COMMAND`
- Credential vars: `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `HEVY_API_KEY`, `CRONOMETER_USERNAME`, `CRONOMETER_PASSWORD`

## Testing Strategy

- Framework: `unittest` (stdlib). No pytest, no linter/formatter/typechecker config.
- Package tests: `personal_trainer/tests/` — test normalization, recommendation logic, adapters, source registry, CLI, and integration flows
- Script tests: `tests/` — test `daily_snapshot_runner.py` and `build_site_artifacts.py` with mocked sources
- Run package tests: `PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v`
- Run script tests: `python3 -m unittest discover -s tests -v`

## Known Constraints

- Python >=3.11 required (uses `|` union syntax, `TypeAlias`, etc.)
- `playwright` dependency listed in `pyproject.toml` but currently unused in code
- Garmin MCP server has rate limits (429 after repeated auth) — wait 15+ minutes between credential-based tests
- MCP stream reader default limit is 64KB — `scripts/mcp_client.py` raises it to 1MB for large payloads
- No CI for snapshot or recommendation correctness — tests cover normalization and decision logic with synthetic data
- Personal data (credentials, `.garminconnect` tokens, raw exports) must never be committed
