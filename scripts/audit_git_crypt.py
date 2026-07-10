#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit git-crypt coverage for the repo-backed .env file.")
    parser.add_argument("--path", default=".env", help="Tracked encrypted file to audit.")
    args = parser.parse_args(argv)

    try:
        encrypted_paths = _collect_encrypted_paths()
        path_status = _collect_path_status(args.path)
        violations = _evaluate(encrypted_paths, path_status, args.path)
    except (OSError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if violations:
        print("git-crypt audit failed:", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        return 1

    print("git-crypt audit passed.")
    return 0


def _collect_encrypted_paths() -> list[str]:
    completed = subprocess.run(
        ["git-crypt", "status", "-e"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git-crypt status failed")
    return [
        line.split(":", 1)[1].strip() for line in completed.stdout.splitlines() if line.startswith("    encrypted:")
    ]


def _collect_path_status(path: str) -> list[str]:
    completed = subprocess.run(
        ["git", "status", "--porcelain", "--", path],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git status failed")
    return [line for line in completed.stdout.splitlines() if line.strip()]


def _evaluate(encrypted_paths: list[str], path_status: list[str], path: str) -> list[str]:
    violations: list[str] = []
    if path not in encrypted_paths:
        violations.append(f"{path} is not listed as encrypted by git-crypt")
    if path_status:
        violations.append(f"{path} has uncommitted working tree changes: {', '.join(path_status)}")
    return violations


if __name__ == "__main__":
    raise SystemExit(main())
