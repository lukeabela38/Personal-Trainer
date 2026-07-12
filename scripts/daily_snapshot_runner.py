#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "personal_trainer" / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.mcp_client import load_dotenv as _load_dotenv

_load_dotenv()

from personal_trainer import build_daily_recommendation, build_snapshot

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main(argv: list[str] | None = None) -> int:
    _configure_logging()
    parser = argparse.ArgumentParser(description="Pull live sources, build a snapshot, and emit site artifacts.")
    parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
    parser.add_argument("--timezone", default="Europe/Malta", help="Snapshot timezone")
    parser.add_argument(
        "--sources-file",
        type=Path,
        default=None,
        help="Use an existing live source payload instead of capturing one.",
    )
    parser.add_argument(
        "--sources-output",
        type=Path,
        default=Path("dist/live-sources.json"),
        help="Where to write the captured live source payload.",
    )
    parser.add_argument(
        "--snapshot-output",
        type=Path,
        default=Path("dist/snapshot.json"),
        help="Where to write the normalized snapshot.",
    )
    parser.add_argument(
        "--site-output",
        type=Path,
        default=Path("dist"),
        help="Where to write the published site artifacts.",
    )
    parser.add_argument(
        "--deploy-log-output",
        type=Path,
        default=Path("dist/deploy-log.txt"),
        help="Where to write a deployment log file.",
    )
    parser.add_argument(
        "--require-garmin-vo2max",
        action="store_true",
        help="Fail the build when live Garmin data does not include current_vo2max.",
    )
    args = parser.parse_args(argv)

    deployment_log: list[str] = []
    status = "failed"
    try:
        _log_line(deployment_log, f"started_at: {datetime.now(timezone.utc).isoformat()}")
        _log_line(deployment_log, f"timezone: {args.timezone}")
        _log_line(
            deployment_log,
            f"sources_mode: {'file' if args.sources_file is not None else 'live'}",
        )
        sources = _load_sources(args.sources_file, args.date, args.timezone, deployment_log)
        _validate_live_sources(sources, require_garmin_vo2max=args.require_garmin_vo2max)
        if args.sources_file is None:
            _write_json(args.sources_output, sources)
            _log_line(deployment_log, f"wrote_sources: {args.sources_output}")
        snapshot = build_snapshot(sources, snapshot_date=args.date, timezone=args.timezone)
        recommendation = build_daily_recommendation(snapshot)
        source_kind = "example" if args.sources_file is not None else _infer_live_source_kind(sources)
        _write_json(
            args.snapshot_output,
            {**snapshot, "source": source_kind, "recommendation": recommendation},
        )
        _log_line(deployment_log, f"wrote_snapshot: {args.snapshot_output}")
        _log_line(deployment_log, "building_site_artifacts: start")
        _build_site_artifacts(args.snapshot_output, args.site_output)
        _log_line(deployment_log, "building_history_artifacts: start")
        _build_history_artifacts(args.site_output, deployment_log)
        _log_line(deployment_log, f"wrote_site_output: {args.site_output}")
        status = "succeeded"
        _write_deploy_log(args.deploy_log_output, deployment_log, status=status)
        print(args.site_output)
        return 0
    except (
        OSError,
        json.JSONDecodeError,
        ValueError,
        subprocess.CalledProcessError,
    ) as exc:
        _log_line(deployment_log, f"error: {exc}")
        _write_deploy_log(args.deploy_log_output, deployment_log, status=status)
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _load_sources(
    path: Path | None,
    date: str | None,
    timezone: str,
    deployment_log: list[str],
) -> dict[str, Any]:
    if path is not None:
        _log_line(deployment_log, f"loaded_sources_file: {path}")
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("sources file must contain a JSON object")
        return payload
    return _capture_live_sources(date, timezone, deployment_log)


def _with_pythonpath() -> dict[str, str]:
    env = os.environ.copy()
    pythonpath = env.get("PYTHONPATH", "")
    root_str = str(REPO_ROOT)
    if pythonpath:
        env["PYTHONPATH"] = f"{root_str}:{pythonpath}"
    else:
        env["PYTHONPATH"] = root_str
    return env


def _capture_live_sources(
    date: str | None,
    timezone: str,
    deployment_log: list[str],
) -> dict[str, Any]:
    command = [sys.executable, str(REPO_ROOT / "scripts" / "live_sources.py")]
    if date:
        command.extend(["--date", date])
    command.extend(["--timezone", timezone])
    _log_line(deployment_log, f"capture_command: {' '.join(command)}")
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        env=_with_pythonpath(),
    )
    if completed.stderr:
        sys.stderr.write(completed.stderr)
        _append_log_block(deployment_log, "live_sources_stderr", completed.stderr)
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise ValueError("live sources payload must be a JSON object")
    _log_line(deployment_log, "captured_live_sources: true")
    return payload


def _build_site_artifacts(snapshot_path: Path, site_output: Path) -> None:
    command = [
        sys.executable,
        str(REPO_ROOT / "scripts" / "build_site_artifacts.py"),
        "--snapshot",
        str(snapshot_path),
        "--output-dir",
        str(site_output),
    ]
    subprocess.run(command, check=True, env=_with_pythonpath())


def _build_history_artifacts(
    site_output: Path, deployment_log: list[str] | None = None
) -> None:
    _run_optional_history_report(
        env_var="PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND",
        script="strength_report.py",
        output_path=site_output / "strength.json",
        deployment_log=deployment_log,
    )
    _run_optional_history_report(
        env_var="PERSONAL_TRAINER_GARMIN_SPEED_COMMAND",
        script="speed_report.py",
        output_path=site_output / "speed.json",
        deployment_log=deployment_log,
    )


def _run_optional_history_report(
    env_var: str,
    script: str,
    output_path: Path,
    deployment_log: list[str] | None = None,
) -> None:
    if not os.environ.get(env_var):
        message = f"Skipping {script}: {env_var} is not set"
        print(message, file=sys.stderr)
        if deployment_log is not None:
            _log_line(deployment_log, message)
        return
    try:
        subprocess.run(
            [
                sys.executable,
                str(REPO_ROOT / "scripts" / script),
                "--output",
                str(output_path),
            ],
            check=True,
            env=_with_pythonpath(),
        )
    except subprocess.CalledProcessError as exc:
        message = f"Skipping {script}: {env_var} failed with exit code {exc.returncode}"
        print(message, file=sys.stderr)
        if deployment_log is not None:
            _log_line(deployment_log, message)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_deploy_log(path: Path, deployment_log: list[str], *, status: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"status: {status}",
        *deployment_log,
    ]
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def _log_line(deployment_log: list[str], message: str) -> None:
    deployment_log.append(message)


def _append_log_block(deployment_log: list[str], heading: str, block: str) -> None:
    deployment_log.append(f"{heading}:")
    for line in block.rstrip().splitlines():
        deployment_log.append(f"  {line}")


def _infer_live_source_kind(sources: dict[str, Any]) -> str:
    live_sections = ("garmin", "hevy", "cronometer")
    for key in live_sections:
        if sources.get(key):
            return "live"
    return "unavailable"


def _validate_live_sources(sources: dict[str, Any], *, require_garmin_vo2max: bool) -> None:
    if not require_garmin_vo2max:
        return

    missing = []

    garmin = sources.get("garmin")
    if not _has_garmin_coverage(garmin):
        missing.append("garmin")

    hevy = sources.get("hevy")
    if not _has_hevy_coverage(hevy):
        missing.append("hevy")

    cronometer = sources.get("cronometer")
    if not _has_cronometer_coverage(cronometer):
        missing.append("cronometer")

    if missing:
        logger.error("live snapshot missing coverage for: %s", ", ".join(missing))
        raise ValueError("live snapshot missing useful data after capture; refusing to publish a Pages snapshot")


def _has_garmin_coverage(garmin: Any) -> bool:
    if not isinstance(garmin, dict):
        return False
    return any(
        (
            garmin.get("current_vo2max") is not None,
            isinstance(garmin.get("recent_runs"), list) and bool(garmin["recent_runs"]),
            isinstance(garmin.get("recent_activities"), list) and bool(garmin["recent_activities"]),
            isinstance(garmin.get("recent_bests"), list) and bool(garmin["recent_bests"]),
            bool(garmin.get("readiness")),
        )
    )


def _has_hevy_coverage(hevy: Any) -> bool:
    if not isinstance(hevy, dict):
        return False
    return any(
        (
            isinstance(hevy.get("recent_workouts"), list) and bool(hevy["recent_workouts"]),
            hevy.get("last_workout") is not None,
            isinstance(hevy.get("recent_bests"), list) and bool(hevy["recent_bests"]),
        )
    )


def _has_cronometer_coverage(cronometer: Any) -> bool:
    if not isinstance(cronometer, dict):
        return False
    today = cronometer.get("today")
    return any(
        (
            isinstance(today, dict)
            and any(
                today.get(key) is not None
                for key in (
                    "calories_consumed",
                    "calories_target",
                    "protein_g",
                    "carbs_g",
                    "fat_g",
                    "remaining_kcal",
                )
            ),
            isinstance(cronometer.get("recent_days"), list) and bool(cronometer["recent_days"]),
            cronometer.get("fueling_status") not in (None, "unknown"),
            cronometer.get("protein_status") not in (None, "unknown"),
            cronometer.get("carb_availability") not in (None, "unknown"),
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
