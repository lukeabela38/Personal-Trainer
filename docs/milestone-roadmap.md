# Milestone Roadmap

This roadmap turns the app blueprint into a small sequence of reviewable milestones.

It stays intentionally high level. The goal is to preserve the direct-data-first product shape while leaving implementation details open until each step is ready.

## Milestone 1: Daily Guidance Shell

Goal:

- show the user what matters today at a glance
- keep the home screen compact and readable
- surface the primary goal, today's targets, and the next action first

Output:

- a simple daily guidance view
- compact status labels for calories, macros, and timing
- a small rationale affordance for why the target exists

## Milestone 2: Direct Inputs That Drive Guidance

Goal:

- let the app react to the signals it can capture directly
- keep session timing, food intake, recovery, and weight as first-class inputs
- keep the rules based on simple goal and session context

Output:

- food entry with timestamps
- planned, live, and retroactive session timing
- goal-aware daily target adjustments

## Milestone 3: Trend Views

Goal:

- show whether the user is moving in the right direction over time
- keep the trend language simple
- emphasize weight and strength before anything more speculative

Output:

- weight trend view
- strength trend view
- short progress summaries instead of dense reports

## Milestone 4: Broader Direct Entry

Goal:

- reduce dependence on imported data where the product can safely replace it
- start moving from snapshot-only input toward durable app entry

Output:

- direct food entry flow
- direct workout entry flow
- clearer data history and review paths

## Milestone 5: Durable Storage Expansion

Goal:

- introduce durable storage only where the product needs it
- keep raw inputs auditable and derived guidance separate
- avoid locking the system into premature technical choices

Output:

- one durable history layer at a time
- queryable data for the views that need it
- a path toward a future backend without forcing it too early

## Working Rule

Each milestone should do one of three things:

- improve daily guidance
- improve data durability
- improve reviewability of progress

If a task does not clearly help one of those outcomes, it should wait.
