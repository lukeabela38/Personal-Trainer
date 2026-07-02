# Data Snapshot Contract

This document defines the normalized data object used by the first daily recommendation feature.

The snapshot is the boundary between data collection and recommendation logic. Garmin, Hevy, Cronometer, and manual check-in data may each have different formats, but the recommendation engine should receive one predictable object.

## Purpose

The data snapshot should answer:

- What has Luke done recently?
- How recovered does he appear?
- Is he fueled enough for hard work?
- What training stress would conflict with current priorities?
- Is the data complete enough to recommend a hard session?

The snapshot should not decide the recommendation by itself. It should provide the evidence used by the daily recommendation contract.

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
    "time_available_minutes": null,
    "constraints": []
  },
  "derived": {
    "data_quality": "medium",
    "hard_session_allowed": "unknown",
    "primary_constraints": [],
    "likely_conflicts": [],
    "check_in_required": true,
    "check_in_questions": []
  }
}
```

## Freshness Values

Each source should include a `freshness` field:

- `fresh`: data was pulled today or is current enough for the decision.
- `stale`: data exists but may no longer reflect the current state.
- `missing`: no useful data was available.
- `partial`: some useful data exists, but a decision-critical field is missing.

Freshness affects confidence. It should not automatically block a recommendation unless the missing data changes the decision.

## Garmin Fields

### Minimum Useful Garmin Data

The first implementation should try to capture:

- Current VO2 max or latest available VO2 max estimate.
- VO2 max trend direction.
- Recent activities, at least the last 7-14 days.
- Recent runs, including distance, duration, pace, heart rate, and date when available.
- Training load trend when available.
- Training status or readiness when available.
- Sleep, HRV, resting HR, stress, or Body Battery context when available.

### Garmin Flags

Garmin flags should be plain strings, such as:

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

### Minimum Useful Hevy Data

The first implementation should try to capture:

- Last workout date and title.
- Recent workouts, at least the last 7-14 days.
- Exercises performed, sets, reps, weight, RPE if available.
- Recent bests or clear progression markers.
- Muscle-group exposure from recent workouts.
- Whether legs, posterior chain, shoulders, arms, pressing, or pulling may be fatigued.

### Muscle Group Fatigue Values

Use these values:

- `low`
- `moderate`
- `high`
- `unknown`

The first implementation can infer this conservatively from recent workout recency and volume. It should avoid pretending precision that does not exist.

### Hevy Flags

Examples:

- `heavy_legs_recently`
- `posterior_chain_fatigue_risk`
- `upper_body_fatigue_risk`
- `shoulder_arm_fatigue_risk`
- `strength_progression_available`
- `gym_data_sparse`
- `recent_pr`

## Cronometer Fields

### Minimum Useful Cronometer Data

The first implementation should try to capture:

- Today calorie target, calories consumed, and remaining calories.
- Today protein, carbohydrates, fat, and fiber.
- Recent 3-7 day calorie and protein pattern when available.
- Whether the log is complete enough to guide fueling.
- Whether carbohydrate availability supports a quality run.
- Whether protein intake supports recovery and recomposition.

### Nutrition Status Values

Use these values for `fueling_status`, `protein_status`, and `carb_availability`:

- `adequate`
- `low`
- `high`
- `unknown`
- `incomplete_log`

### Cronometer Flags

Examples:

- `under_fueled_today`
- `protein_low_today`
- `carbs_low_for_quality_run`
- `large_deficit_risk`
- `log_incomplete`
- `hydration_or_sodium_gap_possible`
- `nutrition_supports_hard_session`

## Manual Context Fields

Manual context should be short. The system should ask for it only when it changes the decision.

### Minimum Check-In Questions

When needed, ask no more than three questions selected from:

- How did you sleep, subjectively?
- Any pain or unusual soreness today?
- Are you playing table tennis today, and is it important?
- How much time do you realistically have?
- Any illness, travel, alcohol, heat exposure, or unusual stress?
- Do you feel motivated for a hard session?

### Manual Values

Use simple values instead of long text where possible:

- Sleep quality: `poor`, `okay`, `good`, `great`, `unknown`
- Motivation: `low`, `normal`, `high`, `unknown`
- Mental fatigue: `low`, `moderate`, `high`, `unknown`
- Table tennis today: `none`, `light`, `training`, `match`, `unknown`

## Derived Fields

Derived fields summarize conflicts and readiness for the recommendation engine.

### Data Quality

Use:

- `high`: all important sources are fresh and agree.
- `medium`: enough data exists, but one source is partial, stale, or mildly conflicting.
- `low`: important data is missing, stale, or contradictory.

### Hard Session Allowed

Use:

- `yes`: hard training appears reasonable.
- `no`: hard training is not recommended.
- `conditional`: hard training may be possible after a check-in or fueling correction.
- `unknown`: data is insufficient.

### Primary Constraints

Examples:

- `poor_recovery`
- `under_fueled`
- `leg_fatigue`
- `upper_body_fatigue`
- `table_tennis_conflict`
- `time_limited`
- `data_missing`
- `pain_risk`

### Likely Conflicts

Examples:

- `heavy_legs_vs_quality_run`
- `calorie_deficit_vs_hard_training`
- `shoulder_fatigue_vs_table_tennis`
- `low_sleep_vs_intensity`
- `high_run_load_vs_strength_progression`

## Missing Data Rules

1. Missing recovery data should reduce confidence before a hard recommendation.
2. Missing nutrition data should reduce confidence if the recommendation depends on hard training or a deficit.
3. Missing Hevy data should reduce confidence for strength or power recommendations.
4. Missing table tennis schedule should trigger a check-in if upper-body or high-coordination fatigue is relevant.
5. Missing subjective pain/soreness should trigger a check-in before high-impact intervals, heavy lower-body lifting, or shoulder-intensive work.

## Stale Data Rules

Use these default stale thresholds unless implementation evidence suggests better ones:

- Garmin activities: stale after 48 hours if no recent activity data is available.
- Garmin recovery metrics: stale after 24 hours.
- Hevy workouts: stale after 7 days for strength trend, but still useful for historical bests.
- Cronometer today log: partial until the day is complete; still useful for current fueling.
- Manual context: stale after 24 hours.

## Privacy Rules

The snapshot should not store secrets, tokens, raw credential material, or unnecessary personally identifying account metadata.

The snapshot may include personal health and training metrics because that is its purpose, but it should keep only fields needed for recommendation decisions.

## Version One Implementation Boundary

The first implementation should build this snapshot for today and print it or use it directly for one recommendation.

It should not yet:

- Store long-term local history unless explicitly designed.
- Write back to Garmin, Hevy, or Cronometer.
- Create workouts automatically.
- Invent precise scores that cannot be explained.
- Treat missing fields as zero.

## Review Questions

Before implementation, review these points:

1. Are any required fields missing from the snapshot?
2. Are any fields too detailed for version one?
3. Are the freshness thresholds reasonable?
4. Should manual check-in be required every day, or only when data is incomplete or conflicting?
