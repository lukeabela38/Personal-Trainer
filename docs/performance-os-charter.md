# Performance OS Charter

This document defines Luke-specific operating principles for the Personal Trainer system. It is intentionally short and reviewable. It is derived from the global vision in [`docs/global-vision.md`](./global-vision.md) and exists to translate that vision into day-to-day recommendation rules.

## Mission

Build the first operating slice of the global vision: a personal performance system that helps Luke become faster, stronger, leaner, more powerful, better fueled, and better prepared for sport.

The system should combine Garmin, Hevy, Cronometer, manual context, and future direct inputs into practical recommendations for training, nutrition, and recovery.

## Athlete Context

- Age: 28
- Height: 188 cm
- Body weight: usually 83-84 kg
- Training profile: gym, running, and table tennis
- Desired outcome: look lean, strong, and powerful while improving real athletic performance

## Operating Principle

The default ambition is progress on all fronts: aerobic fitness, running speed, strength, power, leanness, fueling quality, and sport readiness.

When recovery, calories, time, adaptation capacity, or goal phase conflict, the system must not pretend every goal can be maximized at once. It should explicitly choose the highest-return priority for the current block while protecting the broader athletic profile.

## Current Block

The current block is a hybrid aggressive block.

Primary near-term emphasis:

- Raise aerobic ceiling and move VO2 max to the next waypoint.
- Treat VO2 max 52 as the current waypoint, not the final goal.
- Preserve or improve gym strength and power.
- Lean out gradually without under-fueling key sessions.
- Keep table tennis readiness in view, especially freshness, coordination, and arm/shoulder condition.

The system should be built for rolling waypoints. After VO2 max 52, the next target may be 53 or another performance marker depending on fatigue, training response, strength trend, body composition, and sport schedule.

## Tradeoff Rules

1. Improve everything by default, but prioritize explicitly when constraints appear.
2. Do not chase leanness by under-fueling hard run sessions, heavy gym sessions, or match-heavy table tennis periods.
3. Do not chase VO2 max at the expense of injury risk, chronic fatigue, or collapsing strength trend.
4. Do not chase gym volume if it compromises the highest-value run sessions in an aerobic-emphasis block.
5. Use body weight as context, not as the only body-composition signal.
6. Prefer sustainable weekly structure over heroic individual sessions.
7. If the data is unclear, ask for a short subjective check-in before making a strong recommendation.

## First Version Scope

The first useful version should answer one daily question:

What should Luke do next to make the best overall progress today?

To answer that, version one should consider:

- Recent Garmin endurance load, VO2 max trend, recovery indicators, and run quality.
- Recent Hevy strength work, exercise progression, volume, and muscle-group fatigue.
- Recent Cronometer calories, protein, carbohydrate intake, and obvious nutrition gaps.
- Manual context such as soreness, motivation, table tennis sessions, travel, illness, and sleep quality if device data is incomplete.

## Recommendation Output

Daily recommendations should be concise and actionable:

- Training priority for the day.
- Recommended session type or recovery action.
- Nutrition emphasis for the day.
- One reason based on data.
- One guardrail to avoid the most likely mistake.

Example structure:

```text
Priority: aerobic quality
Session: intervals or threshold, depending on readiness
Nutrition: higher-carb day, protect protein
Reason: VO2 block is active and recovery markers are acceptable
Guardrail: avoid adding heavy leg volume after the run
```

## Review Loop

The system should evolve through small reviewed changes.

Before building broad features, each step should define:

- What decision the feature helps make.
- Which data sources it uses.
- What output it produces.
- What tradeoff it handles.

No major app structure, scoring model, or recommendation engine should be treated as final without review.
