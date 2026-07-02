from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .recommendation import build_daily_recommendation
from .snapshot import build_snapshot


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a snapshot and daily recommendation from live source exports."
    )
    parser.add_argument(
        "sources",
        nargs="?",
        type=Path,
        help="Path to a live source payload JSON file",
    )
    parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
    parser.add_argument("--timezone", default="Europe/Malta", help="Snapshot timezone")
    args = parser.parse_args(argv)

    try:
        sources = _load_json(args.sources) if args.sources else _load_default_sources()
        snapshot = build_snapshot(sources, snapshot_date=args.date, timezone=args.timezone)
        recommendation = build_daily_recommendation(snapshot)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({"snapshot": snapshot, "recommendation": recommendation}, indent=2))
    return 0


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("sources must be a JSON object")
    return data


def _load_default_sources() -> dict[str, Any]:
    from . import live_sources

    return {
        "snapshot_date": None,
        "timezone": "Europe/Malta",
        "garmin": live_sources.fetch_garmin_payload(),
        "hevy": live_sources.fetch_hevy_payload(),
        "cronometer": live_sources.fetch_cronometer_payload(),
        "manual_context": live_sources.fetch_manual_context_payload(),
    }


if __name__ == "__main__":
    raise SystemExit(main())
