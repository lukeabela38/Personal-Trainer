# Personal Trainer Python POC

This package is the first proof-of-concept analysis engine for the Personal Trainer system.

It currently accepts a normalized data snapshot JSON file and emits a daily recommendation matching `docs/daily-recommendation-contract.md`.

## Run Example

```bash
PYTHONPATH=src python3 -m personal_trainer.cli examples/snapshot-ready.json
```

## Run Tests

```bash
PYTHONPATH=src python3 -m unittest discover -s tests
```

## Scope

This package does not pull live Garmin, Hevy, or Cronometer data yet. It starts at the normalized snapshot boundary defined in `docs/data-snapshot-contract.md`.
