#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any


def _read_checkin() -> dict[str, Any]:
    command = os.environ.get("PERSONAL_TRAINER_MANUAL_COMMAND")
    if command:
        completed = subprocess.run(
            shlex.split(command),
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            try:
                data = json.loads(completed.stdout)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                pass

    file_path = os.environ.get("PERSONAL_TRAINER_MANUAL_FILE")
    if file_path:
        path = Path(file_path)
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    return data
            except (json.JSONDecodeError, OSError):
                pass

    return {
        "freshness": "missing",
        "sleep_quality": "unknown",
        "soreness": [],
        "pain": [],
        "motivation": "unknown",
        "mental_fatigue": "unknown",
        "table_tennis_today": "unknown",
        "time_available_minutes": None,
        "constraints": [],
    }


def main() -> int:
    try:
        payload = _read_checkin()
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
