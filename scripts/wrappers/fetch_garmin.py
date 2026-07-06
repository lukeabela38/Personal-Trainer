#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta

from scripts.mcp_client import McpError, call_tool


GARMIN_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_GARMIN_MCP_COMMAND",
    "/opt/homebrew/bin/uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp",
)


async def fetch() -> dict:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    week_ago = (datetime.now(UTC) - timedelta(days=7)).strftime("%Y-%m-%d")
    month_ago = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")

    payload: dict = {
        "freshness": "fresh",
        "current_vo2max": None,
        "vo2max_trend": "unknown",
        "training_status": None,
        "training_load_trend": None,
        "readiness": {},
        "recent_activities": [],
        "recent_runs": [],
        "last_quality_run": None,
        "last_long_run": None,
        "flags": [],
    }

    try:
        vo2max = await call_tool(GARMIN_COMMAND, "get_vo2max_trend", {"start_date": month_ago, "end_date": today})
        if isinstance(vo2max, dict):
            payload["current_vo2max"] = _safe_float(vo2max.get("latest_vo2_max"))
            change = vo2max.get("change", 0)
            if isinstance(change, (int, float)):
                payload["vo2max_trend"] = "up" if change > 0 else "down" if change < 0 else "stable"
    except McpError as e:
        print(f"[garmin] vo2max unavailable: {e}", file=sys.stderr)

    try:
        activities = await call_tool(GARMIN_COMMAND, "get_activities", {"start": 0, "limit": 10})
        if isinstance(activities, dict):
            items = activities.get("activities", [])
            if isinstance(items, list):
                payload["recent_activities"] = items
                payload["flags"] = sorted(set(payload["flags"] + _activity_flags(items)))
    except McpError as e:
        print(f"[garmin] activities unavailable: {e}", file=sys.stderr)

    try:
        readiness = await call_tool(GARMIN_COMMAND, "get_training_readiness", {"date": today})
        if isinstance(readiness, list) and readiness:
            payload["readiness"] = readiness[0]
            payload["flags"] = sorted(set(payload["flags"] + _readiness_flags(readiness[0])))
    except McpError as e:
        print(f"[garmin] readiness unavailable: {e}", file=sys.stderr)

    try:
        load = await call_tool(GARMIN_COMMAND, "get_training_load_trend", {"start_date": month_ago, "end_date": today})
        if isinstance(load, dict):
            payload["training_load_trend"] = str(load.get("days_with_data", ""))
    except McpError as e:
        print(f"[garmin] training load unavailable: {e}", file=sys.stderr)

    try:
        runs = await call_tool(
            GARMIN_COMMAND, "get_activities_by_date",
            {"start_date": month_ago, "end_date": today, "activity_type": "running", "page": 0, "page_size": 20},
        )
        if isinstance(runs, dict):
            items = runs.get("activities", [])
            if isinstance(items, list):
                payload["recent_runs"] = items[:10]
                for run in items:
                    name = str(run.get("name", "")).lower()
                    rtype = str(run.get("type", "")).lower()
                    distance = _safe_float(run.get("distance_meters"))
                    if any(kw in name or kw in rtype for kw in ("interval", "tempo", "threshold", "quality")):
                        if payload["last_quality_run"] is None:
                            payload["last_quality_run"] = _summarize_activity(run)
                    if "long" in name or "long" in rtype or (distance is not None and distance >= 15000):
                        if payload["last_long_run"] is None:
                            payload["last_long_run"] = _summarize_activity(run)
    except McpError as e:
        print(f"[garmin] running history unavailable: {e}", file=sys.stderr)

    return payload


def _activity_flags(activities: list) -> list[str]:
    flags = []
    for act in activities[:3]:
        rtype = str(act.get("type", "")).lower()
        name = str(act.get("name", "")).lower()
        if "strength" in rtype or "resistance" in rtype or "strength" in name:
            flags.append("strength_not_normalized")
        if "rest" in rtype or "recovery" in rtype:
            flags.append("recovery_day")
    return flags


def _readiness_flags(r: dict) -> list[str]:
    flags = []
    feedback = str(r.get("feedback", "")).upper()
    if feedback in ("NEEDS_ATTENTION", "SEEK_RECOVERY"):
        flags.append("recovery_poor")
    context = str(r.get("context", "")).upper()
    if "STRESS" in context and "HIGH" in context:
        flags.append("stress_high")
    sleep_score = r.get("sleep_score")
    if isinstance(sleep_score, (int, float)) and 0 < sleep_score < 60:
        flags.append("sleep_poor")
    return flags


def _summarize_activity(run: dict) -> dict:
    return {
        "date": run.get("start_time", ""),
        "distance_m": _safe_float(run.get("distance_meters")),
        "duration_s": _safe_float(run.get("duration_seconds") or run.get("moving_duration")),
        "type": run.get("type", ""),
    }


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
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
