# Working Conventions

This page captures the lightweight rules this repo should follow when we turn vision into work.

## Requirement Language

Use RFC 2119-style wording when a rule matters.

- `MUST` for hard requirements
- `SHOULD` for the preferred path
- `MAY` for optional behavior

Keep the wording short and concrete. The goal is clarity, not ceremony.

## Issue And PR Shape

- Open one issue per small slice of work.
- Keep cards narrow enough that one contributor can finish them independently.
- Add a short acceptance note to the issue.
- Open a PR for reviewable work instead of committing directly to `main`.
- Link the PR back to the issue it resolves using `Closes #NN` in the PR body to auto-close when merged.
- Prefer a PR that changes one behavior, one page, or one contract at a time.
- Branch protection is enabled on `main`: requires PR review, passing CI checks, and linear history.
- Use a branch name that matches `agent/`, `feature/`, `fix/`, `chore/`, `docs/`, `ci/`, or `dependabot/`.

GitHub templates should be used to keep issue and PR descriptions consistent.

## Architectural Decisions

Use a lightweight ADR-style note when a decision is durable or hard to reverse.

Record:

- the problem
- the decision
- the alternatives considered
- the reason the decision was chosen

Use this for choices like storage shape, data model boundaries, or workflow direction changes.

If the decision is durable enough to outlive a single task, record it in [`DECISIONS.md`](../DECISIONS.md) as well.

## Scope Rules

- Prefer direct-data-first signals when they are available.
- Keep body composition and other indirect metrics optional until the product needs them.
- Do not mix contract changes with UI changes unless the card explicitly requires integration.
- Keep the default path simple, then add detail through progressive disclosure.
- Runtime-generated artifacts MUST stay out of git. Commit source inputs, templates, and fixtures; do not commit build outputs, logs, or other files that are produced during local or CI execution.
- If source code changes, update the matching test surface in the same PR:
  - `personal_trainer/src/personal_trainer/*.py` needs a change in `personal_trainer/tests/`
  - `scripts/**/*.py` needs a change in `tests/`
  - `site/**/*.js` needs a change in `tests/frontend/`
- When changing the snapshot or recommendation contract, add at least one fuzz mutation test and one golden-file regression case.
- When changing encrypted config or secret-handling workflows, run `scripts/audit_git_crypt.py` and keep `.env.example` in sync.

## Review Rule

Before opening a PR, check that:

- the change is still small enough to review quickly
- the issue and PR tell the same story
- validation is obvious
- the docs reflect any durable new rule

## Developer Workflow

- Install and use `pre-commit` locally so Ruff formatting and lint checks run before commits.
- Run `pre-commit run --all-files` after larger refactors or before opening a PR.
- Keep the hook set aligned with CI so local failures match the PR checks.

## Source References

- [RFC 2119](https://www.rfc-editor.org/info/rfc2119)
- [GitHub issue and pull request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates)
- [GitHub pull request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)
- [ADR background](https://en.wikipedia.org/wiki/Architectural_decision)
