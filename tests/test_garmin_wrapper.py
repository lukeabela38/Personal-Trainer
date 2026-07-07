from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "wrappers"))

import fetch_garmin as garmin  # noqa: E402


def _client() -> MagicMock:
    client = MagicMock()
    client.garth = MagicMock()
    client.get_stats.return_value = {"vO2MaxValue": 52}
    client.get_vo2max_trend.return_value = [
        {"vo2Max": 50},
        {"vo2Max": 52},
    ]
    client.get_user_summary.return_value = {
        "sleepingQualifierSummary": {"value": 82},
        "heartRateVariabilitySummary": {"value": 61},
        "stressQualifierSummary": {"value": 24},
        "bodyBatteryChargedValue": 77,
    }
    client.get_activities.return_value = [
        {
            "activityId": 101,
            "activityName": "Recovery Run",
            "activityType": {"typeKey": "running"},
            "startTimeLocal": "2026-07-07 06:15:00",
            "distance": 7200,
            "duration": 2400,
        }
    ]
    client.get_activities_by_date.return_value = [
        {
            "activityName": "Tempo Session",
            "activityType": {"typeKey": "running"},
            "distance": 11200,
            "startTimeLocal": "2026-07-05 18:30:00",
            "duration": 3600,
        }
    ]
    client.get_training_load_trend.return_value = {"days_with_data": 7}
    client.get_personal_records.return_value = [
        {"record_type": "Fastest 5K", "value": "20:15", "date": "2026-07-01"}
    ]
    return client


class GarminWrapperTests(unittest.TestCase):
    def test_fetch_uses_cached_session_before_fresh_login(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp) / ".garminconnect"
            tokenstore.mkdir()
            client = _client()

            with (
                patch.dict(
                    os.environ,
                    {
                        "GARMIN_EMAIL": "runner@example.com",
                        "GARMIN_PASSWORD": "secret",
                        "GARMINTOKENS": str(tokenstore),
                    },
                    clear=False,
                ),
                patch.object(garmin, "Garmin", return_value=client),
            ):
                payload = garmin.fetch()

        client.login.assert_called_once_with(tokenstore=str(tokenstore))
        client.garth.dump.assert_not_called()
        self.assertEqual(payload["current_vo2max"], 52.0)
        self.assertEqual(payload["vo2max_trend"], "up")
        self.assertEqual(payload["recent_activities"][0]["name"], "Recovery Run")
        self.assertEqual(payload["recent_runs"][0]["activityName"], "Tempo Session")

    def test_fetch_saves_session_after_first_fresh_login(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp) / ".garminconnect"
            client = _client()
            client.garth.dump.side_effect = lambda path: Path(path).mkdir(parents=True, exist_ok=True)

            with (
                patch.dict(
                    os.environ,
                    {
                        "GARMIN_EMAIL": "runner@example.com",
                        "GARMIN_PASSWORD": "secret",
                        "GARMINTOKENS": str(tokenstore),
                    },
                    clear=False,
                ),
                patch.object(garmin, "Garmin", return_value=client),
            ):
                payload = garmin.fetch()

        client.login.assert_called_once_with()
        client.garth.dump.assert_called_once_with(str(tokenstore))
        self.assertEqual(payload["current_vo2max"], 52.0)


if __name__ == "__main__":
    unittest.main()
