# Cloudflare Usage & Cost Monitoring Plan

This document defines a staged approach to monitoring Cloudflare resource usage and spend for this project. It derives from the zero-cost bias established in [`zero-cost-fitness-app-iac-brief.md`](./zero-cost-fitness-app-iac-brief.md) and depends on the IaC foundation completed in [#201](https://github.com/lukeabela38/Personal-Trainer/issues/201).

## Current Landscape

### Resources today

| Resource | Status | Free-tier envelope | Risk |
|---|---|---|---|
| GitHub Pages | Live (deployed via `pages.yml`) | 1 GB storage, 100 GB/month bandwidth, 350 builds/month | None (GitHub Free) |
| Cloudflare R2 (env/state bucket) | Exists (created manually or via tofu) | 10 GB storage, 1M Class A ops/month, 10M Class B ops/month, free egress | Low — state object is a few KB, touched per CI run |
| Cloudflare account / provider | Registered, provider pinned in `terraform/` | N/A | N/A |

### Resources in the pipeline

These will be added by future cards. Each comes with its own free-tier envelope and failure modes.

| Resource | Blocked by | Free-tier envelope | Failure mode |
|---|---|---|---|
| Cloudflare Pages project (`terraform/pages.tf`) | #202 (hosting migration) | Unlimited requests, 500 builds/month, 1 concurrent build | Build minutes exhaustion, request spike |
| Cloudflare Workers | #203 | 100,000 requests/day, 10ms CPU time/request | Daily request cap (Error 1027), CPU timeout |
| Cloudflare KV | #204 | 100,000 reads/day, 1,000 writes/day, 1 GB storage | Operation cap, storage growth |
| Cloudflare DNS | Domain finalization | Unlimited queries | N/A |

### Pages→Workers direction

Cloudflare is folding Pages into Workers — static assets on Workers is the replacement. Any Pages-specific monitoring should account for this migration path rather than assume Pages is the terminal state.

## Design Constraints

1. **Zero-cost bias** — no paid monitoring tools (no Datadog, Grafana Cloud, New Relic, or paid Cloudflare add-ons). Free-tier Cloudflare features and GitHub Actions only.
2. **Dashboard-first** — the Cloudflare dashboard is the canonical source of truth. Automated scripts augment, not replace, dashboard review.
3. **Progressive depth** — start with human-visible dashboard review, add automated checks only when manual review becomes insufficient or when a specific resource needs closer tracking.
4. **IaC-aligned** — where Cloudflare's API exposes a resource, manage it through OpenTofu alongside the infrastructure it monitors. Manual-only steps are documented exceptions.

## Recommended Approach

The plan is three layers. Each layer is independently useful; later layers add automation without breaking earlier ones.

### Layer 1: Dashboard Canonical Source (immediate, no code)

**What:** Document exactly where to look for each resource's usage and cost.

| Resource | Dashboard path | What to check |
|---|---|---|
| Account-level spend | Dashboard → **Billing → Billable Usage** | Total usage-based spend across all products. Free accounts see $0 if within limits. |
| R2 | Dashboard → **R2 → [bucket name] → Usage** | Storage (GB), Class A operations, Class B operations. Billable usage widget now in sidebar. |
| Workers (future) | Dashboard → **Workers & Pages → Overview** | Request count, CPU time, Dynamic Worker count. |
| Pages (future) | Dashboard → **Workers & Pages → [project]** | Build minutes, requests, bandwidth. |
| KV (future) | Dashboard → **Workers KV → [namespace]** | Read/write operations, storage size. |

**How to use it:** Add this table to the `terraform/README.md` as a "Usage Monitoring" section. During routine infra review (e.g., monthly), visit the dashboard paths and check that each resource is within its free-tier envelope.

**Acceptance:** A documented source of truth exists in the repo for where to inspect Cloudflare usage and cost.

### Layer 2: Budget Alerts (IaC via OpenTofu, one-time apply)

**What:** Manage a Cloudflare budget alert through OpenTofu using `cloudflare_notification_policy` with `alert_type = "billing_usage_alert"`.

The alert monitors account-level spend and emails you when it crosses a threshold. Since this project targets $0 spend, a low threshold ($1.00) catches any unexpected billing activity early — far before a meaningful bill accumulates.

**Implementation:** `terraform/notifications.tf` defines the resource. It requires:
- `cloudflare_account_id` (already in `vars.tf`)
- `alert_email` (added to `vars.tf`) — your notification email address, set via a `.tfvars` file or CI variable
- A one-time `tofu apply` to create the alert

After creation, the policy is managed like any other resource — changes go through `tofu plan`/`apply` in CI. No manual dashboard steps needed.

**Why $1:** Cloudflare's free tier has no hard cap on usage-based billing — exceeding free limits silently transitions to pay-as-you-go. A $1 alert fires long before any meaningful bill accumulates.

**Acceptance:** `cloudflare_notification_policy` resource exists in `terraform/` and is applied to the account.

### Layer 3: Automated Usage Reporting (when dashboard review is not enough)

**What:** A lightweight scheduled GitHub Actions workflow that queries Cloudflare's GraphQL Analytics API and surfaces usage data.

This is intentionally deferred until at least one Cloudflare billable resource (Workers, R2 beyond free tier, Pages build minutes) is in active use. Premature automation adds maintenance burden without providing signal.

When implemented, the design should be:

```
.github/workflows/usage-report.yml
  └─ cron: monthly on 1st
       └─ calls Cloudflare GraphQL API (via curl or a small script)
            └─ queries R2 storage + operations, Workers requests, Pages build minutes
                 └─ posts summary as an issue comment or writes to a file
```

**Design constraints for Layer 3:**
- Use `curl` against the GraphQL API with the `CLOUDFLARE_API_TOKEN` already stored in GitHub Secrets — no new secrets needed.
- Query only the current billing period and compare against free-tier limits as percentages.
- Output as a pinned issue comment so it's visible during routine review.
- Do not introduce a Python dependency or a new script file unless the curl approach proves too limited.

**Example GraphQL query for R2:**
```graphql
query getR2Usage($accountTag: string!, $date_geq: string!, $date_leq: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2OperationsAdaptiveGroups(
        limit: 10000
        filter: { date_geq: $date_geq, date_leq: $date_leq }
      ) {
        sum { requests }
        dimensions { actionType }
      }
    }
  }
}
```

Similar queries exist for Workers (`workersInvocationsAdaptive`) and Pages (`pagesRequestsAdaptive`). The Cloudflare GraphQL API docs at `https://developers.cloudflare.com/analytics/graphql-api/` are the reference.

**When to implement Layer 3:**
- When R2 storage exceeds 5 GB (50% of free tier)
- When Workers are deployed and receiving traffic
- When a budget alert fires and you need more granular data
- The trigger is explicit, not automatic — no reason to build it before it is needed.

## Implementation Sequence

| Step | Description | Dependencies | Effort |
|---|---|---|---|---|
| 1 | Add the dashboard reference table to `terraform/README.md` | None | ~15 min |
| 2 | Create `terraform/notifications.tf` and `var.alert_email`, then run `tofu apply` | Cloudflare account, `CLOUDFLARE_API_TOKEN` in CI | ~15 min |
| 3 | (Optional) Add a monthly check-in item to the project board or a recurring calendar reminder to review the dashboard paths | Step 1 | ~1 min/month |
| 4 | Implement Layer 3 GH Actions workflow | At least one Cloudflare resource in active use with billable potential | 2-3 hours |
| 5 | Set up a GitHub Issue template for "Monthly Infra Review" that includes the dashboard check path | Steps 1-2 | ~15 min |

## What This Plan Does Not Do

- **No paid monitoring.** No Datadog, Grafana Cloud, or Cloudflare Workers Paid plan monitoring add-ons.
- **No custom dashboard.** Cloudflare's own dashboard is sufficient at the current scale. Building a separate dashboard duplicates effort without adding signal.
- **No per-request tracing.** This is about aggregate usage and cost visibility, not debuggability.
- **No automated cost capping.** Cloudflare does not offer programmatic spend caps on the free plan. The budget alert created in Layer 2 is the closest option and sufficient at this scale.

## Relationship to IaC Foundation

The monitoring approach integrates with OpenTofu at two points:

1. **Layer 2 budget alert** is managed entirely as IaC — the `cloudflare_notification_policy` resource lives in `terraform/notifications.tf` alongside the other infrastructure. The `CLOUDFLARE_API_TOKEN` already configured in GitHub Secrets for existing workflows is reused.

2. **Layer 1 dashboard reference** is documented in `terraform/README.md` and complements IaC by providing the human-facing inspection path.

The Layer 3 GH Actions workflow (when implemented) would also reuse the same `CLOUDFLARE_API_TOKEN` — no new secrets needed.

The IaC foundation is the **resource inventory**: once OpenTofu manages a resource, its definition in `.tf` files becomes the canonical entry in the monitoring table. `terraform/` is the list of "things that could cost money."
