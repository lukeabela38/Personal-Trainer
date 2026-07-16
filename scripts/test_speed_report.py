from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from speed_report import build_report  # noqa: E402


class SpeedReportTests(unittest.TestCase):
    def test_build_report_includes_recent_runs_and_predictions(self) -> None:
        report = build_report(
            {
                "snapshot_date": "2026-07-10",
                "current_vo2max": 51,
                "vo2max_trend": "flat_or_rising",
                "vo2max_trend_points": [
                    {"date": "2026-07-01", "vo2max": 50.5},
                    {"date": "2026-07-09", "vo2max": 51.2},
                ],
                "training_load_trend": "3 days with data",
                "readiness": {
                    "sleep_score": 83,
                    "resting_heart_rate_bpm": 46,
                    "raw_hrv_ms": 61,
                    "stress": "low",
                    "body_battery": 61,
                },
                "result": [
                    {
                        "record_type": "Fastest 5K",
                        "value": 1251.104,
                        "date": "2026-07-02",
                        "activity_id": 1,
                    }
                ],
                "recent_runs": [
                    {
                        "activityId": 1,
                        "activityName": "Tempo Run",
                        "activityType": "running",
                        "startTimeLocal": "2026-07-09 06:00:00",
                        "distance": 10000,
                        "duration": 3600,
                        "avg_heart_rate_bpm": 162,
                    }
                ],
            }
        )

        self.assertEqual(report["entries"][0]["name"], "Fastest 5K")
        self.assertEqual(report["current_vo2max"], 51.0)
        self.assertEqual(report["vo2max_trend"], "flat_or_rising")
        self.assertEqual(report["vo2max_trend_points"][0]["vo2max"], 50.5)
        self.assertEqual(report["training_load_trend"], "3 days with data")
        self.assertEqual(report["readiness"]["sleep_score"], 83)
        self.assertEqual(report["readiness"]["resting_heart_rate_bpm"], 46)
        self.assertEqual(report["readiness"]["raw_hrv_ms"], 61)
        self.assertEqual(len(report["recent_runs"]), 1)
        self.assertEqual(report["recent_runs"][0]["distance"], "10.00 km")
        self.assertEqual(report["recent_runs"][0]["avg_heart_rate_bpm"], 162.0)
        self.assertEqual(report["entries"][0]["date"], "2026-07-02")
        self.assertEqual(report["entries"][0]["context"]["source_run_date"], "2026-07-09")
        self.assertEqual(report["entries"][0]["context"]["source_run_duration"], "1:00:00")
        self.assertEqual(report["entries"][0]["context"]["source_run_pace"], "6:00 /km")
        self.assertEqual(report["entries"][0]["context"]["source_run_avg_heart_rate_bpm"], 162.0)
        self.assertEqual(len(report["predictions"]), 6)
        self.assertEqual(report["prediction_summary"]["stale"], False)
        self.assertEqual(report["prediction_summary"]["useful_run_count"], 1)
        self.assertEqual(report["predictions"][2]["distance_label"], "5K")

    def test_build_report_marks_stale_prediction_sources(self) -> None:
        report = build_report(
            {
                "snapshot_date": "2026-07-30",
                "current_vo2max": 49.5,
                "vo2max_trend": "down",
                "training_load_trend": None,
                "readiness": {},
                "recent_runs": [
                    {
                        "activityId": 1,
                        "activityName": "Tempo Run",
                        "startTimeLocal": "2026-07-01 06:00:00",
                        "distance": 10000,
                        "duration": 3600,
                    }
                ],
            }
        )

        self.assertTrue(report["prediction_summary"]["stale"])
        self.assertIn("older than 14 days", report["prediction_summary"]["warning"])


if __name__ == "__main__":
    unittest.main()
