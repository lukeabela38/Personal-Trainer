# Data Snapshot Contract

This document defines the normalized data object used by the daily recommendation feature and the derived UI pages. It is an implementation contract derived from the global vision in [`docs/global-vision.md`](./global-vision.md).

The snapshot is the boundary between data collection and recommendation logic. Garmin, Hevy, Cronometer, and manual check-in data may each have different shapes, but the recommendation engine should receive one predictable object.

## Purpose

The data snapshot should answer:

- What has Luke done recently?
- How recovered does he appear?
- Is he fueled enough for hard work?
- What training stress would conflict with current priorities?
- Is the data complete enough to recommend a hard session?

The snapshot should not decide the recommendation by itself. It should provide the evidence used by the daily recommendation contract and the derived views.
When the daily runner publishes `dist/snapshot.json`, it includes the computed recommendation alongside the normalized snapshot so the stored artifact remains paired with the exact decision made for that run.

## Snapshot Shape

```json
{
  "snapshot_date": "2026-07-02",
  "timezone": "Europe/Malta",
  "athlete": {
    "age": 28,
    "height_cm": 188,
    "body_weight_kg": 83.5,
    "current_block": "hybrid_aggressive",
    "current_vo2max_waypoint": 52
  },
  "garmin": {
    "freshness": "fresh",
    "current_vo2max": 51,
    "vo2max_trend": "flat_or_rising",
    "training_status": "available_or_null",
    "training_load_trend": "available_or_null",
    "readiness": {
      "training_readiness": null,
      "hrv_status": null,
      "resting_hr_status": null,
      "sleep_status": null,
      "stress_status": null,
      "body_battery_status": null
    },
    "recent_activities": [],
    "recent_runs": [],
    "last_quality_run": null,
    "last_long_run": null,
    "recent_bests": [],
    "flags": []
  },
  "hevy": {
    "freshness": "fresh",
    "recent_workouts": [],
    "last_workout": null,
    "muscle_group_fatigue": {
      "legs": "unknown",
      "posterior_chain": "unknown",
      "push": "unknown",
      "pull": "unknown",
      "shoulders_arms": "unknown",
      "core": "unknown"
    },
    "strength_trend": "unknown",
    "recent_bests": [],
    "flags": []
  },
  "cronometer": {
    "freshness": "fresh",
    "today": {
      "calories_consumed": null,
      "calories_target": null,
      "protein_g": null,
      "carbs_g": null,
      "fat_g": null,
      "fiber_g": null,
      "remaining_kcal": null,
      "log_completeness": "unknown"
    },
    "recent_days": [],
    "fueling_status": "unknown",
    "protein_status": "unknown",
    "carb_availability": "unknown",
    "flags": []
  },
  "manual_context": {
    "freshness": "missing",
    "sleep_quality": null,
    "soreness": [],
    "pain": [],
    "motivation": null,
    "mental_fatigue": null,
    "table_tennis_today": null,
    "constraints": []
  }
}
```

## Athlete Fields

The normalized `athlete` object should always include:

- `age` as an integer
- `height_cm` as an integer
- `body_weight_kg` as a number
- `current_block` as one of `hybrid_aggressive`, `hybrid_balanced`, `run_focus`, `strength_focus`, or `recovery`
- `current_vo2max_waypoint` as an integer

## Freshness Values

Each source should include a `freshness` field:

- `fresh`: data pulled today and current enough for decision-making
- `stale`: data exists but may no longer reflect current state
- `missing`: no useful data available
- `partial`: some useful data exists, but decision-critical fields are missing

Freshness affects confidence. It should not automatically block recommendation output unless missing data changes the decision.

## Garmin Fields

Minimum useful Garmin data to capture:

- current VO2 max
- VO2 max trend direction
- recent activities, at least the last 7-14 days
- recent runs, including distance, duration, pace, heart rate, and date when available
- training load trend
- training status readiness
- sleep, HRV, resting HR, stress, or Body Battery context
- recent bests for speed-oriented pages

### Garmin Flags

Example Garmin flags:

- `vo2_waypoint_close`
- `recent_quality_run`
- `long_run_missing`
- `load_rising_fast`
- `load_low`
- `recovery_poor`
- `sleep_missing`
- `hrv_missing`
- `run_data_sparse`

Flags are evidence, not final decisions.

## Hevy Fields

Minimum useful Hevy data to capture:

- last workout date and title
- recent workouts, at least the last 7-14 days
- exercises performed, sets, reps, weight, and RPE if available
- recent bests that show progression markers
- muscle-group exposure from recent workouts
- whether legs, posterior chain, shoulders, arms, pressing, or pulling may be fatigued

### Muscle Group Fatigue Values

Use these values:

- `low`
- `moderate`
- `high`
- `unknown`

The first implementation should infer conservatively from recency and volume. It should avoid pretending precision does not exist.

### Hevy Flags

Example Hevy flags:

- `heavy_legs_recently`
- `posterior_chain_fatigue_risk`
- `upper_body_fatigue_risk`
- `shoulder_arm_fatigue_risk`
- `strength_progression_available`
- `gym_data_sparse`
- `recent_pr`

## Cronometer Fields

Minimum useful Cronometer data to capture:

- calorie balance
- protein intake
- carbohydrate availability
- recent day summaries
- log completeness

### Nutrition Status Values

Use these values for `fueling_status`, `protein_status`, and `carb_availability`:

- `adequate`
- `low`
- `high`
- `unknown`
- `incomplete_log`

### Cronometer Flags

Example Cronometer flags:

- `under_fueled_today`
- `protein_low_today`
- `carbs_low_for_quality_run`
- `large_deficit_risk`
- `log_incomplete`
- `hydration_or_sodium_gap_possible`
- `nutrition_supports_hard_session`

## Manual Context Fields

Manual context should stay short. The system should ask only what changes the decision.

### Minimum Check-In Questions

When needed, ask no more than three questions, chosen from:

- How recovered do you feel today?
- Any pain or unusual soreness today?
- Have you logged most of today's food yet?

Use fixed answer sets for those questions:

- Recovery: `good`, `okay`, `poor`
- Pain or soreness: `no`, `yes`
- Fueling log: `yes`, `partly`, `no`

### Manual Values

Use simple values instead of long text where possible:

- Sleep quality: `poor`, `okay`, `good`, `great`, `unknown`
- Motivation: `low`, `normal`, `high`, `unknown`
- Mental fatigue: `low`, `moderate`, `high`, `unknown`
- Table tennis today: `none`, `light`, `training`, `match`, `unknown`

## Derived Fields

Derived fields summarize conflicts and readiness for the recommendation engine.

### Data Quality

Use these values:

- `high`: all important sources are fresh and agree
- `medium`: enough data exists, but one source is partial, stale, or mildly conflicting
- `low`: important data is missing, stale, or contradictory

### Check-In Questions

The derived snapshot should carry at most three structured check-in questions when the decision needs more information. Each question should include:

- an `id`
- a short `prompt`
- a fixed list of answer `options`

The first version should keep the set deterministic and rules-based rather than conversational.

### Hard Session Allowed

Use these values:

- `yes`: hard training appears reasonable
- `no`: hard training should be avoided today
- `unknown`: there is not enough data to decide

### Garmin Recent Bests

The Garmin snapshot may expose `recent_bests` for running and related endurance bests. The dedicated `/speed` page should use the Garmin personal-record shape and prefer these records when the live Garmin source provides them.

## Validation Boundary

The snapshot should be validated before it reaches recommendation or static-site rendering:

- `personal_trainer.cli` validates the snapshot before building a recommendation
- `scripts/build_site_artifacts.py` validates the snapshot before writing `dist/`
- `build_snapshot()` should be the normal path for constructing a compliant snapshot from source payloads

## Validation Questions

At the end of snapshot build, ask:

- Are any required fields missing from the snapshot?
- Are Garmin, Hevy, or Cronometer values stale or contradictory?
- Is the recommendation boundary still cleanly separated from source collection?
