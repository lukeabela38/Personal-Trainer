from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from personal_trainer import cli


class CliTests(unittest.TestCase):
    def test_rejects_invalid_snapshot_before_recommendation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            snapshot_path = Path(tmp) / "snapshot.json"
            snapshot_path.write_text(
                json.dumps(
                    {
                        "snapshot_date": "2026-07-06",
                        "timezone": "Europe/Malta",
                        "athlete": {
                            "age": 28,
                            "height_cm": 188,
                            "body_weight_kg": 83.5,
                            "current_block": "not-a-real-block",
                            "current_vo2max_waypoint": 52,
                        },
                        "garmin": {},
                        "hevy": {},
                        "cronometer": {},
                        "manual_context": {},
                        "derived": {
                            "data_quality": "high",
                            "hard_session_allowed": "yes",
                            "primary_constraints": [],
                            "likely_conflicts": [],
                            "check_in_required": False,
                            "check_in_questions": [],
                        },
                    }
                ),
                encoding="utf-8",
            )

            with patch("sys.stderr.write") as stderr_write:
                exit_code = cli.main([str(snapshot_path)])

        self.assertEqual(exit_code, 1)
        self.assertTrue(stderr_write.called)


if __name__ == "__main__":
    unittest.main()
