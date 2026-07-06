#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import UTC, datetime

from scripts.mcp_client import McpError, call_tool


CRONOMETER_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_CRONOMETER_MCP_COMMAND",
    "/opt/homebrew/bin/uvx cronometer-api-mcp",
)


_CALORIES_PER_G_PROTEIN = 4
_CALORIES_PER_G_CARBS = 4
_CALORIES_PER_G_FAT = 9


def _is_error(result) -> bool:
    return isinstance(result, dict) and result.get("status") == "error"


async def fetch() -> dict:
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
        food_log = await call_tool(CRONOMETER_COMMAND, "get_food_log", {"date": today})
        if _is_error(food_log):
            print(f"[cronometer] API error: {food_log.get('message')}", file=sys.stderr)
        elif isinstance(food_log, dict):
            energy = food_log.get("energy_summary") or {}
            macros = food_log.get("nutrition_summary", {}).get("macros") or {}
            td = payload["today"]

            td["calories_consumed"] = _safe_float(
                energy.get("consumed_kcal") or macros.get("energy")
            )
            td["calories_target"] = _safe_float(energy.get("total_target_kcal"))
            td["remaining_kcal"] = _safe_float(energy.get("remaining_kcal"))
            td["protein_g"] = _safe_float(macros.get("protein"))
            td["carbs_g"] = _safe_float(macros.get("carbs") or macros.get("net_carbs"))
            td["fat_g"] = _safe_float(macros.get("fat"))
            td["fiber_g"] = _safe_float(macros.get("fiber"))
            td["log_completeness"] = (
                "complete"
                if td["calories_consumed"] and td["calories_consumed"] > 0
                else "incomplete"
            )

            payload["fueling_status"] = _fueling_status(
                td["calories_consumed"], td["calories_target"]
            )
            payload["protein_status"] = _protein_status(
                td["protein_g"], td["calories_target"]
            )
            payload["carb_availability"] = _carb_status(td["carbs_g"])
    except McpError as e:
        print(f"[cronometer] food log unavailable: {e}", file=sys.stderr)

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
        return "moderate"
    return "adequate"


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
        return "moderate"
    return "adequate"


def _carb_status(carbs_g: float | None) -> str:
    if carbs_g is None:
        return "unknown"
    if carbs_g < 100:
        return "low"
    if carbs_g < 200:
        return "moderate"
    return "adequate"


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
