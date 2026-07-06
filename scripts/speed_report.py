from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


RUN_RECORD_TYPES = {
    "Fastest 1K",
    "Fastest Mile",
    "Fastest 5K",
    "Fastest 10K",
    "Fastest Half Marathon",
    "Longest Run",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build site/speed.json from Garmin records."
    )
    parser.add_argument("--output", type=Path, default=Path("site/speed.json"))
    parser.add_argument("--source", type=Path, default=None)
    args = parser.parse_args(argv)
    try:
        raw = _load_source(args.source)
        report = build_report(raw)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(args.output)
    return 0


def _load_source(path: Path | None) -> dict[str, Any]:
    if path:
        return json.loads(path.read_text(encoding="utf-8"))
    command = os.environ.get("PERSONAL_TRAINER_GARMIN_SPEED_COMMAND")
    if not command:
        raise ValueError("set PERSONAL_TRAINER_GARMIN_SPEED_COMMAND or pass --source")
    completed = subprocess.run(
        command.split(), check=True, capture_output=True, text=True
    )
    data = json.loads(completed.stdout)
    if not isinstance(data, dict):
        raise ValueError("garmin speed source must be JSON object")
    return data


def build_report(raw: dict[str, Any]) -> dict[str, Any]:
    records = _extract_records(raw)
    return {
        "source": "Garmin personal records",
        "snapshot_date": raw.get("snapshot_date")
        or datetime.now(UTC).date().isoformat(),
        "entries": records,
    }


def _extract_records(raw: dict[str, Any]) -> list[dict[str, Any]]:
    source = raw.get("result", raw)
    if isinstance(source, str):
        source = json.loads(source)
    if not isinstance(source, list):
        return []
    results: list[dict[str, Any]] = []
    for entry in source:
        if not isinstance(entry, dict):
            continue
        record_type = str(entry.get("record_type") or "")
        if record_type not in RUN_RECORD_TYPES:
            continue
        results.append(
            {
                "name": record_type,
                "category": "Running",
                "value": entry.get("value"),
                "unit": "",
                "date": entry.get("date"),
                "context": _compact_context(entry),
            }
        )
    return results


def _compact_context(entry: dict[str, Any]) -> dict[str, Any]:
    context: dict[str, Any] = {}
    for key in ("raw_value", "activity_id", "type_id"):
        value = entry.get(key)
        if value not in (None, "", [], {}):
            context[key] = value
    return context


if __name__ == "__main__":
    raise SystemExit(main())
