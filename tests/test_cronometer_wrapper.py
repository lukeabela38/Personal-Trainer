from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "wrappers"))

import fetch_cronometer as cronometer  # noqa: E402


def _diary_payload() -> dict:
    return {
        "summary": {
            "macros": {
                "energy": 2000,
                "protein": 120,
                "carbs": 250,
                "fat": 70,
                "fiber": 30,
            },
            "consumed": {"total": 1500},
        }
    }


class CronometerWrapperTests(unittest.TestCase):
    def test_fetch_uses_cached_session_before_login(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_file = Path(tmp) / "session.json"
            session_file.write_text(
                json.dumps({"userId": 12, "sessionKey": "cached-token"}),
                encoding="utf-8",
            )
            with (
                patch.dict(os.environ, {"CRONOMETER_SESSION_FILE": str(session_file)}, clear=False),
                patch.object(cronometer, "_login") as login,
                patch.object(cronometer, "_post", return_value=_diary_payload()) as post,
            ):
                payload = cronometer.fetch()

        login.assert_not_called()
        post.assert_called_once()
        self.assertEqual(post.call_args.args[:3], (12, "cached-token", "/get_diary"))
        self.assertEqual(set(post.call_args.args[3].keys()), {"day"})
        self.assertRegex(post.call_args.args[3]["day"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertEqual(payload["today"]["calories_consumed"], 1500.0)
        self.assertEqual(payload["today"]["calories_target"], 2000.0)
        self.assertEqual(payload["fueling_status"], "adequate")

    def test_fetch_refreshes_expired_session_and_updates_cache(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_file = Path(tmp) / "session.json"
            session_file.write_text(
                json.dumps({"userId": 12, "sessionKey": "expired-token"}),
                encoding="utf-8",
            )

            calls: list[tuple[int, str, str, dict]] = []

            def fake_post(user_id: int, token: str, path: str, payload: dict) -> dict:
                calls.append((user_id, token, path, payload))
                if len(calls) == 1:
                    raise cronometer.CronometerAPIError(401, path, "expired")
                return _diary_payload()

            with (
                patch.dict(os.environ, {"CRONOMETER_SESSION_FILE": str(session_file)}, clear=False),
                patch.object(cronometer, "_login", return_value=(99, "fresh-token")) as login,
                patch.object(cronometer, "_post", side_effect=fake_post),
            ):
                payload = cronometer.fetch()

            login.assert_called_once()
            self.assertEqual(calls[0][:2], (12, "expired-token"))
            self.assertEqual(calls[1][:2], (99, "fresh-token"))
            self.assertEqual(
                json.loads(session_file.read_text(encoding="utf-8")),
                {"userId": 99, "sessionKey": "fresh-token"},
            )
            self.assertEqual(payload["today"]["calories_consumed"], 1500.0)
            self.assertEqual(payload["fueling_status"], "adequate")


if __name__ == "__main__":
    unittest.main()
