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
            if not _payload_needs_refresh(cached_payload) or not (garmin_email and garmin_password):
                return cached_payload
            logger.warning("[garmin] cached session returned no usable data, retrying with password")
        except Exception as e:
            logger.warning("[garmin] cached session fetch failed: %s", e)

    if garmin_email and garmin_password and Garmin is not None:
        try:
            logger.info("[garmin] using direct credential login")
            return _fetch_direct(garmin_email, garmin_password, tokenstore, today, month_ago)
        except Exception as e:
            logger.warning("[garmin] direct fetch failed: %s", e)

    logger.warning("[garmin] credentials unavailable or unusable; returning empty payload")
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


def _build_payload(client, today: str, month_ago: str) -> dict:
    payload = _empty_payload()

    try:
        stats = client.get_stats(today)
        payload["current_vo2max"] = _safe_float(stats.get("vO2MaxValue"))
    except Exception:
        pass

    try:
        trend = client.get_vo2max_trend(month_ago, today)
        if isinstance(trend, list) and trend:
            vals = [t.get("vo2Max") or t.get("vo2MaxValue") for t in trend if t.get("vo2Max") or t.get("vo2MaxValue")]
            if vals:
                payload["current_vo2max"] = max(vals)
                payload["vo2max_trend"] = "up" if vals[-1] > vals[0] else "down" if vals[-1] < vals[0] else "stable"
    except Exception:
        pass

    try:
        summary = client.get_user_summary(today)
        payload["readiness"] = {
            "sleep_score": (summary.get("sleepingQualifierSummary", {}).get("value") or summary.get("sleepingSeconds")),
            "hrv": summary.get("heartRateVariabilitySummary", {}).get("value"),
            "stress": summary.get("stressQualifierSummary", {}).get("value"),
            "body_battery": summary.get("bodyBatteryChargedValue"),
        }
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
            payload["recent_runs"] = runs[:10]
            vo2_values = []
            for run in runs:
                name = str(run.get("activityName", "")).lower()
                rtype = str(run.get("activityType", {}).get("typeKey", "")).lower()
                distance = _safe_float(run.get("distance"))
                vo2_value = _safe_float(run.get("vO2MaxValue") or run.get("vo2MaxValue"))
                if vo2_value is not None:
                    vo2_values.append(vo2_value)
                if any(kw in name or kw in rtype for kw in ("interval", "tempo", "threshold", "quality")):
                    if payload["last_quality_run"] is None:
                        payload["last_quality_run"] = _summarize_activity(run)
                if "long" in name or "long" in rtype or (distance is not None and distance >= 15000):
                    if payload["last_long_run"] is None:
                        payload["last_long_run"] = _summarize_activity(run)
            if vo2_values:
                payload["current_vo2max"] = vo2_values[0]
            if len(vo2_values) > 1:
                payload["vo2max_trend"] = (
                    "up" if vo2_values[0] > vo2_values[-1] else "down" if vo2_values[0] < vo2_values[-1] else "stable"
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
        records = client.get_personal_records()
        if isinstance(records, list):
            payload["recent_bests"] = [
                {
                    "record_type": r.get("record_type") or r.get("recordType") or r.get("name") or "",
                    "value": r.get("value") or r.get("displayValue"),
                    "date": r.get("date") or r.get("startDate"),
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


def _summarize_activity(run: dict) -> dict:
    return {
        "date": run.get("start_time") or run.get("startTimeLocal") or "",
        "distance_m": _safe_float(run.get("distance_meters") or run.get("distance")),
        "duration_s": _safe_float(run.get("duration_seconds") or run.get("duration") or run.get("moving_duration")),
        "type": run.get("type", "")
        or (run.get("activityType", {}).get("typeKey") if isinstance(run.get("activityType"), dict) else ""),
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
