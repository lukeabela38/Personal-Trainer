from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from personal_trainer.speed_predictions import (  # noqa: E402
    build_speed_prediction_summary,
    build_speed_predictions,
)


class SpeedPredictionTests(TestCase):
    def test_build_speed_predictions_from_single_run_uses_riegel_and_training_paces(self) -> None:
        recent_runs = [
            {
                "name": "Tempo Run",
                "date": "2026-07-09",
                "distance_m": 10000.0,
                "duration_s": 3600.0,
                "pace_s_per_km": 360.0,
                "distance": "10.00 km",
                "duration": "1:00:00",
                "age_days": 1,
            }
        ]

        predictions = build_speed_predictions(recent_runs, "2026-07-10")
        five_k = next(prediction for prediction in predictions if prediction["distance_label"] == "5K")
        summary = build_speed_prediction_summary(predictions, recent_runs, "2026-07-10")

        self.assertEqual(five_k["model"], "Riegel extrapolation")
        self.assertEqual(five_k["confidence"], "high")
        self.assertEqual(five_k["source_run"]["name"], "Tempo Run")
        self.assertEqual(five_k["calibration_points"][0]["name"], "Tempo Run")
        self.assertIn("training_paces_summary", five_k)
        self.assertIn("Threshold", five_k["training_paces_summary"])
        self.assertEqual(summary["useful_run_count"], 1)
        self.assertEqual(summary["warning"], "Based on 2026-07-09.")
        self.assertFalse(summary["stale"])

    def test_build_speed_predictions_with_two_anchors_prefers_fit_based_models(self) -> None:
        recent_runs = [
            {
                "name": "5K effort",
                "date": "2026-07-09",
                "distance_m": 5000.0,
                "duration_s": 1250.0,
                "pace_s_per_km": 250.0,
                "distance": "5.00 km",
                "duration": "20:50",
                "age_days": 1,
            },
            {
                "name": "10K effort",
                "date": "2026-07-08",
                "distance_m": 10000.0,
                "duration_s": 2600.0,
                "pace_s_per_km": 260.0,
                "distance": "10.00 km",
                "duration": "43:20",
                "age_days": 2,
            },
        ]

        predictions = build_speed_predictions(recent_runs, "2026-07-10")
        by_label = {prediction["distance_label"]: prediction for prediction in predictions}

        self.assertEqual(by_label["1K"]["model"], "Critical Speed")
        self.assertEqual(by_label["5K"]["model"], "Critical Speed")
        self.assertEqual(by_label["Marathon"]["model"], "Calibrated Riegel")
        self.assertGreaterEqual(len(by_label["5K"]["supporting_models"]), 3)
        self.assertIn("stabilize CS", by_label["5K"]["how_to_improve"])

    def test_build_speed_predictions_ignores_clustered_same_distance_runs_when_fitting(self) -> None:
        recent_runs = [
            {
                "name": "Slow 5K",
                "date": "2026-07-09",
                "distance_m": 5000.0,
                "duration_s": 1500.0,
                "pace_s_per_km": 300.0,
                "distance": "5.00 km",
                "duration": "25:00",
                "age_days": 1,
            },
            {
                "name": "Fast 5K effort",
                "date": "2026-07-08",
                "distance_m": 5000.0,
                "duration_s": 1220.0,
                "pace_s_per_km": 244.0,
                "distance": "5.00 km",
                "duration": "20:20",
                "age_days": 2,
            },
            {
                "name": "10K effort",
                "date": "2026-07-07",
                "distance_m": 10000.0,
                "duration_s": 2550.0,
                "pace_s_per_km": 255.0,
                "distance": "10.00 km",
                "duration": "42:30",
                "age_days": 3,
            },
        ]

        predictions = build_speed_predictions(recent_runs, "2026-07-10")
        five_k = next(prediction for prediction in predictions if prediction["distance_label"] == "5K")

        self.assertEqual(five_k["source_run"]["name"], "Fast 5K effort")
        self.assertIn("Fast 5K effort", [point["name"] for point in five_k["calibration_points"]])
        self.assertIn("10K effort", [point["name"] for point in five_k["calibration_points"]])
        self.assertNotIn("Slow 5K", [point["name"] for point in five_k["calibration_points"]])
        self.assertEqual(five_k["training_paces"]["source_run"]["name"], "10K effort")


if __name__ == "__main__":
    import unittest

    unittest.main()
