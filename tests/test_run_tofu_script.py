from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase


class RunTofuScriptTests(TestCase):
    def test_script_builds_and_runs_dedicated_tofu_container(self) -> None:
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
                    "CLOUDFLARE_ACCOUNT_ID": "test-account",
                    "CLOUDFLARE_API_TOKEN": "test-token",
                    "TF_STATE_BUCKET": "test-bucket",
                    "TF_STATE_KEY": "terraform.tfstate",
                    "TF_STATE_ENDPOINT": "https://example.r2.cloudflarestorage.com",
                    "R2_ACCESS_KEY_ID": "r2-access",
                    "R2_SECRET_ACCESS_KEY": "r2-secret",
                },
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(
                log_file.read_text(encoding="utf-8").splitlines(),
                [
                    f"{repo_root} | build -f terraform/Dockerfile -t personal-trainer-tofu:latest {repo_root}",
                    (
                        f"{repo_root} | run --rm --volume {repo_root}:/workspace --workdir /workspace/terraform "
                        "--env CLOUDFLARE_ACCOUNT_ID=test-account --env CLOUDFLARE_API_TOKEN=test-token "
                        "--env TF_VAR_cloudflare_account_id=test-account "
                        "--env TF_STATE_BUCKET=test-bucket --env TF_STATE_KEY=terraform.tfstate "
                        "--env TF_STATE_ENDPOINT=https://example.r2.cloudflarestorage.com "
                        "--env R2_ACCESS_KEY_ID=r2-access --env R2_SECRET_ACCESS_KEY=r2-secret "
                        "--env AWS_ACCESS_KEY_ID=r2-access --env AWS_SECRET_ACCESS_KEY=r2-secret "
                        "personal-trainer-tofu:latest fmt -check -recursive"
                    ),
                ],
            )

    def test_init_with_remote_state_writes_backend_config(self) -> None:
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
                [str(script_path), "init"],
                cwd=tmp_path,
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "DOCKER_LOG": str(log_file),
                    "CLOUDFLARE_ACCOUNT_ID": "test-account",
                    "CLOUDFLARE_API_TOKEN": "test-token",
                    "TF_STATE_BUCKET": "test-bucket",
                    "TF_STATE_KEY": "terraform.tfstate",
                    "TF_STATE_ENDPOINT": "https://example.r2.cloudflarestorage.com",
                    "R2_ACCESS_KEY_ID": "r2-access",
                    "R2_SECRET_ACCESS_KEY": "r2-secret",
                },
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertTrue((repo_root / "terraform" / "backend.r2.hcl").exists())
            self.assertEqual(
                log_file.read_text(encoding="utf-8").splitlines(),
                [
                    f"{repo_root} | build -f terraform/Dockerfile -t personal-trainer-tofu:latest {repo_root}",
                    (
                        f"{repo_root} | run --rm --volume {repo_root}:/workspace --workdir /workspace/terraform "
                        "--env CLOUDFLARE_ACCOUNT_ID=test-account --env CLOUDFLARE_API_TOKEN=test-token "
                        "--env TF_VAR_cloudflare_account_id=test-account "
                        "--env TF_STATE_BUCKET=test-bucket --env TF_STATE_KEY=terraform.tfstate "
                        "--env TF_STATE_ENDPOINT=https://example.r2.cloudflarestorage.com "
                        "--env R2_ACCESS_KEY_ID=r2-access --env R2_SECRET_ACCESS_KEY=r2-secret "
                        "--env AWS_ACCESS_KEY_ID=r2-access --env AWS_SECRET_ACCESS_KEY=r2-secret "
                        "personal-trainer-tofu:latest init -backend-config=backend.r2.hcl -reconfigure -input=false"
                    ),
                ],
            )
            self.assertTrue((repo_root / "terraform" / "backend.auto.tf").exists())
