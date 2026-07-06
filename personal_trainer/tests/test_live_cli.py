from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from personal_trainer import live_cli


class LiveCliTests(unittest.TestCase):
    def test_main_builds_snapshot_and_recommendation_from_export_file(self) -> None:
        export = {
            "garmin": {"freshness": "fresh", "current_vo2max": 51, "flags": []},
            "hevy": {
                "freshness": "fresh",
                "strength_trend": "unknown",
                "muscle_group_fatigue": {"legs": "low", "shoulders_arms": "low"},
                "flags": [],
            },
            "cronometer": {
                "freshness": "fresh",
                "fueling_status": "adequate",
                "protein_status": "adequate",
                "carb_availability": "adequate",
                "today": {"log_completeness": "complete"},
                "flags": [],
            },
            "manual_context": {
                "freshness": "fresh",
                "sleep_quality": "good",
                "pain": [],
                "motivation": "normal",
                "mental_fatigue": "low",
                "table_tennis_today": "none",
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            export_path = Path(tmpdir) / "sources.json"
            export_path.write_text(json.dumps(export), encoding="utf-8")
            previous = os.environ.get("PERSONAL_TRAINER_SOURCES_FILE")
            os.environ["PERSONAL_TRAINER_SOURCES_FILE"] = str(export_path)
            try:
                exit_code = live_cli.main([])
            finally:
                if previous is None:
                    os.environ.pop("PERSONAL_TRAINER_SOURCES_FILE", None)
                else:
                    os.environ["PERSONAL_TRAINER_SOURCES_FILE"] = previous

        self.assertEqual(exit_code, 0)

    def test_main_builds_snapshot_and_recommendation_from_command(self) -> None:
        export = {
            "garmin": {"freshness": "fresh", "current_vo2max": 51, "flags": []},
            "hevy": {
                "freshness": "fresh",
                "strength_trend": "unknown",
                "muscle_group_fatigue": {"legs": "low", "shoulders_arms": "low"},
                "flags": [],
            },
            "cronometer": {
                "freshness": "fresh",
                "fueling_status": "adequate",
                "protein_status": "adequate",
                "carb_availability": "adequate",
                "today": {"log_completeness": "complete"},
                "flags": [],
            },
            "manual_context": {
                "freshness": "fresh",
                "sleep_quality": "good",
                "pain": [],
                "motivation": "normal",
                "mental_fatigue": "low",
                "table_tennis_today": "none",
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            command_path = Path(tmpdir) / "emit_sources.py"
            export_json = json.dumps(export)
            command_path.write_text(
                f"import json\nprint(json.dumps({export_json}))\n",
                encoding="utf-8",
            )
            previous_file = os.environ.get("PERSONAL_TRAINER_SOURCES_FILE")
            previous_command = os.environ.get("PERSONAL_TRAINER_SOURCES_COMMAND")
            os.environ.pop("PERSONAL_TRAINER_SOURCES_FILE", None)
            os.environ["PERSONAL_TRAINER_SOURCES_COMMAND"] = f"python3 {command_path}"
            try:
                exit_code = live_cli.main([])
            finally:
                if previous_file is None:
                    os.environ.pop("PERSONAL_TRAINER_SOURCES_FILE", None)
                else:
                    os.environ["PERSONAL_TRAINER_SOURCES_FILE"] = previous_file
                if previous_command is None:
                    os.environ.pop("PERSONAL_TRAINER_SOURCES_COMMAND", None)
                else:
                    os.environ["PERSONAL_TRAINER_SOURCES_COMMAND"] = previous_command

        self.assertEqual(exit_code, 0)


if __name__ == "__main__":
    unittest.main()
