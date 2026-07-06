# Personal Trainer

This repository documents a personal performance system using training, nutrition, strength, recovery, and sport-readiness data.

## What Exists

- [Python recommendation POC](personal_trainer/README.md): normalizes source payloads into the snapshot contract and emits daily recommendations.
- [Static snapshot viewer](site/index.html): local browser UI for inspecting assembled training data.
- [Progress view](site/progress.html): compact change-since-last-snapshot summary.
- [Strength view](site/strength.html): Hevy-backed all-time PBs and estimated 1RMs.
- [Speed view](site/speed.html): Garmin running personal records and fastest efforts.

## How Fits Together

- `personal_trainer/src/personal_trainer/` contains normalization, recommendation, and live-data seam code.
- `site/` contains static browser UI, including the main snapshot viewer and dedicated `/strength` and `/speed` pages.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.

## Local Run

Run the local static server:

```bash
./scripts/serve_site.sh
```

Build the static artifact set from one captured snapshot:

```bash
python3 ./scripts/build_site_artifacts.py
```

Pull live sources, build the snapshot, and emit the site bundle in one pass:

```bash
python3 ./scripts/daily_snapshot_runner.py
```

Open:

- `http://127.0.0.1:4173/` for the main snapshot viewer
- `http://127.0.0.1:4173/progress.html` for progress comparison
- `http://127.0.0.1:4173/strength.html` for strength
- `http://127.0.0.1:4173/speed.html` for speed
- `http://127.0.0.1:4173/raw.json` for the captured raw snapshot payload

## Documentation

- [Performance OS charter](docs/performance-os-charter.md)
- [Daily recommendation contract](docs/daily-recommendation-contract.md)
- [Data snapshot contract](docs/data-snapshot-contract.md)
- [MCP integrations](docs/mcp-integrations.md)
- [Handoff guide](docs/handoff-guide.md)
- [Zero-cost fitness app IaC brief](docs/zero-cost-fitness-app-iac-brief.md)
