# Personal Trainer Python POC

This package is the first proof-of-concept analysis engine for the Personal Trainer system.

It currently:

- normalizes source payloads into a snapshot matching `docs/data-snapshot-contract.md`
- emits a daily recommendation matching `docs/daily-recommendation-contract.md`

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

## Run Tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Scope

This package does not write to Garmin, Hevy, or Cronometer. It can normalize source payloads into the snapshot boundary, but live MCP reads should stay outside the committed repo and should not commit personal raw data.
