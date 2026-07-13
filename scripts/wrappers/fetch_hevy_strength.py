#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.mcp_client import McpError, call_tool

HEVY_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_HEVY_MCP_COMMAND",
    "npx -y -p node@26 -p hevy-mcp hevy-mcp",
)
RECENT_WINDOW_DAYS = 30
RECENT_PAGE_SIZE = 10

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


async def fetch() -> list[dict]:
    all_rows: list[dict] = []
    cutoff = datetime.now(UTC) - timedelta(days=RECENT_WINDOW_DAYS)
    logger.info("[hevy-strength] fetching recent strength history")

    page = 1
    while True:
        try:
            logger.info("[hevy-strength] capturing workout page %d", page)
            history = await call_tool(HEVY_COMMAND, "get-workouts", {"page": page, "pageSize": RECENT_PAGE_SIZE})
        except McpError as e:
            print(f"[hevy-strength] workout history unavailable: {e}", file=sys.stderr)
            logger.warning("[hevy-strength] workout history unavailable: %s", e)
            break

        workouts = history if isinstance(history, list) else history.get("workouts", [])
        if not isinstance(workouts, list) or not workouts:
            break

        stop = False
        for workout in workouts:
            if not isinstance(workout, dict):
                continue
            start_time_raw = workout.get("start_time") or workout.get("startTime") or ""
            start_time = _format_workout_time(start_time_raw)
            if start_time and _parse_iso_date(start_time) < cutoff:
                stop = True
                continue
            workout_title = str(workout.get("title") or workout.get("name") or "")
            for exercise in workout.get("exercises", []):
                if not isinstance(exercise, dict):
                    continue
                template_id = str(
                    exercise.get("exercise_template_id")
                    or exercise.get("exerciseTemplateId")
                    or exercise.get("template_id")
                    or ""
                )
                exercise_name = str(
                    exercise.get("name")
                    or exercise.get("exercise_name")
                    or exercise.get("exerciseTitle")
                    or template_id
                )
                sets = exercise.get("sets", [])
                if not isinstance(sets, list):
                    continue
                for row in sets:
                    if not isinstance(row, dict):
                        continue
                    reps = _safe_int(row.get("reps"))
                    weight = _safe_float(
                        row.get("weight_kg") if row.get("weight_kg") is not None else row.get("weight")
                    )
                    if reps is None:
                        continue
                    all_rows.append(
                        {
                            "exerciseTemplateId": template_id,
                            "exerciseName": exercise_name,
                            "workoutTitle": workout_title,
                            "workoutStartTime": start_time,
                            "weight": 0.0 if weight is None else weight,
                            "reps": reps,
                        }
                    )

        if stop or len(workouts) < RECENT_PAGE_SIZE:
            break
        page += 1

    logger.info("[hevy-strength] collected %d rows", len(all_rows))
    return all_rows


def _format_workout_time(value: object) -> str:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=UTC).isoformat().replace("+00:00", "Z")
    if isinstance(value, str):
        return value
    return ""


def _parse_iso_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: object) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


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
