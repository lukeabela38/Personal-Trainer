from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from unittest import TestCase

from scripts import build_site_artifacts

REPO_ROOT = Path(__file__).resolve().parents[1]


class BuildSiteArtifactsTest(TestCase):
    def _write_site_shell(self, site_dir: Path) -> None:
        for name in (
            "index.html",
            "styles.css",
            "app.js",
            "barcode-scanner.js",
            "manifest.webmanifest",
            "food.html",
            "food.js",
            "food/index.html",
            "data-helpers.js",
            "favicon.png",
            "progress.html",
            "progress.js",
            "progress.css",
            "strength.html",
            "strength.css",
            "strength.js",
            "progression.js",
            "hevy-live.js",
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
        catalog_src = REPO_ROOT / "site" / "history" / "exercises" / "index.json"
        catalog_dst = site_dir / "history" / "exercises" / "index.json"
        catalog_dst.parent.mkdir(parents=True, exist_ok=True)
        catalog_dst.write_text(catalog_src.read_text(encoding="utf-8"), encoding="utf-8")
        assets_src = REPO_ROOT / "site" / "assets"
        assets_dst = site_dir / "assets"
        if assets_src.exists():
            for source in assets_src.rglob("*"):
                if not source.is_file():
                    continue
                destination = assets_dst / source.relative_to(assets_src)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
        for name in (
            "history/index.json",
            "history/2026-07-02.json",
            "history/exercises/_gains.json",
        ):
            path = site_dir / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name, encoding="utf-8")

    def _write_snapshot(self, snapshot: Path, payload: dict[str, object]) -> None:
        snapshot.write_text(json.dumps(payload), encoding="utf-8")

    def test_builds_all_site_artifacts_from_one_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot = tmp_path / "snapshot.json"
            site_dir = tmp_path / "site"
            output_dir = tmp_path / "dist"
            site_dir.mkdir()
            self._write_site_shell(site_dir)
            self._write_snapshot(
                snapshot,
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
                        "recent_workouts": [
                            {
                                "title": "Leg Day",
                                "start_time": "2026-07-05T07:00:00Z",
                                "end_time": "2026-07-05T08:00:00Z",
                                "exercises": [
                                    {
                                        "exercise_template_id": "D04AC939",
                                        "name": "Squat (Barbell)",
                                        "sets": [
                                            {"weight_kg": 100, "reps": 5},
                                            {"weight_kg": 102.5, "reps": 4},
                                        ],
                                    }
                                ],
                            }
                        ],
                        "recent_bests": [
                            {
                                "exercise_template_id": "D04AC939",
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
                        "vo2max_trend_points": [
                            {"date": "2026-07-01", "vo2max": 50.5},
                            {"date": "2026-07-05", "vo2max": 51.0},
                        ],
                        "training_status": None,
                        "training_load_trend": None,
                        "readiness": {
                            "sleep_score": 83,
                            "resting_heart_rate_bpm": 46,
                            "raw_hrv_ms": 61,
                            "stress": "low",
                            "body_battery": 61,
                        },
                        "recent_activities": [],
                        "recent_runs": [
                            {
                                "activityId": 101,
                                "activityName": "Tempo Run",
                                "startTimeLocal": "2026-07-06 07:00:00",
                                "distance": 10000,
                                "duration": 3600,
                            }
                        ],
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
                },
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
            self.assertTrue((output_dir / "manifest.webmanifest").exists())
            self.assertTrue((output_dir / "favicon.png").exists())
            self.assertTrue((output_dir / "progress.html").exists())
            self.assertTrue((output_dir / "progress.js").exists())
            self.assertTrue((output_dir / "food.html").exists())
            self.assertTrue((output_dir / "food.js").exists())
            self.assertTrue((output_dir / "food/index.html").exists())
            self.assertTrue((output_dir / "assets" / "strength-heatmap.svg").exists())
            self.assertTrue((output_dir / "strength.json").exists())
            self.assertTrue((output_dir / "history/index.json").exists())
            self.assertTrue((output_dir / "history/exercises/index.json").exists())
            self.assertTrue((output_dir / "history/exercises/_gains.json").exists())
            self.assertFalse((output_dir / "sw.js").exists())
            self.assertEqual(built_snapshot["derived"]["page_states"]["food"]["kind"], "fresh")
            self.assertEqual(built_snapshot["derived"]["page_states"]["strength"]["kind"], "fresh")
            self.assertEqual(built_snapshot["derived"]["page_states"]["speed"]["kind"], "fresh")
            built_strength = json.loads((output_dir / "strength.json").read_text(encoding="utf-8"))
            self.assertEqual(built_strength["page_state"]["kind"], "fresh")
            self.assertEqual(len(built_strength["recent_workouts"]), 1)
            self.assertEqual(built_strength["entries"][0]["name"], "Squat (Barbell)")
            self.assertEqual(built_strength["entries"][0]["category"], "Lower body")
            self.assertEqual(built_strength["entries"][0]["templateId"], "D04AC939")
            built_speed = json.loads((output_dir / "speed.json").read_text(encoding="utf-8"))
            self.assertEqual(built_speed["page_state"]["kind"], "fresh")
            self.assertEqual(built_speed["source_mode"], "example")
            self.assertEqual(built_speed["current_vo2max"], 51)
            self.assertEqual(built_speed["vo2max_trend"], "unknown")
            self.assertEqual(built_speed["readiness"]["sleep_score"], 83)
            self.assertEqual(built_speed["readiness"]["resting_heart_rate_bpm"], 46)
            self.assertEqual(built_speed["readiness"]["raw_hrv_ms"], 61)
            self.assertEqual(built_speed["vo2max_trend_points"][0]["vo2max"], 50.5)
            self.assertEqual(
                [entry["value"] for entry in built_speed["entries"]],
                ["3:36", "6:23", "20:51", "48:11", "1:43:39", "21.37 km"],
            )
            self.assertEqual(len(built_speed["recent_runs"]), 1)
            self.assertEqual(built_speed["recent_runs"][0]["distance"], "10.00 km")
            self.assertEqual(len(built_speed["predictions"]), 6)
            self.assertFalse(built_speed["prediction_summary"]["stale"])
            self.assertEqual(built_speed["prediction_summary"]["useful_run_count"], 1)

    def test_marks_page_states_missing_when_sources_are_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot = tmp_path / "snapshot.json"
            site_dir = tmp_path / "site"
            output_dir = tmp_path / "dist"
            site_dir.mkdir()
            self._write_site_shell(site_dir)
            self._write_snapshot(
                snapshot,
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
                        "freshness": "missing",
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
                        "freshness": "missing",
                        "current_vo2max": None,
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
                        ],
                        "flags": [],
                    },
                    "cronometer": {
                        "freshness": "missing",
                        "today": {"log_completeness": "incomplete"},
                        "recent_days": [],
                        "fueling_status": "unknown",
                        "protein_status": "unknown",
                        "carb_availability": "unknown",
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
                        "data_quality": "low",
                        "hard_session_allowed": "no",
                        "primary_constraints": [],
                        "likely_conflicts": [],
                        "check_in_required": True,
                        "check_in_questions": [],
                    },
                },
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
            self.assertEqual(built_snapshot["derived"]["page_states"]["food"]["kind"], "missing")
            self.assertEqual(built_snapshot["derived"]["page_states"]["strength"]["kind"], "missing")
            self.assertEqual(built_snapshot["derived"]["page_states"]["speed"]["kind"], "missing")
            built_strength = json.loads((output_dir / "strength.json").read_text(encoding="utf-8"))
            self.assertEqual(built_strength["page_state"]["kind"], "missing")
            built_speed = json.loads((output_dir / "speed.json").read_text(encoding="utf-8"))
            self.assertEqual(built_speed["page_state"]["kind"], "missing")

    def test_derives_page_states_from_source_freshness_matrix(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot = tmp_path / "snapshot.json"
            site_dir = tmp_path / "site"
            output_dir = tmp_path / "dist"
            site_dir.mkdir()
            self._write_site_shell(site_dir)

            cases = [
                (
                    "fresh",
                    {
                        "freshness": "fresh",
                        "recent_bests": [{"name": "Macro", "value": 1}],
                        "today": {"log_completeness": "complete"},
                    },
                    {
                        "freshness": "fresh",
                        "recent_bests": [{"name": "Strength", "best_set": {"weight_kg": 1}}],
                    },
                    {
                        "freshness": "fresh",
                        "recent_bests": [{"name": "Run", "value": 1}],
                    },
                    {"food": "fresh", "strength": "fresh", "speed": "fresh"},
                ),
                (
                    "stale",
                    {
                        "freshness": "stale",
                        "recent_bests": [{"name": "Macro", "value": 1}],
                        "today": {"log_completeness": "incomplete"},
                    },
                    {
                        "freshness": "partial",
                        "recent_bests": [{"name": "Strength", "best_set": {"weight_kg": 1}}],
                    },
                    {
                        "freshness": "stale",
                        "recent_bests": [{"name": "Run", "value": 1}],
                    },
                    {"food": "stale", "strength": "stale", "speed": "stale"},
                ),
                (
                    "missing",
                    {"freshness": "missing", "today": {"log_completeness": "incomplete"}},
                    {"freshness": "missing"},
                    {"freshness": "missing"},
                    {"food": "missing", "strength": "missing", "speed": "missing"},
                ),
            ]

            for case_name, cronometer, hevy, garmin, expected in cases:
                with self.subTest(case=case_name):
                    self._write_snapshot(
                        snapshot,
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
                                "recent_workouts": [],
                                "recent_bests": [],
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
                                **hevy,
                            },
                            "garmin": {
                                "current_vo2max": None,
                                "vo2max_trend": "unknown",
                                "training_status": None,
                                "training_load_trend": None,
                                "readiness": {},
                                "recent_activities": [],
                                "recent_runs": [],
                                "last_quality_run": None,
                                "last_long_run": None,
                                "recent_bests": [],
                                "flags": [],
                                **garmin,
                            },
                            "cronometer": {
                                "recent_days": [],
                                "fueling_status": "unknown",
                                "protein_status": "unknown",
                                "carb_availability": "unknown",
                                "flags": [],
                                **cronometer,
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
                                "data_quality": "medium",
                                "hard_session_allowed": "yes",
                                "primary_constraints": [],
                                "likely_conflicts": [],
                                "check_in_required": False,
                                "check_in_questions": [],
                            },
                        },
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
                    self.assertEqual(built_snapshot["derived"]["page_states"]["food"]["kind"], expected["food"])
                    self.assertEqual(
                        built_snapshot["derived"]["page_states"]["strength"]["kind"],
                        expected["strength"],
                    )
                    self.assertEqual(built_snapshot["derived"]["page_states"]["speed"]["kind"], expected["speed"])

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
