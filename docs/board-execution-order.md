# Project Board Execution Order

Project 7 is intended to be a multi-agent queue. Use the wave labels to keep work ordered while still allowing parallel execution inside a wave.

## Wave 1

- `Finalize snapshot validation and completeness rules`

## Wave 2

- `Normalize Garmin live adapter`
- `Normalize Hevy live adapter`
- `Normalize Cronometer live adapter`

## Wave 3

- `Add workout-day fueling guidance`
- `Add recovery-day fueling guidance`
- `Add training-vs-fueling recommendation output`

## Wave 4

- `Progress page: compare current snapshot to previous snapshot`
- `Strength page: Hevy PBs and estimated 1RM`
- `Speed page: Garmin running PBs`
- `Snapshot viewer: keep compact and readable`

## Wave 5

- `Deployment: zero-cost static site and GitHub Pages hardening`

## Notes

- Wave 1 must land before any downstream agent depends on the snapshot shape.
- Wave 2 can be parallelized because each adapter has a separate source boundary.
- Wave 3 depends on the snapshot shape being stable.
- Wave 4 depends on the data shape and recommendation semantics being mostly settled.
- Wave 5 should stay last unless deployment work blocks verification.
