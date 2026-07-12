from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase

from scripts import build_site_artifacts


class BuildSiteArtifactsTest(TestCase):
    def test_builds_all_site_artifacts_from_one_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot = tmp_path / "snapshot.json"
            site_dir = tmp_path / "site"
            output_dir = tmp_path / "dist"
            site_dir.mkdir()
            for name in (
                "index.html",
                "styles.css",
                "app.js",
                "data-helpers.js",
                "favicon.svg",
                "progress.html",
                "progress.js",
                "progress.css",
                "strength.html",
                "strength.css",
                "strength.js",
                "strength/index.html",
                "speed.html",
                "speed.css",
                "speed.js",
                "speed/index.html",
                "history.js",
                "goals.js",
            ):
                path = site_dir / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(name, encoding="utf-8")
            snapshot.write_text(
                json.dumps(
                    {
                        "snapshot_date": "2026-07-06",
                        "timezone": "Europe/Malta",
                        "athlete": {
                            "age": 28,
                            "height_cm": 188,
                            "body_weight_kg": 83.5,
                            "current_block": "hybrid_aggressive",
                            "current_vo2max_waypoint": 52,
                        },
                        "hevy": {
                            "freshness": "fresh",
                            "recent_workouts": [],
                            "recent_bests": [
                                {
                                    "name": "Squat",
                                    "best_set": {"weight_kg": 100, "reps": 5},
                                }
                            ],
                            "muscle_group_fatigue": {
                                "legs": "low",
                                "posterior_chain": "unknown",
                                "push": "unknown",
                                "pull": "unknown",
                                "shoulders_arms": "low",
                                "core": "unknown",
                            },
                            "strength_trend": "unknown",
                            "flags": [],
                        },
                        "garmin": {
                            "freshness": "fresh",
                            "current_vo2max": 51,
                            "vo2max_trend": "unknown",
                            "training_status": None,
                            "training_load_trend": None,
                            "readiness": {},
                            "recent_activities": [],
                            "recent_runs": [],
                            "last_quality_run": None,
                            "last_long_run": None,
                            "recent_bests": [
                                {"name": "Fastest 1K", "value": 216.9720001220703},
                                {"name": "Fastest Mile", "value": 383.03900146484375},
                                {"name": "Fastest 5K", "value": 1251.10400390625},
                                {"name": "Fastest 10K", "value": 2891.330078125},
                                {
                                    "name": "Fastest Half Marathon",
                                    "value": 6219.27685546875,
                                },
                                {"name": "Longest Run", "value": 21370.650390625},
                            ],
                            "flags": [],
                        },
                        "cronometer": {
                            "freshness": "fresh",
                            "today": {"log_completeness": "complete"},
                            "recent_days": [],
                            "fueling_status": "adequate",
                            "protein_status": "adequate",
                            "carb_availability": "adequate",
                            "flags": [],
                        },
                        "manual_context": {
                            "freshness": "fresh",
                            "sleep_quality": "good",
                            "soreness": [],
                            "pain": [],
                            "motivation": "normal",
                            "mental_fatigue": "low",
                            "table_tennis_today": "none",
                            "constraints": [],
                        },
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

            exit_code = build_site_artifacts.main(
                [
                    "--snapshot",
                    str(snapshot),
                    "--site-dir",
                    str(site_dir),
                    "--output-dir",
                    str(output_dir),
                ]
            )

            self.assertEqual(exit_code, 0)
            built_snapshot = json.loads((output_dir / "data" / "snapshot.json").read_text(encoding="utf-8"))
            self.assertEqual(built_snapshot["recommendation"]["Priority"], "aerobic_quality")
            self.assertTrue((output_dir / "raw.json").exists())
            self.assertTrue((output_dir / "progress.html").exists())
            self.assertTrue((output_dir / "progress.js").exists())
            self.assertTrue((output_dir / "strength.json").exists())
            self.assertFalse((output_dir / "sw.js").exists())
            built_speed = json.loads((output_dir / "speed.json").read_text(encoding="utf-8"))
            self.assertEqual(
                [entry["value"] for entry in built_speed["entries"]],
                ["3:36", "6:23", "20:51", "48:11", "1:43:39", "21.37 km"],
            )

    def test_rejects_invalid_snapshot_before_building_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot = tmp_path / "snapshot.json"
            site_dir = tmp_path / "site"
            output_dir = tmp_path / "dist"
            site_dir.mkdir()
            for name in ("index.html", "styles.css", "app.js"):
                path = site_dir / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(name, encoding="utf-8")
            snapshot.write_text(
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

            exit_code = build_site_artifacts.main(
                [
                    "--snapshot",
                    str(snapshot),
                    "--site-dir",
                    str(site_dir),
                    "--output-dir",
                    str(output_dir),
                ]
            )

            self.assertEqual(exit_code, 1)
            self.assertFalse((output_dir / "data" / "snapshot.json").exists())
