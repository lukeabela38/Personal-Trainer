# Repo Map

## Root Files

- `AGENTS.md` — agent instructions (start here)
- `ARCHITECTURE.md` — system architecture overview
- `REPO_MAP.md` — this file, directory navigation map
- `DECISIONS.md` — stable technical decisions
- `TASK_NOTES.md` — temporary task scratchpad
- `README.md` — human-facing project overview, local run instructions
- `docs/global-vision.md` — top-level product vision; all other docs derive from it
- `docs/app-blueprint.md` — app-level blueprint; derives from the global vision
- `docs/milestone-roadmap.md` — short milestone sequence derived from the blueprint
- `docs/working-conventions.md` — lightweight repository working rules
- `.env.example` — all environment variables documented
- `pyproject.toml` (in `personal_trainer/`) — hatchling build config, entrypoints, dependencies, ruff config
- `.github/workflows/pages.yml` — GitHub Pages deployment
- `.github/workflows/python-tests.yml` — CI: lint + package tests + script tests
- `.github/workflows/pr-review.yml` — PR auto-labeler, size check, branch name check
- `.github/labeler.yml` — path-based label rules for area labels
- `.github/PULL_REQUEST_TEMPLATE.md` — PR description template
- `.github/ISSUE_TEMPLATE/` — bug report and feature request templates

## Source Directories

### `personal_trainer/src/personal_trainer/`

Purpose: Python package — normalization, recommendation, live data seam.

Important files:

- `snapshot.py` — `build_snapshot()` and `_validate_snapshot()` — core normalization + contract validation
- `recommendation.py` — `build_daily_recommendation()` — rule-based decision engine
- `live_sources.py` — loads source payloads from file or env var command
- `contracts.py` — TypedDict definitions for Recommendation, DerivedContext, and Literal types
- `ingestion.py` — `SourceAdapter` protocol, `collect_source_payloads()`
- `source_registry.py` — `CallableSourceAdapter`, `build_source_adapter_registry()`
- `snapshot_assembler.py` — `build_snapshot_from_adapters()`
- `garmin_adapter.py` — `GarminLiveAdapter` class
- `hevy_adapter.py` — `HevyLiveAdapter` class, `build_hevy_live_adapter()`
- `cronometer_adapter.py` — `CronometerLiveAdapter` class, `build_cronometer_live_adapter()`
- `cli.py` — `personal-trainer` entrypoint: snapshot file -> recommendation
- `snapshot_cli.py` — `personal-trainer-snapshot` entrypoint: sources -> snapshot
- `live_cli.py` — `personal-trainer-live` entrypoint: live sources -> snapshot + recommendation
- `live_smoke.py` — `run_live_smoke()` for manual live data smoke test
- `__init__.py` — exports `build_snapshot`, `build_daily_recommendation`, `run_live`

### `personal_trainer/examples/`

- `sources-ready.json` — example merged source payload (used by tests and default env)
- `snapshot-ready.json` — example normalized snapshot (used by CLI and site build)

### `personal_trainer/tests/`

Purpose: Unit and integration tests for the Python package.

Important files:

- `test_snapshot.py` — snapshot normalization and contract validation tests (20+ tests)
- `test_recommendation.py` — recommendation decision logic tests
- `test_integration.py` — snapshot-to-recommendation end-to-end flow
- `test_live_cli.py` — live CLI entrypoint tests
- `test_live_sources.py` — source payload loading tests
- `test_live_sources_script.py` — subprocess integration test for `scripts/live_sources.py`
- `test_garmin_adapter.py`, `test_hevy_adapter.py`, `test_cronometer_adapter.py` — adapter unit tests
- `test_snapshot_assembler.py` — adapter-based snapshot assembly tests
- `test_source_registry.py` — adapter registry tests
- `test_live_smoke.py` — live smoke test harness

### `scripts/`

Purpose: Operational scripts for live data capture, site building, and reporting.

- `daily_snapshot_runner.py` — end-to-end pipeline: live sources -> snapshot -> site artifacts
- `live_sources.py` — merge per-source commands into one payload JSON
- `build_site_artifacts.py` — copy site shell + emit data JSONs to `dist/`
- `mcp_client.py` — reusable async MCP stdio client
- `strength_report.py` — standalone strength PB report from Hevy history
- `speed_report.py` — standalone speed PB report from Garmin records
- `test_strength_report.py` — tests for `strength_report.py`
- `serve_site.sh` — build-and-serve local deploy preview
- `live_sources_example.sh` — example shell pipeline

### `scripts/wrappers/`

Purpose: Per-source MCP wrapper scripts — emit source payload JSON to stdout.

- `fetch_garmin.py` — Garmin Connect data (VO2 max, activities, runs, readiness, load, records)
- `fetch_hevy.py` — Hevy workout data (latest workout, history, exercise history, fatigue inference)
- `fetch_cronometer.py` — Cronometer nutrition data (food log, macro targets, fueling status)
- `fetch_manual.py` — manual check-in (reads from command or file, falls back to defaults)
- `fetch_garmin_speed.py` — Garmin personal records for running
- `fetch_hevy_strength.py` — Hevy exercise history for tracked template IDs

### `site/`

Purpose: Static browser UI.

- `index.html` — main snapshot viewer with recommendation display
- `strength.html` — Hevy PBs and estimated 1RMs (carousel UI)
- `speed.html` — Garmin running PBs (carousel UI)
- `progress.html` — change comparison between current and previous snapshot
- `styles.css` — shared dark theme, card layouts, responsive grid
- `strength.css`, `speed.css` — carousel styles for dedicated pages
- `app.js` — snapshot viewer logic, file loading, delta tracking
- `strength.js` — strength carousel with infinite scroll
- `speed.js` — speed carousel with infinite scroll
- `progress.js` — progress comparison rendering
- `strength/`, `speed/` — redirect index.html files for clean URLs

### `docs/`

- `global-vision.md` — mission, product layers, and derivation rules (read first)
- `app-blueprint.md` — app-level blueprint and first implementation slice
- `milestone-roadmap.md` — direct-data-first milestone sequence
- `working-conventions.md` — RFC 2119, issue/PR shape, and decision rules
- `performance-os-charter.md` — mission, tradeoff rules, athlete context
- `data-snapshot-contract.md` — normalized snapshot shape, freshness, fields (read second)
- `daily-recommendation-contract.md` — priority options, decision rules, check-in triggers
- `mcp-integrations.md` — MCP server setup, env vars, credential rules
- `agent-onboarding.md` — card rules, MCP wrapper testing protocol, commit checklist
- `handoff-guide.md` — current architecture overview, where to start
- `board-execution-order.md` — wave execution order for project board

## Feature Areas

### Snapshot Normalization

Related files:

- `personal_trainer/src/personal_trainer/snapshot.py`
- `personal_trainer/src/personal_trainer/contracts.py`

Tests:

- `personal_trainer/tests/test_snapshot.py`

### Daily Recommendation

Related files:

- `personal_trainer/src/personal_trainer/recommendation.py`
- `personal_trainer/src/personal_trainer/contracts.py`

Tests:

- `personal_trainer/tests/test_recommendation.py`
- `personal_trainer/tests/test_integration.py`

### Live Source Capture

Related files:

- `personal_trainer/src/personal_trainer/live_sources.py`
- `personal_trainer/src/personal_trainer/live_cli.py`
- `scripts/live_sources.py`
- `scripts/daily_snapshot_runner.py`
- `scripts/wrappers/*.py`
- `scripts/mcp_client.py`

Tests:

- `personal_trainer/tests/test_live_cli.py`
- `personal_trainer/tests/test_live_sources.py`
- `personal_trainer/tests/test_live_sources_script.py`
- `tests/test_daily_snapshot_runner.py`

### Static Site / UI

Related files:

- `site/*.html`, `site/*.js`, `site/*.css`
- `scripts/build_site_artifacts.py`
- `scripts/strength_report.py`
- `scripts/speed_report.py`

Tests:

- `tests/test_build_site_artifacts.py`
- `scripts/test_strength_report.py`

## Tests

- **Package unit tests:** `personal_trainer/tests/` — run with `PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v`
- **Script integration tests:** `tests/` — run with `python3 -m unittest discover -s tests -v`
- **Test convention:** All classes extend `unittest.TestCase`. Uses `EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"`. Live-source tests save/restore env vars.

## Scripts

```bash
# Install package (editable)
pip install -e personal_trainer/

# Run all package tests
PYTHONPATH=personal_trainer/src python3 -m unittest discover -s personal_trainer/tests -v

# Run script integration tests
python3 -m unittest discover -s tests -v

# Build and serve the deploy-style preview locally
./scripts/serve_site.sh

# Build site artifacts from example snapshot
python3 ./scripts/build_site_artifacts.py

# Full live pipeline
python3 ./scripts/daily_snapshot_runner.py --sources-file personal_trainer/examples/snapshot-ready.json

# Test a single wrapper
python3 scripts/wrappers/fetch_garmin.py | python3 -m json.tool > /dev/null
```
