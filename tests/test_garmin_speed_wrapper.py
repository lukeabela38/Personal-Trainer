from __future__ import annotations

import sys
from pathlib import Path
from unittest import TestCase

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


if __name__ == "__main__":
    import unittest

    unittest.main()
