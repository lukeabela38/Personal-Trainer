#!/usr/bin/env python3
from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = REPO_ROOT / "personal_trainer" / "examples"

random.seed(42)

TEMPLATE_IDS = [
    "D04AC939", "79D0BB3A", "29083183", "28BB4A95", "392887AA",
    "F1E57334", "5E10D0E6", "8347DFD1", "A1B2C3D4", "B2C3D4E5",
    "C3D4E5F6", "D4E5F6A7", "E5F6A7B8", "F6A7B8C9", "A7B8C9D0",
    "B8C9D0A1", "C9D0A1B2", "D0A1B2C3", "E1F2A3B4", "F2A3B4C5",
    "A3B4C5D6", "B4C5D6E7", "C5D6E7F8", "D6E7F8A9", "E7F8A9B0",
    "F8A9B0C1", "A9B0C1D2", "B0C1D2E3", "C1D2E3F4", "D2E3F4A5",
    "E3F4A5B6", "F4A5B6C7", "A5B6C7D8", "B6C7D8E9",
]

SLEEP_STATES = ["poor", "okay", "good", "great"]
MOTIVATION_STATES = ["low", "normal", "high"]
FATIGUE_STATES = ["low", "moderate", "high"]
TT_STATES = ["none", "light", "training", "match"]
FRESHNESS = ["fresh", "stale", "missing", "partial"]
FUELING = ["adequate", "low", "high"]
WEEKLY_PATTERN = {
    0: "aerobic_base",    # Mon: easy run
    1: "strength",        # Tue: gym
    2: "aerobic_quality",  # Wed: quality run
    3: "strength",        # Thu: gym
    4: "aerobic_base",    # Fri: easy run
    5: "aerobic_quality",  # Sat: quality run
    6: "recovery",        # Sun: rest/recovery
}


def main():
    days = 90
    start = date(2026, 4, 7)
    all_snapshots = []

    vo2 = 48.0
    bw = 84.5

    pb_dates: dict[str, date] = {}
    for tid in TEMPLATE_IDS:
        pb_dates[tid] = start - timedelta(days=random.randint(30, 90))

    exercise_history: dict[str, list[dict]] = {tid: [] for tid in TEMPLATE_IDS}

    for i in range(days):
        current = start + timedelta(days=i)
        day_type = WEEKLY_PATTERN[current.weekday()]

        vo2 = _drift(vo2, drift_up=0.06, noise=0.2, floor=46, ceil=58)
        bw = _drift(bw, drift_up=-0.025, noise=0.12, floor=79, ceil=86)

        fatigue_bonus = 1.0
        if day_type == "recovery":
            fatigue_bonus = 0.6
        elif day_type in ("aerobic_quality", "strength"):
            fatigue_bonus = 1.3

        sleep = _pick_weighted(SLEEP_STATES, [0.10, 0.20, 0.50, 0.20])
        motivation = _pick_weighted(MOTIVATION_STATES, [0.10, 0.60, 0.30])
        mental_fatigue = _pick_weighted(FATIGUE_STATES, [0.60, 0.30, 0.10])

        freshness = "fresh" if random.random() > 0.15 else "stale"

        is_pb_day = i > 0 and i % 14 == 0 and day_type != "recovery"

        garmin_bests = _build_garmin_bests(current, is_pb_day, day_index=i)

        hevy_bests = _build_hevy_bests(current, pb_dates, is_pb_day, day_index=i)

        today_cals = _build_nutrition(day_type, bw)

        source_payload = {
            "snapshot_date": current.isoformat(),
            "timezone": "Europe/Malta",
            "athlete": {"body_weight_kg": round(bw, 1)},
            "garmin": {
                "freshness": freshness,
                "current_vo2max": round(vo2, 1),
                "vo2max_trend": "flat_or_rising" if vo2 > 48.5 else "declining",
                "recent_bests": garmin_bests,
                "flags": [],
            },
            "hevy": {
                "freshness": freshness,
                "strength_trend": "improving",
                "muscle_group_fatigue": _build_muscle_fatigue(day_type, fatigue_bonus),
                "recent_bests": hevy_bests,
                "flags": [],
            },
            "cronometer": {
                "freshness": freshness,
                "fueling_status": "adequate" if today_cals["calories_consumed"] > 2000 else "low",
                "protein_status": "adequate" if today_cals["protein_g"] > 120 else "low",
                "carb_availability": "adequate" if today_cals["carbs_g"] > 200 else "low" if today_cals["carbs_g"] > 100 else "low",
                "today": today_cals,
                "flags": [],
            },
            "manual_context": {
                "freshness": freshness,
                "sleep_quality": sleep,
                "soreness": _build_soreness(day_type, fatigue_bonus),
                "pain": [],
                "motivation": motivation,
                "mental_fatigue": mental_fatigue,
                "table_tennis_today": TT_STATES[0],
                "time_available_minutes": random.choice([45, 60, 60, 75, 90, 90, 120]),
                "constraints": [],
            },
        }

        all_snapshots.append(source_payload)

        for b in hevy_bests:
            tid = b["exercise_template_id"]
            exercise_history[tid].append({
                "date": current.isoformat(),
                "weight_kg": b.get("weight_kg"),
                "reps": b.get("reps"),
                "estimated_one_rm_kg": b.get("estimated_one_rm_kg"),
            })

    output_dir = REPO_ROOT / "dist" / "history"
    output_dir.mkdir(parents=True, exist_ok=True)

    index = {
        "generated": date.today().isoformat(),
        "days": days,
        "start": start.isoformat(),
        "end": current.isoformat(),
        "dates": [s["snapshot_date"] for s in all_snapshots],
    }
    (output_dir / "index.json").write_text(json.dumps(index, indent=2))

    for s in all_snapshots:
        d = s["snapshot_date"]
        (output_dir / f"{d}.json").write_text(json.dumps(s, indent=2))

    ex_dir = output_dir / "exercises"
    ex_dir.mkdir(parents=True, exist_ok=True)
    for tid, entries in exercise_history.items():
        (ex_dir / f"{tid}.json").write_text(json.dumps(entries, indent=2))

    gains = {}
    for tid, entries in exercise_history.items():
        one_rms = [e["estimated_one_rm_kg"] for e in entries if e.get("estimated_one_rm_kg") is not None]
        if len(one_rms) < 2:
            gains[tid] = {"start": None, "current": None, "peak": None, "gain_pct": 0, "stalled": False}
            continue
        recent = one_rms[-30:]
        stalled = len(recent) > 5 and recent[-1] <= recent[0]
        gains[tid] = {
            "start": one_rms[0],
            "current": one_rms[-1],
            "peak": max(one_rms),
            "gain_pct": round(((one_rms[-1] - one_rms[0]) / one_rms[0]) * 100, 1) if one_rms[0] else 0,
            "stalled": stalled,
        }
    (ex_dir / "_gains.json").write_text(json.dumps(gains, indent=2))

    print(f"Generated {days} snapshots ({start} → {current})")
    print(f"  Per-exercise files: {len(exercise_history)}")
    print(f"Output: {output_dir}/")

    _merge_into_dist(all_snapshots, days)


def _load_base_payloads() -> dict:
    path = EXAMPLES / "sources-ready.json"
    return json.loads(path.read_text())


def _drift(value: float, drift_up: float, noise: float, floor: float, ceil: float) -> float:
    drift = drift_up + random.gauss(0, noise * 0.3)
    new = value + drift + random.uniform(-noise, noise)
    return max(floor, min(ceil, new))


def _pick_weighted(options: list[str], weights: list[float]) -> str:
    return random.choices(options, weights=weights, k=1)[0]


def _build_garmin_bests(current: date, is_pb_day: bool, day_index: int = 0) -> list[dict]:
    bests = []
    pb_progress = {
        "Fastest 5K": (300, 240, 19),       # 5:00 → 4:00 /km pace
        "Fastest 10K": (620, 500, 41),
        "Fastest Half Marathon": (1400, 1100, 91),
        "Fastest Mile": (95, 85, 6),
        "Fastest 1K": (58, 50, 3.5),
        "Longest Run": (16, 22, 0.08),
    }
    progress = day_index / 90
    for name, (start_sec, end_sec, divisor) in pb_progress.items():
        if is_pb_day:
            val_sec = start_sec - (start_sec - end_sec) * progress + random.uniform(-5, 0)
            val_sec = max(end_sec - 10, val_sec)
        else:
            val_sec = start_sec - (start_sec - end_sec) * progress + random.uniform(-15, 15)
        if name == "Longest Run":
            value = f"{val_sec:.1f} km"
        else:
            mins = int(val_sec // 60)
            secs = int(val_sec % 60)
            value = f"{mins}:{secs:02d}"
        bests.append({"record_type": name, "value": value, "date": current.isoformat()})
    return bests


def _build_hevy_bests(current: date, pb_dates: dict[str, date], is_pb_day: bool, day_index: int = 0) -> list[dict]:
    progress = day_index / 90
    base_weights = {
        "D04AC939": (100, 130), "79D0BB3A": (75, 95), "29083183": (88, 105), "28BB4A95": (20, 30),
        "392887AA": (None, None), "F1E57334": (36, 48), "5E10D0E6": (32, 42), "8347DFD1": (14, 20),
        "A1B2C3D4": (130, 160), "B2C3D4E5": (50, 65), "C3D4E5F6": (85, 100), "D4E5F6A7": (90, 115),
        "E5F6A7B8": (34, 44), "F6A7B8C9": (32, 42), "A7B8C9D0": (60, 75), "B8C9D0A1": (18, 24),
        "C9D0A1B2": (25, 35), "D0A1B2C3": (12, 18), "E1F2A3B4": (140, 180), "F2A3B4C5": (55, 70),
        "A3B4C5D6": (80, 100), "B4C5D6E7": (20, 28), "C5D6E7F8": (50, 65), "D6E7F8A9": (70, 85),
        "E7F8A9B0": (60, 80), "F8A9B0C1": (16, 24), "A9B0C1D2": (22, 30), "B0C1D2E3": (100, 130),
        "C1D2E3F4": (40, 50), "D2E3F4A5": (None, None), "E3F4A5B6": (20, 28), "F4A5B6C7": (24, 32),
        "A5B6C7D8": (None, None), "B6C7D8E9": (28, 40),
    }
    bests = []
    boost_tid = None
    if is_pb_day:
        candidates = [t for t in TEMPLATE_IDS if pb_dates[t] < current - timedelta(days=14)]
        if candidates:
            boost_tid = random.choice(candidates)
            pb_dates[boost_tid] = current

    for tid in TEMPLATE_IDS:
        start_val, end_val = base_weights.get(tid, (None, None))
        if start_val is None:
            reps = random.randint(8, 50)
            bests.append({
                "exercise_template_id": tid,
                "weight_kg": None,
                "reps": reps,
                "estimated_one_rm_kg": None,
                "workout_start_date": current.isoformat(),
            })
        else:
            current_weight = start_val + (end_val - start_val) * progress
            w = round(current_weight + random.randint(-3, 3))
            if tid == boost_tid:
                w += random.randint(3, 8)
            reps = random.choice([5, 6, 8, 10, 12])
            one_rm = round(w * (1 + reps / 30), 1)
            bests.append({
                "exercise_template_id": tid,
                "weight_kg": w,
                "reps": reps,
                "estimated_one_rm_kg": one_rm,
                "workout_start_date": current.isoformat(),
            })
    return bests


def _build_nutrition(day_type: str, bw: float) -> dict:
    if day_type == "recovery":
        cals = int(bw * 28 + random.randint(-100, 100))
        protein = round(bw * 1.8 + random.randint(-10, 10))
        carbs = int(cals * 0.35 / 4)
        fat = int(cals * 0.30 / 9)
    elif day_type == "aerobic_quality":
        cals = int(bw * 36 + random.randint(-150, 150))
        protein = round(bw * 2.2 + random.randint(-10, 10))
        carbs = int(cals * 0.50 / 4)
        fat = int(cals * 0.25 / 9)
    elif day_type == "strength":
        cals = int(bw * 33 + random.randint(-100, 100))
        protein = round(bw * 2.2 + random.randint(-10, 10))
        carbs = int(cals * 0.40 / 4)
        fat = int(cals * 0.30 / 9)
    else:
        cals = int(bw * 30 + random.randint(-100, 100))
        protein = round(bw * 2.0 + random.randint(-10, 10))
        carbs = int(cals * 0.40 / 4)
        fat = int(cals * 0.30 / 9)
    return {
        "calories_consumed": cals,
        "calories_target": cals,
        "protein_g": protein,
        "carbs_g": carbs,
        "fat_g": fat,
        "fiber_g": random.randint(18, 35),
        "remaining_kcal": max(-200, random.randint(-100, 300)),
        "log_completeness": "complete" if random.random() > 0.15 else "incomplete",
    }


def _build_muscle_fatigue(day_type: str, bonus: float) -> dict:
    base = {"legs": 0.2, "posterior_chain": 0.2, "push": 0.2, "pull": 0.2, "shoulders_arms": 0.2, "core": 0.2}
    if day_type == "strength":
        base["legs"] = 0.5
        base["push"] = 0.5
    elif day_type == "aerobic_quality":
        base["legs"] = 0.6
        base["posterior_chain"] = 0.4
    else:
        base["legs"] = 0.3
    fatigue_map = {0: "low", 1: "moderate", 2: "high"}
    out = {}
    for muscle, pct in base.items():
        adjusted = min(pct * bonus + random.uniform(-0.1, 0.1), 1.0)
        level = 0 if adjusted < 0.3 else 1 if adjusted < 0.6 else 2
        out[muscle] = fatigue_map[level]
    return out


def _build_soreness(day_type: str, bonus: float) -> list[str]:
    if day_type == "recovery":
        return []
    parts = []
    if day_type == "strength" or random.random() < 0.3 * bonus:
        parts.append(random.choice(["calves", "hamstrings", "quads"]))
    if random.random() < 0.2 * bonus:
        parts.append(random.choice(["shoulders", "back"]))
    return parts


def _merge_into_dist(snapshots: list[dict], days: int) -> None:
    dist = REPO_ROOT / "dist"
    dist.mkdir(parents=True, exist_ok=True)

    latest = snapshots[-1]
    latest_processed = _process_snapshot(latest)

    latest_path = dist / "data" / "snapshot.json"
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps(latest_processed, indent=2))

    for s in snapshots:
        d = s["snapshot_date"]
        processed = _process_snapshot(s)
        snapshot_path = dist / "history" / f"{d}.json"
        snapshot_path.write_text(json.dumps(processed, indent=2))

    print("Updated dist/data/snapshot.json with latest day")
    print(f"Updated {days} history snapshots")


def _process_snapshot(payload: dict) -> dict:
    try:
        from personal_trainer.snapshot import build_snapshot
        from personal_trainer.recommendation import build_daily_recommendation

        snapshot = build_snapshot(payload)
        rec = build_daily_recommendation(snapshot)
        snapshot["recommendation"] = rec
        return snapshot
    except Exception:
        return payload


if __name__ == "__main__":
    main()
