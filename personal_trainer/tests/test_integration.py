from __future__ import annotations

import json
import unittest
from pathlib import Path

from personal_trainer import build_daily_recommendation, build_snapshot

EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"


class IntegrationTests(unittest.TestCase):
    def test_snapshot_to_recommendation_flow_for_ready_examples(self):
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(snapshot["derived"]["data_quality"], "high")
        self.assertEqual(recommendation["Priority"], "aerobic_quality")
        self.assertEqual(recommendation["Confidence"], "high")
        self.assertEqual(recommendation["Needs check-in"], "no")

    def test_snapshot_to_recommendation_flow_for_under_fueled_examples(self):
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["cronometer"]["fueling_status"] = "low"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertIn("under_fueled", snapshot["derived"]["primary_constraints"])
        self.assertEqual(snapshot["derived"]["hard_session_allowed"], "no")
        self.assertEqual(recommendation["Priority"], "nutrition_repair")
        self.assertEqual(recommendation["Needs check-in"], "yes")


if __name__ == "__main__":
    unittest.main()
