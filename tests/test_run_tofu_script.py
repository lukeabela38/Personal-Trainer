from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase


class RunTofuScriptTests(TestCase):
    def test_script_invokes_docker_compose_tofu_service(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        script_path = repo_root / "scripts" / "run_tofu.sh"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            log_file = tmp_path / "docker.log"

            docker_stub = bin_dir / "docker"
            docker_stub.write_text(
                """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD | $*" >> "$DOCKER_LOG"
""",
                encoding="utf-8",
            )
            docker_stub.chmod(0o755)

            completed = subprocess.run(
                [str(script_path), "fmt", "-check", "-recursive"],
                cwd=tmp_path,
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "DOCKER_LOG": str(log_file),
                },
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(
                log_file.read_text(encoding="utf-8").splitlines(),
                [f"{repo_root} | compose run --rm tofu fmt -check -recursive"],
            )
