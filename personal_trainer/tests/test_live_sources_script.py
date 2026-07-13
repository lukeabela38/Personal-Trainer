from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


class LiveSourcesScriptTests(unittest.TestCase):
    def test_script_emits_merged_source_payload(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        script_path = repo_root / "scripts" / "live_sources.py"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            commands: dict[str, str] = {}
            for name, payload in {
                "garmin": {"freshness": "fresh", "flags": []},
                "hevy": {"freshness": "fresh", "flags": []},
                "cronometer": {"freshness": "fresh", "flags": []},
                "manual": {"freshness": "fresh", "motivation": "normal"},
            }.items():
                script = tmp / f"{name}.py"
                script.write_text(
                    f"import json\nprint(json.dumps({json.dumps(payload)}))\n",
                    encoding="utf-8",
                )
                commands[name] = f"python3 {script}"

            completed = subprocess.run(
                [
                    "python3",
                    str(script_path),
                    "--garmin-command",
                    commands["garmin"],
                    "--hevy-command",
                    commands["hevy"],
                    "--cronometer-command",
                    commands["cronometer"],
                    "--manual-command",
                    commands["manual"],
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            data = json.loads(completed.stdout)

            self.assertEqual(data["garmin"]["freshness"], "fresh")
            self.assertEqual(data["hevy"]["freshness"], "fresh")
            self.assertEqual(data["cronometer"]["freshness"], "fresh")
            self.assertEqual(data["manual_context"]["freshness"], "fresh")

    def test_script_forwards_wrapper_stderr(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        script_path = repo_root / "scripts" / "live_sources.py"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            noisy = tmp / "noisy.py"
            noisy.write_text(
                "import json, sys\nsys.stderr.write('wrapper-logged-message\\n')\nprint(json.dumps({'freshness': 'fresh', 'flags': []}))\n",
                encoding="utf-8",
            )

            completed = subprocess.run(
                [
                    "python3",
                    str(script_path),
                    "--garmin-command",
                    f"python3 {noisy}",
                    "--hevy-command",
                    f"python3 {noisy}",
                    "--cronometer-command",
                    f"python3 {noisy}",
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertIn("wrapper-logged-message", completed.stderr)


if __name__ == "__main__":
    unittest.main()
