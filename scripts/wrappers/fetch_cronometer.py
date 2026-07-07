#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import UTC, datetime
from pathlib import Path

_API_BASE = "https://mobile.cronometer.com/api/v2"

_CALORIES_PER_G_PROTEIN = 4
_CALORIES_PER_G_CARBS = 4
_CALORIES_PER_G_FAT = 9

_APP_AUTH_TEMPLATE = {
    "api": 3,
    "os": "Android",
    "build": "2807",
    "flavour": "free",
}


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
        raise RuntimeError(f"Cronometer API {e.code} for {path}: {body_text}")


def fetch() -> dict:
    today = datetime.now(UTC).strftime("%Y-%m-%d")

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
        user_id, token = _login()
        diary = _post(user_id, token, "/get_diary", {"day": today})

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

        entry_macros = (summary.get("macros") or {})
        td["protein_g"] = _safe_float(entry_macros.get("protein"))
        td["carbs_g"] = _safe_float(entry_macros.get("carbs") or entry_macros.get("net_carbs"))
        td["fat_g"] = _safe_float(entry_macros.get("fat"))
        td["fiber_g"] = _safe_float(entry_macros.get("fiber"))

        payload["fueling_status"] = _fueling_status(td["calories_consumed"], td["calories_target"])
        payload["protein_status"] = _protein_status(td["protein_g"], td["calories_target"])
        payload["carb_availability"] = _carb_status(td["carbs_g"])

    except Exception as e:
        print(f"[cronometer] nutrition unavailable: {e}", file=sys.stderr)

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
        payload = fetch()
        json.dump(payload, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
