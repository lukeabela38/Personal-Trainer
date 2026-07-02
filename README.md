# Personal Trainer

This repository documents and builds a personal performance system using training, nutrition, strength, recovery, and sport-readiness data.

## What Exists

- [Python recommendation POC](personal_trainer/README.md): dependency-light analysis engine that accepts normalized snapshot JSON and emits the daily recommendation contract output.
- [Static snapshot viewer](site/index.html): local browser UI for importing snapshot JSON and inspecting the assembled data.

## How It Fits Together

- `personal_trainer/src/personal_trainer/` contains normalization, recommendation, and live-data seam code.
- `site/` contains the static browser UI.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.

## Documentation

- [Performance OS charter](docs/performance-os-charter.md): operating principles, current training block, tradeoff rules, and first-build scope.
- [Daily recommendation contract](docs/daily-recommendation-contract.md): input/output boundary for the first recommendation feature.
- [Data snapshot contract](docs/data-snapshot-contract.md): normalized Garmin, Hevy, Cronometer, and manual-context object used before recommendation logic runs.
- [MCP integrations](docs/mcp-integrations.md): Garmin, Cronometer, Hevy, and GitHub setup details, credential handling, and verification notes.
- [Handoff guide](docs/handoff-guide.md): continuation notes for the next agent.
