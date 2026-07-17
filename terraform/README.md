# Terraform / OpenTofu Foundation

This directory is the IaC foundation for future Cloudflare-managed resources.

Current scope:

- provider pinning for Cloudflare
- local OpenTofu state only
- empty scaffold files for future Pages, Workers, KV, DNS, and secrets work
- CI checks for format, validate, plan, and security scanning

Authentication should come from environment variables, not committed secrets.

- `CLOUDFLARE_API_TOKEN` for Cloudflare API auth
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` for the R2-backed state bucket

Remote state sketch:

- Copy [backend.r2.hcl.example](./backend.r2.hcl.example) to an untracked `backend.r2.hcl`
- Export the R2 credentials and endpoint in your shell or `.env`
- Run `../scripts/run_tofu.sh init -backend-config=backend.r2.hcl -reconfigure`
- Follow with `../scripts/run_tofu.sh plan`
- Use `../scripts/run_tofu.sh apply -auto-approve` only after the backend exists and the state bucket is ready

Useful commands from this directory:

```bash
../scripts/run_tofu.sh fmt -check -recursive
../scripts/run_tofu.sh init -backend=false
../scripts/run_tofu.sh validate
../scripts/run_tofu.sh plan
../scripts/run_tofu.sh apply -auto-approve
```

The wrapper uses the `tofu` Docker service defined in `docker-compose.yml`, so the same flow works on any machine with Docker installed.

If you want to keep all Terraform/OpenTofu commands rooted at the repo top level instead, the wrapper also works from there because it always runs against `/workspace/terraform` in the container.
