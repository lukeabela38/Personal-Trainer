from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .recommendation import build_daily_recommendation


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a daily training recommendation from a snapshot JSON file."
    )
    parser.add_argument("snapshot", type=Path, help="Path to a normalized snapshot JSON file")
    args = parser.parse_args(argv)

    try:
        snapshot = _load_json(args.snapshot)
        recommendation = build_daily_recommendation(snapshot)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(recommendation, indent=2))
    return 0


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("snapshot must be a JSON object")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
