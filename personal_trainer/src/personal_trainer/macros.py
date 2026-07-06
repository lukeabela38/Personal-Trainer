from __future__ import annotations

from .contracts import Macros, Priority


# Mifflin-St Jeor BMR for males
def _bmr(weight_kg: float, height_cm: float, age: int) -> float:
    return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5


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

# Minimum carb floor (grams) even when calories are low
_CARB_FLOOR_G = 80


def build_macros(
    *,
    weight_kg: float,
    height_cm: float,
    age: int,
    priority: Priority | str,
) -> Macros:
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
    }
