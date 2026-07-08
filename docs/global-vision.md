# Global Vision

This document is the top-level product vision for Personal Trainer. Everything else in the repo should derive from it: data contracts, architecture, UI, recommendation rules, and future backend work.

## Mission

Build an integrated performance companion that acts as:

- a coach for training decisions
- a nutritionist for fueling decisions
- a ledger for durable personal performance data

The system should help Luke decide what to do next, what to eat next, and how to adjust training and fueling based on goals, recovery, and recent behavior.

## Product Promise

The product should combine imported data and direct user input into one closed loop:

1. Capture what happened.
2. Normalize it into a durable model.
3. Explain what it means.
4. Recommend the next action.
5. Learn from the result and adjust.

The long-term experience should feel like one integrated system, not separate tools for workouts, food, recovery, and logging.

## Core Layers

### 1. Ledger

Store workouts, meals, body metrics, recovery signals, manual check-ins, and source events in a durable, queryable form.

### 2. Decision Engine

Turn the ledger into recommendations for:

- training
- fueling
- recovery
- progression
- risk reduction

The decision engine should be explainable and rule-driven before it becomes more adaptive.

### 3. Companion Surfaces

Expose the system through:

- read-only dashboards
- direct logging flows
- feedback and coaching views
- progress comparison views
- future conversational or agent-assisted interactions

## Design Principles

- One canonical model for the user and their goals.
- Raw source data stays auditable and append-only.
- Imported data and manual input are equally valid inputs.
- Recommendations must be tied to visible evidence.
- Goal context changes the meaning of the same data.
- Training and fueling are coupled, not independent.
- The system should prefer simple rules that can be inspected and revised.
- The first implementation should be useful without requiring a full backend rewrite.

## Derivation Rule

If a future feature does not clearly support one of these outcomes, it should not become a priority yet:

- better performance decisions
- better fueling decisions
- better recovery decisions
- better durability of the data record
- better feedback loops between action and outcome

All other docs should either derive from this vision or describe one implementation slice of it.
