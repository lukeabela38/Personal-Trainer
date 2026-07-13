# Personal Trainer

This repository documents a personal performance system using training, nutrition, strength, recovery, and sport-readiness data.

## What Exists

- [Python recommendation POC](personal_trainer/README.md): normalizes source payloads into the snapshot contract and emits daily recommendations.
- [Static snapshot viewer](site/index.html): local browser UI for inspecting assembled training data.
- [Progress view](site/progress.html): compact change-since-last-snapshot summary.
- [Strength view](site/strength.html): Hevy-backed all-time PBs and estimated 1RMs.
- [Speed view](site/speed.html): Garmin running personal records and fastest efforts, rendered as readable paces and distances.

## How It Fits Together

- `personal_trainer/src/personal_trainer/` contains normalization, recommendation, and live-data seam code.
- `site/` contains the static browser UI, including the main snapshot viewer and dedicated `/strength` and `/speed` pages.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.
- The repo-backed `.env` is encrypted with `git-crypt`; unlock it locally before running live source commands or the daily pipeline.

## Local Run

Prefer Docker for Python 3.12 runs. Use local Python only if Docker is unavailable.

Install pre-commit once so Ruff formatting and lint checks run before commits:

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

If you need live source credentials, unlock the repo-backed `.env` first:

```bash
git-crypt unlock /path/to/git-crypt.key
```

Build the same artifact set used for Pages, then serve it locally:

```bash
./scripts/serve_site.sh
```

Add `--live` if you want the preview to pull from your unlocked `.env` and run the live daily pipeline before serving:

```bash
./scripts/serve_site.sh --live
```

Build the static artifact set from one captured snapshot:

```bash
docker compose run --rm app python3 scripts/build_site_artifacts.py
```

Pull live sources, build snapshot, and emit the site bundle in one pass:

```bash
docker compose run --rm app python3 scripts/daily_snapshot_runner.py
```

This also refreshes the dedicated `strength.json` and `speed.json` history artifacts used by the `/strength` and `/speed` pages.
The live build path now widens the recent source windows so deploys can show a short live 30-day nutrition and workout history without adding a database.
The speed artifact normalizes Garmin personal records into human-readable durations and distances before publishing them.

History snapshots are generated locally when needed and are not committed. To create the archive used by the progress/history UI, run:

```bash
docker compose run --rm app python3 scripts/generate_history.py
```

This writes `dist/history/` and updates `dist/history/index.json` for local browsing.
The entire `dist/` publish tree is generated locally by the build pipeline and is not meant to live in the repository.

Open:

- `http://127.0.0.1:4173/` for the main snapshot viewer
- `http://127.0.0.1:4173/progress.html` for progress comparison
- `http://127.0.0.1:4173/strength.html` for strength
- `http://127.0.0.1:4173/speed.html` for speed
- `http://127.0.0.1:4173/raw.json` for the captured raw snapshot payload

## Documentation

- [Global vision](docs/global-vision.md)
- [App blueprint](docs/app-blueprint.md)
- [Milestone roadmap](docs/milestone-roadmap.md)
- [Working conventions](docs/working-conventions.md)
- [Performance OS charter](docs/performance-os-charter.md)
- [Daily recommendation contract](docs/daily-recommendation-contract.md)
- [Data snapshot contract](docs/data-snapshot-contract.md)
- [MCP integrations](docs/mcp-integrations.md)
- [git-crypt rotation](docs/git-crypt-rotation.md)
- [Handoff guide](docs/handoff-guide.md)
- [Agent onboarding](docs/agent-onboarding.md)
- [Project board execution order](docs/board-execution-order.md)
- [Zero-cost fitness app IaC brief](docs/zero-cost-fitness-app-iac-brief.md)
