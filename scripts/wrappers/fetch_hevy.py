#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import os
import sys
import urllib.error
import urllib.request
from collections import defaultdict

_API_BASE = "https://api.hevyapp.com/v1"
_RECENT_WORKOUT_LIMIT = 30
_RECENT_WORKOUT_PAGE_SIZE = 10

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

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def _api_key() -> str:
    key = os.environ.get("HEVY_API_KEY")
    if not key:
        raise RuntimeError("HEVY_API_KEY not set")
    return key


def _get(path: str) -> dict:
    req = urllib.request.Request(f"{_API_BASE}{path}")
    req.add_header("api-key", _api_key())
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            logger.info("[hevy] request status_code=%s path=%s", getattr(resp, "status", 200), path)
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        logger.warning("[hevy] request failed status_code=%s path=%s: %s", e.code, path, body[:200])
        raise RuntimeError(f"Hevy API {e.code} for {path}: {body[:200]}")


def fetch() -> dict:
    tracked_ids = {tid for _, tid in _TRACKED_EXERCISES}
    per_exercise_sets: dict[str, list[dict]] = defaultdict(list)

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
        recent = []
        page = 1
        while len(recent) < _RECENT_WORKOUT_LIMIT:
            remaining = _RECENT_WORKOUT_LIMIT - len(recent)
            page_size = min(_RECENT_WORKOUT_PAGE_SIZE, remaining)
            data = _get(f"/workouts?page={page}&pageSize={page_size}")
            workouts = data.get("workouts", [])
            if not isinstance(workouts, list):
                raise RuntimeError("unexpected response shape")
            if not workouts:
                break

            for w in workouts:
                if not isinstance(w, dict):
                    continue
                recent.append(_summarize_workout(w))
                for ex in w.get("exercises", []):
                    if not isinstance(ex, dict):
                        continue
                    tid = ex.get("exercise_template_id", "")
                    if tid in tracked_ids:
                        for s in ex.get("sets", []):
                            if not isinstance(s, dict):
                                continue
                            weight = _safe_float(s.get("weight_kg"))
                            reps = _safe_int(s.get("reps"))
                            if weight is None or reps is None or reps == 0:
                                continue
                            per_exercise_sets[tid].append(
                                {
                                    "weight": weight,
                                    "reps": reps,
                                    "exerciseTemplateId": tid,
                                    "workoutStartTime": w.get("start_time", ""),
                                    "workoutTitle": w.get("title", ""),
                                }
                            )
                if len(recent) >= _RECENT_WORKOUT_LIMIT:
                    break

            if len(workouts) < page_size:
                break
            page += 1

        if recent:
            payload["last_workout"] = recent[0]
            payload["recent_workouts"] = recent
            payload["muscle_group_fatigue"] = _infer_fatigue(workouts[0])
            logger.info("[hevy] auth status_code=200 source=workout-history page_count=%d", page)

    except Exception as e:
        print(f"[hevy] workouts unavailable status_code=500: {e}", file=sys.stderr)
        logger.warning("[hevy] workouts unavailable status_code=500: %s", e)

    bests = []
    for tid in tracked_ids:
        rows = per_exercise_sets.get(tid, [])
        if rows:
            best = _best_set(rows)
            if best:
                bests.append(best)
    payload["recent_bests"] = bests

    return payload


def _summarize_workout(w: dict) -> dict:
    exercises = [
        _summarize_exercise(ex)
        for ex in (w.get("exercises") if isinstance(w.get("exercises"), list) else [])
    ]
    return {
        "title": w.get("title") or w.get("name") or "",
        "start_time": w.get("start_time") or w.get("start_time") or "",
        "end_time": w.get("end_time") or w.get("end_time") or "",
        "exercise_count": len(exercises),
        "exercises": exercises,
    }


def _summarize_exercise(exercise: dict) -> dict:
    sets = [
        _summarize_set(summary)
        for summary in (exercise.get("sets") if isinstance(exercise.get("sets"), list) else [])
        if isinstance(summary, dict)
    ]
    return {
        "exercise_template_id": str(exercise.get("exercise_template_id") or ""),
        "name": str(exercise.get("name") or exercise.get("title") or ""),
        "sets": [s for s in sets if s is not None],
    }


def _summarize_set(summary: dict) -> dict | None:
    weight = _safe_float(summary.get("weight_kg"))
    reps = _safe_int(summary.get("reps"))
    if weight is None and reps is None:
        return None
    payload = {
        "weight_kg": weight,
        "reps": reps,
    }
    rpe = _safe_float(summary.get("rpe"))
    if rpe is not None:
        payload["rpe"] = rpe
    return payload


def _infer_fatigue(workout: dict) -> dict:
    fatigue = {
        "legs": "unknown",
        "posterior_chain": "unknown",
        "push": "unknown",
        "pull": "unknown",
        "shoulders_arms": "unknown",
        "core": "unknown",
    }
    exercises = workout.get("exercises") if isinstance(workout.get("exercises"), list) else []
    for ex in exercises:
        if not isinstance(ex, dict):
            continue
        tpid = str(ex.get("exercise_template_id") or "")
        if tpid == "D04AC939":
            fatigue["legs"] = "high"
            fatigue["posterior_chain"] = "moderate"
        elif tpid == "5E10D0E6":
            fatigue["legs"] = "high"
        elif tpid in ("79D0BB3A", "28BB4A95", "392887AA"):
            fatigue["push"] = "high"
            fatigue["shoulders_arms"] = "moderate"
        elif tpid in ("29083183", "F1E57334"):
            fatigue["pull"] = "high"
            fatigue["posterior_chain"] = "moderate"
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
                "workout_start_time": str(row.get("workoutStartTime") or row.get("startTime") or ""),
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
