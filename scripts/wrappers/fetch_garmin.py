#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import shlex
import subprocess
import sys
import textwrap
from datetime import UTC, datetime, timedelta

from scripts.mcp_client import McpError, call_tool


GARMIN_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_GARMIN_MCP_COMMAND",
    "/opt/homebrew/bin/uvx --python 3.12 --from git+https://github.com/Taxuspt/garmin_mcp garmin-mcp",
)


async def fetch() -> dict:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    month_ago = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")

    garmin_email = os.environ.get("GARMIN_EMAIL") or os.environ.get("GC_EMAIL")
    garmin_password = os.environ.get("GARMIN_PASSWORD") or os.environ.get("GC_PASSWORD")

    if garmin_email and garmin_password:
        try:
            return await _fetch_direct(garmin_email, garmin_password, today, month_ago)
        except Exception as e:
            print(f"[garmin] direct fetch failed, falling back to MCP: {e}", file=sys.stderr)
    return await _fetch_via_mcp(today, month_ago)


async def _fetch_direct(email: str, password: str, today: str, month_ago: str) -> dict:
    script = textwrap.dedent(f"""\
        import json, sys
        from garminconnect import Garmin
        client = Garmin({json.dumps(email)}, {json.dumps(password)})
        client.login()
        today = {json.dumps(today)}
        month_ago = {json.dumps(month_ago)}
        result = {{}}
        try:
            stats = client.get_stats(today)
            result["current_vo2max"] = stats.get("vO2MaxValue")
        except Exception: pass
        try:
            trend = client.get_vo2max_trend(month_ago, today)
            if isinstance(trend, list) and trend:
                vals = [t.get("vo2Max") or t.get("vo2MaxValue") for t in trend if t.get("vo2Max") or t.get("vo2MaxValue")]
                if vals:
                    result["current_vo2max"] = max(vals)
                    result["vo2max_trend"] = "up" if vals[-1] > vals[0] else "down" if vals[-1] < vals[0] else "stable"
        except Exception: pass
        try:
            summary = client.get_user_summary(today)
            result["readiness"] = {{
                "sleep_score": summary.get("sleepingQualifierSummary", {{}}).get("value") or summary.get("sleepingSeconds"),
                "hrv": summary.get("heartRateVariabilitySummary", {{}}).get("value"),
                "stress": summary.get("stressQualifierSummary", {{}}).get("value"),
                "body_battery": summary.get("bodyBatteryChargedValue"),
            }}
        except Exception: pass
        try:
            acts = client.get_activities(0, 10)
            result["recent_activities"] = [
                {{"id": a.get("activityId"), "name": a.get("activityName"), "type": a.get("activityType", {{}}).get("typeKey"),
                  "start_time": a.get("startTimeLocal"), "distance_meters": a.get("distance"), "duration_seconds": a.get("duration")}}
                for a in acts if isinstance(a, dict)
            ]
        except Exception: pass
        try:
            runs = client.get_activities_by_date(month_ago, today, "running")
            result["recent_runs"] = runs[:20] if isinstance(runs, list) else []
        except Exception: pass
        try:
            load = client.get_training_load_trend(month_ago, today)
            if isinstance(load, dict):
                result["training_load_trend"] = str(load.get("days_with_data", ""))
        except Exception: pass
        print(json.dumps(result))
    """)

    proc = await asyncio.create_subprocess_exec(
        *shlex.split("/opt/homebrew/bin/uv run --with garminconnect -- python3 -"),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(script.encode()), timeout=60)
    if proc.returncode != 0:
        err = stderr.decode() if stderr else ""
        raise RuntimeError(f"garminconnect subprocess failed (exit {proc.returncode}): {err[:500]}")

    data = json.loads(stdout.decode())

    vo2max = data.get("current_vo2max")
    trend_val = data.get("vo2max_trend", "unknown")

    payload = _empty_payload()
    payload["current_vo2max"] = _safe_float(vo2max)
    payload["vo2max_trend"] = trend_val if isinstance(trend_val, str) else "unknown"
    payload["training_load_trend"] = str(data.get("training_load_trend", ""))
    payload["readiness"] = data.get("readiness", {})

    activities = data.get("recent_activities", [])
    if isinstance(activities, list):
        payload["recent_activities"] = activities
        payload["flags"] = sorted(set(payload["flags"] + _activity_flags(activities)))

    runs = data.get("recent_runs", [])
    if isinstance(runs, list):
        payload["recent_runs"] = runs[:10]
        for run in runs:
            name = str(run.get("activityName", run.get("name", ""))).lower()
            rtype = str(run.get("activityType", run.get("type", ""))).lower()
            distance = _safe_float(run.get("distance") or run.get("distance_meters"))
            if any(kw in name or kw in rtype for kw in ("interval", "tempo", "threshold", "quality")):
                if payload["last_quality_run"] is None:
                    payload["last_quality_run"] = _summarize_activity(run)
            if "long" in name or "long" in rtype or (distance is not None and distance >= 15000):
                if payload["last_long_run"] is None:
                    payload["last_long_run"] = _summarize_activity(run)

    return payload


async def _fetch_via_mcp(today: str, month_ago: str) -> dict:
    payload = _empty_payload()

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


def _empty_payload() -> dict:
    return {
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


def _activity_flags(activities: list) -> list[str]:
    flags = []
    for act in activities[:3]:
        rtype = str(act.get("type", "")).lower()
        name = str(act.get("name", "") or act.get("activityName", "")).lower()
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
        "date": run.get("start_time") or run.get("startTimeLocal") or "",
        "distance_m": _safe_float(run.get("distance_meters") or run.get("distance")),
        "duration_s": _safe_float(run.get("duration_seconds") or run.get("duration") or run.get("moving_duration")),
        "type": run.get("type", "") or (run.get("activityType", {}).get("typeKey") if isinstance(run.get("activityType"), dict) else ""),
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
