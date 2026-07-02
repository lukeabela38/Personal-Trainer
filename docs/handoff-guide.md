# Handoff Guide

This repository builds a personal performance system for Luke. The current direction is:

- normalize training, nutrition, recovery, and manual check-in data into one snapshot
- render that snapshot in a local static viewer
- publish a read-only snapshot view to GitHub Pages
- keep live source ingestion local and separate from the published artifact

## Where To Start

- [Performance OS charter](./performance-os-charter.md)
- [Data snapshot contract](./data-snapshot-contract.md)
- [Daily recommendation contract](./daily-recommendation-contract.md)
- [MCP integrations](./mcp-integrations.md)
- [Repository README](../README.md)

## Current Working Shape

- `personal_trainer/src/personal_trainer/` contains the Python seam code for loading live source exports.
- `site/` contains the static browser viewer.
- `.github/workflows/pages.yml` publishes the viewer and snapshot artifact to GitHub Pages.
- `personal_trainer/examples/snapshot-ready.json` is the deployed snapshot input.

## Snapshot Viewer

The viewer supports:

- importing a local JSON snapshot file
- loading the deployed snapshot from `./data/snapshot.json`
- showing the assembled sections plus raw JSON

If the viewer changes, verify that:

- the athlete summary still wraps inside the main card on narrow widths
- the deployed snapshot path remains `./data/snapshot.json`
- the page still works as a static GitHub Pages artifact

## Python Live-Source Seam

`personal_trainer/src/personal_trainer/live_sources.py` loads normalized source payloads from a local export file.

- default export path: `personal_trainer/examples/sources-ready.json`
- override env var: `PERSONAL_TRAINER_SOURCES_FILE`

The current tests only verify export-file loading. If you expand this seam, keep the contract small and predictable.

## Important Constraints

- Do not add live credentials or secrets to the snapshot.
- Keep published Pages read-only.
- Prefer small, reviewable PRs.
- Avoid growing the snapshot shape without updating the contract docs.
- Keep cache and virtualenv noise out of the repo status.

## Likely Next Step

The next useful increment is to bring live data into the local snapshot flow while keeping the GitHub Pages artifact point-in-time and deterministic. A good boundary is:

1. assemble a local snapshot from source exports
2. render that snapshot in the static viewer
3. optionally publish a workflow-generated snapshot for Pages

That keeps local experimentation and deployed output aligned without mixing responsibilities.
