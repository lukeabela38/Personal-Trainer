#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

RUFF_CATEGORIES = {
    "F": "Bug",
    "E": "Style",
    "W": "Style",
    "D": "Documentation",
    "N": "Style",
    "A": "Maintainability",
    "C": "Maintainability",
    "B": "Bug",
    "SIM": "Maintainability",
    "ARG": "Maintainability",
    "PERF": "Performance",
    "S": "Security",
    "PL": "Bug",
    "RUF": "Maintainability",
    "UP": "Maintainability",
    "YTT": "Maintainability",
    "ASYNC": "Performance",
    "TCH": "Maintainability",
    "ISC": "Maintainability",
    "ICN": "Maintainability",
    "PIE": "Style",
    "T20": "Maintainability",
    "RET": "Bug",
    "SLF": "Bug",
    "SLOT": "Performance",
    "DTZ": "Bug",
    "PT": "Test",
    "Q": "Style",
    "RSE": "Bug",
    "PYI": "Maintainability",
    "TID": "Style",
    "NPY": "Performance",
    "PTH": "Maintainability",
}

MYPY_CATEGORIES = {
    "error": "Bug",
    "note": "Maintainability",
}

SEMGREP_CATEGORIES = {
    "error": "Security",
    "warning": "Security",
}


def parse_ruff(file: Path) -> list[dict]:
    issues: list[dict] = []
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return issues

    entries = data if isinstance(data, list) else []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        code = str(entry.get("code", ""))
        prefix = re.match(r"[A-Z]+", code)
        category = RUFF_CATEGORIES.get(
            prefix.group(0) if prefix else "", "Maintainability"
        )
        location = entry.get("location", {}) or {}
        issues.append(
            {
                "tool": "ruff",
                "severity": _ruff_severity(code),
                "line": location.get("row", 0),
                "column": location.get("col", 0),
                "rule": code,
                "message": str(entry.get("message", "")),
                "file": str(entry.get("filename", "")),
                "fixable": bool(entry.get("fix")),
                "category": category,
            }
        )
    return issues


def _ruff_severity(code: str) -> str:
    if code.startswith(("F", "B", "A", "S", "PERF", "RSE", "RET", "SLF")):
        return "critical" if code.startswith("S") else "high"
    if code.startswith(("E", "W", "D")):
        return "medium"
    return "low"


def parse_mypy(file: Path) -> list[dict]:
    issues: list[dict] = []
    try:
        text = file.read_text(encoding="utf-8")
    except OSError:
        return issues

    for line in text.splitlines():
        m = re.match(r"^(.+?):(\d+):(\d+):\s*(error|note|warning):\s+(.+)$", line)
        if not m:
            continue
        sev = m.group(4)
        issues.append(
            {
                "tool": "mypy",
                "severity": "high" if sev == "error" else "medium",
                "line": int(m.group(2)),
                "column": int(m.group(3)),
                "rule": f"mypy-{sev}",
                "message": m.group(5),
                "file": m.group(1),
                "fixable": False,
                "category": MYPY_CATEGORIES.get(sev, "Maintainability"),
            }
        )
    return issues


def parse_semgrep(file: Path) -> list[dict]:
    issues: list[dict] = []
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return issues

    results = data.get("results", []) if isinstance(data, dict) else []
    for r in results:
        if not isinstance(r, dict):
            continue
        loc = r.get("location", {}) or {}
        extra = r.get("extra", {}) or {}
        sev = extra.get("severity", "warning")
        issues.append(
            {
                "tool": "semgrep",
                "severity": "critical" if sev in ("ERROR", "error") else "high",
                "line": loc.get("line", 0),
                "column": loc.get("col", 0),
                "rule": r.get("check_id", ""),
                "message": extra.get("message", ""),
                "file": loc.get("path", ""),
                "fixable": False,
                "category": SEMGREP_CATEGORIES.get(sev.lower(), "Security"),
            }
        )
    return issues


def parse_junit(file: Path) -> dict:
    """Minimal junit parser — extracts failure counts."""
    import xml.etree.ElementTree as ET

    try:
        tree = ET.parse(file)
        root = tree.getroot()
        errors = int(root.get("errors", 0))
        failures = int(root.get("failures", 0))
        return {"errors": errors, "failures": failures}
    except (OSError, ET.ParseError):
        return {"errors": 0, "failures": 0}


def build_summary(
    ruff_issues: list[dict],
    mypy_issues: list[dict],
    semgrep_issues: list[dict],
    junit_report: dict | None = None,
    severity_threshold: str = "warning",
) -> dict:
    all_issues = ruff_issues + mypy_issues + semgrep_issues

    files_map: dict[str, dict] = {}
    errors = 0
    warnings = 0
    security = 0

    for issue in all_issues:
        path = issue["file"]
        sev = issue["severity"]

        if sev in ("critical", "high", "error"):
            errors += 1
        else:
            warnings += 1

        if issue["category"] == "Security":
            security += 1

        if path not in files_map:
            files_map[path] = []
        files_map[path].append(issue)

    files_list = [
        {"path": path, "issues": issues} for path, issues in sorted(files_map.items())
    ]

    status = "failed" if errors > 0 else "success"

    summary: dict[str, Any] = {
        "status": status,
        "errors": errors + (junit_report.get("errors", 0) if junit_report else 0),
        "warnings": warnings + (junit_report.get("failures", 0) if junit_report else 0),
        "security": security,
        "files": files_list,
    }
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Generate review-summary.json from tool outputs."
    )
    parser.add_argument("--ruff", type=Path, help="Path to ruff JSON output")
    parser.add_argument("--mypy", type=Path, help="Path to mypy text output")
    parser.add_argument("--semgrep", type=Path, help="Path to semgrep JSON output")
    parser.add_argument("--junit", type=Path, help="Path to JUnit XML")
    parser.add_argument("--output", type=Path, default=Path("review-summary.json"))
    parser.add_argument("--severity-threshold", default="warning")
    args = parser.parse_args(argv)

    ruff_issues = parse_ruff(args.ruff) if args.ruff else []
    mypy_issues = parse_mypy(args.mypy) if args.mypy else []
    semgrep_issues = parse_semgrep(args.semgrep) if args.semgrep else []
    junit_report = parse_junit(args.junit) if args.junit else None

    summary = build_summary(
        ruff_issues, mypy_issues, semgrep_issues, junit_report, args.severity_threshold
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if summary["status"] == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
