#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import urllib.error
import urllib.request
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

_API_BASE = "https://mobile.cronometer.com/api/v2"
_SESSION_FILE_ENV = "CRONOMETER_SESSION_FILE"
_DEFAULT_SESSION_FILE = Path.home() / ".cronometer_session.json"

_CALORIES_PER_G_PROTEIN = 4
_CALORIES_PER_G_CARBS = 4
_CALORIES_PER_G_FAT = 9
_RECENT_DAYS_LIMIT = 30

_APP_AUTH_TEMPLATE = {
    "api": 3,
    "os": "Android",
    "build": "2807",
    "flavour": "free",
}

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


class CronometerAPIError(RuntimeError):
    def __init__(self, code: int, path: str, body_text: str):
        super().__init__(f"Cronometer API {code} for {path}: {body_text}")
        self.code = code


def _session_file_path() -> Path:
    configured = os.environ.get(_SESSION_FILE_ENV)
    if configured:
        return Path(configured).expanduser()
    return _DEFAULT_SESSION_FILE


def _load_cached_session(path: Path | None = None) -> tuple[int, str] | None:
    session_file = path or _session_file_path()
    try:
        if not session_file.is_file():
            return None
        data = json.loads(session_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None

    user_id = data.get("userId")
    token = data.get("sessionKey")
    if user_id is None or not token:
        return None

    try:
        return int(user_id), str(token)
    except (TypeError, ValueError):
        return None


def _save_cached_session(user_id: int, token: str, path: Path | None = None) -> None:
    session_file = path or _session_file_path()
    session_file.parent.mkdir(parents=True, exist_ok=True)
    session_file.write_text(
        json.dumps({"userId": user_id, "sessionKey": token}, indent=2),
        encoding="utf-8",
    )
    try:
        session_file.chmod(0o600)
    except OSError:
        pass


def _login() -> tuple[int, str]:
    email = os.environ.get("CRONOMETER_USERNAME")
    password = os.environ.get("CRONOMETER_PASSWORD")
    if not email or not password:
        raise RuntimeError("CRONOMETER_USERNAME and CRONOMETER_PASSWORD must be set")

    data = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        f"{_API_BASE}/login",
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()[:200] if e.fp else ""
        raise RuntimeError(f"Cronometer login HTTP {e.code}: {body_text}")

    user_id = body.get("id")
    token = body.get("sessionKey")
    if not user_id or not token:
        raise RuntimeError(f"Cronometer login failed: {body.get('error', 'unknown')}")

    return user_id, token


def _post(user_id: int, token: str, path: str, payload: dict) -> dict:
    payload["auth"] = {
        "userId": user_id,
        "token": token,
        **_APP_AUTH_TEMPLATE,
    }
    payload.setdefault("lastSeen", 0)

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{_API_BASE}{path}",
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()[:200] if e.fp else ""
        raise CronometerAPIError(e.code, path, body_text)


def fetch(date_str: str | None = None) -> dict:
    day = date_str or datetime.now(UTC).strftime("%Y-%m-%d")
    logger.info("[cronometer] fetching nutrition data for %s", day)

    payload: dict = {
        "freshness": "fresh",
        "today": {
            "calories_consumed": None,
            "calories_target": None,
            "protein_g": None,
            "carbs_g": None,
            "fat_g": None,
            "fiber_g": None,
            "remaining_kcal": None,
            "log_completeness": "unknown",
        },
        "recent_days": [],
        "fueling_status": "unknown",
        "protein_status": "unknown",
        "carb_availability": "unknown",
        "flags": [],
    }

    try:
        user_id, token = _load_session()
        diary = _fetch_diary_with_retry(user_id, token, day)
        if diary is None:
            raise RuntimeError(f"unable to fetch diary for {day}")

        summary = (diary or {}).get("summary") or {}
        target = (summary.get("macros") or {}).get("energy")
        consumed = (summary.get("consumed") or {}).get("total")

        td = payload["today"]
        if target is not None:
            td["calories_target"] = _safe_float(target)
        if consumed is not None:
            td["calories_consumed"] = _safe_float(consumed)
            td["remaining_kcal"] = _safe_float(target - consumed) if target is not None else None
            td["log_completeness"] = "complete" if consumed > 0 else "incomplete"

        entry_macros = summary.get("macros") or {}
        td["protein_g"] = _safe_float(entry_macros.get("protein"))
        td["carbs_g"] = _safe_float(entry_macros.get("carbs") or entry_macros.get("net_carbs"))
        td["fat_g"] = _safe_float(entry_macros.get("fat"))
        td["fiber_g"] = _safe_float(entry_macros.get("fiber"))

        payload["recent_days"] = _build_recent_days(user_id, token, day)

        payload["fueling_status"] = _fueling_status(td["calories_consumed"], td["calories_target"])
        payload["protein_status"] = _protein_status(td["protein_g"], td["calories_target"])
        payload["carb_availability"] = _carb_status(td["carbs_g"])
        logger.info("[cronometer] built nutrition payload for %s", day)

    except Exception as e:
        print(f"[cronometer] nutrition unavailable: {e}", file=sys.stderr)
        logger.warning("[cronometer] nutrition unavailable: %s", e)

    flags = payload["flags"]
    if payload["fueling_status"] == "low":
        flags.append("under_fueled_today")
    if payload["protein_status"] == "low":
        flags.append("protein_low_today")
    if payload["carb_availability"] == "low":
        flags.append("carbs_low_for_quality_run")
    if payload["today"]["log_completeness"] in ("unknown", "incomplete"):
        flags.append("log_incomplete")
    payload["flags"] = sorted(set(flags))

    return payload


def _load_session() -> tuple[int, str]:
    cached_session = _load_cached_session()
    if cached_session is not None:
        return cached_session
    user_id, token = _login()
    _save_cached_session(user_id, token)
    return user_id, token


def _fetch_diary_with_retry(user_id: int, token: str, day: str) -> dict | None:
    try:
        return _post(user_id, token, "/get_diary", {"day": day})
    except CronometerAPIError as e:
        if e.code not in {401, 403}:
            raise
        refreshed_user_id, refreshed_token = _login()
        _save_cached_session(refreshed_user_id, refreshed_token)
        return _post(refreshed_user_id, refreshed_token, "/get_diary", {"day": day})


def _build_recent_days(user_id: int, token: str, day: str) -> list[dict]:
    try:
        base_day = date.fromisoformat(day)
    except ValueError:
        return []

    recent_days: list[dict] = []
    for offset in range(_RECENT_DAYS_LIMIT - 1, -1, -1):
        current_day = base_day - timedelta(days=offset)
        day_str = current_day.isoformat()
        try:
            diary = _fetch_diary_with_retry(user_id, token, day_str)
        except CronometerAPIError as e:
            print(f"[cronometer] skipping {day_str}: {e}", file=sys.stderr)
            logger.warning("[cronometer] skipping %s: %s", day_str, e)
            continue
        summary = (diary or {}).get("summary") or {}
        macros = summary.get("macros") or {}
        consumed = (summary.get("consumed") or {}).get("total")
        target = macros.get("energy")
        recent_days.append(
            {
                "date": day_str,
                "calories_consumed": _safe_float(consumed),
                "calories_target": _safe_float(target),
                "protein_g": _safe_float(macros.get("protein")),
                "carbs_g": _safe_float(macros.get("carbs") or macros.get("net_carbs")),
                "fat_g": _safe_float(macros.get("fat")),
                "fiber_g": _safe_float(macros.get("fiber")),
                "remaining_kcal": _safe_float(target - consumed)
                if target is not None and consumed is not None
                else None,
                "log_completeness": "complete" if consumed and consumed > 0 else "incomplete",
            }
        )
    return recent_days


def _fueling_status(calories: float | None, target: float | None) -> str:
    if calories is None or target is None:
        return "unknown"
    ratio = calories / target if target > 0 else 1
    if ratio < 0.6:
        return "low"
    if ratio < 0.85:
        return "adequate"
    return "high"


def _protein_status(protein_g: float | None, target_cal: float | None) -> str:
    if protein_g is None or target_cal is None:
        return "unknown"
    recommended = target_cal * 0.25 / _CALORIES_PER_G_PROTEIN
    if recommended <= 0:
        return "unknown"
    ratio = protein_g / recommended
    if ratio < 0.5:
        return "low"
    if ratio < 0.8:
        return "adequate"
    return "high"


def _carb_status(carbs_g: float | None) -> str:
    if carbs_g is None:
        return "unknown"
    if carbs_g < 100:
        return "low"
    if carbs_g < 200:
        return "adequate"
    return "high"


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
        parser = argparse.ArgumentParser(description="Emit a live Cronometer source payload.")
        parser.add_argument("--date", help="Snapshot date in YYYY-MM-DD format")
        args = parser.parse_args()

        payload = fetch(args.date)
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
