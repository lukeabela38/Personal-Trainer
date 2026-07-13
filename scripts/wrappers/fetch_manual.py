#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def _read_checkin() -> dict[str, Any]:
    command = os.environ.get("PERSONAL_TRAINER_MANUAL_COMMAND")
    if command:
        logger.info("[manual] reading check-in from command")
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
                    logger.info("[manual] loaded check-in from command")
                    return data
            except json.JSONDecodeError:
                pass

    file_path = os.environ.get("PERSONAL_TRAINER_MANUAL_FILE")
    if file_path:
        logger.info("[manual] reading check-in from file")
        path = Path(file_path)
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    logger.info("[manual] loaded check-in from file")
                    return data
            except (json.JSONDecodeError, OSError):
                pass

    logger.info("[manual] using default check-in payload")
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
        _configure_logging()
        payload = _read_checkin()
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
