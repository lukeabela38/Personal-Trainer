from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase


REPO_ROOT = Path(__file__).resolve().parents[1]


class DockerSmokeTest(TestCase):
    def test_dockerized_daily_pipeline_runs_end_to_end(self) -> None:
        if shutil.which("docker") is None:
            self.skipTest("docker CLI is required for this smoke test")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            tmp_path.chmod(0o777)
            output_dir = tmp_path / "dist"
            self._write_history_source_payloads(tmp_path)
            created_env_file = self._ensure_env_file()

            try:
                self._run_command(["docker", "compose", "build", "app"])
                self._run_command(
                    [
                        "docker",
                        "compose",
                        "run",
                        "--rm",
                        "--no-deps",
                        "-v",
                        f"{tmp_path}:/tmp/out",
                        "-e",
                        "PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND=cat /tmp/out/hevy_strength_source.json",
                        "-e",
                        "PERSONAL_TRAINER_GARMIN_SPEED_COMMAND=cat /tmp/out/garmin_speed_source.json",
                        "app",
                        "python3",
                        "scripts/daily_snapshot_runner.py",
                        "--sources-file",
                        "personal_trainer/examples/sources-ready.json",
                        "--snapshot-output",
                        "/tmp/out/snapshot.json",
                        "--site-output",
                        "/tmp/out/dist",
                    ]
                )
            finally:
                if created_env_file:
                    created_env_file.unlink(missing_ok=True)

            snapshot_path = output_dir / "data" / "snapshot.json"
            raw_path = output_dir / "raw.json"
            strength_path = output_dir / "strength.json"
            speed_path = output_dir / "speed.json"

            self.assertTrue(snapshot_path.exists())
            self.assertTrue(raw_path.exists())
            self.assertTrue(strength_path.exists())
            self.assertTrue(speed_path.exists())

            snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
            self.assertIn("recommendation", snapshot)
            self.assertEqual(snapshot["recommendation"]["Priority"], "aerobic_quality")

    def _write_history_source_payloads(self, tmp_path: Path) -> None:
        snapshot_path = REPO_ROOT / "personal_trainer" / "examples" / "snapshot-ready.json"
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))

        hevy_rows = []
        for row in snapshot["hevy"]["recent_bests"]:
            hevy_rows.append(
                {
                    "exerciseTemplateId": row["exercise_template_id"],
                    "weight": row["weight_kg"],
                    "reps": row["reps"],
                    "workoutStartTime": f'{row["workout_start_date"]}T07:00:00Z',
                }
            )
        (tmp_path / "hevy_strength_source.json").write_text(
            json.dumps(hevy_rows, indent=2), encoding="utf-8"
        )

        garmin_rows = [
            {
                "record_type": row["record_type"],
                "value": row["value"],
                "date": row["date"],
            }
            for row in snapshot["garmin"]["recent_bests"]
        ]
        (tmp_path / "garmin_speed_source.json").write_text(
            json.dumps({"result": garmin_rows}, indent=2), encoding="utf-8"
        )

    def _ensure_env_file(self) -> Path | None:
        env_file = REPO_ROOT / ".env"
        if env_file.exists():
            return None
        env_file.write_text("", encoding="utf-8")
        return env_file

    def _run_command(self, command: list[str]) -> None:
        completed = subprocess.run(
            command,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            message = "\n".join(
                part
                for part in (
                    f"command failed: {' '.join(command)}",
                    f"stdout:\n{completed.stdout}" if completed.stdout else "",
                    f"stderr:\n{completed.stderr}" if completed.stderr else "",
                )
                if part
            )
            self.fail(message)
