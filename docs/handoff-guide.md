# Handoff Guide

This repository builds a personal performance system for Luke.

Current direction:

- normalize training, nutrition, recovery, manual check-in, Garmin, and Hevy data into one snapshot
- render the snapshot in a local static viewer
- publish read-only static pages to GitHub Pages
- keep live source ingestion local and separate from the published artifact

## Where To Start

- [Performance OS charter](./performance-os-charter.md)
- [Data snapshot contract](./data-snapshot-contract.md)
- [Live input boundary](./live-input-boundary.md)
- [Daily recommendation contract](./daily-recommendation-contract.md)
- [MCP integrations](./mcp-integrations.md)
- [Repository README](../README.md)

## Current Working Shape

- `personal_trainer/src/personal_trainer/` contains Python seam code that loads live source exports.
- `site/` contains the static browser viewer plus dedicated `/strength` and `/speed` pages.
- `.github/workflows/pages.yml` publishes the static site to GitHub Pages.
- `personal_trainer/examples/snapshot-ready.json` is the deployed snapshot input.

## Snapshot Viewer

The main viewer supports:

- importing a local JSON snapshot file
- loading the deployed snapshot from `./data/snapshot.json`
- showing assembled sections plus a separate raw JSON view

If the viewer changes, verify that:

- the athlete summary still wraps inside the main card on narrow widths
- the deployed snapshot path remains `./data/snapshot.json`
- the page still works as a static GitHub Pages artifact

## Strength And Speed Views

The dedicated pages are:

- `/strength` for Hevy-backed all-time PBs and estimated 1RMs
- `/speed` for Garmin running personal records

Both are rendered as horizontally scrolling, center-focused carousels with an emphasized active card.

## Python Live-Source Seam

`personal_trainer/src/personal_trainer/live_sources.py` loads normalized source payloads from either a local export file or a live wrapper command.

- default export path: `personal_trainer/examples/sources-ready.json`
- override env var: `PERSONAL_TRAINER_SOURCES_FILE`
- live wrapper env var: `PERSONAL_TRAINER_SOURCES_COMMAND`
- combined live command: `personal_trainer.live_cli`

Keep the separation between:

1. source exports
2. snapshot/recommendation generation
3. published static pages

That keeps local experimentation and deployed output aligned without mixing responsibilities.
