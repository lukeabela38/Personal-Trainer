import unittest

from personal_trainer import build_snapshot


def ready_sources():
    return {
        "snapshot_date": "2026-07-02",
        "garmin": {"freshness": "fresh", "current_vo2max": 51, "flags": []},
        "hevy": {
            "freshness": "fresh",
            "strength_trend": "unknown",
            "muscle_group_fatigue": {"legs": "low", "shoulders_arms": "low"},
            "flags": [],
        },
        "cronometer": {
            "freshness": "fresh",
            "fueling_status": "adequate",
            "protein_status": "adequate",
            "carb_availability": "adequate",
            "today": {"log_completeness": "complete"},
            "flags": [],
        },
        "manual_context": {
            "freshness": "fresh",
            "sleep_quality": "good",
            "pain": [],
            "motivation": "normal",
            "mental_fatigue": "low",
            "table_tennis_today": "none",
        },
    }


class SnapshotTests(unittest.TestCase):
    def test_builds_high_quality_ready_snapshot(self):
        snapshot = build_snapshot(ready_sources())

        self.assertEqual(snapshot["snapshot_date"], "2026-07-02")
        self.assertEqual(snapshot["derived"]["data_quality"], "high")
        self.assertEqual(snapshot["derived"]["hard_session_allowed"], "yes")
        self.assertFalse(snapshot["derived"]["check_in_required"])

    def test_under_fueled_sources_create_constraint(self):
        sources = ready_sources()
        sources["cronometer"]["fueling_status"] = "low"

        snapshot = build_snapshot(sources)

        self.assertIn("under_fueled", snapshot["derived"]["primary_constraints"])
        self.assertEqual(snapshot["derived"]["hard_session_allowed"], "no")

    def test_leg_fatigue_creates_quality_run_conflict(self):
        sources = ready_sources()
        sources["hevy"]["muscle_group_fatigue"]["legs"] = "high"

        snapshot = build_snapshot(sources)

        self.assertIn("leg_fatigue", snapshot["derived"]["primary_constraints"])
        self.assertIn("heavy_legs_vs_quality_run", snapshot["derived"]["likely_conflicts"])

    def test_missing_manual_context_triggers_questions(self):
        sources = ready_sources()
        sources["manual_context"] = {"freshness": "missing"}

        snapshot = build_snapshot(sources)

        self.assertTrue(snapshot["derived"]["check_in_required"])
        self.assertGreater(len(snapshot["derived"]["check_in_questions"]), 0)


if __name__ == "__main__":
    unittest.main()
