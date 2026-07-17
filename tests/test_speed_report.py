from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import speed_report  # noqa: E402


class SpeedReportTests(TestCase):
    def test_extract_records_prefers_best_distance_and_duration_match_over_wrong_activity_id(self) -> None:
        raw = {
            "recent_bests": [
                {
                    "record_type": "Fastest 5K",
                    "value": 1250,
                    "activityId": 202,
                },
            ]
        }
        recent_runs = [
            {
                "activity_id": 101,
                "name": "5K tempo",
                "date": "2026-06-15",
                "distance_m": 5000.0,
                "duration_s": 1250.0,
                "distance": "5.00 km",
                "duration": "20:50",
                "pace": "4:10 /km",
            },
            {
                "activity_id": 202,
                "name": "Half marathon",
                "date": "2026-06-15",
                "distance_m": 21097.5,
                "duration_s": 5520.0,
                "distance": "21.10 km",
                "duration": "1:32:00",
                "pace": "4:22 /km",
            },
        ]

        records = speed_report._extract_records(raw, recent_runs)

        self.assertEqual(records[0]["context"]["source_run_name"], "5K tempo")
        self.assertEqual(records[0]["context"]["source_run_duration"], "20:50")

    def test_extract_records_preserves_activity_name_from_record_row(self) -> None:
        raw = {
            "recent_bests": [
                {
                    "record_type": "Fastest 5K",
                    "value": 1250,
                    "date": "2026-06-15",
                    "activityId": 202,
                    "activity_name": "Sliema - LifeStar Malta Marathon (Half Marathon)",
                }
            ]
        }

        records = speed_report._extract_records(raw, [])

        self.assertEqual(
            records[0]["context"]["activity_name"],
            "Sliema - LifeStar Malta Marathon (Half Marathon)",
        )

    def test_build_report_includes_prediction_contract_and_trend_history(self) -> None:
        raw = {
            "source": "Garmin personal records",
            "snapshot_date": "2026-07-09",
            "current_vo2max": 52,
            "vo2max_trend": "up",
            "vo2max_trend_points": [
                {"date": "2026-07-01", "vo2max": 50.5},
                {"date": "2026-07-09", "vo2max": 52.0},
            ],
            "readiness": {
                "sleep_score": 83,
                "resting_heart_rate_bpm": 46,
                "raw_hrv_ms": 61,
            },
            "recent_runs": [
                {
                    "activity_id": 42,
                    "name": "Tempo Run",
                    "date": "2026-07-09",
                    "start_time": "2026-07-09T06:00:00Z",
                    "distance_m": 10000.0,
                    "distance": "10.00 km",
                    "duration_s": 3600.0,
                    "duration": "1:00:00",
                    "pace_s_per_km": 360.0,
                    "pace": "6:00 /km",
                    "avg_heart_rate_bpm": 161.0,
                    "age_days": 0,
                }
            ],
            "recent_bests": [],
        }

        report = speed_report.build_report(raw, speed_predictions_enabled=True)

        self.assertEqual(report["vo2max_trend_history"][0]["vo2max"], 50.5)
        self.assertEqual(report["predictions"][2]["confidence"], "high")
        self.assertEqual(report["predictions"][2]["prediction"], report["predictions"][2]["predicted_time"])
        self.assertEqual(report["predictions"][2]["model"], "Riegel extrapolation")
        self.assertEqual(report["predictions"][2]["calibration_points"][0]["name"], "Tempo Run")
        self.assertTrue(report["predictions"][2]["ci_60"].startswith("±"))
        self.assertTrue(report["predictions"][2]["ci_90"].startswith("±"))
        self.assertEqual(report["predictions"][2]["trend"], "improving")
        self.assertTrue(report["predictions"][2]["how_to_improve"])

    def test_build_report_disables_predictions_when_flag_is_off(self) -> None:
        raw = {
            "snapshot_date": "2026-07-09",
            "recent_runs": [
                {
                    "activityId": 42,
                    "activityName": "Tempo Run",
                    "startTimeLocal": "2026-07-09 06:00:00",
                    "distance": 10000,
                    "duration": 3600,
                }
            ],
        }

        original = os.environ.get("PERSONAL_TRAINER_SPEED_PREDICTIONS_ENABLED")
        os.environ["PERSONAL_TRAINER_SPEED_PREDICTIONS_ENABLED"] = "0"
        try:
            report = speed_report.build_report(raw)
        finally:
            if original is None:
                os.environ.pop("PERSONAL_TRAINER_SPEED_PREDICTIONS_ENABLED", None)
            else:
                os.environ["PERSONAL_TRAINER_SPEED_PREDICTIONS_ENABLED"] = original

        self.assertFalse(report["feature_flags"]["speed_predictions"])
        self.assertEqual(report["predictions"], [])
        self.assertEqual(
            report["prediction_summary"]["warning"],
            "Speed predictions are currently disabled.",
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
