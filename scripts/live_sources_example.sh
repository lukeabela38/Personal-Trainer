#!/usr/bin/env bash
set -euo pipefail

cat <<'JSON'
{
  "snapshot_date": "2026-07-02",
  "timezone": "Europe/Malta",
  "garmin": {
    "freshness": "fresh",
    "current_vo2max": 51,
    "vo2max_trend": "unknown",
    "training_status": null,
    "training_load_trend": null,
    "readiness": {},
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
      "legs": "low",
      "posterior_chain": "unknown",
      "push": "unknown",
      "pull": "unknown",
      "shoulders_arms": "low",
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
      "log_completeness": "complete"
    },
    "recent_days": [],
    "fueling_status": "adequate",
    "protein_status": "adequate",
    "carb_availability": "adequate",
    "flags": []
  },
  "manual_context": {
    "freshness": "fresh",
    "sleep_quality": "good",
    "soreness": [],
    "pain": [],
    "motivation": "normal",
    "mental_fatigue": "low",
    "table_tennis_today": "none"
  }
}
JSON
