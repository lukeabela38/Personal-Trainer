from __future__ import annotations

import json
import tempfile
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from unittest import TestCase
from unittest.mock import ANY, patch

import scripts.daily_snapshot_runner as daily_snapshot_runner


class DailySnapshotRunnerTest(TestCase):
    def test_runs_the_full_pipeline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources_output = tmp_path / "live-sources.json"
            snapshot_output = tmp_path / "snapshot.json"
            site_output = tmp_path / "dist"
            deploy_log_output = tmp_path / "deploy-log.txt"

            with (
                patch.object(
                    daily_snapshot_runner,
                    "_capture_live_sources",
                    return_value={
                        "snapshot_date": "2026-07-06",
                        "timezone": "Europe/Malta",
                        "garmin": {
                            "current_vo2max": 52,
                            "recent_activities": [{"name": "Run"}],
                            "recent_bests": [],
                            "readiness": {"body_battery": 70},
                        },
                        "hevy": {
                            "recent_workouts": [{"title": "Upper"}],
                            "last_workout": {"title": "Upper"},
                            "recent_bests": [],
                        },
                        "cronometer": {
                            "today": {"calories_consumed": 2100},
                            "recent_days": [{"date": "2026-07-05", "calories_consumed": 2100}],
                            "fueling_status": "adequate",
                        },
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
                patch.object(daily_snapshot_runner, "_build_site_artifacts") as build_site_artifacts,
                patch.object(daily_snapshot_runner, "_build_history_artifacts") as build_history_artifacts,
            ):
                exit_code = daily_snapshot_runner.main(
                    [
                        "--sources-output",
                        str(sources_output),
                        "--snapshot-output",
                        str(snapshot_output),
                        "--site-output",
                        str(site_output),
                        "--deploy-log-output",
                        str(deploy_log_output),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertTrue(sources_output.exists())
            self.assertTrue(snapshot_output.exists())
            self.assertTrue(deploy_log_output.exists())
            build_site_artifacts.assert_called_once()
            build_history_artifacts.assert_called_once_with(site_output, ANY)

            saved_sources = json.loads(sources_output.read_text(encoding="utf-8"))
            saved_snapshot = json.loads(snapshot_output.read_text(encoding="utf-8"))
            deploy_log = deploy_log_output.read_text(encoding="utf-8")
            self.assertEqual(saved_sources["garmin"]["current_vo2max"], 52)
            self.assertEqual(saved_snapshot["garmin"]["current_vo2max"], 52)
            self.assertEqual(saved_snapshot["recommendation"]["Priority"], "aerobic_quality")
            self.assertIn("status: succeeded", deploy_log)
            self.assertIn("wrote_snapshot:", deploy_log)

    def test_requires_live_coverage_before_publishing_pages_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            sources_output = tmp_path / "live-sources.json"
            snapshot_output = tmp_path / "snapshot.json"
            site_output = tmp_path / "dist"
            deploy_log_output = tmp_path / "deploy-log.txt"
            stderr = StringIO()

            with (
                patch.object(
                    daily_snapshot_runner,
                    "_capture_live_sources",
                    return_value={
                        "snapshot_date": "2026-07-06",
                        "timezone": "Europe/Malta",
                        "garmin": {
                            "current_vo2max": None,
                            "recent_activities": [],
                            "recent_runs": [],
                            "recent_bests": [],
                            "readiness": {},
                        },
                        "hevy": {"recent_workouts": [], "last_workout": None, "recent_bests": []},
                        "cronometer": {
                            "today": {},
                            "recent_days": [],
                            "fueling_status": "unknown",
                            "protein_status": "unknown",
                            "carb_availability": "unknown",
                        },
                        "manual_context": {
                            "sleep_quality": "good",
                            "motivation": "normal",
                        },
                    },
                ),
                patch.object(daily_snapshot_runner, "build_daily_recommendation") as build_recommendation,
                patch.object(daily_snapshot_runner, "_build_site_artifacts") as build_site_artifacts,
                patch.object(daily_snapshot_runner, "_build_history_artifacts") as build_history_artifacts,
                redirect_stderr(stderr),
            ):
                exit_code = daily_snapshot_runner.main(
                    [
                        "--sources-output",
                        str(sources_output),
                        "--snapshot-output",
                        str(snapshot_output),
                        "--site-output",
                        str(site_output),
                        "--deploy-log-output",
                        str(deploy_log_output),
                        "--require-garmin-vo2max",
                    ]
                )

            self.assertEqual(exit_code, 1)
            self.assertIn("live snapshot missing coverage for", stderr.getvalue())
            self.assertFalse(sources_output.exists())
            self.assertFalse(snapshot_output.exists())
            self.assertTrue(deploy_log_output.exists())
            self.assertIn("status: failed", deploy_log_output.read_text(encoding="utf-8"))
            build_recommendation.assert_not_called()
            build_site_artifacts.assert_not_called()
            build_history_artifacts.assert_not_called()

    def test_skips_optional_history_reports_when_commands_are_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            site_output = tmp_path / "dist"

            with (
                patch.dict(daily_snapshot_runner.os.environ, {}, clear=True),
                patch.object(daily_snapshot_runner.subprocess, "run") as run,
            ):
                daily_snapshot_runner._build_history_artifacts(site_output)

            self.assertFalse(run.called)
            self.assertFalse((site_output / "strength.json").exists())
            self.assertFalse((site_output / "speed.json").exists())

    def test_skips_optional_history_reports_when_commands_fail(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            site_output = tmp_path / "dist"
            stderr = StringIO()

            with (
                patch.dict(
                    daily_snapshot_runner.os.environ,
                    {"PERSONAL_TRAINER_GARMIN_SPEED_COMMAND": "python3 -c 'raise SystemExit(1)'"},
                    clear=True,
                ),
                patch.object(
                    daily_snapshot_runner.subprocess,
                    "run",
                    side_effect=daily_snapshot_runner.subprocess.CalledProcessError(
                        returncode=1,
                        cmd=[
                            "python3",
                            "scripts/speed_report.py",
                            "--output",
                            str(site_output / "speed.json"),
                        ],
                    ),
                ) as run,
                redirect_stderr(stderr),
            ):
                daily_snapshot_runner._run_optional_history_report(
                    env_var="PERSONAL_TRAINER_GARMIN_SPEED_COMMAND",
                    script="speed_report.py",
                    output_path=site_output / "speed.json",
                )

            self.assertTrue(run.called)
            self.assertIn("Skipping speed_report.py", stderr.getvalue())
