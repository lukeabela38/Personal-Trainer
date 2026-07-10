#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
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


def main(argv: list[str] | None = None) -> int:
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
    args = parser.parse_args(argv)

    try:
        sources = _load_sources(args.sources_file, args.date, args.timezone)
        if args.sources_file is None:
            _write_json(args.sources_output, sources)
        snapshot = build_snapshot(sources, snapshot_date=args.date, timezone=args.timezone)
        recommendation = build_daily_recommendation(snapshot)
        source_kind = "example" if args.sources_file is not None else _infer_live_source_kind(sources)
        _write_json(
            args.snapshot_output,
            {**snapshot, "source": source_kind, "recommendation": recommendation},
        )
        _build_site_artifacts(args.snapshot_output, args.site_output)
        _build_history_artifacts(args.site_output)
        print(args.site_output)
        return 0
    except (
        OSError,
        json.JSONDecodeError,
        ValueError,
        subprocess.CalledProcessError,
    ) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _load_sources(path: Path | None, date: str | None, timezone: str) -> dict[str, Any]:
    if path is not None:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("sources file must contain a JSON object")
        return payload
    return _capture_live_sources(date, timezone)


def _with_pythonpath() -> dict[str, str]:
    env = os.environ.copy()
    pythonpath = env.get("PYTHONPATH", "")
    root_str = str(REPO_ROOT)
    if pythonpath:
        env["PYTHONPATH"] = f"{root_str}:{pythonpath}"
    else:
        env["PYTHONPATH"] = root_str
    return env


def _capture_live_sources(date: str | None, timezone: str) -> dict[str, Any]:
    command = [sys.executable, str(REPO_ROOT / "scripts" / "live_sources.py")]
    if date:
        command.extend(["--date", date])
    command.extend(["--timezone", timezone])
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        env=_with_pythonpath(),
    )
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        raise ValueError("live sources payload must be a JSON object")
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


def _build_history_artifacts(site_output: Path) -> None:
    _run_optional_history_report(
        env_var="PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND",
        script="strength_report.py",
        output_path=site_output / "strength.json",
    )
    _run_optional_history_report(
        env_var="PERSONAL_TRAINER_GARMIN_SPEED_COMMAND",
        script="speed_report.py",
        output_path=site_output / "speed.json",
    )


def _run_optional_history_report(env_var: str, script: str, output_path: Path) -> None:
    if not os.environ.get(env_var):
        print(f"Skipping {script}: {env_var} is not set", file=sys.stderr)
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
        print(
            f"Skipping {script}: {env_var} failed with exit code {exc.returncode}",
            file=sys.stderr,
        )


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _infer_live_source_kind(sources: dict[str, Any]) -> str:
    live_sections = ("garmin", "hevy", "cronometer")
    for key in live_sections:
        if sources.get(key):
            return "live"
    return "unavailable"


if __name__ == "__main__":
    raise SystemExit(main())
