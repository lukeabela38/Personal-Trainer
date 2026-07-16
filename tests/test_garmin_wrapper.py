from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "wrappers"))

import fetch_garmin as garmin  # noqa: E402


class _FakeGarth:
    def __init__(self) -> None:
        self.dump_calls: list[str] = []

    def dump(self, dir_path: str) -> None:
        self.dump_calls.append(dir_path)
        path = Path(dir_path)
        path.mkdir(parents=True, exist_ok=True)
        (path / "oauth1_token.json").write_text(json.dumps({"token": "oauth1"}), encoding="utf-8")
        (path / "oauth2_token.json").write_text(json.dumps({"token": "oauth2"}), encoding="utf-8")


class _AuthError(Exception):
    def __init__(self, status_code: int) -> None:
        super().__init__(f"status_code={status_code}")
        self.response = type("Response", (), {"status_code": status_code})()


class _FakeGarmin:
    instances: list[_FakeGarmin] = []

    def __init__(self, email: str | None = None, password: str | None = None) -> None:
        self.email = email
        self.password = password
        self.login_calls: list[str | None] = []
        self.garth = _FakeGarth()
        self.__class__.instances.append(self)

    def login(self, tokenstore: str | None = None) -> bool:
        self.login_calls.append(tokenstore)
        return True

    def get_stats(self, today: str) -> dict:
        return {"vO2MaxValue": 52}

    def get_vo2max_trend(self, month_ago: str, today: str) -> list[dict]:
        return [{"vo2MaxValue": 50}, {"vo2MaxValue": 52}]

    def get_user_summary(self, today: str) -> dict:
        return {
            "sleepingQualifierSummary": {"value": "good"},
            "stressQualifierSummary": {"value": "low"},
            "bodyBatteryChargedValue": 73,
            "restingHeartRate": 46,
            "lastSevenDaysAvgRestingHeartRate": 47,
        }

    def get_sleep_data(self, today: str) -> dict:
        return {
            "avgOvernightHrv": 62,
            "sleepScores": {"overall": {"value": 83}},
            "restingHeartRate": 46,
        }

    def get_activities(self, start: int, limit: int) -> list[dict]:
        return [
            {
                "activityId": 1,
                "activityName": "Easy run",
                "activityType": {"typeKey": "running"},
                "startTimeLocal": "2026-07-07T06:00:00",
                "distance": 10000,
                "duration": 3600,
            }
        ]

    def get_activities_by_date(self, month_ago: str, today: str, sport: str) -> list[dict]:
        return [
            {
                "activityName": "Threshold run",
                "activityType": {"typeKey": "running"},
                "distance": 16000,
                "startTimeLocal": "2026-07-06T06:00:00",
                "duration": 5400,
                "vO2MaxValue": 52,
                "averageHR": 164,
            },
            {
                "activityName": "Easy run",
                "activityType": {"typeKey": "running"},
                "distance": 10000,
                "startTimeLocal": "2026-07-05T06:00:00",
                "duration": 3600,
                "vO2MaxValue": 50,
                "averageHeartRate": 148,
            },
        ]

    def get_training_load_trend(self, month_ago: str, today: str) -> dict:
        return {"days_with_data": 21}

    def get_personal_record(self) -> list[dict]:
        return [{"record_type": "Fastest 5K", "value": "20:15", "date": "2026-07-01"}]


class GarminWrapperTests(TestCase):
    def setUp(self) -> None:
        _FakeGarmin.instances.clear()

    def test_prefers_cached_tokenstore_before_password_login(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp)
            (tokenstore / "oauth1_token.json").write_text("{}", encoding="utf-8")
            (tokenstore / "oauth2_token.json").write_text("{}", encoding="utf-8")

            with (
                patch.object(garmin, "Garmin", _FakeGarmin),
                patch.dict(
                    os.environ,
                    {
                        "GARMINTOKENS": str(tokenstore),
                        "GARMIN_EMAIL": "person@example.com",
                        "GARMIN_PASSWORD": "secret",
                    },
                    clear=False,
                ),
            ):
                payload = garmin.fetch()

        self.assertEqual(len(_FakeGarmin.instances), 1)
        client = _FakeGarmin.instances[0]
        self.assertEqual(client.email, None)
        self.assertEqual(client.password, None)
        self.assertEqual(client.login_calls, [str(tokenstore)])
        self.assertEqual(client.garth.dump_calls, [])
        self.assertEqual(payload["current_vo2max"], 52.0)
        self.assertEqual(payload["vo2max_trend"], "up")
        self.assertEqual(payload["training_load_trend"], "21")
        self.assertEqual(payload["readiness"]["resting_heart_rate_bpm"], 46.0)
        self.assertEqual(payload["readiness"]["raw_hrv_ms"], 62.0)
        self.assertEqual(payload["recent_bests"][0]["record_type"], "Fastest 5K")
        self.assertEqual(payload["recent_runs"][0]["avg_heart_rate_bpm"], 164.0)
        self.assertEqual(payload["vo2max_trend_points"][0]["vo2max"], 50.0)
        self.assertEqual(payload["vo2max_trend_history"][0]["vo2max"], 50.0)

    def test_password_login_persists_session_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp) / "garmin-cache"

            with (
                patch.object(garmin, "Garmin", _FakeGarmin),
                patch.dict(
                    os.environ,
                    {
                        "GARMINTOKENS": str(tokenstore),
                        "GARMIN_EMAIL": "person@example.com",
                        "GARMIN_PASSWORD": "secret",
                    },
                    clear=False,
                ),
            ):
                payload = garmin.fetch()

        self.assertEqual(len(_FakeGarmin.instances), 1)
        client = _FakeGarmin.instances[0]
        self.assertEqual(client.email, "person@example.com")
        self.assertEqual(client.password, "secret")
        self.assertEqual(client.login_calls, [None])
        self.assertEqual(client.garth.dump_calls, [str(tokenstore)])
        self.assertEqual(payload["current_vo2max"], 52.0)

    def test_empty_fallback_logs_payload_summary(self) -> None:
        with (
            patch.object(garmin, "_log_payload_summary") as log_payload_summary,
            patch.dict(
                os.environ,
                {
                    "GARMIN_EMAIL": "",
                    "GARMIN_PASSWORD": "",
                    "GC_EMAIL": "",
                    "GC_PASSWORD": "",
                },
                clear=False,
            ),
        ):
            payload = garmin.fetch()

        log_payload_summary.assert_called_once_with("empty", payload)
        self.assertEqual(payload["recent_runs"], [])
        self.assertEqual(payload["recent_bests"], [])

    def test_cached_401_clears_tokenstore_before_password_retry(self) -> None:
        class StaleTokenstoreGarmin(_FakeGarmin):
            def login(self, tokenstore: str | None = None) -> bool:
                self.login_calls.append(tokenstore)
                if tokenstore is not None:
                    raise _AuthError(401)
                return True

            def get_stats(self, today: str) -> dict:
                return {"vO2MaxValue": 52}

        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp) / "garmin-cache"
            tokenstore.mkdir(parents=True, exist_ok=True)
            (tokenstore / "oauth1_token.json").write_text("{}", encoding="utf-8")
            (tokenstore / "oauth2_token.json").write_text("{}", encoding="utf-8")

            with (
                patch.object(garmin, "Garmin", StaleTokenstoreGarmin),
                patch.dict(
                    os.environ,
                    {
                        "GARMINTOKENS": str(tokenstore),
                        "GARMIN_EMAIL": "person@example.com",
                        "GARMIN_PASSWORD": "secret",
                    },
                    clear=False,
                ),
            ):
                payload = garmin.fetch()

            self.assertEqual(len(_FakeGarmin.instances), 2)
            self.assertEqual(_FakeGarmin.instances[0].login_calls, [str(tokenstore)])
            self.assertEqual(_FakeGarmin.instances[1].login_calls, [None])
            self.assertTrue(tokenstore.exists())
            self.assertTrue((tokenstore / "oauth1_token.json").exists())
            self.assertTrue((tokenstore / "oauth2_token.json").exists())
            self.assertEqual(payload["current_vo2max"], 52.0)

    def test_uses_recent_runs_for_vo2max_when_summary_is_missing(self) -> None:
        class MissingSummaryGarmin(_FakeGarmin):
            def get_stats(self, today: str) -> dict:
                return {}

            def get_vo2max_trend(self, month_ago: str, today: str) -> list[dict]:
                return []

        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp) / "garmin-cache"

            with (
                patch.object(garmin, "Garmin", MissingSummaryGarmin),
                patch.dict(
                    os.environ,
                    {
                        "GARMINTOKENS": str(tokenstore),
                        "GARMIN_EMAIL": "person@example.com",
                        "GARMIN_PASSWORD": "secret",
                    },
                    clear=False,
                ),
            ):
                payload = garmin.fetch()

        self.assertEqual(payload["current_vo2max"], 52.0)
        self.assertEqual(payload["vo2max_trend"], "up")
        self.assertEqual(payload["recent_runs"][0]["avg_heart_rate_bpm"], 164.0)
        self.assertEqual(payload["vo2max_trend_history"][0]["vo2max"], 52.0)

    def test_prefers_most_recent_run_vo2max_over_summary_value(self) -> None:
        class SummaryLagGarmin(_FakeGarmin):
            def get_stats(self, today: str) -> dict:
                return {"vO2MaxValue": 51}

        with tempfile.TemporaryDirectory() as tmp:
            tokenstore = Path(tmp) / "garmin-cache"

            with (
                patch.object(garmin, "Garmin", SummaryLagGarmin),
                patch.dict(
                    os.environ,
                    {
                        "GARMINTOKENS": str(tokenstore),
                        "GARMIN_EMAIL": "person@example.com",
                        "GARMIN_PASSWORD": "secret",
                    },
                    clear=False,
                ),
            ):
                payload = garmin.fetch()

        self.assertEqual(payload["current_vo2max"], 52.0)
        self.assertEqual(payload["vo2max_trend"], "up")
        self.assertEqual(payload["vo2max_trend_points"][0]["vo2max"], 50.0)
        self.assertEqual(payload["recent_runs"][0]["avg_heart_rate_bpm"], 164.0)
        self.assertEqual(payload["vo2max_trend_history"][0]["vo2max"], 50.0)


if __name__ == "__main__":
    import unittest

    unittest.main()
