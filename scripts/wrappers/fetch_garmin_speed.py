#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys

from scripts.mcp_client import McpError, call_tool


GARMIN_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_GARMIN_MCP_COMMAND",
    "/opt/homebrew/bin/uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp",
)

RUN_RECORD_TYPES = {
    "Fastest 1K",
    "Fastest Mile",
    "Fastest 5K",
    "Fastest 10K",
    "Fastest Half Marathon",
    "Longest Run",
}


async def fetch() -> dict:
    records = []

    try:
        raw = await call_tool(GARMIN_COMMAND, "get_personal_record")
        source = raw if isinstance(raw, list) else raw.get("result", raw) if isinstance(raw, dict) else []
        if isinstance(source, str):
            source = json.loads(source)
        if isinstance(source, list):
            for entry in source:
                if not isinstance(entry, dict):
                    continue
                record_type = str(entry.get("record_type") or entry.get("recordType") or entry.get("name") or "")
                if record_type not in RUN_RECORD_TYPES:
                    continue
                records.append({
                    "record_type": record_type,
                    "value": entry.get("value"),
                    "date": entry.get("date") or entry.get("start_date"),
                    "raw_value": entry.get("raw_value") or entry.get("rawValue"),
                    "activity_id": entry.get("activity_id") or entry.get("activityId") or entry.get("activityIdGarmin"),
                    "type_id": entry.get("type_id") or entry.get("typeId"),
                })
    except McpError as e:
        print(f"[garmin-speed] personal records unavailable: {e}", file=sys.stderr)

    return {"result": records}


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
