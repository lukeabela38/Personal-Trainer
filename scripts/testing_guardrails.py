#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class GuardrailRule:
    name: str
    source_prefix: str
    test_prefixes: tuple[str, ...]
    source_suffixes: tuple[str, ...]


RULES = (
    GuardrailRule(
        name="python",
        source_prefix="personal_trainer/src/personal_trainer/",
        test_prefixes=("personal_trainer/tests/",),
        source_suffixes=(".py",),
    ),
    GuardrailRule(
        name="scripts",
        source_prefix="scripts/",
        test_prefixes=("tests/",),
        source_suffixes=(".py",),
    ),
    GuardrailRule(
        name="frontend",
        source_prefix="site/",
        test_prefixes=("tests/browser/", "tests/frontend/"),
        source_suffixes=(".js",),
    ),
)


def collect_changed_files(base_ref: str, head_ref: str) -> list[str]:
    completed = subprocess.run(
        [
            "git",
            "diff",
            "--name-only",
            "--diff-filter=ACMR",
            base_ref,
            head_ref,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "git diff failed")
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def evaluate_guardrails(changed_files: list[str]) -> list[str]:
    violations: list[str] = []
    for rule in RULES:
        source_files = _matching_paths(changed_files, rule.source_prefix, rule.source_suffixes)
        if not source_files:
            continue
        if any(_matching_paths(changed_files, prefix, ()) for prefix in rule.test_prefixes):
            continue
        violations.append(f"{rule.name} source changed without matching tests: {', '.join(source_files)}")
    return violations


def _matching_paths(paths: list[str], prefix: str, suffixes: tuple[str, ...]) -> list[str]:
    matches = []
    for path in paths:
        if not path.startswith(prefix):
            continue
        if suffixes and not path.endswith(suffixes):
            continue
        matches.append(path)
    return matches


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Enforce small file-mapping testing guardrails.")
    parser.add_argument(
        "--base",
        default="origin/main",
        help="Git ref or SHA to diff from.",
    )
    parser.add_argument(
        "--head",
        default="HEAD",
        help="Git ref or SHA to diff to.",
    )
    args = parser.parse_args(argv)

    try:
        changed_files = collect_changed_files(args.base, args.head)
        violations = evaluate_guardrails(changed_files)
    except (OSError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if violations:
        print("Testing guardrails failed:", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        print(
            "Add or update the matching test file(s) before merging source changes.",
            file=sys.stderr,
        )
        return 1

    print("Testing guardrails passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
