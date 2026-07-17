# Terraform / OpenTofu Foundation

This directory is the IaC foundation for future Cloudflare-managed resources.

Current scope:

- provider pinning for Cloudflare
- R2-backed remote state by default when the required bucket and credentials are present
- local OpenTofu fallback only when remote state is not configured
- empty scaffold files for future Pages, Workers, KV, DNS, and secrets work
- CI checks for format, validate, plan, and security scanning

Authentication should come from environment variables, not committed secrets.

- `CLOUDFLARE_API_TOKEN` for Cloudflare API auth
- `CLOUDFLARE_ACCOUNT_ID` is forwarded by `scripts/run_tofu.sh` into Terraform as `TF_VAR_cloudflare_account_id`
- `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` for the R2-backed state bucket
- `TF_STATE_BUCKET`, `TF_STATE_KEY`, and `TF_STATE_ENDPOINT` tell the wrapper which R2 bucket and object key to use for remote state
- `ALERT_EMAIL` is forwarded as `TF_VAR_alert_email` for the budget alert notification destination
- In GitHub Actions, set `CLOUDFLARE_ACCOUNT_ID`, `TF_STATE_BUCKET`, `TF_STATE_KEY`, `TF_STATE_ENDPOINT`, and `ALERT_EMAIL` as repository variables, then set `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` as repository secrets.

Remote state sketch:

- Copy [backend.r2.hcl.example](./backend.r2.hcl.example) to an untracked `backend.r2.hcl`
- Export the R2 credentials and endpoint in your shell or `.env`
- Run `../scripts/run_tofu.sh init`
- Follow with `../scripts/run_tofu.sh plan`
- Use `../scripts/run_tofu.sh apply -auto-approve` only after the backend exists and the state bucket is ready
- The GitHub Actions `apply` job waits on the protected `terraform-apply` environment before it starts, so there is a manual approval gate between plan and apply.
- If you are using `docker compose` anywhere else in the repo, unlock the repo-backed encrypted `.env` first; Compose reads it automatically, which can break local runs if it is still encrypted.

Useful commands from this directory:

```bash
../scripts/run_tofu.sh fmt -check -recursive
../scripts/run_tofu.sh init -backend=false
../scripts/run_tofu.sh validate
../scripts/run_tofu.sh plan
../scripts/run_tofu.sh apply -auto-approve
```

The wrapper builds and runs a dedicated OpenTofu container directly, so infra commands stay separate from the app's Docker Compose services.

If you want to keep all Terraform/OpenTofu commands rooted at the repo top level instead, the wrapper still works from there because it mounts the repo into `/workspace` in the container.

When the R2 state variables are present, `../scripts/run_tofu.sh init` writes local ignored `terraform/backend.auto.tf` and `terraform/backend.r2.hcl` files and initialises OpenTofu against remote state automatically.

## Usage Monitoring

Inspect usage and spend for each managed resource in the Cloudflare dashboard:

| Resource | Dashboard path | What to check |
|---|---|---|
| Account-level spend | Dashboard → **Billing → Billable Usage** | Total usage-based spend across all products. Free accounts see $0 if within limits. |
| R2 | Dashboard → **R2 → [bucket name] → Usage** | Storage (GB), Class A operations, Class B operations. |
| Workers (future) | Dashboard → **Workers & Pages → Overview** | Request count, CPU time, Dynamic Worker count. |
| Pages (future) | Dashboard → **Workers & Pages → [project]** | Build minutes, requests, bandwidth. |
| KV (future) | Dashboard → **Workers KV → [namespace]** | Read/write operations, storage size. |

A budget alert at $1 is configured via `notifications.tf` — it emails `var.alert_email` when account-level spend crosses the threshold. Run `tofu plan` after adding new billable resources to confirm the alert still covers everything.
