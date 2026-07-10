# Personal Trainer Python POC

This package is the first proof-of-concept analysis engine for the Personal Trainer system. Currently it:

- normalizes source payloads into the snapshot defined in `docs/data-snapshot-contract.md`
- emits daily recommendations matching `docs/daily-recommendation-contract.md`
- provides a combined live-data command that runs both steps

## Run Example

```bash
PYTHONPATH=src python3 -m personal_trainer.snapshot_cli examples/sources-ready.json
PYTHONPATH=src python3 -m personal_trainer.cli examples/snapshot-ready.json
```

To chain the two steps:

```bash
PYTHONPATH=src python3 -m personal_trainer.snapshot_cli examples/sources-ready.json > /tmp/snapshot.json
PYTHONPATH=src python3 -m personal_trainer.cli /tmp/snapshot.json
```

## Live Data

```bash
PYTHONPATH=src python3 -m personal_trainer.live_cli
```

This reads source exports from `PERSONAL_TRAINER_SOURCES_FILE` when set, otherwise `personal_trainer/examples/sources-ready.json`, and prints the assembled snapshot plus recommendation as JSON. If you want the command to pull from a live wrapper, unlock the repo-backed `.env` first with `git-crypt`, then set `PERSONAL_TRAINER_SOURCES_COMMAND` to a command that prints a JSON object with `garmin`, `hevy`, `cronometer`, and `manual_context` keys.

## Run Tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Scope

This package does not write to Garmin, Hevy, or Cronometer. It can normalize source payloads into the snapshot boundary, but live MCP reads should stay outside the committed repo and should not commit personal raw data.
