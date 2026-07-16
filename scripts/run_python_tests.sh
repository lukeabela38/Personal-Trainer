#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

exec docker compose run --rm --volume "$REPO_ROOT:/app" app sh -c 'set -euo pipefail
python3 -m unittest discover -s personal_trainer/tests -v
python3 -m unittest discover -s tests -v
'
