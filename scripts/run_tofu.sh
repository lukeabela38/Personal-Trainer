#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TOFU_IMAGE="personal-trainer-tofu:latest"
STATE_CONFIG_FILE="$REPO_ROOT/terraform/backend.r2.hcl"
BACKEND_BLOCK_FILE="$REPO_ROOT/terraform/backend.auto.tf"

AWS_ACCESS_KEY_ID_VALUE="${R2_ACCESS_KEY_ID:-${AWS_ACCESS_KEY_ID:-}}"
AWS_SECRET_ACCESS_KEY_VALUE="${R2_SECRET_ACCESS_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"

write_state_config() {
  cat > "$STATE_CONFIG_FILE" <<EOF
bucket = "${TF_STATE_BUCKET}"
key    = "${TF_STATE_KEY}"
region = "auto"

endpoint = "${TF_STATE_ENDPOINT}"

skip_credentials_validation = true
skip_metadata_api_check     = true
skip_region_validation      = true
skip_requesting_account_id  = true
skip_s3_checksum            = true
use_path_style              = true
EOF
}

write_backend_block() {
  cat > "$BACKEND_BLOCK_FILE" <<'EOF'
terraform {
  backend "s3" {}
}
EOF
}

remote_state_enabled() {
  [[ -n "${TF_STATE_BUCKET:-}" && -n "${TF_STATE_ENDPOINT:-}" && -n "${AWS_ACCESS_KEY_ID_VALUE:-}" && -n "${AWS_SECRET_ACCESS_KEY_VALUE:-}" ]]
}

tofu_run() {
  docker run \
    --rm \
    --volume "$REPO_ROOT:/workspace" \
    --workdir /workspace/terraform \
    --env CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}" \
    --env CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}" \
    --env TF_VAR_cloudflare_account_id="${CLOUDFLARE_ACCOUNT_ID:-}" \
    --env TF_STATE_BUCKET="${TF_STATE_BUCKET:-}" \
    --env TF_STATE_KEY="${TF_STATE_KEY:-terraform.tfstate}" \
    --env TF_STATE_ENDPOINT="${TF_STATE_ENDPOINT:-}" \
    --env R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-}" \
    --env R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-}" \
    --env AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID_VALUE:-}" \
    --env AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY_VALUE:-}" \
    "$TOFU_IMAGE" "$@"
}

cd "$REPO_ROOT"

docker build -f terraform/Dockerfile -t "$TOFU_IMAGE" "$REPO_ROOT"

command="${1:-}"
shift || true

if [[ "$command" == "init" && "$(remote_state_enabled && echo yes || echo no)" == "yes" ]]; then
  write_backend_block
  write_state_config
  tofu_run init -backend-config=backend.r2.hcl -reconfigure -input=false "$@"
  exit $?
fi

if [[ "$command" == "init" ]]; then
  rm -f "$BACKEND_BLOCK_FILE" "$STATE_CONFIG_FILE"
  tofu_run init -backend=false -input=false "$@"
  exit $?
fi

if remote_state_enabled; then
  write_backend_block
  write_state_config
else
  rm -f "$BACKEND_BLOCK_FILE" "$STATE_CONFIG_FILE"
fi

tofu_run "$command" "$@"
