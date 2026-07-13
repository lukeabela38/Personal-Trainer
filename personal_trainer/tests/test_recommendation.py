import unittest

from personal_trainer import build_daily_recommendation


def base_snapshot():
    return {
        "athlete": {
            "current_block": "hybrid_aggressive",
            "current_vo2max_waypoint": 52,
        },
        "garmin": {"flags": []},
        "hevy": {"flags": [], "strength_trend": "unknown"},
        "cronometer": {"flags": []},
        "manual_context": {
            "freshness": "fresh",
            "motivation": "normal",
            "mental_fatigue": "low",
            "table_tennis_today": "none",
        },
        "derived": {
            "data_quality": "high",
            "hard_session_allowed": "yes",
            "primary_constraints": [],
            "likely_conflicts": [],
            "check_in_required": False,
        },
    }


class RecommendationTests(unittest.TestCase):
    def test_recommends_aerobic_quality_for_ready_hybrid_block(self):
        with self.assertLogs("personal_trainer.recommendation", level="INFO") as logs:
            recommendation = build_daily_recommendation(base_snapshot())

        self.assertEqual(recommendation["Priority"], "aerobic_quality")
        self.assertEqual(recommendation["Confidence"], "high")
        self.assertEqual(recommendation["Needs check-in"], "no")
        self.assertTrue(any("selected recommendation priority=aerobic_quality" in message for message in logs.output))

    def test_recommends_recovery_when_recovery_is_poor(self):
        snapshot = base_snapshot()
        snapshot["derived"]["primary_constraints"] = ["poor_recovery"]

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Priority"], "recovery")
        self.assertIn("low-readiness", recommendation["Guardrail"])

    def test_recommends_nutrition_repair_when_under_fueled(self):
        snapshot = base_snapshot()
        snapshot["derived"]["primary_constraints"] = ["under_fueled"]

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Priority"], "nutrition_repair")
        self.assertEqual(recommendation["Needs check-in"], "yes")

    def test_table_tennis_match_takes_priority(self):
        snapshot = base_snapshot()
        snapshot["manual_context"]["table_tennis_today"] = "match"

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Priority"], "table_tennis_readiness")
        self.assertIn("coordination", recommendation["Guardrail"])

    def test_table_tennis_training_takes_priority(self):
        snapshot = base_snapshot()
        snapshot["manual_context"]["table_tennis_today"] = "training"

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Priority"], "table_tennis_readiness")
        self.assertIn("coordination", recommendation["Guardrail"])

    def test_strength_progression_when_aerobic_quality_blocked_and_strength_available(self):
        snapshot = base_snapshot()
        snapshot["derived"]["hard_session_allowed"] = "no"
        snapshot["hevy"]["flags"] = ["strength_progression_available"]

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Priority"], "strength_progression")
        self.assertIn("progression", recommendation["Session"])

    def test_power_and_athleticism_when_strength_focus_block_is_ready(self):
        snapshot = base_snapshot()
        snapshot["athlete"]["current_block"] = "strength_focus"
        snapshot["hevy"]["strength_trend"] = "stable"

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Priority"], "power_and_athleticism")
        self.assertIn("explosive", recommendation["Session"])
        self.assertEqual(recommendation["Needs check-in"], "no")

    def test_low_quality_snapshot_requests_check_in(self):
        snapshot = base_snapshot()
        snapshot["derived"]["data_quality"] = "low"
        snapshot["derived"]["hard_session_allowed"] = "unknown"

        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation["Confidence"], "low")
        self.assertEqual(recommendation["Needs check-in"], "yes")


if __name__ == "__main__":
    unittest.main()
