# Handoff Guide

This repository builds a personal performance system for Luke.

## Current Direction

- Normalize training, nutrition, recovery, manual check-in, Garmin, and Hevy data into one snapshot.
- Render the snapshot in the local static viewer.
- Publish read-only static pages to GitHub Pages.
- Keep live source ingestion local and separate from the published artifact.
- Build all published artifacts from one captured snapshot so the data pages stay aligned.
- Keep a dedicated progress page that compares the current snapshot with the previously loaded snapshot.
- Prefer a single daily runner command for live capture, snapshot build, and site artifact generation.
- Treat any work intended for review as a pull request by default.
- Unless explicitly told otherwise, put reviewable work on a feature branch and open a PR.

## Where To Start

- [Performance OS charter](./performance-os-charter.md)
- [Data snapshot contract](./data-snapshot-contract.md)
- [Live input boundary](./live-input-boundary.md)
- [Daily recommendation contract](./daily-recommendation-contract.md)
- [MCP integrations](./mcp-integrations.md)
- [Repository README](../README.md)
- [Agent onboarding](./agent-onboarding.md)
- [Project board execution order](./board-execution-order.md)
- [Zero-cost fitness app IaC brief](./zero-cost-fitness-app-iac-brief.md)

## Current Working Shape

- `personal_trainer/src/personal_trainer/` contains the Python seam code that loads live source exports.
- `site/` contains the static browser viewer plus dedicated `/strength` and `/speed` pages.
- `site/progress.html` provides the progress comparison view.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.
- `personal_trainer/examples/snapshot-ready.json` is the deployed snapshot input.
- `scripts/build_site_artifacts.py` copies the site shell and emits `dist/data/snapshot.json`, `dist/raw.json`, `dist/strength.json`, and `dist/speed.json` from one snapshot.
- `scripts/daily_snapshot_runner.py` captures live sources, normalizes the snapshot, and writes the site bundle.

## Python Live-Source Seam

- `personal_trainer/src/personal_trainer/live_sources.py`
- `personal_trainer/examples/sources-ready.json`
- `PERSONAL_TRAINER_SOURCES_FILE`
- `PERSONAL_TRAINER_SOURCES_COMMAND`
- `personal_trainer.live_cli`
- snapshot/recommendation generation
