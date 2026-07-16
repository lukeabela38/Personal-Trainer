#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

try:
    from garminconnect import Garmin
except ImportError:
    Garmin = None

logger = logging.getLogger(__name__)

RUN_RECORD_TYPES = {
    1: "Fastest 1K",
    2: "Fastest Mile",
    3: "Fastest 5K",
    4: "Fastest 10K",
    5: "Fastest Half Marathon",
    7: "Longest Run",
}


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def fetch() -> dict:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    month_ago = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")
    tokenstore = _tokenstore_path()

    garmin_email = os.environ.get("GARMIN_EMAIL") or os.environ.get("GC_EMAIL")
    garmin_password = os.environ.get("GARMIN_PASSWORD") or os.environ.get("GC_PASSWORD")

    if Garmin is not None and _tokenstore_is_populated(tokenstore):
        try:
            logger.info("[garmin] using cached token store at %s", tokenstore)
            cached_payload = _fetch_cached(tokenstore, today, month_ago)
            logger.info("[garmin] auth status_code=200 mode=cached tokenstore=%s", tokenstore)
            if not _payload_needs_refresh(cached_payload) or not (garmin_email and garmin_password):
                return cached_payload
            logger.warning("[garmin] cached session returned no usable data, retrying with password")
        except Exception as e:
            logger.warning("[garmin] cached session fetch failed status_code=%s: %s", _status_code(e), e)

    if garmin_email and garmin_password and Garmin is not None:
        try:
            logger.info("[garmin] using direct credential login")
            payload = _fetch_direct(garmin_email, garmin_password, tokenstore, today, month_ago)
            logger.info("[garmin] auth status_code=200 mode=password")
            return payload
        except Exception as e:
            logger.warning("[garmin] direct fetch failed status_code=%s: %s", _status_code(e), e)

    logger.warning("[garmin] credentials unavailable or unusable; returning empty payload status_code=401")
    return _empty_payload()


def _tokenstore_path() -> Path:
    configured = os.environ.get("GARMINTOKENS")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".garminconnect"


def _tokenstore_is_populated(tokenstore: Path) -> bool:
    return tokenstore.is_dir() and all(
        (tokenstore / filename).is_file() for filename in ("oauth1_token.json", "oauth2_token.json")
    )


def _fetch_cached(tokenstore: Path, today: str, month_ago: str) -> dict:
    client = Garmin()
    client.login(tokenstore=str(tokenstore))
    return _build_payload(client, today, month_ago)


def _fetch_direct(email: str, password: str, tokenstore: Path, today: str, month_ago: str) -> dict:
    client = Garmin(email, password)
    client.login()
    try:
        client.garth.dump(str(tokenstore))
    except Exception:
        pass

    return _build_payload(client, today, month_ago)


def _status_code(exc: Exception) -> int:
    response = getattr(exc, "response", None)
    if response is not None and getattr(response, "status_code", None) is not None:
        try:
            return int(response.status_code)
        except (TypeError, ValueError):
            pass
    return 500


def _build_payload(client, today: str, month_ago: str) -> dict:
    payload = _empty_payload()

    try:
        stats = client.get_stats(today)
        payload["current_vo2max"] = _safe_float(stats.get("vO2MaxValue"))
    except Exception:
        pass

    try:
        trend = client.get_vo2max_trend(month_ago, today)
        trend_points = _normalize_vo2max_trend_points(trend)
        if trend_points:
            payload["vo2max_trend_points"] = trend_points
            payload["vo2max_trend_history"] = trend_points
            payload["vo2max_trend"] = _trend_label(trend_points)
    except Exception:
        pass

    try:
        summary = client.get_user_summary(today)
        sleep_data = client.get_sleep_data(today)
        payload["readiness"] = _normalize_readiness(summary, sleep_data)
    except Exception:
        pass

    try:
        acts = client.get_activities(0, 10)
        payload["recent_activities"] = [
            {
                "id": a.get("activityId"),
                "name": a.get("activityName"),
                "type": a.get("activityType", {}).get("typeKey"),
                "start_time": a.get("startTimeLocal"),
                "distance_meters": a.get("distance"),
                "duration_seconds": a.get("duration"),
            }
            for a in acts
            if isinstance(a, dict)
        ]
        payload["flags"] = sorted(set(payload["flags"] + _activity_flags(payload["recent_activities"])))
    except Exception:
        pass

    try:
        runs = client.get_activities_by_date(month_ago, today, "running")
        if isinstance(runs, list):
            payload["recent_runs"] = [_summarize_run(run) for run in runs if isinstance(run, dict)]
            run_trend_points = []
            vo2_values = []
            for run in runs:
                name = str(run.get("activityName", "")).lower()
                rtype = str(run.get("activityType", {}).get("typeKey", "")).lower()
                distance = _safe_float(run.get("distance"))
                vo2_value = _safe_float(run.get("vO2MaxValue") or run.get("vo2MaxValue"))
                if vo2_value is not None:
                    vo2_values.append(vo2_value)
                    run_trend_points.append(
                        {
                            "date": run.get("startTimeLocal") or run.get("startTimeGMT") or run.get("startTime"),
                            "vo2max": vo2_value,
                        }
                    )
                if any(kw in name or kw in rtype for kw in ("interval", "tempo", "threshold", "quality")):
                    if payload["last_quality_run"] is None:
                        payload["last_quality_run"] = _summarize_activity(run)
                if "long" in name or "long" in rtype or (distance is not None and distance >= 15000):
                    if payload["last_long_run"] is None:
                        payload["last_long_run"] = _summarize_activity(run)
            if run_trend_points and not payload.get("vo2max_trend_points"):
                payload["vo2max_trend_points"] = run_trend_points
            if run_trend_points and not payload.get("vo2max_trend_history"):
                payload["vo2max_trend_history"] = run_trend_points
            if vo2_values:
                payload["current_vo2max"] = vo2_values[0]
                if len(vo2_values) > 1 and payload.get("vo2max_trend") in (None, "unknown"):
                    payload["vo2max_trend"] = (
                        "up"
                        if vo2_values[0] > vo2_values[-1]
                        else "down"
                        if vo2_values[0] < vo2_values[-1]
                        else "stable"
                    )
    except Exception:
        pass

    try:
        load = client.get_training_load_trend(month_ago, today)
        if isinstance(load, dict):
            payload["training_load_trend"] = str(load.get("days_with_data", ""))
    except Exception:
        pass

    try:
        records = client.get_personal_record()
        if isinstance(records, list):
            payload["recent_bests"] = [
                {
                    "record_type": _record_type_for_entry(r),
                    "value": r.get("value") or r.get("displayValue"),
                    "date": r.get("date") or r.get("startDate"),
                    "activity_id": r.get("activityId") or r.get("activity_id"),
                    "activity_name": r.get("activityName") or r.get("name"),
                    "activity_type": r.get("activityType") or r.get("activity_type"),
                    "activity_start_time_gmt": r.get("activityStartDateTimeInGMTFormatted")
                    or r.get("activityStartDateTimeInGMT"),
                    "activity_start_time_local": r.get("activityStartDateTimeLocalFormatted")
                    or r.get("activityStartDateTimeLocal"),
                    "pr_start_time_gmt": r.get("prStartTimeGmtFormatted") or r.get("prStartTimeGmt"),
                    "pr_start_time_local": r.get("prStartTimeLocalFormatted") or r.get("prStartTimeLocal"),
                }
                for r in records
                if isinstance(r, dict)
            ]
    except Exception:
        pass

    return payload


def _payload_needs_refresh(payload: dict) -> bool:
    return not any(
        (
            payload.get("current_vo2max") is not None,
            payload.get("recent_activities"),
            payload.get("recent_runs"),
            payload.get("recent_bests"),
            payload.get("readiness"),
        )
    )


def _empty_payload() -> dict:
    return {
        "freshness": "fresh",
        "current_vo2max": None,
        "vo2max_trend": "unknown",
        "vo2max_trend_points": [],
        "vo2max_trend_history": [],
        "training_status": None,
        "training_load_trend": None,
        "readiness": {},
        "recent_activities": [],
        "recent_runs": [],
        "last_quality_run": None,
        "last_long_run": None,
        "recent_bests": [],
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


def _normalize_readiness(summary: dict, sleep_data: object | None = None) -> dict:
    raw_hrv_ms = _safe_float(
        _summary_value(
            summary,
            (
                "heartRateVariabilitySummary",
                "value",
            ),
            summary.get("latestHrvValue")
            or summary.get("hrvValue")
            or summary.get("hrvMs")
            or summary.get("heartRateVariabilityMs"),
        )
    )
    if raw_hrv_ms is None and isinstance(sleep_data, dict):
        raw_hrv_ms = _safe_float(
            sleep_data.get("avgOvernightHrv")
            or _summary_value(
                sleep_data,
                (
                    "hrvData",
                    "value",
                ),
            )
        )

    return {
        "sleep_score": _summary_value(summary, ("sleepingQualifierSummary", "value"), summary.get("sleepingSeconds")),
        "resting_heart_rate_bpm": _safe_float(
            summary.get("restingHeartRate") or summary.get("lastSevenDaysAvgRestingHeartRate")
        ),
        "raw_hrv_ms": raw_hrv_ms,
        "hrv": _summary_value(summary, ("heartRateVariabilitySummary", "value")),
        "stress": _summary_value(summary, ("stressQualifierSummary", "value")),
        "body_battery": _safe_float(summary.get("bodyBatteryChargedValue")),
    }


def _record_type_for_entry(entry: dict) -> str:
    record_type = str(entry.get("record_type") or entry.get("recordType") or entry.get("name") or "")
    if record_type in RUN_RECORD_TYPES.values():
        return record_type

    type_id = entry.get("typeId") or entry.get("type_id")
    try:
        type_id = int(type_id)
    except (TypeError, ValueError):
        type_id = None
    if type_id in RUN_RECORD_TYPES:
        return RUN_RECORD_TYPES[type_id]
    return record_type


def _summary_value(summary: dict, path: tuple[str, ...], default=None):
    if not isinstance(summary, dict):
        return default
    current: object = summary
    for key in path:
        if not isinstance(current, dict):
            return default
        current = current.get(key)
    return current if current not in (None, "") else default


def _normalize_vo2max_trend_points(trend: object) -> list[dict]:
    if not isinstance(trend, list):
        return []
    points: list[dict] = []
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
        point = {"date": date, "vo2max": value}
        if date is None and value is None:
            continue
        points.append(point)
    return points


def _trend_label(points: list[dict]) -> str:
    values = [point.get("vo2max") for point in points if point.get("vo2max") is not None]
    if len(values) < 2:
        return "stable"
    first = values[0]
    last = values[-1]
    if last > first:
        return "up"
    if last < first:
        return "down"
    return "stable"


def _summarize_activity(run: dict) -> dict:
    return {
        "date": run.get("start_time") or run.get("startTimeLocal") or "",
        "distance_m": _safe_float(run.get("distance_meters") or run.get("distance")),
        "duration_s": _safe_float(run.get("duration_seconds") or run.get("duration") or run.get("moving_duration")),
        "type": run.get("type", "")
        or (run.get("activityType", {}).get("typeKey") if isinstance(run.get("activityType"), dict) else ""),
    }


def _summarize_run(run: dict) -> dict:
    return {
        "activity_id": run.get("activityId") or run.get("activity_id"),
        "name": run.get("activityName") or run.get("name") or "Run",
        "activity_type": _extract_activity_type(run),
        "start_time": run.get("startTimeLocal") or run.get("startTimeGMT") or run.get("startTime"),
        "distance_meters": run.get("distance"),
        "duration_seconds": run.get("duration")
        or run.get("movingDuration")
        or run.get("elapsedDuration")
        or run.get("moving_duration")
        or run.get("timerDuration"),
        "avg_heart_rate_bpm": _extract_avg_heart_rate(run),
    }


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


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _extract_avg_heart_rate(entry: dict) -> float | None:
    for candidate in (
        entry.get("averageHeartRateInBeatsPerMinute"),
        entry.get("averageHeartRate"),
        entry.get("averageHR"),
        entry.get("average_hr"),
        entry.get("avgHeartRate"),
        entry.get("avg_hr"),
    ):
        value = _safe_float(candidate)
        if value is not None:
            return value

    for nested in (
        entry.get("summary"),
        entry.get("metrics"),
        entry.get("stats"),
        entry.get("performance"),
    ):
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


def main() -> int:
    try:
        _configure_logging()
        payload = fetch()
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
