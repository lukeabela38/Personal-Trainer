from __future__ import annotations

import unittest

from personal_trainer.progression import build_progression_state


class ProgressionTests(unittest.TestCase):
    def test_strength_ready_to_progress_includes_next_weight(self) -> None:
        result = build_progression_state(
            {
                "name": "Bench Press (Barbell)",
                "best_set": {"weight_kg": 100, "reps": 5},
                "last_set": {"weight_kg": 100, "reps": 5},
            },
            {"current": 100, "peak": 100, "stalled": False},
            goal="strength",
        )

        self.assertEqual(result["state"], "ready_to_progress")
        self.assertEqual(result["next_weight_kg"], 102.5)
        self.assertIn("add 2.5 kg next", result["summary"])

    def test_hypertrophy_accumulates_volume_before_adding_load(self) -> None:
        result = build_progression_state(
            {
                "name": "Dumbbell Row",
                "best_set": {"weight_kg": 36, "reps": 8},
                "last_set": {"weight_kg": 36, "reps": 8},
            },
            {"current": 48, "peak": 48, "stalled": False},
            goal="hypertrophy",
        )

        self.assertEqual(result["state"], "accumulate")
        self.assertEqual(result["target_reps"], 10)
        self.assertIn("add 2 more reps", result["summary"])

    def test_endurance_can_progress_after_hitting_high_rep_target(self) -> None:
        result = build_progression_state(
            {
                "name": "Split Squat",
                "best_set": {"weight_kg": 20, "reps": 15},
                "last_set": {"weight_kg": 20, "reps": 15},
            },
            {"current": 27, "peak": 27, "stalled": False},
            goal="endurance",
        )

        self.assertEqual(result["state"], "ready_to_progress")
        self.assertEqual(result["increment_kg"], 1.0)
        self.assertEqual(result["next_weight_kg"], 21.0)

    def test_stalled_trend_maps_to_stalled_state(self) -> None:
        result = build_progression_state(
            {
                "name": "Squat (Barbell)",
                "best_set": {"weight_kg": 100, "reps": 5},
                "last_set": {"weight_kg": 100, "reps": 5},
            },
            {"current": 100, "peak": 100, "stalled": True},
            goal="strength",
        )

        self.assertEqual(result["state"], "stalled")
        self.assertTrue(result["stalled"])

    def test_decrease_below_peak_triggers_deload(self) -> None:
        result = build_progression_state(
            {
                "name": "Deadlift (Barbell)",
                "best_set": {"weight_kg": 120, "reps": 3},
                "last_set": {"weight_kg": 120, "reps": 3},
            },
            {"current": 100, "peak": 120, "stalled": False},
            goal="strength",
        )

        self.assertEqual(result["state"], "deload")
        self.assertTrue(result["deload"])
        self.assertIn("below peak", result["summary"])

    def test_equipment_caps_force_constrained_progression(self) -> None:
        result = build_progression_state(
            {
                "name": "Leg Press",
                "best_set": {"weight_kg": 160, "reps": 10},
                "last_set": {"weight_kg": 160, "reps": 10},
            },
            {"current": 160, "peak": 160, "stalled": False},
            goal="hypertrophy",
            equipment={"kind": "capped", "max_weight_kg": 160},
        )

        self.assertEqual(result["state"], "constrained")
        self.assertTrue(result["equipment_limited"])
        self.assertIn("progress with reps or tempo", result["summary"])


if __name__ == "__main__":
    unittest.main()
