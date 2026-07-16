#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import logging
import os
import shlex
import sys
import tempfile
import textwrap
from datetime import datetime, timedelta
from pathlib import Path

try:
    from datetime import UTC
except ImportError:  # pragma: no cover - compatibility for older local interpreters
    UTC = UTC

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.mcp_client import McpError, call_tool
from scripts.wrappers import fetch_garmin

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

logger = logging.getLogger(__name__)
UV_CACHE_DIR = Path(tempfile.gettempdir()) / "personal-trainer-uv-cache"
DEFAULT_LOOKBACK_DAYS = 30
ACTIVITY_PAGE_SIZE = 1000


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


async def fetch() -> dict:
    garmin_email = os.environ.get("GARMIN_EMAIL") or os.environ.get("GC_EMAIL")
    garmin_password = os.environ.get("GARMIN_PASSWORD") or os.environ.get("GC_PASSWORD")
    logger.info("[garmin-speed] fetching running activities and records")

    if garmin_email and garmin_password:
        try:
            logger.info("[garmin-speed] trying direct credential login")
            return await _fetch_direct(garmin_email, garmin_password)
        except Exception as e:
            print(
                f"[garmin-speed] direct fetch failed, falling back to MCP: {e}",
                file=sys.stderr,
            )
            logger.warning("[garmin-speed] direct fetch failed, falling back to MCP: %s", e)
    logger.info("[garmin-speed] fetching via MCP")
    try:
        return await _fetch_via_mcp()
    except Exception as exc:  # noqa: BLE001
        logger.warning("[garmin-speed] MCP fetch failed, returning empty payload: %s", exc)
        return _empty_payload()


async def _fetch_direct(email: str, password: str) -> dict:
    lookback_days = _speed_lookback_days()
    script = textwrap.dedent(
        f"""\
        import json, sys
        from datetime import UTC, datetime, timedelta
        from garminconnect import Garmin

        ACTIVITY_PAGE_SIZE = {ACTIVITY_PAGE_SIZE}

        def _normalize_activity_page(page):
            if isinstance(page, str):
                try:
                    page = json.loads(page)
                except json.JSONDecodeError:
                    return []
            if isinstance(page, list):
                return [entry for entry in page if isinstance(entry, dict)]
            if isinstance(page, dict):
                for key in ("activityList", "activities", "result", "items"):
                    source = page.get(key)
                    if isinstance(source, list):
                        return [entry for entry in source if isinstance(entry, dict)]
            return []

        def _collect_all_activities(client):
            activities = []
            start = 0
            while True:
                page = client.get_activities(start, ACTIVITY_PAGE_SIZE)
                page_entries = _normalize_activity_page(page)
                if not page_entries:
                    break
                activities.extend(page_entries)
                if len(page_entries) < ACTIVITY_PAGE_SIZE:
                    break
                start += ACTIVITY_PAGE_SIZE
            return activities

        client = Garmin({json.dumps(email)}, {json.dumps(password)})
        client.login()
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        month_ago = (datetime.now(UTC) - timedelta(days={lookback_days})).strftime("%Y-%m-%d")

        try:
            stats = client.get_stats(today)
            current_vo2max = stats.get("vO2MaxValue")
        except Exception:
            current_vo2max = None

        try:
            trend = client.get_vo2max_trend(month_ago, today)
        except Exception:
            trend = None

        try:
            summary = client.get_user_summary(today)
            sleep_data = client.get_sleep_data(today)
        except Exception:
            summary = {{}}
            sleep_data = {{}}

        try:
            load = client.get_training_load_trend(month_ago, today)
        except Exception:
            load = None

        try:
            records = client.get_personal_record()
            records = records if isinstance(records, list) else []
        except Exception:
            records = []

        try:
            activities = _collect_all_activities(client)
        except Exception:
            activities = []

        print(
            json.dumps(
                {{
                    "records": records,
                    "activities": activities,
                    "current_vo2max": current_vo2max,
                    "vo2max_trend": trend,
                    "vo2max_trend_points": trend if isinstance(trend, list) else [],
                    "training_load_trend": load,
                    "readiness": summary,
                    "sleep_data": sleep_data,
                }}
            )
        )
        """
    )

    proc = await asyncio.create_subprocess_exec(
        *shlex.split("uv run --with garminconnect -- python3 -"),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "UV_CACHE_DIR": str(UV_CACHE_DIR)},
    )
    stdout, stderr = await asyncio.wait_for(proc.communicate(script.encode()), timeout=60)
    if proc.returncode != 0:
        err = stderr.decode()[:500]
        raise RuntimeError(f"garminconnect subprocess failed (exit {proc.returncode}): {err}")

    raw = json.loads(stdout.decode())
    if isinstance(raw, dict) and "error" in raw:
        print(f"[garmin-speed] {raw['error']}", file=sys.stderr)
        logger.warning("[garmin-speed] %s", raw["error"])
        return {
            "result": [],
            "recent_runs": [],
            "current_vo2max": None,
            "vo2max_trend": None,
            "vo2max_trend_points": [],
            "vo2max_trend_history": [],
            "training_load_trend": None,
            "readiness": {},
        }

    records = _extract_records(raw.get("records", []))
    recent_runs = _extract_runs([entry for entry in raw.get("activities", []) if _is_running_activity(entry)])
    return _merge_live_metrics(
        {
            "result": records,
            "recent_runs": recent_runs,
            "current_vo2max": _safe_float(raw.get("current_vo2max")),
            "vo2max_trend": _normalize_trend(raw.get("vo2max_trend")),
            "vo2max_trend_points": _normalize_vo2max_trend_points(
                raw.get("vo2max_trend_points") or raw.get("vo2max_trend")
            ),
            "vo2max_trend_history": _normalize_vo2max_trend_points(
                raw.get("vo2max_trend_history") or raw.get("vo2max_trend_points") or raw.get("vo2max_trend")
            ),
            "training_load_trend": _normalize_trend(raw.get("training_load_trend")),
            "readiness": _normalize_readiness(raw.get("readiness"), raw.get("sleep_data")),
        }
    )


async def _fetch_via_mcp() -> dict:
    lookback_days = _speed_lookback_days()
    records = []
    recent_runs = []
    current_vo2max = None
    vo2max_trend = None
    vo2max_trend_points = []
    vo2max_trend_history = []
    training_load_trend = None
    readiness = {}
    try:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        month_ago = (datetime.now(UTC) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        raw = await call_tool(GARMIN_COMMAND, "get_stats", {"today": today})
        source = raw if isinstance(raw, dict) else {}
        current_vo2max = _safe_float(source.get("vO2MaxValue") or source.get("current_vo2max"))
    except McpError as e:
        print(f"[garmin-speed] vo2max stats unavailable: {e}", file=sys.stderr)
        logger.warning("[garmin-speed] vo2max stats unavailable: %s", e)
    try:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        month_ago = (datetime.now(UTC) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")
        raw = await call_tool(
            GARMIN_COMMAND,
            "get_vo2max_trend",
            {"month_ago": month_ago, "today": today},
        )
        source = raw if isinstance(raw, dict) else {}
        trend_source = source.get("result", source.get("vo2max_trend"))
        vo2max_trend = _normalize_trend(trend_source)
        vo2max_trend_points = _normalize_vo2max_trend_points(trend_source)
    except McpError as e:
        print(f"[garmin-speed] vo2max trend unavailable: {e}", file=sys.stderr)
        logger.warning("[garmin-speed] vo2max trend unavailable: %s", e)
    try:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        raw = await call_tool(GARMIN_COMMAND, "get_user_summary", {"today": today})
        source = raw if isinstance(raw, dict) else {}
        sleep_raw = await call_tool(GARMIN_COMMAND, "get_sleep_data", {"today": today})
        sleep_source = sleep_raw if isinstance(sleep_raw, dict) else {}
        readiness = _normalize_readiness(
            source.get("result", source.get("readiness")),
            sleep_source.get("result", sleep_source.get("sleep_data", sleep_source)),
        )
    except McpError as e:
        print(f"[garmin-speed] readiness unavailable: {e}", file=sys.stderr)
        logger.warning("[garmin-speed] readiness unavailable: %s", e)
    try:
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        month_ago = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")
        raw = await call_tool(GARMIN_COMMAND, "get_training_load_trend", {"month_ago": month_ago, "today": today})
        source = raw if isinstance(raw, dict) else {}
        training_load_trend = _normalize_trend(source.get("result", source.get("training_load_trend")))
    except McpError as e:
        print(f"[garmin-speed] training load trend unavailable: {e}", file=sys.stderr)
        logger.warning("[garmin-speed] training load trend unavailable: %s", e)
    try:
        raw = await call_tool(GARMIN_COMMAND, "get_personal_record")
        source = raw if isinstance(raw, list) else raw.get("result", raw) if isinstance(raw, dict) else []
        if isinstance(source, str):
            source = json.loads(source)
        records = _extract_records(source)
    except McpError as e:
        print(f"[garmin-speed] personal records unavailable: {e}", file=sys.stderr)
        logger.warning("[garmin-speed] personal records unavailable: %s", e)
    try:
        activities = await _collect_all_activities_mcp()
        recent_runs = _extract_runs([entry for entry in activities if _is_running_activity(entry)])
    except McpError as e:
        print(f"[garmin-speed] recent running activities unavailable: {e}", file=sys.stderr)
        logger.warning("[garmin-speed] recent running activities unavailable: %s", e)
    return _merge_live_metrics(
        {
            "result": records,
            "recent_runs": recent_runs,
            "current_vo2max": current_vo2max,
            "vo2max_trend": vo2max_trend,
            "vo2max_trend_points": vo2max_trend_points,
            "vo2max_trend_history": vo2max_trend_history,
            "training_load_trend": training_load_trend,
            "readiness": readiness,
        }
    )


def _speed_lookback_days() -> int:
    raw = os.environ.get("PERSONAL_TRAINER_GARMIN_SPEED_LOOKBACK_DAYS", str(DEFAULT_LOOKBACK_DAYS)).strip()
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_LOOKBACK_DAYS
    return max(1, value)


def _collect_all_activities_direct(client) -> list[dict]:
    activities: list[dict] = []
    start = 0
    while True:
        page = client.get_activities(start, ACTIVITY_PAGE_SIZE)
        page_entries = _normalize_activity_page(page)
        if not page_entries:
            break
        activities.extend(page_entries)
        if len(page_entries) < ACTIVITY_PAGE_SIZE:
            break
        start += ACTIVITY_PAGE_SIZE
    return activities


async def _collect_all_activities_mcp() -> list[dict]:
    activities: list[dict] = []
    start = 0
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    month_ago = (datetime.now(UTC) - timedelta(days=_speed_lookback_days())).strftime("%Y-%m-%d")
    while True:
        try:
            raw = await call_tool(
                GARMIN_COMMAND,
                "get_activities",
                {"start": start, "limit": ACTIVITY_PAGE_SIZE},
            )
        except McpError:
            if start != 0:
                raise
            raw = await call_tool(
                GARMIN_COMMAND,
                "get_activities_by_date",
                {"month_ago": month_ago, "today": today, "sport": "running"},
            )
            return _normalize_activity_page(raw)
        page_entries = _normalize_activity_page(raw)
        if not page_entries:
            if start == 0:
                raise McpError("no activity data received from get_activities")
            break
        activities.extend(page_entries)
        if len(page_entries) < ACTIVITY_PAGE_SIZE:
            break
        start += ACTIVITY_PAGE_SIZE
    return activities


def _merge_live_metrics(payload: dict) -> dict:
    live = fetch_garmin.fetch()
    if not isinstance(live, dict):
        return payload
    payload["current_vo2max"] = payload.get("current_vo2max") or live.get("current_vo2max")
    payload["vo2max_trend"] = payload.get("vo2max_trend") or live.get("vo2max_trend")
    payload["vo2max_trend_points"] = payload.get("vo2max_trend_points") or live.get("vo2max_trend_points") or []
    payload["vo2max_trend_history"] = (
        payload.get("vo2max_trend_history") or live.get("vo2max_trend_history") or payload["vo2max_trend_points"] or []
    )
    payload["training_load_trend"] = payload.get("training_load_trend") or live.get("training_load_trend")
    payload["readiness"] = payload.get("readiness") or live.get("readiness") or {}
    if not payload.get("result") and live.get("recent_bests"):
        payload["result"] = live.get("recent_bests")
    live_runs = live.get("recent_runs") or []
    if payload.get("recent_runs") and live_runs:
        payload["recent_runs"] = _merge_recent_runs(payload["recent_runs"], live_runs)
    elif not payload.get("recent_runs") and live_runs:
        payload["recent_runs"] = live_runs
    return payload


def _empty_payload() -> dict:
    return {
        "result": [],
        "recent_runs": [],
        "current_vo2max": None,
        "vo2max_trend": None,
        "vo2max_trend_points": [],
        "vo2max_trend_history": [],
        "training_load_trend": None,
        "readiness": {},
    }


def _normalize_activity_page(page: object) -> list[dict]:
    if isinstance(page, str):
        try:
            page = json.loads(page)
        except json.JSONDecodeError:
            return []
    if isinstance(page, list):
        return [entry for entry in page if isinstance(entry, dict)]
    if isinstance(page, dict):
        for key in ("activityList", "activities", "result", "items"):
            source = page.get(key)
            if isinstance(source, list):
                return [entry for entry in source if isinstance(entry, dict)]
    return []


def _is_running_activity(entry: dict) -> bool:
    activity_type = _extract_activity_type(entry).lower()
    activity_name = str(entry.get("activityName") or entry.get("name") or "").lower()
    return "run" in activity_type or "run" in activity_name


def _merge_recent_runs(base_runs: list[dict], live_runs: list[dict]) -> list[dict]:
    live_by_key: dict[tuple[object, ...], dict] = {}
    for run in live_runs:
        if not isinstance(run, dict):
            continue
        live_by_key[_run_key(run)] = run

    merged: list[dict] = []
    for run in base_runs:
        if not isinstance(run, dict):
            continue
        merged_run = dict(run)
        live_run = live_by_key.get(_run_key(run))
        if live_run:
            for field in ("avg_heart_rate_bpm", "pace_s_per_km", "activity_id", "name", "activity_type", "start_time"):
                if merged_run.get(field) in (None, "", []):
                    value = live_run.get(field)
                    if value not in (None, "", []):
                        merged_run[field] = value
        merged.append(merged_run)
    return merged


def _run_key(run: dict) -> tuple[object, ...]:
    return (
        run.get("activity_id") or run.get("activityId") or run.get("activity_id"),
        run.get("start_time") or run.get("startTimeLocal") or run.get("startTimeGMT") or run.get("startTime"),
        _safe_float(run.get("distance_m") or run.get("distance")),
        _safe_float(run.get("duration_s") or run.get("duration")),
        run.get("name") or run.get("activityName"),
    )


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


def _extract_runs(source) -> list[dict]:
    if not isinstance(source, list):
        return []
    results = []
    for entry in source:
        if not isinstance(entry, dict):
            continue
        distance_m = _safe_float(entry.get("distance"))
        duration_s = _safe_float(
            entry.get("duration")
            or entry.get("movingDuration")
            or entry.get("elapsedDuration")
            or entry.get("moving_duration")
            or entry.get("timerDuration")
        )
        if distance_m is None or duration_s is None:
            continue
        results.append(
            {
                "activity_id": entry.get("activityId") or entry.get("activity_id"),
                "name": entry.get("activityName") or entry.get("name") or "Run",
                "activity_type": _extract_activity_type(entry),
                "start_time": entry.get("startTimeLocal") or entry.get("startTimeGMT") or entry.get("startTime"),
                "distance_m": distance_m,
                "duration_s": duration_s,
                "pace_s_per_km": duration_s / (distance_m / 1000.0),
                "avg_heart_rate_bpm": _extract_avg_heart_rate(entry),
            }
        )
    return results


def _extract_avg_heart_rate(entry: dict) -> float | None:
    candidates = [
        entry.get("avg_heart_rate_bpm"),
        entry.get("averageHeartRateInBeatsPerMinute"),
        entry.get("averageHeartRate"),
        entry.get("averageHR"),
        entry.get("average_hr"),
        entry.get("avgHeartRate"),
        entry.get("avg_hr"),
    ]
    for candidate in candidates:
        value = _safe_float(candidate)
        if value is not None:
            return value

    nested_sources = [
        entry.get("summary"),
        entry.get("metrics"),
        entry.get("stats"),
        entry.get("performance"),
    ]
    for nested in nested_sources:
        if not isinstance(nested, dict):
            continue
        for key in (
            "averageHeartRateInBeatsPerMinute",
            "averageHeartRate",
            "averageHR",
            "average_hr",
            "avgHeartRate",
            "avg_hr",
        ):
            value = _safe_float(nested.get(key))
            if value is not None:
                return value
    return None


def _normalize_vo2max_trend_points(trend) -> list[dict]:
    if not isinstance(trend, list):
        return []
    points = []
    for entry in trend:
        if not isinstance(entry, dict):
            continue
        value = _safe_float(
            entry.get("vo2Max")
            or entry.get("vo2MaxValue")
            or entry.get("vO2MaxValue")
            or entry.get("vo2max")
            or entry.get("value")
        )
        date = entry.get("calendarDate") or entry.get("date") or entry.get("startDate")
        if date is None and value is None:
            continue
        points.append({"date": date, "vo2max": value})
    return points


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


def _extract_activity_type(entry: dict) -> str:
    activity_type = entry.get("activity_type") or entry.get("type") or entry.get("sport")
    if isinstance(activity_type, dict):
        activity_type = activity_type.get("typeKey") or activity_type.get("typeName")
    if activity_type:
        return str(activity_type)
    nested = entry.get("activityType")
    if isinstance(nested, dict):
        return str(nested.get("typeKey") or nested.get("typeName") or nested.get("name") or "")
    return ""


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_trend(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        return "flat_or_rising" if value else None
    if isinstance(value, dict):
        for key in ("trend", "vo2max_trend", "status", "result"):
            candidate = value.get(key)
            if candidate:
                return str(candidate)
    return str(value)


def _normalize_readiness(value: object, sleep_data: object | None = None) -> dict:
    if not isinstance(value, dict):
        value = {}
    readiness = {}
    sleep_score = value.get("sleep_score")
    if sleep_score in (None, ""):
        sleep_summary = value.get("sleepingQualifierSummary")
        if isinstance(sleep_summary, dict):
            sleep_score = sleep_summary.get("value")
        if sleep_score in (None, ""):
            sleep_score = value.get("sleepingSeconds")
    readiness["sleep_score"] = sleep_score

    resting_hr = value.get("resting_heart_rate_bpm")
    if resting_hr in (None, ""):
        resting_hr = value.get("restingHeartRate") or value.get("lastSevenDaysAvgRestingHeartRate")
    readiness["resting_heart_rate_bpm"] = resting_hr

    raw_hrv = value.get("raw_hrv_ms")
    if raw_hrv in (None, ""):
        hrv_summary = value.get("heartRateVariabilitySummary")
        if isinstance(hrv_summary, dict):
            raw_hrv = hrv_summary.get("value")
        if raw_hrv in (None, ""):
            raw_hrv = value.get("latestHrvValue") or value.get("hrvValue") or value.get("hrvMs")
    if raw_hrv in (None, "") and isinstance(sleep_data, dict):
        raw_hrv = sleep_data.get("avgOvernightHrv")
    readiness["raw_hrv_ms"] = raw_hrv

    hrv = value.get("hrv")
    if hrv in (None, ""):
        hrv_summary = value.get("heartRateVariabilitySummary")
        if isinstance(hrv_summary, dict):
            hrv = hrv_summary.get("value")
    readiness["hrv"] = hrv

    stress = value.get("stress")
    if stress in (None, ""):
        stress_summary = value.get("stressQualifierSummary")
        if isinstance(stress_summary, dict):
            stress = stress_summary.get("value")
    readiness["stress"] = stress

    body_battery = value.get("body_battery")
    if body_battery in (None, ""):
        body_battery = value.get("bodyBatteryChargedValue")
    readiness["body_battery"] = body_battery
    return readiness


def main() -> int:
    try:
        _configure_logging()
        payload = asyncio.run(fetch())
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
