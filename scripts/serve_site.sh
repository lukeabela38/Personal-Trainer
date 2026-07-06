#!/usr/bin/env bash
set -euo pipefail

port="${1:-4173}"
site_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../site" && pwd)"

if command -v python3 >/dev/null 2>&1; then
  echo "Serving $site_dir at http://127.0.0.1:$port"
  cd "$site_dir"
  exec python3 -m http.server "$port"
else
  echo "python3 is required to run the local site server" >&2
  exit 1
fi
