#!/usr/bin/env python3
from __future__ import annotations

import json
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

_TOKENSTORE_ENV = "GARMINTOKENS"
_DEFAULT_TOKENSTORE = Path.home() / ".garminconnect"


def _tokenstore_path() -> Path:
    configured = os.environ.get(_TOKENSTORE_ENV)
    if configured:
        return Path(configured).expanduser()
    return _DEFAULT_TOKENSTORE


def fetch() -> dict:
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    month_ago = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%d")

    garmin_email = os.environ.get("GARMIN_EMAIL") or os.environ.get("GC_EMAIL")
    garmin_password = os.environ.get("GARMIN_PASSWORD") or os.environ.get("GC_PASSWORD")
    tokenstore = _tokenstore_path()

    if Garmin is not None and ((garmin_email and garmin_password) or tokenstore.exists()):
        try:
            return _fetch_direct(
                garmin_email,
                garmin_password,
                today,
                month_ago,
                tokenstore,
            )
        except Exception as e:
            print(f"[garmin] direct fetch failed: {e}", file=sys.stderr)

    return _empty_payload()


def _fetch_direct(
    email: str | None,
    password: str | None,
    today: str,
    month_ago: str,
    tokenstore: Path | None,
) -> dict:
    client = Garmin(email, password)

    logged_in = False
    if tokenstore is not None and tokenstore.exists():
        try:
            client.login(tokenstore=str(tokenstore))
            logged_in = True
        except Exception as e:
            print(f"[garmin] cached session failed, refreshing: {e}", file=sys.stderr)

    if not logged_in:
        if not email or not password:
            raise RuntimeError(
                f"{_TOKENSTORE_ENV} cache unavailable and GARMIN_EMAIL/GARMIN_PASSWORD are not set"
            )
        client.login()
        logged_in = True

        if tokenstore is not None:
            try:
                client.garth.dump(str(tokenstore))
            except Exception as e:
                print(f"[garmin] failed to save session cache: {e}", file=sys.stderr)

    payload = _empty_payload()

    try:
        stats = client.get_stats(today)
        payload["current_vo2max"] = _safe_float(stats.get("vO2MaxValue"))
    except Exception:
        pass

    try:
        trend = client.get_vo2max_trend(month_ago, today)
        if isinstance(trend, list) and trend:
            vals = [
                t.get("vo2Max") or t.get("vo2MaxValue")
                for t in trend
                if t.get("vo2Max") or t.get("vo2MaxValue")
            ]
            if vals:
                payload["current_vo2max"] = max(vals)
                payload["vo2max_trend"] = (
                    "up" if vals[-1] > vals[0] else "down" if vals[-1] < vals[0] else "stable"
                )
    except Exception:
        pass

    try:
        summary = client.get_user_summary(today)
        payload["readiness"] = {
            "sleep_score": (
                summary.get("sleepingQualifierSummary", {}).get("value")
                or summary.get("sleepingSeconds")
            ),
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
            for run in runs:
                name = str(run.get("activityName", "")).lower()
                rtype = str(run.get("activityType", {}).get("typeKey", "")).lower()
                distance = _safe_float(run.get("distance"))
                if any(kw in name or kw in rtype for kw in ("interval", "tempo", "threshold", "quality")):
                    if payload["last_quality_run"] is None:
                        payload["last_quality_run"] = _summarize_activity(run)
                if "long" in name or "long" in rtype or (distance is not None and distance >= 15000):
                    if payload["last_long_run"] is None:
                        payload["last_long_run"] = _summarize_activity(run)
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
        "duration_s": _safe_float(
            run.get("duration_seconds") or run.get("duration") or run.get("moving_duration")
        ),
        "type": run.get("type", "")
        or (
            run.get("activityType", {}).get("typeKey")
            if isinstance(run.get("activityType"), dict)
            else ""
        ),
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
        payload = fetch()
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
