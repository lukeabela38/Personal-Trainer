# Agent Onboarding

This repo is a personal performance system for tracking running, gym, fueling, and recovery.
Agents should optimize for small, independent cards that can be completed without redefining the project.

## What The Project Is

- Track progress across running and gym.
- Translate planned workouts into practical eating guidance.
- Keep deployment zero-cost and static by default.

## Canonical Documents

- [Performance OS charter](./performance-os-charter.md)
- [Data snapshot contract](./data-snapshot-contract.md)
- [Daily recommendation contract](./daily-recommendation-contract.md)
- [Live input boundary](./live-input-boundary.md)
- [Handoff guide](./handoff-guide.md)
- [Zero-cost fitness app IaC brief](./zero-cost-fitness-app-iac-brief.md)

## Current Architecture

- `personal_trainer/src/personal_trainer/` holds the Python seam for live sources and recommendation generation.
- `site/` holds the static browser UI.
- `site/progress.html` compares the current snapshot against the previous snapshot.
- `site/strength.html` shows Hevy PBs and estimated 1RMs.
- `site/speed.html` shows Garmin running PBs.
- `scripts/mcp_client.py` is the reusable MCP stdio client that starts servers and calls tools via JSON-RPC.
- `scripts/wrappers/` contains per-source MCP wrapper scripts (`fetch_garmin.py`, `fetch_hevy.py`, `fetch_cronometer.py`, `fetch_manual.py`, `fetch_garmin_speed.py`, `fetch_hevy_strength.py`) that each emit source payload JSON to stdout.
- `scripts/daily_snapshot_runner.py` is the local end-to-end capture and build entrypoint.
- `.github/workflows/pages.yml` publishes the static site.

## Board Strategy

Use Project 7 as the work queue for multiple agents.

Wave order:

1. `wave-1-contracts`
2. `wave-2-adapters`
3. `wave-3-recommendation`
4. `wave-4-ui`
5. `wave-5-deployment`

## Card Rules

- Keep cards narrow enough that one agent can finish them independently.
- Prefer one issue per behavior, source adapter, or page.
- Add a short acceptance note to each card.
- Any work intended for review must be delivered as a pull request, not a direct commit.
- Unless explicitly told otherwise, create a feature branch and open a PR for reviewable work.
- Do not combine contract changes with UI work unless the card is explicitly about integration.
- Avoid duplicate cards; if scope overlaps, keep the sharper card and archive the broader one.

## Start Here For New Work

1. Read the charter and snapshot contract first.
2. Check the current board wave label.
3. Pick one `Ready` card.
4. Implement the smallest complete slice.
5. Update docs if the contract or handoff behavior changes.

## Local Commands

- `./scripts/serve_site.sh`
- `python3 ./scripts/build_site_artifacts.py`
- `python3 ./scripts/daily_snapshot_runner.py`
- `python3 ./scripts/wrappers/fetch_garmin.py`
- `python3 ./scripts/wrappers/fetch_hevy.py`
- `python3 ./scripts/wrappers/fetch_cronometer.py`
- `python3 ./scripts/wrappers/fetch_manual.py`
- `python3 ./scripts/wrappers/fetch_garmin_speed.py`
- `python3 ./scripts/wrappers/fetch_hevy_strength.py`

## Handoff Notes

- Keep raw data and display data separate.
- Prefer explicit field names over nested blobs in the UI.
- Hide empty values.
- Split fueling guidance by workout day, recovery day, and recommendation output.
