# Zero-Cost Fitness App IaC Brief

This document captures the zero-cost toolchain and infrastructure path for making the fitness app live while keeping running cost at zero by default.

## Purpose

- Define a small, production-shaped MVP fitness app.
- Keep ongoing runtime cost at zero by default.
- Prefer resources that can be managed through Terraform or OpenTofu.
- Preserve cost controls and privacy from the start.

## Preferred Stack

1. Cloudflare + GitHub + Terraform/OpenTofu
2. Supabase + Cloudflare + Terraform, if Postgres productivity becomes more important
3. AWS Serverless + Terraform only if explicitly required

## Core Principles

- No paid managed databases by default.
- No always-on compute.
- No NAT gateways, VMs, or unbounded autoscaling.
- Keep raw fitness data optional.
- Store derived summaries first.
- Avoid plaintext OAuth token storage.
- Keep logging retention tightly bounded.

## Intended MVP Shape

- Authentication
- Activity import and sync placeholders
- Storage for workout summaries
- Optional storage for raw import files
- Basic dashboard and API access
- Daily summaries, workouts, and goals
- GitHub Actions deployment and Terraform/OpenTofu IaC

## Suggested Repository Layout

- `apps/web`
- `apps/worker`
- `terraform/`
- `terraform/main.tf`
- `terraform/pages.tf`
- `terraform/workers.tf`
- `terraform/kv.tf`
- `terraform/dns.tf`
- `terraform/secrets.tf`
- `terraform/vars.tf`
- `.github/workflows`
- `docs/`

## Direction Clarification

- This is not the app itself.
- This is the repeatable, low-cost tooling and IaC path for making the app live.
- The repo can use this brief to decide where to take things next without drifting into paid infrastructure by accident.
- Any ticket that is intended to ship to production and needs backend execution should explicitly depend on the IaC foundation card (`#201`) or its successor before implementation starts.

## Suggested Follow-Up Work

- Convert this brief into an implementation roadmap.
- Add cost-control and privacy docs specific to the chosen platform.
- Build the smallest possible Cloudflare Pages + Worker + D1 skeleton.
- Add IaC modules only after the platform choice is locked.
- Keep the first pass as a root-level OpenTofu scaffold so future Cloudflare resources can be added incrementally without introducing paid infrastructure by accident.

## Notes For Future Agents

- This repository is currently a personal training snapshot and viewer system.
- The brief is intentionally preserved here so future platform work can be developed without losing the zero-cost constraint.
- Do not introduce paid resources unless explicitly approved.
