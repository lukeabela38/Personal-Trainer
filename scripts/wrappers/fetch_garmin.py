#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime

from scripts.mcp_client import McpError, call_tool


GARMIN_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_GARMIN_MCP_COMMAND",
    "/opt/homebrew/bin/uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp",
)


FRESHNESS_PERIOD_HOURS = 6


def _freshness() -> str:
    return "fresh"


async def fetch() -> dict:
    payload: dict = {
        "freshness": _freshness(),
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
        vo2max = await call_tool(GARMIN_COMMAND, "get_vo2max_trend")
        if isinstance(vo2max, list) and vo2max:
            latest = vo2max[0]
            payload["current_vo2max"] = _safe_float(latest.get("vo2MaxValue") or latest.get("vo2Max" or latest.get("value")))
            payload["vo2max_trend"] = _trend(latest)
    except McpError as e:
        print(f"[garmin] vo2max unavailable: {e}", file=sys.stderr)

    try:
        activities = await call_tool(GARMIN_COMMAND, "get_latest_activity_summaries")
        if isinstance(activities, list):
            payload["recent_activities"] = activities[:10]
            flags = _activity_flags(activities)
            payload["flags"] = sorted(set(payload["flags"] + flags))
    except McpError as e:
        print(f"[garmin] activities unavailable: {e}", file=sys.stderr)

    try:
        readiness = await call_tool(GARMIN_COMMAND, "get_recovery_context")
        if isinstance(readiness, dict):
            payload["readiness"] = readiness
            flags = _readiness_flags(readiness)
            payload["flags"] = sorted(set(payload["flags"] + flags))
    except McpError as e:
        print(f"[garmin] readiness unavailable: {e}", file=sys.stderr)

    try:
        load = await call_tool(GARMIN_COMMAND, "get_training_load_trend")
        if isinstance(load, dict):
            payload["training_load_trend"] = load.get("trend") or load.get("loadTrend") or str(load.get("status", ""))
            payload["training_status"] = load.get("status") or load.get("trainingStatus")
    except McpError as e:
        print(f"[garmin] training load unavailable: {e}", file=sys.stderr)

    try:
        runs = await call_tool(GARMIN_COMMAND, "get_running_activity_history")
        if isinstance(runs, list):
            payload["recent_runs"] = runs[:10]
            for run in runs:
                run_type = str(run.get("activityType", "")).lower()
                if "quality" in run_type or "interval" in run_type or "tempo" in run_type or "threshold" in run_type:
                    if payload["last_quality_run"] is None:
                        payload["last_quality_run"] = _summarize_activity(run)
                if "long" in run_type or ("distance" in run_type and _safe_float(run.get("distance")) >= 15000):
                    if payload["last_long_run"] is None:
                        payload["last_long_run"] = _summarize_activity(run)
    except McpError as e:
        print(f"[garmin] running history unavailable: {e}", file=sys.stderr)

    return payload


def _trend(entry: dict) -> str:
    trend = entry.get("trend") or entry.get("trendDirection") or ""
    trend = str(trend).lower()
    if trend in ("up", "improving", "upward"):
        return "up"
    if trend in ("down", "declining", "downward"):
        return "down"
    if trend in ("stable", "maintaining"):
        return "stable"
    return "unknown"


def _activity_flags(activities: list) -> list[str]:
    flags = []
    for act in activities[:3]:
        act_type = str(act.get("activityType", "")).lower()
        if "strength" in act_type or "resistance" in act_type:
            flags.append("strength_not_normalized")
        if "rest" in act_type or "recovery" in act_type:
            flags.append("recovery_day")
    return flags


def _readiness_flags(readiness: dict) -> list[str]:
    flags = []
    if _safe_float(readiness.get("hrvStatus")) < 50 and _safe_float(readiness.get("hrvStatus")) > 0:
        flags.append("hrv_low")
    if _safe_float(readiness.get("sleepScore")) < 60 and _safe_float(readiness.get("sleepScore")) > 0:
        flags.append("sleep_poor")
    if _safe_float(readiness.get("stressLevel")) > 60 and _safe_float(readiness.get("stressLevel")) > 0:
        flags.append("stress_high")
    if _safe_int(readiness.get("bodyBattery")) < 40 and _safe_int(readiness.get("bodyBattery")) > 0:
        flags.append("recovery_poor")
    return flags


def _summarize_activity(run: dict) -> dict:
    return {
        "date": run.get("startTime") or run.get("date") or "",
        "distance_m": _safe_float(run.get("distance")),
        "duration_s": _safe_float(run.get("duration") or run.get("elapsedDuration")),
        "type": run.get("activityType", ""),
    }


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
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
