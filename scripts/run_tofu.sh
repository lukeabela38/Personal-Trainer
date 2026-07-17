#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOFU_IMAGE="personal-trainer-tofu:latest"

cd "$REPO_ROOT"

docker build -f terraform/Dockerfile -t "$TOFU_IMAGE" "$REPO_ROOT"

exec docker run \
  --rm \
  --volume "$REPO_ROOT:/workspace" \
  --workdir /workspace/terraform \
  --env CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}" \
  --env CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" \
  --env TF_STATE_BUCKET="${TF_STATE_BUCKET:-}" \
  --env TF_STATE_KEY="${TF_STATE_KEY:-terraform.tfstate}" \
  --env TF_STATE_ENDPOINT="${TF_STATE_ENDPOINT:-}" \
  --env R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}" \
  --env R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}" \
  "$TOFU_IMAGE" "$@"
