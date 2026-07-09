# Daily Recommendation Contract

This document defines the first decision contract for the Personal Trainer system. It is derived from the global vision in [`docs/global-vision.md`](./global-vision.md) and the Luke-specific operating policy in [`docs/performance-os-charter.md`](./performance-os-charter.md).

It does not define the final scoring model or UI. It defines the smallest useful feature boundary: given available training, nutrition, recovery, and manual context, produce one daily recommendation that helps Luke make the best overall progress today.

## Decision Question

The first version answers one question:

What should Luke do next to make the best overall progress today?

The answer must respect the Performance OS charter:

- Improve all fronts by default.
- Prioritize explicitly when constraints appear.
- Treat VO2 max 52 as the current waypoint, not the final goal.
- Protect long-term strength, leanness, power, recovery, and table tennis readiness.

## Required Output

Each daily recommendation must produce this shape:

```text
Priority: <primary priority for today>
Session: <specific session type or recovery action>
Nutrition: <nutrition emphasis for today>
Reason: <one data-based reason>
Guardrail: <one thing to avoid today>
Confidence: <high | medium | low>
Needs check-in: <yes | no>
```

The output should be short enough to act on immediately. It should not become a long report unless explicitly requested.

## Priority Options

The first version should choose one primary priority:

- `aerobic_quality`: intervals, threshold, tempo, or another high-value run stimulus.
- `aerobic_base`: easy run, longer easy aerobic work, or low-intensity volume.
- `strength_progression`: productive gym work with progression intent.
- `power_and_athleticism`: explosive work, speed, jumps, throws, or sport-relevant power.
- `table_tennis_readiness`: protect freshness, coordination, shoulder/arm condition, and match quality.
- `recovery`: active recovery, rest, mobility, sleep, or load reduction.
- `nutrition_repair`: correct under-fueling, protein gap, carb gap, or obvious micronutrient issue before pushing load.

## Input Sources

### Garmin

Use Garmin for endurance and recovery context:

- Recent activities and run history.
- VO2 max trend and current waypoint progress.
- Training load trend.
- Training status when available.
- Recovery indicators such as HRV, resting HR, sleep, stress, Body Battery, or training readiness when available.
- Race predictions and activity splits when relevant.

Garmin should drive whether today can support aerobic quality, aerobic base, or recovery.

### Hevy

Use Hevy for strength and muscle-fatigue context:

- Recent workouts.
- Exercise progression.
- Volume by exercise or muscle group when available.
- Recent bests and estimated strength trend.
- Leg, posterior chain, pressing, pulling, and shoulder/arm fatigue risk.

Hevy should drive whether today can support strength progression, power work, or whether gym load would interfere with aerobic quality or table tennis.

### Cronometer

Use Cronometer for fueling and body-composition context:

- Calories consumed versus target.
- Protein consistency.
- Carbohydrate availability around hard training.
- Fat intake if it affects calorie budget or recovery.
- Micronutrient or hydration/sodium gaps when visible.
- Recent logging completeness.

Cronometer should drive whether today supports hard training, needs nutrition repair, or should avoid a large deficit.

### Manual Context

Ask for or use manual context when device data is incomplete or ambiguous:

- Sleep quality if device sleep looks wrong or missing.
- Soreness, especially calves, hamstrings, quads, hips, back, shoulders, elbows, and wrists.
- Motivation and mental fatigue.
- Table tennis schedule or match importance.
- Travel, illness, alcohol, heat exposure, unusual work stress, or time constraints.
- Any pain that changes movement quality.

Manual context should override clean-looking device data when the subjective signal is strong.

## Decision Rules

1. If recovery markers are poor and subjective fatigue is high, choose `recovery` or `nutrition_repair`, not hard training.
2. If the current block is aerobic-emphasis and readiness is acceptable, protect the highest-value run session before adding heavy leg volume.
3. If hard run quality is scheduled or recommended, avoid heavy lower-body gym work afterward unless it is intentionally planned and recovery budget is high.
4. If protein or calories have been poor for one or more days, avoid stacking high stress unless nutrition is corrected.
5. If carbohydrate intake is low before a quality run, recommend fueling before forcing the session.
6. If upper-body or shoulder/arm fatigue is high before table tennis, reduce pressing, pulling, grip, or explosive upper-body work.
7. If all major signals are acceptable but no single priority is urgent, choose the highest-return action for the current block.
8. If data conflicts, state the conflict and lower confidence.
9. If data is missing in a way that changes the decision, ask for a short check-in.

## Confidence Levels

Use `high` when recent data is complete and signals agree.

Use `medium` when data is mostly complete but one relevant area is missing, stale, or mildly conflicting.

Use `low` when key data is missing, stale, or contradictory, or when manual context is needed before choosing a hard session.

## Check-In Trigger

Set `Needs check-in: yes` when any of these are true:

- No reliable sleep or recovery signal is available before a hard recommendation.
- Recent pain or soreness could change the session choice.
- Table tennis schedule is unknown and could conflict with gym or running load.
- Nutrition logs are incomplete and the recommendation depends on fueling status.
- Garmin and subjective patterns appear likely to disagree.
- The recommendation would meaningfully increase injury or fatigue risk.

When a check-in is needed, ask no more than three short questions from the fixed check-in set defined in the snapshot contract.

## Non-Goals For Version One

Version one should not:

- Produce a full weekly plan.
- Invent exact training zones without enough data.
- Overwrite Garmin, Hevy, or Cronometer data.
- Create workouts automatically.
- Optimize only for VO2 max while ignoring strength, leanness, power, or table tennis.
- Treat body weight as the sole body-composition metric.
- Use hidden scores that cannot be explained in plain language.

## Example Outputs

### Aerobic Quality Day

```text
Priority: aerobic_quality
Session: threshold or VO2-focused run, chosen after warm-up readiness
Nutrition: higher-carb day, protect protein
Reason: aerobic block is active and recovery indicators are acceptable
Guardrail: do not add heavy lower-body volume after the run
Confidence: medium
Needs check-in: no
```

### Nutrition Repair Day

```text
Priority: nutrition_repair
Session: easy walk or light mobility only
Nutrition: close the protein and calorie gap before adding stress
Reason: recent intake does not support another hard session
Guardrail: do not turn today into a deficit plus intensity day
Confidence: medium
Needs check-in: yes
```

### Strength Progression Day

```text
Priority: strength_progression
Session: gym session with progression intent, avoid excessive junk volume
Nutrition: normal or slight surplus around training, protein target protected
Reason: endurance stress is manageable and recent gym trend can progress
Guardrail: keep lower-body work compatible with the next quality run
Confidence: high
Needs check-in: no
```

## Review Questions

Before implementation, review these points:

1. Are the priority options complete enough for the first version?
2. Is the required output short enough to use daily?
3. Are the check-in triggers strict enough?
4. Are any tradeoff rules wrong for how Luke actually trains?
