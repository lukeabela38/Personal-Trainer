# Agent Skills

These project-scoped skills are shared by agents that support the Agent Skills layout, including Codex and OpenCode.

## Installed Skills

| Skill | Source | Revision | Use |
| --- | --- | --- | --- |
| `cloudflare` | `cloudflare/skills` | `7021530d44a81a0db3219428f4825b604fc6061` | Cloudflare platform architecture and current-doc retrieval |
| `wrangler` | `cloudflare/skills` | `7021530d44a81a0db3219428f4825b604fc6061` | Wrangler commands, config, bindings, and deployment checks |
| `web-perf` | `cloudflare/skills` | `7021530d44a81a0db3219428f4825b604fc6061` | Static-site performance and Core Web Vitals review |
| `frontend-design` | `anthropics/skills` | `fa0fa64bdc967915dc8399e803be67759e1e62b8` | Intentional visual direction, adapted for this vanilla site |

## Boundaries

- Cloudflare skills provide guidance and documentation retrieval; they do not authorize deploys, account mutations, or secret handling by themselves.
- `frontend-design` is intentionally adapted in its `SKILL.md` for this repository. Keep the upstream guidance recognizable and make repository-specific changes explicit.
- Prefer the existing Playwright MCP and browser smoke suite for UI verification. Do not add a parallel browser-testing skill unless the current workflow has a demonstrated gap.
- Re-evaluate upstream revisions before updating these files. Record the new commit in this document.
- The Cloudflare reference bundle is intentionally limited to `bindings`, `cron-triggers`, `d1`, `graphql-api`, `kv`, `observability`, `pages`, `pages-functions`, `r2`, `static-assets`, `terraform`, `tunnel`, and `workers`. Other products should use current official documentation instead of adding the entire upstream catalog to this repository.
