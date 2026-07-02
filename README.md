# Personal Trainer

This repository documents and builds the personal performance system used to combine training, nutrition, strength, recovery, and sport-readiness data.

## Implementation

- [Python recommendation POC](personal_trainer/README.md): dependency-light analysis engine that accepts a normalized snapshot JSON and emits the daily recommendation contract output.

## Documentation

- [Performance OS charter](docs/performance-os-charter.md): operating principles, current training block, tradeoff rules, and first build scope.
- [Daily recommendation contract](docs/daily-recommendation-contract.md): input/output boundary for the first recommendation feature.
- [Data snapshot contract](docs/data-snapshot-contract.md): normalized Garmin, Hevy, Cronometer, and manual context object used before recommendation logic runs.
- [MCP integrations](docs/mcp-integrations.md): Garmin, Cronometer, Hevy, and GitHub setup details, credential handling, and verification notes.
