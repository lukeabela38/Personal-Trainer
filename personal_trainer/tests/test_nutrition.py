from __future__ import annotations

import unittest

from personal_trainer import build_nutrition_guidance
from personal_trainer.macros import build_macros


def base_snapshot() -> dict[str, object]:
    return {
        "athlete": {
            "body_weight_kg": 83.5,
            "height_cm": 188,
            "age": 28,
        },
        "derived": {
            "data_quality": "high",
            "primary_constraints": [],
        },
        "cronometer": {
            "flags": [],
            "today": {
                "calories_consumed": 450,
                "remaining_kcal": 2650,
                "protein_g": 90,
                "carbs_g": 140,
                "fat_g": 25,
                "fiber_g": 10,
            },
        },
        "manual_context": {
            "freshness": "fresh",
            "sleep_quality": "good",
            "mental_fatigue": "low",
        },
    }


class NutritionGuidanceTests(unittest.TestCase):
    def test_aerobic_quality_day_is_fuel_heavy(self) -> None:
        guidance = build_nutrition_guidance(base_snapshot(), priority="aerobic_quality")

        self.assertEqual(guidance["day_type"], "fuel_heavy")
        self.assertEqual(guidance["confidence"], "high")
        self.assertTrue(guidance["fallback_used"] is False)
        self.assertIn("hard_session_today", guidance["warnings"])
        self.assertIn("fuel 2-3 hours before training", guidance["pre_training"])
        self.assertIn("refuel within 30-60 minutes", guidance["post_training"])

    def test_recovery_day_is_fuel_light(self) -> None:
        guidance = build_nutrition_guidance(base_snapshot(), priority="recovery")

        self.assertEqual(guidance["day_type"], "fuel_light")
        self.assertIn("timing is not critical today", guidance["pre_training"])
        self.assertIn("protein protected", guidance["post_training"])

    def test_under_fueled_day_becomes_repair(self) -> None:
        snapshot = base_snapshot()
        snapshot["derived"]["primary_constraints"] = ["under_fueled"]  # type: ignore[index]

        guidance = build_nutrition_guidance(snapshot, priority="strength_progression")

        self.assertEqual(guidance["day_type"], "repair")
        self.assertIn("under_fueled", guidance["warnings"])
        self.assertIn("close the calorie, protein, or carbohydrate gap", guidance["pre_training"])
        self.assertEqual(guidance["budget"]["calories"], 2650)

    def test_beginner_fallback_is_explicit(self) -> None:
        snapshot = base_snapshot()
        snapshot["derived"]["data_quality"] = "low"  # type: ignore[index]
        snapshot["athlete"] = {}  # type: ignore[assignment]

        guidance = build_nutrition_guidance(snapshot, priority="aerobic_base")

        self.assertEqual(guidance["day_type"], "beginner_estimate")
        self.assertEqual(guidance["confidence"], "low")
        self.assertTrue(guidance["fallback_used"])
        self.assertIn("starter_estimate", guidance["warnings"])

    def test_build_macros_keeps_backward_compatibility(self) -> None:
        macros = build_macros(weight_kg=83.5, height_cm=188, age=28, priority="aerobic_quality")

        self.assertEqual(macros["calories"], 3094)
        self.assertEqual(macros["protein_g"], 184)
        self.assertEqual(macros["carbs_g"], 421)
        self.assertEqual(macros["fat_g"], 75)
        self.assertGreaterEqual(macros["fiber_g"], 25)


if __name__ == "__main__":
    unittest.main()
