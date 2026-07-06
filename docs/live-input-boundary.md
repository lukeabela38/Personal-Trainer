# Live Input Boundary

The live wrapper command may emit either:

- a raw source object
- a wrapper object with `snapshot` and `recommendation`

## Raw Source Object

When the command emits raw sources, the top-level object should include:

- `snapshot_date` optional, ISO date string
- `timezone` optional, IANA timezone string
- `garmin` if Garmin data is available
- `hevy` if Hevy data is available
- `cronometer` if Cronometer data is available
- `manual_context` required, even if sparse

## Wrapper Object

When the command emits a wrapper object, the UI and CLI should prefer `snapshot` when present and fall back to the wrapper object itself when only raw sources are available. The wrapper should include `recommendation` so the viewer can show the final output without recomputing it.

## Derived Views

The site also renders derived pages from the same snapshot boundary:

- `/strength` from Hevy history and bests
- `/speed` from Garmin personal records and recent bests

Those pages should be generated from the same source payloads rather than from ad hoc browser-only state.

## Constraints

- Do not put secret tokens in payloads.
- Do not require the viewer to understand provider auth.
- Keep wrapper output valid JSON and stable enough for tests.
