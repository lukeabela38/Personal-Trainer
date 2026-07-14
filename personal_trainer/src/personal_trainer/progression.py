from __future__ import annotations

from typing import Any, Literal

ProgressionGoal = Literal["strength", "hypertrophy", "endurance"]
ProgressionState = Literal["baseline", "accumulate", "ready_to_progress", "stalled", "deload", "constrained"]

_GOAL_RULES: dict[ProgressionGoal, dict[str, float | int | str]] = {
    "strength": {"target_reps": 5, "increment_kg": 2.5, "label": "Strength"},
    "hypertrophy": {"target_reps": 10, "increment_kg": 2.5, "label": "Hypertrophy"},
    "endurance": {"target_reps": 15, "increment_kg": 1.0, "label": "Endurance"},
}


def build_progression_state(
    entry: dict[str, Any],
    gain: dict[str, Any] | None = None,
    *,
    goal: ProgressionGoal = "strength",
    equipment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rule = _GOAL_RULES.get(goal, _GOAL_RULES["strength"])
    best_set = entry.get("best_set") if isinstance(entry.get("best_set"), dict) else {}
    source_set = (
        entry.get("last_set")
        if isinstance(entry.get("last_set"), dict)
        else entry.get("latest_set")
        if isinstance(entry.get("latest_set"), dict)
        else best_set
    )
    weight_kg = _to_float(source_set.get("weight_kg"))
    reps = _to_int(source_set.get("reps"))
    current = _to_float(gain.get("current")) if isinstance(gain, dict) else None
    peak = _to_float(gain.get("peak")) if isinstance(gain, dict) else current
    stalled = bool(gain.get("stalled")) if isinstance(gain, dict) else False
    equipment_limited = _equipment_limited(entry, best_set, equipment)
    increment_kg = _resolve_increment(goal, weight_kg, equipment)
    target_reps = int(rule["target_reps"])
    goal_label = str(rule["label"])

    decline_pct = _decline_pct(current, peak)
    state: ProgressionState
    summary: str
    detail: str
    next_weight_kg: float | None = None
    reasons: list[str] = []

    if weight_kg is None and reps is None and current is None:
        state = "baseline"
        summary = f"{goal_label}: establish a baseline"
        detail = "No recent loaded set is available yet."
        reasons.append("No recent best set to progress from")
    elif decline_pct is not None and decline_pct >= 10:
        state = "deload"
        summary = f"Deload: {decline_pct:.0f}% below peak"
        detail = "Performance has moved materially off peak, so back the load off and rebuild."
        reasons.append(f"Current 1RM is {decline_pct:.1f}% below peak")
        if peak is not None and current is not None:
            reasons.append(f"Peak {peak:.1f} kg vs current {current:.1f} kg")
    elif stalled:
        state = "stalled"
        summary = "Stalled: hold load and refine execution"
        detail = "4+ weeks of flat estimated 1RM means the lift is not moving yet."
        reasons.append("Stalled trend flagged over the recent window")
    elif equipment_limited:
        state = "constrained"
        summary = f"{goal_label}: progress with reps or tempo"
        detail = "The load is capped, so the next gain has to come from volume, tempo, or range of motion."
        reasons.append("Equipment or movement pattern limits additional load")
    elif reps is not None and reps >= target_reps and weight_kg is not None:
        state = "ready_to_progress"
        next_weight_kg = _round_to_increment(weight_kg + increment_kg, increment_kg)
        summary = f"Ready: add {increment_kg:g} kg next"
        detail = f"{reps} reps clear the {goal_label.lower()} target, so step the load up."
        reasons.append(f"{reps} reps meets the {goal_label.lower()} threshold of {target_reps}")
        reasons.append(f"Increase the load by {increment_kg:g} kg")
    else:
        state = "accumulate"
        if reps is None:
            summary = f"{goal_label}: build a clean baseline"
            detail = "There is not enough rep data yet to advance the load."
            reasons.append("Missing rep count for progression")
        else:
            if reps < target_reps:
                needed = target_reps - reps
                summary = f"Accumulate: add {needed} more reps"
                detail = f"Hold the current load until you reach {target_reps} reps."
                reasons.append(f"{reps}/{target_reps} reps complete at the current load")
            else:
                summary = f"{goal_label}: hold load and keep volume steady"
                detail = "The lift is not stalled, but the set does not yet justify a load increase."
                reasons.append("Reps are on target but the set is not ready to progress yet")

    return {
        "goal": goal,
        "goal_label": goal_label,
        "state": state,
        "state_label": _state_label(state),
        "summary": summary,
        "detail": detail,
        "current_weight_kg": weight_kg,
        "current_reps": reps,
        "target_reps": target_reps,
        "increment_kg": increment_kg,
        "next_weight_kg": next_weight_kg,
        "stalled": stalled,
        "deload": state == "deload",
        "equipment_limited": equipment_limited,
        "reasons": reasons,
    }


def _equipment_limited(
    entry: dict[str, Any],
    best_set: dict[str, Any],
    equipment: dict[str, Any] | None,
) -> bool:
    if equipment:
        if equipment.get("kind") in {"bodyweight", "capped"}:
            return True
        if equipment.get("max_weight_kg") is not None:
            max_weight = _to_float(equipment.get("max_weight_kg"))
            weight_kg = _to_float(best_set.get("weight_kg"))
            if max_weight is not None and weight_kg is not None and weight_kg >= max_weight:
                return True
    if _to_float(best_set.get("weight_kg")) is None:
        return True
    return False


def _resolve_increment(
    goal: ProgressionGoal,
    weight_kg: float | None,
    equipment: dict[str, Any] | None,
) -> float:
    if equipment is not None:
        increment = _to_float(equipment.get("increment_kg"))
        if increment is not None and increment > 0:
            return increment
    if weight_kg is not None and weight_kg < 20:
        return 1.0
    return float(_GOAL_RULES[goal]["increment_kg"])


def _round_to_increment(value: float, increment: float) -> float:
    if increment <= 0:
        return round(value, 1)
    return round(value / increment) * increment


def _decline_pct(current: float | None, peak: float | None) -> float | None:
    if current is None or peak is None or peak <= 0:
        return None
    return max(0.0, ((peak - current) / peak) * 100)


def _state_label(state: ProgressionState) -> str:
    return {
        "baseline": "Baseline",
        "accumulate": "Accumulate",
        "ready_to_progress": "Ready to progress",
        "stalled": "Stalled",
        "deload": "Deload",
        "constrained": "Constrained",
    }[state]


def _to_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    if value in (None, "", "null"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
