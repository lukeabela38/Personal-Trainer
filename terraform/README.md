# Terraform / OpenTofu Foundation

This directory is the IaC foundation for future Cloudflare-managed resources.

Current scope:

- provider pinning for Cloudflare
- local OpenTofu state only
- empty scaffold files for future Pages, Workers, KV, DNS, and secrets work
- CI checks for format, validate, plan, and security scanning

Authentication should come from environment variables, not committed secrets.

- `CLOUDFLARE_API_TOKEN` for Cloudflare API auth

Useful commands from this directory:

```bash
../scripts/run_tofu.sh fmt -check -recursive
../scripts/run_tofu.sh init -backend=false
../scripts/run_tofu.sh validate
../scripts/run_tofu.sh plan
```

The wrapper uses the `tofu` Docker service defined in `docker-compose.yml`, so the same flow works on any machine with Docker installed.
