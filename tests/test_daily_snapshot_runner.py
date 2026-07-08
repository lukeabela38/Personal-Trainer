from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

import scripts.daily_snapshot_runner as daily_snapshot_runner


class DailySnapshotRunnerTest(TestCase):
    def test_runs_the_full_pipeline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources_output = tmp_path / "live-sources.json"
            snapshot_output = tmp_path / "snapshot.json"
            site_output = tmp_path / "dist"

            with (
                patch.object(
                    daily_snapshot_runner,
                    "_capture_live_sources",
                    return_value={
                        "snapshot_date": "2026-07-06",
                        "timezone": "Europe/Malta",
                        "garmin": {"current_vo2max": 52, "recent_bests": []},
                        "hevy": {"recent_bests": []},
                        "cronometer": {"today": {}, "fueling_status": "adequate"},
                        "manual_context": {
                            "sleep_quality": "good",
                            "motivation": "normal",
                        },
                    },
                ),
                patch.object(
                    daily_snapshot_runner,
                    "build_daily_recommendation",
                    return_value={
                        "Priority": "aerobic_quality",
                        "Session": "threshold",
                        "Nutrition": "higher-carbohydrate day",
                        "Macros": {
                            "calories": 3094,
                            "protein_g": 184,
                            "carbs_g": 421,
                            "fat_g": 75,
                        },
                        "Reason": "testing",
                        "Guardrail": "testing",
                        "Confidence": "high",
                        "Needs check-in": "no",
                    },
                ),
                patch.object(
                    daily_snapshot_runner, "_build_site_artifacts"
                ) as build_site_artifacts,
                patch.object(
                    daily_snapshot_runner, "_build_history_artifacts"
                ) as build_history_artifacts,
            ):
                exit_code = daily_snapshot_runner.main(
                    [
                        "--sources-output",
                        str(sources_output),
                        "--snapshot-output",
                        str(snapshot_output),
                        "--site-output",
                        str(site_output),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertTrue(sources_output.exists())
            self.assertTrue(snapshot_output.exists())
            build_site_artifacts.assert_called_once()
            build_history_artifacts.assert_called_once_with(site_output)

            saved_sources = json.loads(sources_output.read_text(encoding="utf-8"))
            saved_snapshot = json.loads(snapshot_output.read_text(encoding="utf-8"))
            self.assertEqual(saved_sources["garmin"]["current_vo2max"], 52)
            self.assertEqual(saved_snapshot["garmin"]["current_vo2max"], 52)
            self.assertEqual(saved_snapshot["recommendation"]["Priority"], "aerobic_quality")
