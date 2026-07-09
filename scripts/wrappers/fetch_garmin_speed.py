#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import shlex
import sys
import textwrap
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.mcp_client import McpError, call_tool

GARMIN_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_GARMIN_MCP_COMMAND",
    "uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp",
)

RUN_RECORD_TYPES = {
    1: "Fastest 1K",
    2: "Fastest Mile",
    3: "Fastest 5K",
    4: "Fastest 10K",
    5: "Fastest Half Marathon",
    7: "Longest Run",
}


async def fetch() -> dict:
    garmin_email = os.environ.get("GARMIN_EMAIL") or os.environ.get("GC_EMAIL")
    garmin_password = os.environ.get("GARMIN_PASSWORD") or os.environ.get("GC_PASSWORD")

    if garmin_email and garmin_password:
        try:
            return await _fetch_direct(garmin_email, garmin_password)
        except Exception as e:
            print(
                f"[garmin-speed] direct fetch failed, falling back to MCP: {e}",
                file=sys.stderr,
            )
    return await _fetch_via_mcp()


async def _fetch_direct(email: str, password: str) -> dict:
    script = textwrap.dedent(f"""\
        import json, sys
        from garminconnect import Garmin
        client = Garmin({json.dumps(email)}, {json.dumps(password)})
        client.login()
        try:
            records = client.get_personal_record()
            print(json.dumps(records if isinstance(records, list) else []))
        except Exception as e:
            print(json.dumps({{"error": str(e)}}))
    """)

    proc = await asyncio.create_subprocess_exec(
        *shlex.split("uv run --with garminconnect -- python3 -"),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(script.encode()), timeout=60)
    if proc.returncode != 0:
        err = stderr.decode()[:500]
        raise RuntimeError(f"garminconnect subprocess failed (exit {proc.returncode}): {err}")

    raw = json.loads(stdout.decode())
    if isinstance(raw, dict) and "error" in raw:
        print(f"[garmin-speed] {raw['error']}", file=sys.stderr)
        return {"result": []}

    records = _extract_records(raw)
    return {"result": records}


async def _fetch_via_mcp() -> dict:
    records = []
    try:
        raw = await call_tool(GARMIN_COMMAND, "get_personal_record")
        source = raw if isinstance(raw, list) else raw.get("result", raw) if isinstance(raw, dict) else []
        if isinstance(source, str):
            source = json.loads(source)
        records = _extract_records(source)
    except McpError as e:
        print(f"[garmin-speed] personal records unavailable: {e}", file=sys.stderr)
    return {"result": records}


def _extract_records(source) -> list[dict]:
    if not isinstance(source, list):
        return []
    results = []
    for entry in source:
        if not isinstance(entry, dict):
            continue
        record_type = _record_type_for_entry(entry)
        if record_type is None:
            continue
        results.append(
            {
                "record_type": record_type,
                "value": entry.get("value"),
                "date": entry.get("date") or entry.get("start_date") or entry.get("startTimeLocal"),
                "raw_value": entry.get("raw_value") or entry.get("rawValue"),
                "activity_id": entry.get("activity_id") or entry.get("activityId") or entry.get("activityIdGarmin"),
                "type_id": entry.get("type_id") or entry.get("typeId"),
            }
        )
    return results


def _record_type_for_entry(entry: dict) -> str | None:
    record_type = str(
        entry.get("record_type") or entry.get("recordType") or entry.get("name") or entry.get("activityName") or ""
    )
    if record_type in RUN_RECORD_TYPES.values():
        return record_type

    type_id = entry.get("typeId") or entry.get("type_id")
    try:
        type_id = int(type_id)
    except (TypeError, ValueError):
        type_id = None
    if type_id in RUN_RECORD_TYPES:
        return RUN_RECORD_TYPES[type_id]
    return None


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
