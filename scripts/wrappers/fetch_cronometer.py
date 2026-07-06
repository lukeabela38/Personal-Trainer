#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys

from scripts.mcp_client import McpError, call_tool


CRONOMETER_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_CRONOMETER_MCP_COMMAND",
    "/opt/homebrew/bin/uvx cronometer-api-mcp",
)

_CALORIES_PER_G_PROTEIN = 4
_CALORIES_PER_G_CARBS = 4
_CALORIES_PER_G_FAT = 9


async def fetch() -> dict:
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
        summary = await call_tool(CRONOMETER_COMMAND, "get_daily_nutrition_summary")
        if isinstance(summary, dict):
            today = payload["today"]
            today["calories_consumed"] = _safe_float(summary.get("calories") or summary.get("energy") or summary.get("caloriesConsumed"))
            today["calories_target"] = _safe_float(summary.get("caloriesTarget") or summary.get("energyTarget") or summary.get("targetCalories"))
            today["protein_g"] = _safe_float(summary.get("protein") or summary.get("protein_g"))
            today["carbs_g"] = _safe_float(summary.get("carbs") or summary.get("carbohydrates") or summary.get("carbs_g"))
            today["fat_g"] = _safe_float(summary.get("fat") or summary.get("fat_g"))
            today["fiber_g"] = _safe_float(summary.get("fiber") or summary.get("fiber_g"))
            today["log_completeness"] = _compute_completeness(summary)

            consumed = today["calories_consumed"]
            target = today["calories_target"]
            if consumed is not None and target is not None:
                today["remaining_kcal"] = round(target - consumed, 1)

            payload["fueling_status"] = _fueling_status(today["calories_consumed"], today["calories_target"])
            payload["protein_status"] = _protein_status(today["protein_g"], today["calories_target"])
            payload["carb_availability"] = _carb_status(today["carbs_g"])
    except McpError as e:
        print(f"[cronometer] daily summary unavailable: {e}", file=sys.stderr)

    try:
        targets = await call_tool(CRONOMETER_COMMAND, "get_macro_targets")
        if isinstance(targets, dict):
            today = payload["today"]
            if today["calories_target"] is None:
                today["calories_target"] = _safe_float(targets.get("calories") or targets.get("energy"))
            if today["protein_g"] is None:
                protein_target = _safe_float(targets.get("protein") or targets.get("protein_g"))
            if today["carbs_g"] is None:
                carbs_target = _safe_float(targets.get("carbs") or targets.get("carbs_g"))
            if today["fat_g"] is None:
                fat_target = _safe_float(targets.get("fat") or targets.get("fat_g"))
    except McpError as e:
        print(f"[cronometer] macro targets unavailable: {e}", file=sys.stderr)

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


def _compute_completeness(summary: dict) -> str:
    cal = _safe_float(summary.get("calories") or summary.get("energy") or summary.get("caloriesConsumed"))
    protein = _safe_float(summary.get("protein") or summary.get("protein_g"))
    if cal is not None and cal > 0:
        return "complete"
    if cal is not None:
        return "incomplete"
    return "unknown"


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
