#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import json
import os
import sys

from scripts.mcp_client import McpError, call_tool


HEVY_COMMAND = os.environ.get(
    "PERSONAL_TRAINER_HEVY_MCP_COMMAND",
    "/opt/homebrew/bin/npx -y -p node@26 -p hevy-mcp hevy-mcp",
)

_TRACKED_EXERCISES = [
    ("Squat (Barbell)", "D04AC939"),
    ("Bench Press (Barbell)", "79D0BB3A"),
    ("Chin Up", "29083183"),
    ("Triceps Dip", "28BB4A95"),
    ("Push Up", "392887AA"),
    ("Dumbbell Row", "F1E57334"),
    ("Sumo Squat (Kettlebell)", "5E10D0E6"),
    ("Single Arm Tricep Extension (Dumbbell)", "8347DFD1"),
]


async def fetch() -> dict:
    payload: dict = {
        "freshness": "fresh",
        "recent_workouts": [],
        "last_workout": None,
        "muscle_group_fatigue": {
            "legs": "unknown",
            "posterior_chain": "unknown",
            "push": "unknown",
            "pull": "unknown",
            "shoulders_arms": "unknown",
            "core": "unknown",
        },
        "strength_trend": "unknown",
        "recent_bests": [],
        "flags": [],
    }

    try:
        workouts = await call_tool(
            HEVY_COMMAND, "get-workouts", {"page": 1, "pageSize": 1}
        )
        if isinstance(workouts, list) and workouts:
            w = workouts[0]
            payload["last_workout"] = _summarize_workout(w)
            payload["muscle_group_fatigue"] = _infer_fatigue(w)
    except McpError as e:
        print(f"[hevy] latest workout unavailable: {e}", file=sys.stderr)

    try:
        history = await call_tool(
            HEVY_COMMAND, "get-workouts", {"page": 1, "pageSize": 10}
        )
        if isinstance(history, list):
            payload["recent_workouts"] = [
                _summarize_workout(w) for w in history if isinstance(w, dict)
            ]
        elif isinstance(history, dict):
            workouts = history.get("workouts") or history.get("data") or []
            if isinstance(workouts, list):
                payload["recent_workouts"] = [
                    _summarize_workout(w) for w in workouts if isinstance(w, dict)
                ]
    except McpError as e:
        print(f"[hevy] workout history unavailable: {e}", file=sys.stderr)

    for exercise_name, template_id in _TRACKED_EXERCISES:
        try:
            history = await call_tool(
                HEVY_COMMAND,
                "get-exercise-history",
                {"exerciseTemplateId": template_id, "page": 1, "pageSize": 5},
            )
            rows = history if isinstance(history, list) else []
            if rows:
                best = _best_set(rows)
                if best:
                    payload["recent_bests"].append(best)
        except McpError as e:
            print(
                f"[hevy] exercise history for {exercise_name} unavailable: {e}",
                file=sys.stderr,
            )

    return payload


def _summarize_workout(w: dict) -> dict:
    return {
        "title": w.get("title") or w.get("name") or "",
        "start_time": w.get("startTime") or w.get("start_time") or "",
        "end_time": w.get("endTime") or w.get("end_time") or "",
        "exercise_count": len(
            w.get("exercises", []) if isinstance(w.get("exercises"), list) else []
        ),
    }


def _infer_fatigue(workout: dict) -> dict:
    fatigue = {
        "legs": "unknown",
        "posterior_chain": "unknown",
        "push": "unknown",
        "pull": "unknown",
        "shoulders_arms": "unknown",
        "core": "unknown",
    }
    exercises = (
        workout.get("exercises") if isinstance(workout.get("exercises"), list) else []
    )
    for ex in exercises:
        if not isinstance(ex, dict):
            continue
        tpid = str(ex.get("exerciseTemplateId") or "")
        if tpid == "D04AC939":
            fatigue["legs"] = "high"
            fatigue["posterior_chain"] = "medium"
        elif tpid == "5E10D0E6":
            fatigue["legs"] = "high"
        elif tpid in ("79D0BB3A", "28BB4A95", "392887AA"):
            fatigue["push"] = "high"
            fatigue["shoulders_arms"] = "medium"
        elif tpid in ("29083183", "F1E57334"):
            fatigue["pull"] = "high"
            fatigue["posterior_chain"] = "medium"
        elif tpid == "8347DFD1":
            fatigue["shoulders_arms"] = "high"
    return fatigue


def _best_set(rows: list[dict]) -> dict | None:
    best = None
    best_score = 0
    for row in rows:
        weight = _safe_float(row.get("weight"))
        reps = _safe_int(row.get("reps")) or 0
        if weight is None or reps == 0:
            continue
        score = weight * (1 + reps / 30)
        if score > best_score:
            best_score = score
            best = {
                "exercise_template_id": str(row.get("exerciseTemplateId", "")),
                "weight_kg": weight,
                "reps": reps,
                "estimated_one_rm_kg": round(weight * (1 + reps / 30), 1),
                "workout_start_time": str(
                    row.get("workoutStartTime") or row.get("startTime") or ""
                ),
                "workout_title": str(row.get("workoutTitle") or row.get("title") or ""),
            }
    return best


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
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
