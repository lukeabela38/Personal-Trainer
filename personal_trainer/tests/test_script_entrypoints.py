from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "personal_trainer" / "src"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "wrappers"))

import fetch_hevy  # noqa: E402
import fetch_hevy_strength  # noqa: E402
import fetch_manual  # noqa: E402
import generate_history  # noqa: E402

from personal_trainer import snapshot_cli  # noqa: E402

try:  # noqa: SIM105
    import speed_report  # noqa: E402
except ImportError as exc:  # pragma: no cover - exercised only on older local Python
    speed_report = None
    SPEED_REPORT_IMPORT_ERROR = exc
else:
    SPEED_REPORT_IMPORT_ERROR = None


class SnapshotCliTests(TestCase):
    def test_main_normalizes_source_payloads(self) -> None:
        source = REPO_ROOT / "personal_trainer" / "examples" / "sources-ready.json"
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = snapshot_cli.main([str(source), "--date", "2026-07-09", "--timezone", "Europe/Malta"])

        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")

        snapshot = json.loads(stdout.getvalue())
        self.assertEqual(snapshot["snapshot_date"], "2026-07-09")
        self.assertEqual(snapshot["timezone"], "Europe/Malta")
        self.assertIn("derived", snapshot)
        self.assertIn("athlete", snapshot)

    def test_main_rejects_non_object_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "sources.json"
            source.write_text(json.dumps([]), encoding="utf-8")
            stdout = StringIO()
            stderr = StringIO()

            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = snapshot_cli.main([str(source)])

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("sources must be a JSON object", stderr.getvalue())


class SpeedReportTests(TestCase):
    def test_main_writes_filtered_running_prs(self) -> None:
        if speed_report is None:
            self.skipTest(f"speed_report requires Python 3.11+: {SPEED_REPORT_IMPORT_ERROR}")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "speed-source.json"
            output = tmp_path / "speed.json"
            source.write_text(
                json.dumps(
                    {
                        "snapshot_date": "2026-07-09",
                        "result": [
                            {
                                "record_type": "Fastest 5K",
                                "value": 1251.10400390625,
                                "date": "2026-07-01",
                                "raw_value": 1251.10400390625,
                                "activity_id": 22817326323,
                            },
                            {
                                "record_type": "Not Tracked",
                                "value": 999,
                                "date": "2026-07-01",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            stdout = StringIO()
            stderr = StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = speed_report.main(["--source", str(source), "--output", str(output)])

            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr.getvalue(), "")
            self.assertEqual(stdout.getvalue().strip(), str(output))
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["source"], "Garmin personal records")
            self.assertEqual(report["snapshot_date"], "2026-07-09")
            self.assertEqual(len(report["entries"]), 1)
            self.assertEqual(report["entries"][0]["name"], "Fastest 5K")
            self.assertEqual(report["entries"][0]["context"]["activity_id"], 22817326323)


class GenerateHistoryTests(TestCase):
    def test_merge_into_dist_writes_latest_snapshot_and_history(self) -> None:
        snapshots = [
            {"snapshot_date": "2026-07-08", "source": "test", "value": 1},
            {"snapshot_date": "2026-07-09", "source": "test", "value": 2},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with (
                patch.object(generate_history, "REPO_ROOT", tmp_path),
                patch.object(
                    generate_history,
                    "_process_snapshot",
                    side_effect=lambda payload: {**payload, "recommendation": {"Priority": "aerobic_quality"}},
                ),
            ):
                generate_history._merge_into_dist(snapshots, len(snapshots))

            latest = json.loads((tmp_path / "dist" / "data" / "snapshot.json").read_text(encoding="utf-8"))
            history_a = json.loads((tmp_path / "dist" / "history" / "2026-07-08.json").read_text(encoding="utf-8"))
            history_b = json.loads((tmp_path / "dist" / "history" / "2026-07-09.json").read_text(encoding="utf-8"))

            self.assertEqual(latest["recommendation"]["Priority"], "aerobic_quality")
            self.assertEqual(history_a["recommendation"]["Priority"], "aerobic_quality")
            self.assertEqual(history_b["recommendation"]["Priority"], "aerobic_quality")


class ManualWrapperTests(TestCase):
    def test_main_reads_checkin_from_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            checkin = tmp_path / "manual.json"
            payload = {
                "freshness": "fresh",
                "sleep_quality": "good",
                "soreness": ["quads"],
                "pain": [],
                "motivation": "high",
                "mental_fatigue": "low",
                "table_tennis_today": "training",
                "time_available_minutes": 60,
                "constraints": ["travel"],
            }
            checkin.write_text(json.dumps(payload), encoding="utf-8")

            stdout = StringIO()
            stderr = StringIO()
            original = os.environ.get("PERSONAL_TRAINER_MANUAL_FILE")
            os.environ["PERSONAL_TRAINER_MANUAL_FILE"] = str(checkin)
            try:
                with redirect_stdout(stdout), redirect_stderr(stderr):
                    exit_code = fetch_manual.main()
            finally:
                if original is None:
                    os.environ.pop("PERSONAL_TRAINER_MANUAL_FILE", None)
                else:
                    os.environ["PERSONAL_TRAINER_MANUAL_FILE"] = original

            self.assertEqual(exit_code, 0)
            self.assertIn("[manual] reading check-in from file", stderr.getvalue())
            self.assertIn("[manual] loaded check-in from file", stderr.getvalue())
            self.assertEqual(json.loads(stdout.getvalue()), payload)


class HevyStrengthWrapperTests(TestCase):
    def test_fetch_collects_all_exercises_from_workout_history(self) -> None:
        async def fake_call_tool(
            _command: str, method: str, params: dict[str, object]
        ) -> list[dict[str, object]] | dict[str, object]:
            if method != "get-workouts":
                return []
            self.assertEqual(params.get("page"), 1)
            self.assertEqual(params.get("pageSize"), 10)
            return {
                "workouts": [
                    {
                        "title": "Lower Body",
                        "start_time": "2026-07-09T08:00:00Z",
                        "exercises": [
                            {
                                "exercise_template_id": "D04AC939",
                                "name": "Squat (Barbell)",
                                "sets": [{"weight_kg": 110, "reps": 3}],
                            },
                            {
                                "exercise_template_id": "392887AA",
                                "name": "Push Up",
                                "sets": [{"weight_kg": 0, "reps": 20}],
                            },
                        ],
                    }
                ]
            }

        with patch.object(fetch_hevy_strength, "call_tool", side_effect=fake_call_tool):
            rows = asyncio.run(fetch_hevy_strength.fetch())

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["exerciseName"], "Squat (Barbell)")
        self.assertEqual(rows[0]["weight"], 110.0)
        self.assertEqual(rows[1]["exerciseName"], "Push Up")
        self.assertEqual(rows[1]["reps"], 20)


class HevyWrapperTests(TestCase):
    def test_fetch_builds_recent_bests_and_fatigue(self) -> None:
        class FakeResponse:
            def __init__(self, body: dict[str, object]) -> None:
                self._body = body

            def read(self) -> bytes:
                return json.dumps(self._body).encode("utf-8")

            def __enter__(self) -> FakeResponse:
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

        captured_requests = []

        def fake_urlopen(req, timeout: int = 30) -> FakeResponse:
            self.assertEqual(timeout, 30)
            captured_requests.append(req)
            return FakeResponse(
                {
                    "workouts": [
                        {
                            "title": "Lower Body",
                            "start_time": "2026-07-09T08:00:00Z",
                            "end_time": "2026-07-09T09:00:00Z",
                            "exercises": [
                                {
                                    "exercise_template_id": "D04AC939",
                                    "sets": [
                                        {"weight_kg": 100, "reps": 5},
                                        {"weight_kg": 110, "reps": 3},
                                    ],
                                },
                                {
                                    "exercise_template_id": "79D0BB3A",
                                    "sets": [{"weight_kg": 80, "reps": 8}],
                                },
                                {
                                    "exercise_template_id": "NOPE",
                                    "sets": [{"weight_kg": 999, "reps": 1}],
                                },
                            ],
                        },
                        {
                            "title": "Upper Body",
                            "start_time": "2026-07-08T08:00:00Z",
                            "end_time": "2026-07-08T09:00:00Z",
                            "exercises": [
                                {
                                    "exercise_template_id": "29083183",
                                    "sets": [{"weight_kg": 50, "reps": 10}],
                                }
                            ],
                        },
                    ]
                }
            )

        original = os.environ.get("HEVY_API_KEY")
        os.environ["HEVY_API_KEY"] = "test-hevy-key"
        try:
            with patch.object(fetch_hevy.urllib.request, "urlopen", side_effect=fake_urlopen):
                payload = fetch_hevy.fetch()
        finally:
            if original is None:
                os.environ.pop("HEVY_API_KEY", None)
            else:
                os.environ["HEVY_API_KEY"] = original

        self.assertEqual(len(captured_requests), 1)
        self.assertEqual(captured_requests[0].full_url, "https://api.hevyapp.com/v1/workouts?page=1&pageSize=10")
        self.assertEqual(captured_requests[0].headers["Api-key"], "test-hevy-key")
        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["last_workout"]["title"], "Lower Body")
        self.assertEqual(payload["last_workout"]["exercise_count"], 3)
        self.assertEqual(len(payload["recent_workouts"]), 2)
        self.assertEqual(payload["muscle_group_fatigue"]["legs"], "high")
        self.assertEqual(payload["muscle_group_fatigue"]["push"], "high")
        self.assertEqual(payload["muscle_group_fatigue"]["posterior_chain"], "moderate")
        self.assertEqual(payload["muscle_group_fatigue"]["pull"], "unknown")
        self.assertEqual(len(payload["recent_bests"]), 3)
        best_by_template = {row["exercise_template_id"]: row for row in payload["recent_bests"]}
        self.assertEqual(best_by_template["D04AC939"]["weight_kg"], 110.0)
        self.assertEqual(best_by_template["D04AC939"]["reps"], 3)
        self.assertEqual(best_by_template["D04AC939"]["workout_title"], "Lower Body")
        self.assertEqual(best_by_template["79D0BB3A"]["estimated_one_rm_kg"], 101.3)
        self.assertEqual(best_by_template["29083183"]["workout_start_time"], "2026-07-08T08:00:00Z")

    def test_fetch_returns_valid_payload_when_workouts_are_empty(self) -> None:
        class FakeResponse:
            def read(self) -> bytes:
                return json.dumps({"workouts": []}).encode("utf-8")

            def __enter__(self) -> FakeResponse:
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

        def fake_urlopen(req, timeout: int = 30) -> FakeResponse:
            return FakeResponse()

        original = os.environ.get("HEVY_API_KEY")
        os.environ["HEVY_API_KEY"] = "test-hevy-key"
        try:
            with patch.object(fetch_hevy.urllib.request, "urlopen", side_effect=fake_urlopen):
                payload = fetch_hevy.fetch()
        finally:
            if original is None:
                os.environ.pop("HEVY_API_KEY", None)
            else:
                os.environ["HEVY_API_KEY"] = original

        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["recent_workouts"], [])
        self.assertIsNone(payload["last_workout"])
        self.assertEqual(payload["recent_bests"], [])
        self.assertEqual(payload["muscle_group_fatigue"]["legs"], "unknown")

    def test_fetch_paginates_recent_workouts_in_batches_of_ten(self) -> None:
        class FakeResponse:
            def __init__(self, body: dict) -> None:
                self._body = body

            def read(self) -> bytes:
                return json.dumps(self._body).encode("utf-8")

            def __enter__(self) -> FakeResponse:
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

        captured_requests: list = []

        def fake_urlopen(req, timeout: int = 30) -> FakeResponse:
            captured_requests.append(req)
            if "page=1&pageSize=10" in req.full_url:
                workouts = [
                    {
                        "title": f"Workout {index}",
                        "start_time": f"2026-07-{index:02d}T08:00:00Z",
                        "end_time": f"2026-07-{index:02d}T09:00:00Z",
                        "exercises": [],
                    }
                    for index in range(1, 11)
                ]
                return FakeResponse({"workouts": workouts})
            if "page=2&pageSize=10" in req.full_url:
                return FakeResponse(
                    {
                        "workouts": [
                            {
                                "title": "Workout 11",
                                "start_time": "2026-07-11T08:00:00Z",
                                "end_time": "2026-07-11T09:00:00Z",
                                "exercises": [],
                            }
                        ]
                    }
                )
            raise AssertionError(f"unexpected request: {req.full_url}")

        original = os.environ.get("HEVY_API_KEY")
        os.environ["HEVY_API_KEY"] = "test-hevy-key"
        try:
            with patch.object(fetch_hevy.urllib.request, "urlopen", side_effect=fake_urlopen):
                payload = fetch_hevy.fetch()
        finally:
            if original is None:
                os.environ.pop("HEVY_API_KEY", None)
            else:
                os.environ["HEVY_API_KEY"] = original

        self.assertEqual(len(captured_requests), 2)
        self.assertEqual(captured_requests[0].full_url, "https://api.hevyapp.com/v1/workouts?page=1&pageSize=10")
        self.assertEqual(captured_requests[1].full_url, "https://api.hevyapp.com/v1/workouts?page=2&pageSize=10")
        self.assertEqual(len(payload["recent_workouts"]), 11)
        self.assertEqual(payload["last_workout"]["title"], "Workout 1")

    def test_fetch_logs_and_recovers_when_api_key_is_missing(self) -> None:
        original = os.environ.pop("HEVY_API_KEY", None)
        stdout = StringIO()
        stderr = StringIO()
        try:
            with redirect_stdout(stdout), redirect_stderr(stderr):
                payload = fetch_hevy.fetch()
        finally:
            if original is not None:
                os.environ["HEVY_API_KEY"] = original

        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("HEVY_API_KEY not set", stderr.getvalue())
        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["recent_workouts"], [])
        self.assertEqual(payload["recent_bests"], [])
