#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

kill_preview_processes() {
  local patterns=(
    'scripts/site_preview.py --live'
    'http.server 4173 --bind 127.0.0.1'
  )
  local pids=()

  while IFS= read -r pid command; do
    for pattern in "${patterns[@]}"; do
      if [[ "$command" == *"$pattern"* ]]; then
        pids+=("$pid")
        break
      fi
    done
  done < <(ps -ax -o pid=,command=)

  if ((${#pids[@]} == 0)); then
    return
  fi

  # Deduplicate before sending signals.
  local unique_pids=()
  local pid seen duplicate
  for pid in "${pids[@]}"; do
    duplicate=0
    for seen in "${unique_pids[@]}"; do
      if [[ "$pid" == "$seen" ]]; then
        duplicate=1
        break
      fi
    done
    if [[ "$duplicate" -eq 0 ]]; then
      unique_pids+=("$pid")
    fi
  done

  kill "${unique_pids[@]}" 2>/dev/null || true
  sleep 1
  local still_running=()
  for pid in "${unique_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      still_running+=("$pid")
    fi
  done
  if ((${#still_running[@]} > 0)); then
    kill -9 "${still_running[@]}" 2>/dev/null || true
  fi
}

kill_preview_processes
exec "$SCRIPT_DIR/serve_site.sh" --live "$@"
