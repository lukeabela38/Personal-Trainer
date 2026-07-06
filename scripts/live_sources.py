from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Emit a live Personal Trainer source payload.")
    parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
    parser.add_argument("--timezone", default="Europe/Malta", help="Snapshot timezone")
    parser.add_argument("--garmin-command", default=os.environ.get("PERSONAL_TRAINER_GARMIN_COMMAND"))
    parser.add_argument("--hevy-command", default=os.environ.get("PERSONAL_TRAINER_HEVY_COMMAND"))
    parser.add_argument("--cronometer-command", default=os.environ.get("PERSONAL_TRAINER_CRONOMETER_COMMAND"))
    parser.add_argument("--manual-command", default=os.environ.get("PERSONAL_TRAINER_MANUAL_COMMAND"))
    args = parser.parse_args(argv)

    try:
        payload = {
            "snapshot_date": args.date,
            "timezone": args.timezone,
            "garmin": _load_payload(args.garmin_command, "garmin"),
            "hevy": _load_payload(args.hevy_command, "hevy"),
            "cronometer": _load_payload(args.cronometer_command, "cronometer"),
            "manual_context": _load_payload(args.manual_command, "manual_context"),
        }
    except (OSError, json.JSONDecodeError, ValueError, subprocess.CalledProcessError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(payload, indent=2))
    return 0


def _load_payload(command: str | None, source_name: str) -> dict[str, Any]:
    if not command:
        raise ValueError(f"missing command for {source_name}; set PERSONAL_TRAINER_{source_name.upper()}_COMMAND")

    completed = subprocess.run(
        shlex.split(command),
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise ValueError(f"{source_name} command must emit a JSON object")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
