from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase

import scripts.pr_review_summary as pr_review_summary


class PrReviewSummaryTests(TestCase):
    def test_parse_ruff_reads_json_issues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ruff.json"
            path.write_text(
                json.dumps(
                    [
                        {
                            "code": "F401",
                            "message": "unused import",
                            "filename": "src/example.py",
                            "location": {"row": 3, "col": 5},
                            "fix": {"applicability": "safe"},
                        }
                    ]
                ),
                encoding="utf-8",
            )

            issues = pr_review_summary.parse_ruff(path)

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["tool"], "ruff")
        self.assertEqual(issues[0]["severity"], "high")
        self.assertEqual(issues[0]["category"], "Bug")
        self.assertTrue(issues[0]["fixable"])
        self.assertEqual(issues[0]["line"], 3)
        self.assertEqual(issues[0]["column"], 5)

    def test_parse_mypy_reads_text_issues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mypy.txt"
            path.write_text("src/example.py:8:4: error: Incompatible types\n", encoding="utf-8")

            issues = pr_review_summary.parse_mypy(path)

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["tool"], "mypy")
        self.assertEqual(issues[0]["severity"], "high")
        self.assertEqual(issues[0]["category"], "Bug")
        self.assertEqual(issues[0]["rule"], "mypy-error")
        self.assertEqual(issues[0]["line"], 8)
        self.assertEqual(issues[0]["column"], 4)

    def test_parse_semgrep_reads_json_issues(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "semgrep.json"
            path.write_text(
                json.dumps(
                    {
                        "results": [
                            {
                                "check_id": "python.lang.security.audit.exec",
                                "location": {
                                    "path": "src/example.py",
                                    "line": 12,
                                    "col": 7,
                                },
                                "extra": {"severity": "ERROR", "message": "avoid exec"},
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )

            issues = pr_review_summary.parse_semgrep(path)

        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["tool"], "semgrep")
        self.assertEqual(issues[0]["severity"], "critical")
        self.assertEqual(issues[0]["category"], "Security")
        self.assertEqual(issues[0]["line"], 12)
        self.assertEqual(issues[0]["column"], 7)

    def test_parse_junit_reads_failure_counts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "junit.xml"
            path.write_text('<testsuite errors="2" failures="3"></testsuite>', encoding="utf-8")

            report = pr_review_summary.parse_junit(path)

        self.assertEqual(report, {"errors": 2, "failures": 3})

    def test_build_summary_combines_sources_and_junit_counts(self) -> None:
        ruff_issues = [
            {
                "tool": "ruff",
                "severity": "high",
                "line": 1,
                "column": 1,
                "rule": "F401",
                "message": "unused import",
                "file": "src/a.py",
                "fixable": True,
                "category": "Bug",
            }
        ]
        mypy_issues = [
            {
                "tool": "mypy",
                "severity": "medium",
                "line": 4,
                "column": 2,
                "rule": "mypy-note",
                "message": "note",
                "file": "src/b.py",
                "fixable": False,
                "category": "Maintainability",
            }
        ]
        semgrep_issues = [
            {
                "tool": "semgrep",
                "severity": "critical",
                "line": 9,
                "column": 3,
                "rule": "rule.id",
                "message": "security",
                "file": "src/a.py",
                "fixable": False,
                "category": "Security",
            }
        ]

        summary = pr_review_summary.build_summary(
            ruff_issues,
            mypy_issues,
            semgrep_issues,
            {"errors": 1, "failures": 2},
        )

        self.assertEqual(summary["status"], "failed")
        self.assertEqual(summary["errors"], 3)
        self.assertEqual(summary["warnings"], 3)
        self.assertEqual(summary["security"], 1)
        self.assertEqual([entry["path"] for entry in summary["files"]], ["src/a.py", "src/b.py"])

    def test_main_writes_summary_and_exit_code(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            ruff = tmp_path / "ruff.json"
            junit = tmp_path / "junit.xml"
            output = tmp_path / "review-summary.json"
            ruff.write_text(
                json.dumps(
                    [
                        {
                            "code": "F401",
                            "message": "unused import",
                            "filename": "site/app.js",
                            "location": {"row": 1, "col": 1},
                        }
                    ]
                ),
                encoding="utf-8",
            )
            junit.write_text('<testsuite errors="0" failures="1"></testsuite>', encoding="utf-8")

            exit_code = pr_review_summary.main(
                [
                    "--ruff",
                    str(ruff),
                    "--junit",
                    str(junit),
                    "--output",
                    str(output),
                ]
            )
            summary = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 1)
        self.assertEqual(summary["status"], "failed")
        self.assertEqual(summary["errors"], 1)
        self.assertEqual(summary["warnings"], 1)


if __name__ == "__main__":
    import unittest

    unittest.main()
