from __future__ import annotations

from datetime import date
from typing import Any


Snapshot = dict[str, Any]
SourcePayload = dict[str, Any]


DEFAULT_ATHLETE = {
    "age": 28,
    "height_cm": 188,
    "body_weight_kg": 83.5,
    "current_block": "hybrid_aggressive",
    "current_vo2max_waypoint": 52,
}


def build_snapshot(
    sources: dict[str, SourcePayload],
    *,
    snapshot_date: str | None = None,
    timezone: str = "Europe/Malta",
    athlete: dict[str, Any] | None = None,
) -> Snapshot:
    """Normalize source payloads into the data snapshot contract."""
    normalized_athlete = DEFAULT_ATHLETE | (athlete or sources.get("athlete", {}))
    garmin = _normalize_garmin(sources.get("garmin", {}))
    hevy = _normalize_hevy(sources.get("hevy", {}))
    cronometer = _normalize_cronometer(sources.get("cronometer", {}))
    manual = _normalize_manual_context(sources.get("manual_context", {}))
    derived = _derive_context(garmin, hevy, cronometer, manual)
    snapshot = {
        "snapshot_date": snapshot_date or sources.get("snapshot_date") or date.today().isoformat(),
        "timezone": sources.get("timezone", timezone),
        "athlete": normalized_athlete,
        "garmin": garmin,
        "hevy": hevy,
        "cronometer": cronometer,
        "manual_context": manual,
        "derived": derived,
    }
    return _validate_snapshot(snapshot)


def _normalize_garmin(raw: SourcePayload) -> SourcePayload:
    return {
        "freshness": raw.get("freshness", "missing"),
        "current_vo2max": raw.get("current_vo2max"),
        "vo2max_trend": raw.get("vo2max_trend", "unknown"),
        "training_status": raw.get("training_status"),
        "training_load_trend": raw.get("training_load_trend"),
        "readiness": raw.get("readiness", {}),
        "recent_activities": _list(raw.get("recent_activities")),
        "recent_runs": _list(raw.get("recent_runs")),
        "last_quality_run": raw.get("last_quality_run"),
        "last_long_run": raw.get("last_long_run"),
        "recent_bests": _list(raw.get("recent_bests")),
        "flags": _unique_strings(raw.get("flags")),
    }


def _normalize_hevy(raw: SourcePayload) -> SourcePayload:
    muscle_group_fatigue = {
        "legs": "unknown",
        "posterior_chain": "unknown",
        "push": "unknown",
        "pull": "unknown",
        "shoulders_arms": "unknown",
        "core": "unknown",
    } | raw.get("muscle_group_fatigue", {})

    flags = set(_unique_strings(raw.get("flags")))
    if muscle_group_fatigue.get("legs") == "high":
        flags.add("heavy_legs_recently")
    if muscle_group_fatigue.get("posterior_chain") == "high":
        flags.add("posterior_chain_fatigue_risk")
    if muscle_group_fatigue.get("shoulders_arms") == "high":
        flags.add("shoulder_arm_fatigue_risk")

    return {
        "freshness": raw.get("freshness", "missing"),
        "recent_workouts": _list(raw.get("recent_workouts")),
        "last_workout": raw.get("last_workout"),
        "muscle_group_fatigue": muscle_group_fatigue,
        "strength_trend": raw.get("strength_trend", "unknown"),
        "recent_bests": _list(raw.get("recent_bests")),
        "flags": sorted(flags),
    }


def _normalize_cronometer(raw: SourcePayload) -> SourcePayload:
    today = {
        "calories_consumed": None,
        "calories_target": None,
        "protein_g": None,
        "carbs_g": None,
        "fat_g": None,
        "fiber_g": None,
        "remaining_kcal": None,
        "log_completeness": "unknown",
    } | raw.get("today", {})

    flags = set(_unique_strings(raw.get("flags")))
    if raw.get("fueling_status") == "low":
        flags.add("under_fueled_today")
    if raw.get("protein_status") == "low":
        flags.add("protein_low_today")
    if raw.get("carb_availability") == "low":
        flags.add("carbs_low_for_quality_run")
    if today.get("log_completeness") in {"unknown", "incomplete"}:
        flags.add("log_incomplete")

    return {
        "freshness": raw.get("freshness", "missing"),
        "today": today,
        "recent_days": _list(raw.get("recent_days")),
        "fueling_status": raw.get("fueling_status", "unknown"),
        "protein_status": raw.get("protein_status", "unknown"),
        "carb_availability": raw.get("carb_availability", "unknown"),
        "flags": sorted(flags),
    }


def _normalize_manual_context(raw: SourcePayload) -> SourcePayload:
    return {
        "freshness": raw.get("freshness", "missing"),
        "sleep_quality": raw.get("sleep_quality", "unknown"),
        "soreness": _list(raw.get("soreness")),
        "pain": _list(raw.get("pain")),
        "motivation": raw.get("motivation", "unknown"),
        "mental_fatigue": raw.get("mental_fatigue", "unknown"),
        "table_tennis_today": raw.get("table_tennis_today", "unknown"),
        "time_available_minutes": raw.get("time_available_minutes"),
        "constraints": _unique_strings(raw.get("constraints")),
    }


def _derive_context(
    garmin: SourcePayload,
    hevy: SourcePayload,
    cronometer: SourcePayload,
    manual: SourcePayload,
) -> SourcePayload:
    constraints: set[str] = set()
    conflicts: set[str] = set()
    questions: list[str] = []

    garmin_flags = set(_list(garmin.get("flags")))
    hevy_flags = set(_list(hevy.get("flags")))
    cronometer_flags = set(_list(cronometer.get("flags")))

    if "recovery_poor" in garmin_flags or manual.get("sleep_quality") == "poor":
        constraints.add("poor_recovery")
        conflicts.add("low_sleep_vs_intensity")

    if manual.get("mental_fatigue") == "high" or manual.get("motivation") == "low":
        constraints.add("poor_recovery")

    if manual.get("pain"):
        constraints.add("pain_risk")
        questions.append("Does the pain change your movement quality today?")

    if _has_any(cronometer_flags, {"under_fueled_today", "protein_low_today", "carbs_low_for_quality_run"}):
        constraints.add("under_fueled")
        conflicts.add("calorie_deficit_vs_hard_training")

    if _has_any(hevy_flags, {"heavy_legs_recently", "posterior_chain_fatigue_risk"}):
        constraints.add("leg_fatigue")
        conflicts.add("heavy_legs_vs_quality_run")

    if _has_any(hevy_flags, {"shoulder_arm_fatigue_risk", "upper_body_fatigue_risk"}) and manual.get(
        "table_tennis_today"
    ) in {"training", "match", "unknown"}:
        constraints.add("table_tennis_conflict")
        conflicts.add("shoulder_fatigue_vs_table_tennis")

    if manual.get("freshness") in {"missing", "stale"}:
        questions.append("Any pain or unusual soreness today?")
        questions.append("Are you playing table tennis today, and is it important?")

    if garmin.get("freshness") in {"missing", "stale", "partial"}:
        questions.append("How did you sleep, subjectively?")

    if cronometer.get("freshness") in {"missing", "stale", "partial"} or "log_incomplete" in cronometer_flags:
        questions.append("Are your nutrition logs complete enough to judge fueling today?")

    data_quality = _data_quality(garmin, hevy, cronometer, manual)
    if data_quality == "low":
        constraints.add("data_missing")

    check_in_required = bool(questions or constraints & {"pain_risk", "data_missing"})
    hard_session_allowed = _hard_session_allowed(constraints, check_in_required)

    return {
        "data_quality": data_quality,
        "hard_session_allowed": hard_session_allowed,
        "primary_constraints": sorted(constraints),
        "likely_conflicts": sorted(conflicts),
        "check_in_required": check_in_required,
        "check_in_questions": _dedupe(questions)[:3],
    }


def _data_quality(*sources: SourcePayload) -> str:
    freshness = [source.get("freshness") for source in sources]
    if all(value == "fresh" for value in freshness):
        return "high"
    if any(value == "missing" for value in freshness[:3]):
        return "low"
    return "medium"


def _hard_session_allowed(constraints: set[str], check_in_required: bool) -> str:
    if constraints & {"poor_recovery", "pain_risk", "under_fueled"}:
        return "no"
    if check_in_required or constraints:
        return "conditional"
    return "yes"


def _unique_strings(value: Any) -> list[str]:
    return _dedupe(_list(value))


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _has_any(values: set[str], targets: set[str]) -> bool:
    return bool(values & targets)


def _dedupe(values: list[Any]) -> list[Any]:
    deduped = []
    seen = set()
    for value in values:
        if not isinstance(value, str) or value in seen:
            continue
        deduped.append(value)
        seen.add(value)
    return deduped


_VALID_FRESHNESS = frozenset({"fresh", "stale", "missing", "partial"})
_VALID_DATA_QUALITY = frozenset({"high", "medium", "low"})
_VALID_HARD_SESSION = frozenset({"yes", "no", "conditional", "unknown"})
_VALID_MUSCLE_FATIGUE = frozenset({"low", "moderate", "high", "unknown"})
_VALID_NUTRITION_STATUS = frozenset({"adequate", "low", "high", "unknown", "incomplete_log"})
_VALID_SLEEP_QUALITY = frozenset({"poor", "okay", "good", "great", "unknown"})
_VALID_MOTIVATION = frozenset({"low", "normal", "high", "unknown"})
_VALID_MENTAL_FATIGUE = frozenset({"low", "moderate", "high", "unknown"})
_VALID_TABLE_TENNIS = frozenset({"none", "light", "training", "match", "unknown"})
_VALID_SORENESS = frozenset({
    "calves", "hamstrings", "quads", "hips", "back", "shoulders", "elbows", "wrists",
})
_VALID_FRESHNESS_SOURCES = frozenset({"garmin", "hevy", "cronometer", "manual_context"})


def _validate_snapshot(snapshot: Snapshot) -> Snapshot:
    required_top_level = ("snapshot_date", "timezone", "athlete", "garmin", "hevy", "cronometer", "manual_context", "derived")
    missing = [key for key in required_top_level if key not in snapshot]
    if missing:
        raise ValueError(f"snapshot missing required fields: {', '.join(missing)}")

    for section in ("athlete", "garmin", "hevy", "cronometer", "manual_context", "derived"):
        if not isinstance(snapshot.get(section), dict):
            raise ValueError(f"snapshot section '{section}' must be a JSON object")

    if not isinstance(snapshot.get("snapshot_date"), str):
        raise ValueError("snapshot_date must be a string")
    if not isinstance(snapshot.get("timezone"), str):
        raise ValueError("timezone must be a string")

    derived = snapshot["derived"]
    required_derived = ("data_quality", "hard_session_allowed", "primary_constraints", "likely_conflicts", "check_in_required", "check_in_questions")
    missing_derived = [key for key in required_derived if key not in derived]
    if missing_derived:
        raise ValueError(f"derived snapshot missing required fields: {', '.join(missing_derived)}")

    _check_in(derived["data_quality"], _VALID_DATA_QUALITY, "derived.data_quality")
    _check_in(derived["hard_session_allowed"], _VALID_HARD_SESSION, "derived.hard_session_allowed")
    if not isinstance(derived.get("check_in_required"), bool):
        raise ValueError("derived.check_in_required must be a bool")
    if not isinstance(derived.get("primary_constraints"), list):
        raise ValueError("derived.primary_constraints must be a list")
    if not isinstance(derived.get("likely_conflicts"), list):
        raise ValueError("derived.likely_conflicts must be a list")
    if not isinstance(derived.get("check_in_questions"), list):
        raise ValueError("derived.check_in_questions must be a list")

    for source in _VALID_FRESHNESS_SOURCES:
        freshness = snapshot.get(source, {}).get("freshness")
        if freshness is not None:
            _check_in(freshness, _VALID_FRESHNESS, f"{source}.freshness")

    garmin = snapshot.get("garmin", {})
    if not isinstance(garmin.get("recent_activities"), list):
        raise ValueError("garmin.recent_activities must be a list")
    if not isinstance(garmin.get("recent_runs"), list):
        raise ValueError("garmin.recent_runs must be a list")
    if not isinstance(garmin.get("recent_bests"), list):
        raise ValueError("garmin.recent_bests must be a list")
    if not isinstance(garmin.get("flags"), list):
        raise ValueError("garmin.flags must be a list")

    hevy = snapshot.get("hevy", {})
    if not isinstance(hevy.get("recent_workouts"), list):
        raise ValueError("hevy.recent_workouts must be a list")
    if not isinstance(hevy.get("recent_bests"), list):
        raise ValueError("hevy.recent_bests must be a list")
    if not isinstance(hevy.get("flags"), list):
        raise ValueError("hevy.flags must be a list")
    muscle_fatigue = hevy.get("muscle_group_fatigue", {})
    if not isinstance(muscle_fatigue, dict):
        raise ValueError("hevy.muscle_group_fatigue must be a dict")
    for mg, val in muscle_fatigue.items():
        if val is not None:
            _check_in(val, _VALID_MUSCLE_FATIGUE, f"hevy.muscle_group_fatigue.{mg}")

    cronometer = snapshot.get("cronometer", {})
    for status_field in ("fueling_status", "protein_status", "carb_availability"):
        val = cronometer.get(status_field)
        if val is not None:
            _check_in(val, _VALID_NUTRITION_STATUS, f"cronometer.{status_field}")
    if not isinstance(cronometer.get("flags"), list):
        raise ValueError("cronometer.flags must be a list")

    manual = snapshot.get("manual_context", {})
    sleep_val = manual.get("sleep_quality")
    if sleep_val is not None:
        _check_in(sleep_val, _VALID_SLEEP_QUALITY, "manual_context.sleep_quality")
    mot_val = manual.get("motivation")
    if mot_val is not None:
        _check_in(mot_val, _VALID_MOTIVATION, "manual_context.motivation")
    fatigue_val = manual.get("mental_fatigue")
    if fatigue_val is not None:
        _check_in(fatigue_val, _VALID_MENTAL_FATIGUE, "manual_context.mental_fatigue")
    tt_val = manual.get("table_tennis_today")
    if tt_val is not None:
        _check_in(tt_val, _VALID_TABLE_TENNIS, "manual_context.table_tennis_today")
    if not isinstance(manual.get("soreness"), list):
        raise ValueError("manual_context.soreness must be a list")
    if not isinstance(manual.get("pain"), list):
        raise ValueError("manual_context.pain must be a list")
    if not isinstance(manual.get("constraints"), list):
        raise ValueError("manual_context.constraints must be a list")

    return snapshot


def _check_in(value: str, valid: frozenset[str], path: str) -> None:
    if value not in valid:
        raise ValueError(f"{path} must be one of {sorted(valid)}, got {value!r}")
