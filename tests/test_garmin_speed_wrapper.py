from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "wrappers"))

import fetch_garmin_speed as garmin_speed  # noqa: E402


class GarminSpeedWrapperTests(TestCase):
    def test_extract_records_filters_to_running_prs(self) -> None:
        records = garmin_speed._extract_records(
            [
                {
                    "typeId": 1,
                    "value": 216.9,
                    "date": "2026-05-09",
                    "activityIdGarmin": 123,
                },
                {
                    "typeId": 8,
                    "value": 1000,
                    "date": "2026-05-01",
                },
                {
                    "typeId": 3,
                    "value": 1251.1,
                    "date": "2026-05-03",
                },
            ]
        )

        self.assertEqual([record["record_type"] for record in records], ["Fastest 1K", "Fastest 5K"])
        self.assertEqual(records[0]["activity_id"], 123)

    def test_extract_runs_normalizes_recent_activities(self) -> None:
        runs = garmin_speed._extract_runs(
            [
                {
                    "activityId": 42,
                    "activityName": "Tempo Run",
                    "activityType": {"typeKey": "running"},
                    "startTimeLocal": "2026-07-09 06:00:00",
                    "distance": 10000,
                    "duration": 3600,
                    "averageHR": 161,
                }
            ]
        )

        self.assertEqual(len(runs), 1)
        self.assertEqual(runs[0]["activity_id"], 42)
        self.assertEqual(runs[0]["name"], "Tempo Run")
        self.assertEqual(runs[0]["activity_type"], "running")
        self.assertEqual(runs[0]["distance_m"], 10000.0)
        self.assertEqual(runs[0]["duration_s"], 3600.0)
        self.assertEqual(runs[0]["pace_s_per_km"], 360.0)
        self.assertEqual(runs[0]["avg_heart_rate_bpm"], 161.0)

    def test_collect_all_activities_direct_pages_until_history_is_exhausted(self) -> None:
        class FakeClient:
            def __init__(self) -> None:
                self.calls: list[tuple[int, int]] = []

            def get_activities(self, start: int, limit: int):
                self.calls.append((start, limit))
                if start == 0:
                    return [
                        {
                            "activityId": idx + 1,
                            "activityType": {"typeKey": "running"},
                            "activityName": f"Run {idx + 1}",
                        }
                        for idx in range(garmin_speed.ACTIVITY_PAGE_SIZE)
                    ]
                if start == garmin_speed.ACTIVITY_PAGE_SIZE:
                    return [
                        {
                            "activityId": garmin_speed.ACTIVITY_PAGE_SIZE + 1,
                            "activityType": {"typeKey": "cycling"},
                            "activityName": "Ride",
                        },
                        {
                            "activityId": garmin_speed.ACTIVITY_PAGE_SIZE + 2,
                            "activityType": {"typeKey": "running"},
                            "activityName": "Run after page",
                        },
                    ]
                return []

        client = FakeClient()
        activities = garmin_speed._collect_all_activities_direct(client)

        self.assertEqual([call[0] for call in client.calls], [0, garmin_speed.ACTIVITY_PAGE_SIZE])
        self.assertEqual(
            [entry["activityId"] for entry in activities],
            [
                *range(1, garmin_speed.ACTIVITY_PAGE_SIZE + 1),
                garmin_speed.ACTIVITY_PAGE_SIZE + 1,
                garmin_speed.ACTIVITY_PAGE_SIZE + 2,
            ],
        )
        self.assertTrue(garmin_speed._is_running_activity(activities[0]))
        self.assertFalse(garmin_speed._is_running_activity(activities[-2]))

    def test_merge_live_metrics_backfills_heart_rate_from_live_fetch(self) -> None:
        payload = {
            "current_vo2max": None,
            "vo2max_trend": None,
            "training_load_trend": None,
            "readiness": {},
            "result": [],
            "recent_runs": [
                {
                    "activity_id": 42,
                    "name": "Tempo Run",
                    "start_time": "2026-07-09 06:00:00",
                    "distance_m": 10000.0,
                    "duration_s": 3600.0,
                    "avg_heart_rate_bpm": None,
                }
            ],
        }
        live = {
            "current_vo2max": 52,
            "vo2max_trend": "up",
            "vo2max_trend_points": [
                {"date": "2026-07-01", "vo2max": 50.5},
                {"date": "2026-07-09", "vo2max": 52.0},
            ],
            "training_load_trend": "21",
            "readiness": {"sleep_score": 83, "resting_heart_rate_bpm": 46, "raw_hrv_ms": 61},
            "sleep_data": {"avgOvernightHrv": 62},
            "recent_bests": [{"record_type": "Fastest 5K"}],
            "recent_runs": [
                {
                    "activity_id": 42,
                    "name": "Tempo Run",
                    "start_time": "2026-07-09 06:00:00",
                    "distance_m": 10000.0,
                    "duration_s": 3600.0,
                    "avg_heart_rate_bpm": 161.0,
                }
            ],
        }

        with patch.object(garmin_speed.fetch_garmin, "fetch", return_value=live):
            merged = garmin_speed._merge_live_metrics(payload)

        self.assertEqual(merged["current_vo2max"], 52)
        self.assertEqual(merged["result"][0]["record_type"], "Fastest 5K")
        self.assertEqual(merged["vo2max_trend_points"][0]["vo2max"], 50.5)
        self.assertEqual(merged["vo2max_trend_history"][0]["vo2max"], 50.5)
        self.assertEqual(merged["recent_runs"][0]["avg_heart_rate_bpm"], 161.0)

    def test_normalize_readiness_uses_sleep_data_for_raw_hrv(self) -> None:
        readiness = garmin_speed._normalize_readiness(
            {"sleepingQualifierSummary": {"value": "good"}},
            {"avgOvernightHrv": 62},
        )

        self.assertEqual(readiness["raw_hrv_ms"], 62)

    def test_speed_lookback_days_uses_environment_override(self) -> None:
        with patch.dict(os.environ, {"PERSONAL_TRAINER_GARMIN_SPEED_LOOKBACK_DAYS": "90"}, clear=False):
            self.assertEqual(garmin_speed._speed_lookback_days(), 90)

    def test_speed_lookback_days_falls_back_to_default(self) -> None:
        with patch.dict(os.environ, {"PERSONAL_TRAINER_GARMIN_SPEED_LOOKBACK_DAYS": "invalid"}, clear=False):
            self.assertEqual(garmin_speed._speed_lookback_days(), 30)


if __name__ == "__main__":
    import unittest

    unittest.main()
