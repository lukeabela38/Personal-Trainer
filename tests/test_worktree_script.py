from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase


class WorktreeScriptTests(TestCase):
    def test_new_bootstraps_a_namespaced_worktree(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        script_path = repo_root / "scripts" / "worktree.sh"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            worktree_dir = tmp_path / "worktrees"
            resolved_cwd = tmp_path.resolve()
            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            git_log = tmp_path / "git.log"
            worktree_dir = tmp_path / "worktrees"

            git_stub = bin_dir / "git"
            git_stub.write_text(
                """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD | $*" >> "$GIT_LOG"
if [[ "${8:-}" == "add" ]]; then
  mkdir -p "${9:?}"
fi
""",
                encoding="utf-8",
            )
            git_stub.chmod(0o755)

            completed = subprocess.run(
                [str(script_path), "new", "226"],
                cwd=tmp_path,
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "GIT_LOG": str(git_log),
                    "PERSONAL_TRAINER_WORKTREE_PARENT": str(worktree_dir),
                },
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertIn(f"Worktree ready: {worktree_dir / 'issue-226'}", completed.stdout)
            self.assertEqual(
                git_log.read_text(encoding="utf-8").splitlines(),
                [
                    f"{resolved_cwd} | -c filter.git-crypt.smudge=cat -c filter.git-crypt.clean=cat -c filter.git-crypt.required=false -C {repo_root} worktree add --no-checkout {worktree_dir / 'issue-226'} -b feature/issue-226",
                    f"{resolved_cwd} | -c filter.git-crypt.smudge=cat -c filter.git-crypt.clean=cat -c filter.git-crypt.required=false -C {worktree_dir / 'issue-226'} reset --hard HEAD",
                ],
            )
            self.assertFalse((tmp_path / "python.log").exists())

    def test_list_and_remove_delegate_to_git_worktree(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        script_path = repo_root / "scripts" / "worktree.sh"

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            worktree_dir = tmp_path / "worktrees"
            resolved_cwd = tmp_path.resolve()
            bin_dir = tmp_path / "bin"
            bin_dir.mkdir()
            git_log = tmp_path / "git.log"
            git_stub = bin_dir / "git"
            git_stub.write_text(
                """#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$PWD | $*" >> "$GIT_LOG"
""",
                encoding="utf-8",
            )
            git_stub.chmod(0o755)

            list_run = subprocess.run(
                [str(script_path), "list"],
                cwd=tmp_path,
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "GIT_LOG": str(git_log),
                    "PERSONAL_TRAINER_WORKTREE_PARENT": str(worktree_dir),
                },
                capture_output=True,
                text=True,
                check=False,
            )
            remove_run = subprocess.run(
                [str(script_path), "remove", "226"],
                cwd=tmp_path,
                env={
                    **os.environ,
                    "PATH": f"{bin_dir}:{os.environ['PATH']}",
                    "GIT_LOG": str(git_log),
                    "PERSONAL_TRAINER_WORKTREE_PARENT": str(worktree_dir),
                },
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(list_run.returncode, 0, list_run.stderr)
            self.assertEqual(remove_run.returncode, 0, remove_run.stderr)
            self.assertEqual(
                git_log.read_text(encoding="utf-8").splitlines(),
                [
                    f"{resolved_cwd} | -C {repo_root} worktree list",
                    f"{resolved_cwd} | -C {repo_root} worktree remove {worktree_dir / 'issue-226'}",
                ],
            )
