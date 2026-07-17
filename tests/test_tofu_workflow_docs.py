from __future__ import annotations

from pathlib import Path
from unittest import TestCase


class TofuWorkflowDocsTests(TestCase):
    def test_terraform_workflow_includes_apply(self) -> None:
        workflow = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "terraform.yml"
        content = workflow.read_text(encoding="utf-8")
        self.assertIn("tofu apply -auto-approve -input=false -lock=false -no-color", content)

    def test_terraform_readme_mentions_apply(self) -> None:
        readme = Path(__file__).resolve().parents[1] / "terraform" / "README.md"
        content = readme.read_text(encoding="utf-8")
        self.assertIn("../scripts/run_tofu.sh apply -auto-approve", content)
