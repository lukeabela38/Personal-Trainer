from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts import speed_report  # noqa: E402


class SpeedReportTests(TestCase):
    def test_extract_records_prefers_same_day_distance_match_over_wrong_activity_id(self) -> None:
        raw = {
            "recent_bests": [
                {
                    "record_type": "Fastest 5K",
                    "value": 1250,
                    "date": "2026-06-15",
                    "activityId": 202,
                },
                {
                    "record_type": "Fastest Mile",
                    "value": 360,
                    "date": "2026-06-15",
                    "activityId": 101,
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
                "pace": "4:10 /km",
            },
            {
                "activity_id": 202,
                "name": "Mile race",
                "date": "2026-06-15",
                "distance_m": 1609.344,
                "duration_s": 360.0,
                "pace": "5:56 /km",
            },
        ]

        records = speed_report._extract_records(raw, recent_runs)
        by_name = {record["name"]: record for record in records}

        self.assertEqual(by_name["Fastest 5K"]["context"]["source_run_name"], "5K tempo")
        self.assertEqual(by_name["Fastest Mile"]["context"]["source_run_name"], "Mile race")

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


if __name__ == "__main__":
    import unittest

    unittest.main()
