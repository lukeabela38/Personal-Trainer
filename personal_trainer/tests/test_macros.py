import unittest

from personal_trainer.macros import build_macros

_DEFAULT = {"weight_kg": 83.5, "height_cm": 188, "age": 28}


class MacrosTests(unittest.TestCase):
    def test_aerobic_quality_has_highest_carbs(self):
        macros = build_macros(**_DEFAULT, priority="aerobic_quality")
        self.assertEqual(macros["calories"], 3094)
        self.assertEqual(macros["protein_g"], 184)
        self.assertEqual(macros["carbs_g"], 421)
        self.assertEqual(macros["fat_g"], 75)

    def test_recovery_has_lowest_calories(self):
        macros = build_macros(**_DEFAULT, priority="recovery")
        self.assertEqual(macros["calories"], 2344)
        self.assertEqual(macros["protein_g"], 150)
        self.assertEqual(macros["fat_g"], 75)

    def test_strength_progression_has_higher_fat(self):
        macros = build_macros(**_DEFAULT, priority="strength_progression")
        self.assertEqual(macros["calories"], 2719)
        self.assertEqual(macros["protein_g"], 184)
        self.assertEqual(macros["fat_g"], 84)

    def test_nutrition_repair_keeps_protein_high(self):
        macros = build_macros(**_DEFAULT, priority="nutrition_repair")
        self.assertEqual(macros["calories"], 2250)
        self.assertEqual(macros["protein_g"], 184)
        self.assertEqual(macros["carbs_g"], 228)
        self.assertEqual(macros["fat_g"], 67)

    def test_unknown_priority_uses_sensible_default(self):
        macros = build_macros(**_DEFAULT, priority="unknown")
        self.assertEqual(macros["calories"], 2625)
        self.assertGreaterEqual(macros["protein_g"], 160)
        self.assertGreaterEqual(macros["fat_g"], 75)

    def test_lighter_athlete_gets_lower_targets(self):
        macros = build_macros(weight_kg=65, height_cm=175, age=30, priority="aerobic_quality")
        self.assertLess(macros["calories"], _DEFAULT["weight_kg"] * 40)
        self.assertLess(macros["protein_g"], 150)

    def test_carbs_never_below_floor(self):
        macros = build_macros(
            **_DEFAULT,
            priority="nutrition_repair",
        )
        self.assertGreaterEqual(macros["carbs_g"], 80)
