from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.speed_report import build_report  # noqa: E402


class SpeedContractTests(unittest.TestCase):
    def test_build_report_emits_speed_prediction_contract_fields(self) -> None:
        report = build_report(
            {
                "snapshot_date": "2026-07-10",
                "current_vo2max": 51,
                "recent_runs": [
                    {
                        "activityId": 1,
                        "activityName": "Tempo Run",
                        "activityType": {"typeKey": "running"},
                        "startTimeLocal": "2026-07-09 06:00:00",
                        "distance": 10000,
                        "duration": 3600,
                        "averageHeartRate": 162,
                    }
                ],
            },
            speed_predictions_enabled=True,
        )

        prediction = report["predictions"][0]
        self.assertIn("prediction", prediction)
        self.assertIn("ci_68", prediction)
        self.assertIn("ci_95", prediction)
        self.assertIn("model", prediction)
        self.assertIn("calibration_points", prediction)
        self.assertIn("confidence", prediction)
        self.assertIn("trend", prediction)
        self.assertIn("how_to_improve", prediction)
        self.assertIn("distance_label", prediction)
        self.assertIn("target_distance_m", prediction)
        self.assertIn("predicted_time_s", prediction)
        self.assertIn("predicted_time", prediction)
        self.assertIn("predicted_pace", prediction)
        self.assertIn("source_run", prediction)
        self.assertIn("stale", prediction)
        self.assertIn("generated_on", prediction)
        self.assertIsInstance(prediction["calibration_points"], list)
        self.assertIn("avg_heart_rate_bpm", prediction["source_run"])


if __name__ == "__main__":
    unittest.main()
