from __future__ import annotations

import subprocess
from unittest import TestCase
from unittest.mock import patch

from scripts import audit_git_crypt


class AuditGitCryptTest(TestCase):
    def test_main_passes_when_env_is_encrypted_and_clean(self) -> None:
        def fake_run(command, cwd, capture_output, text, check):  # noqa: ANN001
            if command[:2] == ["git-crypt", "status"]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout="    encrypted: .env\n",
                    stderr="",
                )
            if command[:3] == ["git", "status", "--porcelain"]:
                return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {command}")

        with patch.object(audit_git_crypt.subprocess, "run", side_effect=fake_run):
            self.assertEqual(audit_git_crypt.main([]), 0)

    def test_main_fails_when_env_is_not_encrypted(self) -> None:
        def fake_run(command, cwd, capture_output, text, check):  # noqa: ANN001
            if command[:2] == ["git-crypt", "status"]:
                return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
            if command[:3] == ["git", "status", "--porcelain"]:
                return subprocess.CompletedProcess(command, 0, stdout="", stderr="")
            raise AssertionError(f"unexpected command: {command}")

        with patch.object(audit_git_crypt.subprocess, "run", side_effect=fake_run):
            self.assertEqual(audit_git_crypt.main([]), 1)

    def test_main_fails_when_env_has_worktree_changes(self) -> None:
        def fake_run(command, cwd, capture_output, text, check):  # noqa: ANN001
            if command[:2] == ["git-crypt", "status"]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    stdout="    encrypted: .env\n",
                    stderr="",
                )
            if command[:3] == ["git", "status", "--porcelain"]:
                return subprocess.CompletedProcess(
                    command, 0, stdout=" M .env\n", stderr=""
                )
            raise AssertionError(f"unexpected command: {command}")

        with patch.object(audit_git_crypt.subprocess, "run", side_effect=fake_run):
            self.assertEqual(audit_git_crypt.main([]), 1)
