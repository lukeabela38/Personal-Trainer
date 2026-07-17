from __future__ import annotations

from typing import Any

from .contracts import Confidence, Macros, NutritionDayType, NutritionGuidance, Priority

_ACTIVITY_MULTIPLIERS: dict[str, float] = {
    "aerobic_quality": 1.65,
    "aerobic_base": 1.50,
    "strength_progression": 1.45,
    "power_and_athleticism": 1.55,
    "table_tennis_readiness": 1.35,
    "recovery": 1.25,
    "nutrition_repair": 1.20,
}

_PROTEIN_G_PER_KG: dict[str, float] = {
    "aerobic_quality": 2.2,
    "aerobic_base": 2.0,
    "strength_progression": 2.2,
    "power_and_athleticism": 2.2,
    "table_tennis_readiness": 2.0,
    "recovery": 1.8,
    "nutrition_repair": 2.2,
}

_FAT_G_PER_KG: dict[str, float] = {
    "aerobic_quality": 0.9,
    "aerobic_base": 0.9,
    "strength_progression": 1.0,
    "power_and_athleticism": 0.9,
    "table_tennis_readiness": 0.9,
    "recovery": 0.9,
    "nutrition_repair": 0.8,
}

_CARB_FLOOR_G = 80
_FIBER_FLOOR_G = 25


def _bmr(weight_kg: float, height_cm: float, age: int) -> float:
    # Mifflin-St Jeor BMR for males.
    return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5


def _athlete_defaults(snapshot: dict[str, Any]) -> dict[str, float | int]:
    athlete = snapshot.get("athlete", {})
    return {
        "weight_kg": _number_or_default(athlete.get("body_weight_kg"), 83.5),
        "height_cm": _number_or_default(athlete.get("height_cm"), 188),
        "age": int(athlete.get("age")) if isinstance(athlete.get("age"), int) else 28,
    }


def _number_or_default(value: Any, default: float) -> float:
    return float(value) if isinstance(value, (int, float)) else default


def _fiber_target(calories: int) -> int:
    return max(_FIBER_FLOOR_G, round(calories * 0.012))


def _build_targets(weight_kg: float, height_cm: float, age: int, priority: Priority | str) -> Macros:
    bmr = _bmr(weight_kg, height_cm, age)
    multiplier = _ACTIVITY_MULTIPLIERS.get(priority, 1.4)
    total_calories = round(bmr * multiplier)

    protein_g = round(weight_kg * _PROTEIN_G_PER_KG.get(priority, 2.0))
    fat_g = round(weight_kg * _FAT_G_PER_KG.get(priority, 0.9))

    protein_calories = protein_g * 4
    fat_calories = fat_g * 9
    remaining = total_calories - protein_calories - fat_calories
    carbs_g = max(round(remaining / 4), _CARB_FLOOR_G)

    return {
        "calories": total_calories,
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
        "fiber_g": _fiber_target(total_calories),
    }


def build_nutrition_guidance(snapshot: dict[str, Any], *, priority: Priority | str) -> NutritionGuidance:
    athlete = _athlete_defaults(snapshot)
    targets = _build_targets(
        athlete["weight_kg"],
        athlete["height_cm"],
        athlete["age"],
        priority,
    )

    cronometer = snapshot.get("cronometer", {})
    derived = snapshot.get("derived", {})
    manual = snapshot.get("manual_context", {})
    source_today = cronometer.get("today", {})

    warnings: list[str] = []
    fallback_used = _is_beginner_fallback(snapshot)

    day_type: NutritionDayType = _day_type(priority, fallback_used, snapshot)
    confidence: Confidence = _confidence(snapshot, fallback_used)

    if _is_under_fueled(snapshot, source_today):
        warnings.append("under_fueled")
    if _manual_recovery_poor(manual) or "poor_recovery" in _list(derived.get("primary_constraints")):
        warnings.append("recovery_poor")
    if day_type == "fuel_heavy":
        warnings.append("hard_session_today")
    if fallback_used:
        warnings.append("starter_estimate")

    budget = _remaining_budget(targets, source_today)

    return {
        "day_type": day_type,
        "targets": targets,
        "budget": budget,
        "pre_training": _pre_training_hint(day_type, priority),
        "post_training": _post_training_hint(day_type, priority),
        "confidence": confidence,
        "warnings": warnings,
        "fallback_used": fallback_used,
    }


def _day_type(priority: Priority | str, fallback_used: bool, snapshot: dict[str, Any]) -> NutritionDayType:
    derived = snapshot.get("derived", {})
    constraints = set(_list(derived.get("primary_constraints")))

    if fallback_used:
        return "beginner_estimate"
    if "under_fueled" in constraints or priority == "nutrition_repair":
        return "repair"
    if priority in {"aerobic_quality", "power_and_athleticism"}:
        return "fuel_heavy"
    if priority == "recovery":
        return "fuel_light"
    return "normal"


def _confidence(snapshot: dict[str, Any], fallback_used: bool) -> Confidence:
    quality = snapshot.get("derived", {}).get("data_quality")
    if fallback_used:
        return "low"
    if quality == "high":
        return "high"
    if quality == "medium":
        return "medium"
    return "low"


def _is_beginner_fallback(snapshot: dict[str, Any]) -> bool:
    athlete = snapshot.get("athlete", {})
    derived = snapshot.get("derived", {})
    return bool(
        derived.get("data_quality") == "low"
        or not isinstance(athlete.get("body_weight_kg"), (int, float))
        or not isinstance(athlete.get("height_cm"), (int, float))
        or not isinstance(athlete.get("age"), int)
    )


def _is_under_fueled(snapshot: dict[str, Any], source_today: dict[str, Any]) -> bool:
    derived = set(_list(snapshot.get("derived", {}).get("primary_constraints")))
    source_flags = set(_list(snapshot.get("cronometer", {}).get("flags")))
    today_flags = set(_list(source_today.get("flags")))
    return bool(
        {"under_fueled"} & derived
        or {"under_fueled_today", "protein_low_today"} & source_flags
        or {"under_fueled_today", "protein_low_today"} & today_flags
    )


def _manual_recovery_poor(manual: dict[str, Any]) -> bool:
    return manual.get("sleep_quality") == "poor" or manual.get("mental_fatigue") == "high"


def _remaining_budget(targets: Macros, source_today: dict[str, Any]) -> Macros:
    calories_remaining = _remaining_int(source_today.get("remaining_kcal"), targets["calories"], source_today.get("calories_consumed"))
    protein_remaining = _remaining_macro(targets["protein_g"], source_today.get("protein_g"))
    carbs_remaining = _remaining_macro(targets["carbs_g"], source_today.get("carbs_g"))
    fat_remaining = _remaining_macro(targets["fat_g"], source_today.get("fat_g"))
    fiber_remaining = _remaining_macro(targets["fiber_g"], source_today.get("fiber_g"))
    return {
        "calories": calories_remaining,
        "protein_g": protein_remaining,
        "carbs_g": carbs_remaining,
        "fat_g": fat_remaining,
        "fiber_g": fiber_remaining,
    }


def _remaining_int(remaining_value: Any, target_value: int, consumed_value: Any) -> int:
    if isinstance(remaining_value, (int, float)):
        return max(round(float(remaining_value)), 0)
    if isinstance(consumed_value, (int, float)):
        return max(target_value - round(float(consumed_value)), 0)
    return target_value


def _remaining_macro(target_value: int, consumed_value: Any) -> int:
    if isinstance(consumed_value, (int, float)):
        return max(target_value - round(float(consumed_value)), 0)
    return target_value


def _pre_training_hint(day_type: NutritionDayType, priority: Priority | str) -> str:
    if day_type == "repair":
        return "close the calorie, protein, or carbohydrate gap before adding stress"
    if priority in {"aerobic_quality", "power_and_athleticism"}:
        return "fuel 2-3 hours before training and prioritize carbs"
    if priority == "strength_progression":
        return "eat a normal meal 2-3 hours before training and keep protein steady"
    if priority == "recovery":
        return "timing is not critical today; keep meals simple and consistent"
    return "timing is not critical today"


def _post_training_hint(day_type: NutritionDayType, priority: Priority | str) -> str:
    if day_type == "repair":
        return "refuel within 30-60 minutes and protect protein"
    if priority in {"aerobic_quality", "power_and_athleticism"}:
        return "refuel within 30-60 minutes with protein and carbs"
    if priority == "strength_progression":
        return "refuel within about 60 minutes with protein and carbs"
    if priority == "recovery":
        return "eat when convenient and keep protein protected"
    return "refuel when convenient and keep protein protected"


def _list(value: Any) -> list[str]:
    return value if isinstance(value, list) else []
