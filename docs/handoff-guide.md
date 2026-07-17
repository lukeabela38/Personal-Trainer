# Handoff Guide

This repository builds a personal performance system for Luke.

## Current Direction

- Normalize training, nutrition, recovery, manual check-in, Garmin, Hevy, and Cronometer data into one snapshot.
- Render the snapshot in the local static viewer.
- Publish read-only static pages to GitHub Pages.
- Keep live source ingestion local and separate from the published artifact.
- Build all published artifacts from one captured snapshot so the data pages stay aligned.
- Keep a dedicated progress page that compares the current snapshot with the previously loaded snapshot.
- Prefer a single daily runner command for live capture, snapshot build, and site artifact generation.
- For parallel agent cards, use the issue-scoped worktree helper (`./scripts/worktree.sh`) so each agent has an isolated checkout.
- Keep the root checkout on `main` as the canonical review and merge tree; do issue work in separate worktrees.
- Treat any work intended for review as a pull request by default.
- Unless explicitly told otherwise, put reviewable work on a feature branch and open a PR.
- Preserve the global vision as the top-level source of truth before deriving new contracts or UI work.

## Where To Start

- [Global vision](./global-vision.md)
- [App blueprint](./app-blueprint.md)
- [Milestone roadmap](./milestone-roadmap.md)
- [Working conventions](./working-conventions.md)
- [Performance OS charter](./performance-os-charter.md)
- [Data snapshot contract](./data-snapshot-contract.md)
- [Live input boundary](./live-input-boundary.md)
- [Daily recommendation contract](./daily-recommendation-contract.md)
- [MCP integrations](./mcp-integrations.md)
- [git-crypt rotation](./git-crypt-rotation.md)
- [Repository README](../README.md)
- [Agent onboarding](./agent-onboarding.md)
- [Project board execution order](./board-execution-order.md)
- [Zero-cost fitness app IaC brief](./zero-cost-fitness-app-iac-brief.md)

## Current Working Shape

- `personal_trainer/src/personal_trainer/` contains the Python seam code that loads live source exports.
- `site/` contains the static browser viewer plus dedicated `/strength` and `/speed` pages.
- `site/progress.html` provides the progress comparison view.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.
- `docker-compose.yml` covers the app, site, and optional tunnel services.
- Run `docker compose --profile tunnel up tunnel` when you want the Cloudflare Tunnel locally; it stays off by default.
- `terraform/` is the root-level OpenTofu scaffold for future Cloudflare resources.
- `.github/workflows/terraform.yml` validates the Terraform/OpenTofu foundation and security scan.
- `scripts/run_tofu.sh` is the supported host-side wrapper for the Dockerized Terraform/OpenTofu workflow.
- `personal_trainer/examples/snapshot-ready.json` is the fallback snapshot input used when live secrets are unavailable.
- `scripts/mcp_client.py` is the reusable async MCP stdio client for calling tools on Garmin, Hevy, and Cronometer MCP servers.
- `scripts/wrappers/` contains per-source wrapper scripts that each call MCP tools and emit source payload JSON to stdout.
- `scripts/build_site_artifacts.py` copies the site shell and emits `dist/data/snapshot.json`, `dist/raw.json`, `dist/strength.json`, and `dist/speed.json` from one snapshot. Treat the entire `dist/` tree as generated build output, not committed source artifacts.
- `scripts/daily_snapshot_runner.py` captures live sources, normalizes the snapshot, and writes the site bundle.
- `scripts/daily_snapshot_runner.py` writes the computed recommendation into `dist/snapshot.json`, and `scripts/build_site_artifacts.py` preserves that recommendation if it is already present so the published snapshot and UI stay aligned.
- The canonical repo config lives in an encrypted `.env` file managed with `git-crypt`.
- GitHub Actions unlocks that file with one repo secret (`GIT_CRYPT_KEY`) before running tests or Pages deploys.
- `./scripts/serve_site.sh` now builds the deploy-style `dist/` bundle before serving it locally; add `--live` to preview the live daily pipeline if your secrets are unlocked.
- `./scripts/reload_site.sh --fast` is the quick UI-iteration path: it kills the old preview and serves the existing `dist/` tree without rerunning live source capture.
- The long-term architecture should evolve toward a ledger plus direct logging, but the current implementation stays snapshot-first.

## Python Live-Source Seam

- `personal_trainer/src/personal_trainer/live_sources.py`
- `personal_trainer/examples/sources-ready.json`
- `PERSONAL_TRAINER_SOURCES_FILE`
- `PERSONAL_TRAINER_SOURCES_COMMAND`
- `personal_trainer.live_cli`
- snapshot/recommendation generation

## MCP Wrapper Scripts

Per-source MCP wrapper scripts that connect to Garmin, Hevy, and Cronometer MCP servers and emit JSON in the expected source payload shape. Set the corresponding env vars to wire them into the daily pipeline:

- `scripts/wrappers/fetch_garmin.py` → `PERSONAL_TRAINER_GARMIN_COMMAND`
- `scripts/wrappers/fetch_hevy.py` → `PERSONAL_TRAINER_HEVY_COMMAND`
- `scripts/wrappers/fetch_cronometer.py` → `PERSONAL_TRAINER_CRONOMETER_COMMAND`
- `scripts/wrappers/fetch_manual.py` → `PERSONAL_TRAINER_MANUAL_COMMAND`
- `scripts/wrappers/fetch_garmin_speed.py` → `PERSONAL_TRAINER_GARMIN_SPEED_COMMAND`
- `scripts/wrappers/fetch_hevy_strength.py` → `PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND` (30-day workout history flattened into exercise rows)

Each wrapper uses `scripts/mcp_client.py` (reusable async MCP stdio client) to start the server, call tools via JSON-RPC, and format the result. Failures per source are logged to stderr with fallback defaults emitted.
