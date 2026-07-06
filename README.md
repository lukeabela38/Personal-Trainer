# Personal Trainer

This repository documents and builds a personal performance system using training, nutrition, strength, recovery, and sport-readiness data.

## What Exists

- [Python recommendation POC](personal_trainer/README.md): normalizes source payloads into the snapshot contract and emits daily recommendations.
- [Static snapshot viewer](site/index.html): local browser UI for inspecting assembled training data.
- [Strength view](site/strength.html): Hevy-backed all-time PBs and estimated 1RMs for common lifts.
- [Speed view](site/speed.html): Garmin running personal records and fastest efforts.

## How It Fits Together

- `personal_trainer/src/personal_trainer/` contains normalization, recommendation, and live-data seam code.
- `site/` contains the static browser UI, including the main snapshot viewer and dedicated `/strength` and `/speed` pages.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.

## Documentation

- [Performance OS charter](docs/performance-os-charter.md)
- [Daily recommendation contract](docs/daily-recommendation-contract.md)
- [Data snapshot contract](docs/data-snapshot-contract.md)
- [MCP integrations](docs/mcp-integrations.md)
- [Handoff guide](docs/handoff-guide.md)
