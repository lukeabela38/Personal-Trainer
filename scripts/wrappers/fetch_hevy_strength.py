#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys

from scripts.mcp_client import McpError, call_tool


HEVY_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_HEVY_MCP_COMMAND",
    "/opt/homebrew/bin/npx -y -p node@26 -p hevy-mcp hevy-mcp",
)

_TRACKED_EXERCISES = [
    ("Squat (Barbell)", "D04AC939"),
    ("Bench Press (Barbell)", "79D0BB3A"),
    ("Chin Up", "29083183"),
    ("Triceps Dip", "28BB4A95"),
    ("Push Up", "392887AA"),
    ("Dumbbell Row", "F1E57334"),
    ("Sumo Squat (Kettlebell)", "5E10D0E6"),
    ("Single Arm Tricep Extension (Dumbbell)", "8347DFD1"),
]


async def fetch() -> list[dict]:
    all_rows: list[dict] = []

    for name, template_id in _TRACKED_EXERCISES:
        try:
            history = await call_tool(
                HEVY_COMMAND,
                "get-exercise-history",
                {"exerciseTemplateId": template_id, "page": 1, "pageSize": 50},
            )
            rows = history if isinstance(history, list) else []
            for row in rows:
                if isinstance(row, dict):
                    row["_exercise_name"] = name
                    all_rows.append(row)
        except McpError as e:
            print(f"[hevy-strength] {name} history unavailable: {e}", file=sys.stderr)

    return all_rows


def main() -> int:
    try:
        payload = asyncio.run(fetch())
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
