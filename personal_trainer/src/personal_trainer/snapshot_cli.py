from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .snapshot import build_snapshot


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Normalize source payloads into the Personal Trainer snapshot contract."
    )
    parser.add_argument("sources", type=Path, help="Path to a source payload JSON file")
    parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
    parser.add_argument("--timezone", default="Europe/Malta", help="Snapshot timezone")
    args = parser.parse_args(argv)

    try:
        sources = _load_json(args.sources)
        snapshot = build_snapshot(sources, snapshot_date=args.date, timezone=args.timezone)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(snapshot, indent=2))
    return 0


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("sources must be a JSON object")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
