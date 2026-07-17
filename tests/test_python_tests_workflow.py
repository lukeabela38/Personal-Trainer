from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase


class PythonTestsWorkflowShellTest(TestCase):
    def test_pipefail_pattern_preserves_ruff_exit_code(self) -> None:
        script = """
status=0
set -o pipefail
{ printf 'ruff format failed\\n'; false; } | tee -a "$SUMMARY_FILE" >/dev/null || status=$?
{ printf 'ruff check passed\\n'; true; } | tee -a "$SUMMARY_FILE" >/dev/null || status=$?
exit "$status"
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            summary_file = Path(tmpdir) / "summary.md"
            completed = subprocess.run(
                ["bash", "-lc", script],
                env={**os.environ, "SUMMARY_FILE": str(summary_file)},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 1)
            self.assertTrue(summary_file.exists())


class CiWorkflowLintAutomationTest(TestCase):
    def test_lint_job_autofixes_and_commits(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        workflow_text = (repo_root / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

        self.assertIn("permissions:\n      contents: write", workflow_text)
        self.assertIn("\n  javascript:\n", workflow_text)
        self.assertIn("Apply JS formatting fixes", workflow_text)
        self.assertIn("Apply JS lint fixes", workflow_text)
        self.assertIn("stefanzweifel/git-auto-commit-action@v5", workflow_text)
        self.assertIn('commit_message: "chore: apply automated lint fixes"', workflow_text)


class PythonTestsWrapperScriptTest(TestCase):
    def test_wrapper_runs_docker_compose_from_repo_root(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        script_path = repo_root / "scripts" / "run_python_tests.sh"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            cwd_file = tmp_path / "cwd.txt"
            args_file = tmp_path / "args.txt"
            command_file = tmp_path / "command.txt"
            docker = bin_dir / "docker"
            docker.write_text(
                """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD" > "$CWD_FILE"
printf '%s\n' "${@:1:8}" > "$ARGS_FILE"
printf '%s' "${9:-}" > "$COMMAND_FILE"
""",
                encoding="utf-8",
            )
            docker.chmod(0o755)

            completed = subprocess.run(
                [str(script_path)],
                cwd=tmp_path,
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "CWD_FILE": str(cwd_file),
                    "ARGS_FILE": str(args_file),
                    "COMMAND_FILE": str(command_file),
                },
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(cwd_file.read_text(encoding="utf-8").strip(), str(repo_root))
            self.assertEqual(
                args_file.read_text(encoding="utf-8").splitlines(),
                [
                    "compose",
                    "run",
                    "--rm",
                    "--volume",
                    f"{repo_root}:/app",
                    "app",
                    "sh",
                    "-c",
                ],
            )
            self.assertEqual(
                command_file.read_text(encoding="utf-8"),
                "set -euo pipefail\n"
                "python3 -m unittest discover -s personal_trainer/tests -v\n"
                "python3 -m unittest discover -s tests -v\n",
            )

    def test_pipefail_pattern_passes_when_commands_succeed(self) -> None:
        script = """
status=0
set -o pipefail
true | tee -a "$SUMMARY_FILE" >/dev/null || status=$?
true | tee -a "$SUMMARY_FILE" >/dev/null || status=$?
exit "$status"
"""
        with tempfile.TemporaryDirectory() as tmpdir:
            summary_file = Path(tmpdir) / "summary.md"
            completed = subprocess.run(
                ["bash", "-lc", script],
                env={**os.environ, "SUMMARY_FILE": str(summary_file)},
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(completed.returncode, 0)
            self.assertTrue(summary_file.exists())
