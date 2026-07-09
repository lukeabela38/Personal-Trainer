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
            summary_text = summary_file.read_text(encoding="utf-8")
            self.assertIn("ruff format failed", summary_text)
            self.assertIn("ruff check passed", summary_text)

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
