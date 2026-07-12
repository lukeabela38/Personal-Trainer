from __future__ import annotations

import argparse
import json
import logging
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

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main(argv: list[str] | None = None) -> int:
    _configure_logging()
    parser = argparse.ArgumentParser(description="Emit a live Personal Trainer source payload.")
    parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
    parser.add_argument("--timezone", default="Europe/Malta", help="Snapshot timezone")
    parser.add_argument("--garmin-command", default=os.environ.get("PERSONAL_TRAINER_GARMIN_COMMAND"))
    parser.add_argument("--hevy-command", default=os.environ.get("PERSONAL_TRAINER_HEVY_COMMAND"))
    parser.add_argument(
        "--cronometer-command",
        default=os.environ.get("PERSONAL_TRAINER_CRONOMETER_COMMAND"),
    )
    parser.add_argument("--manual-command", default=os.environ.get("PERSONAL_TRAINER_MANUAL_COMMAND"))
    args = parser.parse_args(argv)

    garmin, hevy, cronometer, manual = {}, {}, {}, _manual_default()

    try:
        logger.info("capturing Garmin source")
        garmin = _load_payload(args.garmin_command, "garmin")
        logger.info("captured Garmin source")
    except Exception as exc:
        logger.warning("[sources] garmin unavailable: %s", exc)

    try:
        logger.info("capturing Hevy source")
        hevy = _load_payload(args.hevy_command, "hevy")
        logger.info("captured Hevy source")
    except Exception as exc:
        logger.warning("[sources] hevy unavailable: %s", exc)

    try:
        logger.info("capturing Cronometer source")
        cronometer = _load_payload(args.cronometer_command, "cronometer")
        logger.info("captured Cronometer source")
    except Exception as exc:
        logger.warning("[sources] cronometer unavailable: %s", exc)

    if args.manual_command:
        try:
            logger.info("capturing manual check-in source")
            manual = _load_payload(args.manual_command, "manual_context")
            logger.info("captured manual check-in source")
        except Exception as exc:
            logger.warning("[sources] manual check-in unavailable: %s", exc)

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
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )
    if completed.stderr:
        sys.stderr.write(completed.stderr)
    if completed.returncode != 0:
        raise subprocess.CalledProcessError(
            completed.returncode,
            completed.args,
            output=completed.stdout,
            stderr=completed.stderr,
        )
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise ValueError(f"{source_name} command must emit a JSON object")
    return payload


if __name__ == "__main__":
    raise SystemExit(main())
