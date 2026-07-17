from __future__ import annotations

from pathlib import Path
from unittest import TestCase


class TofuWorkflowDocsTests(TestCase):
    def test_terraform_workflow_includes_apply(self) -> None:
        workflow = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "terraform.yml"
        content = workflow.read_text(encoding="utf-8")
        self.assertIn("name: terraform", content)
        self.assertIn("run: tofu plan -input=false -lock=false -no-color -out=tfplan", content)
        self.assertIn("run: tofu apply -input=false -lock=false -no-color tfplan", content)
        self.assertIn("environment: terraform-apply", content)
        self.assertIn("actions/upload-artifact@v4", content)
        self.assertIn("actions/download-artifact@v4", content)

    def test_terraform_readme_mentions_apply(self) -> None:
        readme = Path(__file__).resolve().parents[1] / "terraform" / "README.md"
        content = readme.read_text(encoding="utf-8")
        self.assertIn("../scripts/run_tofu.sh apply -auto-approve", content)
        self.assertIn("The wrapper builds and runs a dedicated OpenTofu container directly", content)

    def test_r2_backend_example_contains_required_fields(self) -> None:
        backend = Path(__file__).resolve().parents[1] / "terraform" / "backend.r2.hcl.example"
        content = backend.read_text(encoding="utf-8")
        self.assertIn('bucket = "personal-trainer-terraform-state"', content)
        self.assertIn('endpoint = "https://<ACCOUNT_ID>.r2.cloudflarestorage.com"', content)
        self.assertIn("use_lockfile                = true", content)
