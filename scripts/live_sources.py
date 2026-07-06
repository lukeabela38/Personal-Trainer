from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.mcp_client import load_dotenv

load_dotenv()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Emit a live Personal Trainer source payload.")
    parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
    parser.add_argument("--timezone", default="Europe/Malta", help="Snapshot timezone")
    parser.add_argument("--garmin-command", default=os.environ.get("PERSONAL_TRAINER_GARMIN_COMMAND"))
    parser.add_argument("--hevy-command", default=os.environ.get("PERSONAL_TRAINER_HEVY_COMMAND"))
    parser.add_argument("--cronometer-command", default=os.environ.get("PERSONAL_TRAINER_CRONOMETER_COMMAND"))
    parser.add_argument("--manual-command", default=os.environ.get("PERSONAL_TRAINER_MANUAL_COMMAND"))
    args = parser.parse_args(argv)

    garmin, hevy, cronometer, manual = {}, {}, {}, _manual_default()

    try:
        garmin = _load_payload(args.garmin_command, "garmin")
    except Exception as exc:
        print(f"[sources] garmin unavailable: {exc}", file=sys.stderr)

    try:
        hevy = _load_payload(args.hevy_command, "hevy")
    except Exception as exc:
        print(f"[sources] hevy unavailable: {exc}", file=sys.stderr)

    try:
        cronometer = _load_payload(args.cronometer_command, "cronometer")
    except Exception as exc:
        print(f"[sources] cronometer unavailable: {exc}", file=sys.stderr)

    if args.manual_command:
        try:
            manual = _load_payload(args.manual_command, "manual_context")
        except Exception as exc:
            print(f"[sources] manual check-in unavailable: {exc}", file=sys.stderr)

    payload = {
        "snapshot_date": args.date,
        "timezone": args.timezone,
        "garmin": garmin,
        "hevy": hevy,
        "cronometer": cronometer,
        "manual_context": manual,
    }

    print(json.dumps(payload, indent=2))
    return 0


def _manual_default() -> dict[str, Any]:
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


def _load_payload(command: str | None, source_name: str) -> dict[str, Any]:
    if not command:
        raise ValueError(f"missing command for {source_name}; set PERSONAL_TRAINER_{source_name.upper()}_COMMAND")

    env = os.environ.copy()
    pythonpath = env.get("PYTHONPATH", "")
    repo_root_str = str(_REPO_ROOT)
    if pythonpath:
        env["PYTHONPATH"] = f"{repo_root_str}:{pythonpath}"
    else:
        env["PYTHONPATH"] = repo_root_str

    completed = subprocess.run(
        shlex.split(command),
        check=True,
        capture_output=True,
        text=True,
        env=env,
    )
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise ValueError(f"{source_name} command must emit a JSON object")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
