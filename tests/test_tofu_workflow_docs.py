from __future__ import annotations

from pathlib import Path
from unittest import TestCase


class TofuWorkflowDocsTests(TestCase):
    def test_terraform_workflow_includes_apply(self) -> None:
        workflow = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "terraform.yml"
        content = workflow.read_text(encoding="utf-8")
        self.assertIn("name: terraform", content)
        self.assertIn("CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}", content)
        self.assertIn("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}", content)
        self.assertIn("TF_STATE_BUCKET: ${{ vars.TF_STATE_BUCKET }}", content)
        self.assertIn("TF_STATE_KEY: ${{ vars.TF_STATE_KEY }}", content)
        self.assertIn("TF_STATE_ENDPOINT: ${{ vars.TF_STATE_ENDPOINT }}", content)
        self.assertIn("R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}", content)
        self.assertIn("R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}", content)
        self.assertIn("run: ../scripts/run_tofu.sh fmt -check -recursive", content)
        self.assertIn("run: ../scripts/run_tofu.sh init", content)
        self.assertIn("run: ../scripts/run_tofu.sh validate", content)
        self.assertIn("run: ../scripts/run_tofu.sh plan -input=false -lock=false -no-color -out=tfplan", content)
        self.assertIn("run: ../scripts/run_tofu.sh apply -input=false -lock=false -no-color tfplan", content)
        self.assertIn("environment: terraform-apply", content)
        self.assertIn("actions/upload-artifact@v4", content)
        self.assertIn("actions/download-artifact@v4", content)
        self.assertIn("Security scan (Trivy)", content)
        self.assertIn("aquasec/trivy:latest", content)
        self.assertNotIn("setup-opentofu", content)

    def test_pages_resource_uses_account_variable(self) -> None:
        pages = Path(__file__).resolve().parents[1] / "terraform" / "pages.tf"
        content = pages.read_text(encoding="utf-8")
        self.assertIn('resource "cloudflare_pages_project" "site" {', content)
        self.assertIn("account_id        = var.cloudflare_account_id", content)
        self.assertIn("name              = local.project_name", content)
        self.assertIn('production_branch = "main"', content)

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
        self.assertIn("use_path_style              = true", content)
        self.assertNotIn("use_lockfile", content)

    def test_security_workflow_scans_terraform_with_trivy(self) -> None:
        workflow = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "security.yml"
        content = workflow.read_text(encoding="utf-8")
        self.assertIn("Run Trivy IaC scan on terraform/", content)
        self.assertIn("scan-ref: terraform/", content)
        self.assertIn("trivy-terraform-results.sarif", content)
        self.assertIn("category: terraform", content)

    def test_precommit_includes_tofu_fmt_hook(self) -> None:
        config = Path(__file__).resolve().parents[1] / ".pre-commit-config.yaml"
        content = config.read_text(encoding="utf-8")
        self.assertIn("id: tofu-fmt", content)
        self.assertIn("entry: ./scripts/run_tofu.sh fmt -check -recursive", content)
        self.assertIn("files: ^terraform/", content)

    def test_readme_mentions_tofu_in_precommit_setup(self) -> None:
        readme = Path(__file__).resolve().parents[1] / "README.md"
        content = readme.read_text(encoding="utf-8")
        self.assertIn("OpenTofu formatting checks", content)
        self.assertIn(
            "repository variables: `CLOUDFLARE_ACCOUNT_ID`, `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_ENDPOINT`",
            content,
        )
        self.assertIn("repository secrets: `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`", content)

    def test_terraform_readme_mentions_account_mapping(self) -> None:
        readme = Path(__file__).resolve().parents[1] / "terraform" / "README.md"
        content = readme.read_text(encoding="utf-8")
        self.assertIn("R2-backed remote state by default when the required bucket and credentials are present", content)
        self.assertIn("local OpenTofu fallback only when remote state is not configured", content)
        self.assertIn("CLOUDFLARE_ACCOUNT_ID", content)
        self.assertIn("TF_VAR_cloudflare_account_id", content)
        self.assertIn("TF_STATE_BUCKET", content)
        self.assertIn("TF_STATE_KEY", content)
