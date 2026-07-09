from __future__ import annotations

from unittest import TestCase

import scripts.testing_guardrails as testing_guardrails


class TestingGuardrailsTests(TestCase):
    def test_allows_python_source_changes_when_python_tests_change(self) -> None:
        violations = testing_guardrails.evaluate_guardrails(
            [
                "personal_trainer/src/personal_trainer/snapshot.py",
                "personal_trainer/tests/test_snapshot.py",
            ]
        )

        self.assertEqual(violations, [])

    def test_requires_python_tests_for_python_source_changes(self) -> None:
        violations = testing_guardrails.evaluate_guardrails(["personal_trainer/src/personal_trainer/snapshot.py"])

        self.assertEqual(
            violations,
            ["python source changed without matching tests: personal_trainer/src/personal_trainer/snapshot.py"],
        )

    def test_requires_script_tests_for_script_changes(self) -> None:
        violations = testing_guardrails.evaluate_guardrails(["scripts/testing_guardrails.py"])

        self.assertEqual(
            violations,
            ["scripts source changed without matching tests: scripts/testing_guardrails.py"],
        )

    def test_requires_frontend_tests_for_site_js_changes(self) -> None:
        violations = testing_guardrails.evaluate_guardrails(["site/app.js"])

        self.assertEqual(violations, ["frontend source changed without matching tests: site/app.js"])

    def test_ignores_docs_only_changes(self) -> None:
        violations = testing_guardrails.evaluate_guardrails(["docs/working-conventions.md"])

        self.assertEqual(violations, [])
