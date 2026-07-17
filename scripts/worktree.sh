#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_PARENT="${PERSONAL_TRAINER_WORKTREE_PARENT:-$HOME/Documents/projects/Personal-Trainer-worktrees}"
BRANCH_PREFIX="${PERSONAL_TRAINER_WORKTREE_BRANCH_PREFIX:-feature/issue-}"

usage() {
  cat <<'EOF'
Usage:
  scripts/worktree.sh new <issue-number> [branch-slug]
  scripts/worktree.sh list
  scripts/worktree.sh remove <issue-number>

Environment:
  PERSONAL_TRAINER_WORKTREE_PARENT
  PERSONAL_TRAINER_WORKTREE_BRANCH_PREFIX
EOF
}

slugify() {
  local value="$1"
  printf '%s' "$value" \
    | tr '[:upper:] _' '[:lower:]-' \
    | sed -E 's/[^a-z0-9.-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//'
}

cmd_new() {
  local issue="$1"
  local branch_slug="${2:-}"
  local branch dir

  if [[ -n "$branch_slug" ]]; then
    branch_slug="$(slugify "$branch_slug")"
    branch="feature/${branch_slug}"
  else
    branch="${BRANCH_PREFIX}${issue}"
  fi

  dir="${WORKTREE_PARENT}/issue-${issue}"
  mkdir -p "$WORKTREE_PARENT"

  git -c filter.git-crypt.smudge=cat -c filter.git-crypt.clean=cat -c filter.git-crypt.required=false \
    -C "$REPO_ROOT" worktree add --no-checkout "$dir" -b "$branch"
  git -c filter.git-crypt.smudge=cat -c filter.git-crypt.clean=cat -c filter.git-crypt.required=false \
    -C "$dir" reset --hard HEAD

  printf 'Worktree ready: %s (branch: %s)\n' "$dir" "$branch"
}

cmd_list() {
  git -C "$REPO_ROOT" worktree list
}

cmd_remove() {
  local issue="$1"
  local dir="${WORKTREE_PARENT}/issue-${issue}"
  git -C "$REPO_ROOT" worktree remove "$dir"
}

main() {
  if [[ $# -lt 1 ]]; then
    usage >&2
    exit 1
  fi

  case "$1" in
    new)
      if [[ $# -lt 2 ]]; then
        usage >&2
        exit 1
      fi
      cmd_new "$2" "${3:-}"
      ;;
    list)
      cmd_list
      ;;
    remove)
      if [[ $# -lt 2 ]]; then
        usage >&2
        exit 1
      fi
      cmd_remove "$2"
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
