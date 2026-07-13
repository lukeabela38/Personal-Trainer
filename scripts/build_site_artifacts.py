#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path
from typing import Any

_PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "personal_trainer" / "src"
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from personal_trainer.recommendation import build_daily_recommendation
from personal_trainer.snapshot import _validate_snapshot


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the static site artifacts from one captured snapshot.")
    parser.add_argument(
        "--snapshot",
        type=Path,
        default=Path("personal_trainer/examples/snapshot-ready.json"),
        help="Path to the captured snapshot JSON.",
    )
    parser.add_argument(
        "--site-dir",
        type=Path,
        default=Path("site"),
        help="Directory containing the source HTML/CSS/JS files.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("dist"),
        help="Directory to write the published site artifacts into.",
    )
    args = parser.parse_args(argv)

    try:
        snapshot = _load_json(args.snapshot)
        _validate_snapshot(snapshot)
        snapshot_payload = _with_recommendation(snapshot)
        output_dir = args.output_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "data").mkdir(parents=True, exist_ok=True)

        _copy_site_shell(args.site_dir, output_dir)
        (output_dir / "data" / "snapshot.json").write_text(
            json.dumps(snapshot_payload, indent=2),
            encoding="utf-8",
        )
        (output_dir / "raw.json").write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        (output_dir / "strength.json").write_text(
            json.dumps(_build_strength_view(snapshot), indent=2),
            encoding="utf-8",
        )
        (output_dir / "speed.json").write_text(
            json.dumps(_build_speed_view(snapshot), indent=2),
            encoding="utf-8",
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(output_dir)
    return 0


def _with_recommendation(snapshot: dict[str, Any]) -> dict[str, Any]:
    recommendation = snapshot.get("recommendation")
    source = snapshot.get("source") or _infer_snapshot_source(snapshot)
    if isinstance(recommendation, dict):
        return {**snapshot, "source": source}
    return {
        **snapshot,
        "source": source,
        "recommendation": build_daily_recommendation(snapshot),
    }


def _copy_site_shell(site_dir: Path, output_dir: Path) -> None:
    for relative in (
        Path("index.html"),
        Path("styles.css"),
        Path("app.js"),
        Path("food.html"),
        Path("food.js"),
        Path("food/index.html"),
        Path("data-helpers.js"),
        Path("favicon.svg"),
        Path("progress.html"),
        Path("progress.js"),
        Path("progress.css"),
        Path("strength.html"),
        Path("strength.css"),
        Path("strength.js"),
        Path("strength/index.html"),
        Path("speed.html"),
        Path("speed.css"),
        Path("speed.js"),
        Path("speed/index.html"),
        Path("history.js"),
        Path("goals.js"),
    ):
        destination = output_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(site_dir / relative, destination)

    history_dir = site_dir / "history"
    if history_dir.exists():
        for source in history_dir.rglob("*"):
            if not source.is_file():
                continue
            destination = output_dir / source.relative_to(site_dir)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)


_EXERCISE_NAMES = {
    "D04AC939": "Squat (Barbell)",
    "79D0BB3A": "Bench Press (Barbell)",
    "29083183": "Chin Up",
    "28BB4A95": "Triceps Dip",
    "392887AA": "Push Up",
    "F1E57334": "Dumbbell Row",
    "5E10D0E6": "Sumo Squat (Kettlebell)",
    "8347DFD1": "Single Arm Tricep Extension (Dumbbell)",
    "A1B2C3D4": "Deadlift (Barbell)",
    "B2C3D4E5": "Overhead Press (Barbell)",
    "C3D4E5F6": "Pull Up",
    "D4E5F6A7": "Romanian Deadlift",
    "E5F6A7B8": "Bulgarian Split Squat",
    "F6A7B8C9": "Dumbbell Bench Press",
    "A7B8C9D0": "Seated Cable Row",
    "B8C9D0A1": "Bicep Curl (Dumbbell)",
    "C9D0A1B2": "Tricep Pushdown",
    "D0A1B2C3": "Lateral Raise",
    "E1F2A3B4": "Leg Press",
    "F2A3B4C5": "Hamstring Curl",
    "A3B4C5D6": "Calf Raise",
    "B4C5D6E7": "Face Pull",
    "C5D6E7F8": "Pendlay Row",
    "D6E7F8A9": "Front Squat",
    "E7F8A9B0": "Incline Bench Press",
    "F8A9B0C1": "Skull Crusher",
    "A9B0C1D2": "Dumbbell Shoulder Press",
    "B0C1D2E3": "Barbell Hip Thrust",
    "C1D2E3F4": "Farmer Walk",
    "D2E3F4A5": "Pistol Squat",
    "E3F4A5B6": "Weighted Plank",
    "F4A5B6C7": "Kettlebell Swing",
    "A5B6C7D8": "Box Jump",
    "B6C7D8E9": "Dips (Weighted)",
}

_EXERCISE_CATEGORIES = {
    "D04AC939": "Lower body",
    "79D0BB3A": "Push",
    "29083183": "Pull",
    "28BB4A95": "Push",
    "392887AA": "Push",
    "F1E57334": "Pull",
    "5E10D0E6": "Lower body",
    "8347DFD1": "Accessory",
    "A1B2C3D4": "Lower body",
    "B2C3D4E5": "Push",
    "C3D4E5F6": "Pull",
    "D4E5F6A7": "Lower body",
    "E5F6A7B8": "Lower body",
    "F6A7B8C9": "Push",
    "A7B8C9D0": "Pull",
    "B8C9D0A1": "Accessory",
    "C9D0A1B2": "Accessory",
    "D0A1B2C3": "Accessory",
    "E1F2A3B4": "Lower body",
    "F2A3B4C5": "Lower body",
    "A3B4C5D6": "Lower body",
    "B4C5D6E7": "Accessory",
    "C5D6E7F8": "Pull",
    "D6E7F8A9": "Lower body",
    "E7F8A9B0": "Push",
    "F8A9B0C1": "Accessory",
    "A9B0C1D2": "Push",
    "B0C1D2E3": "Lower body",
    "C1D2E3F4": "Accessory",
    "D2E3F4A5": "Lower body",
    "E3F4A5B6": "Accessory",
    "F4A5B6C7": "Accessory",
    "A5B6C7D8": "Accessory",
    "B6C7D8E9": "Push",
}


def _build_strength_view(snapshot: dict[str, Any]) -> dict[str, Any]:
    hevy = snapshot.get("hevy", {})
    entries = []
    for b in hevy.get("recent_bests", []):
        if not isinstance(b, dict):
            continue
        tid = str(b.get("exercise_template_id", ""))
        entries.append(
            {
                "name": _EXERCISE_NAMES.get(tid, tid),
                "category": _EXERCISE_CATEGORIES.get(tid, "Strength"),
                "best_set": {
                    "weight_kg": b.get("weight_kg"),
                    "reps": b.get("reps"),
                },
                "estimated_one_rm_kg": b.get("estimated_one_rm_kg"),
            }
        )
    return {
        "source": "Hevy exercise history",
        "snapshot_date": snapshot.get("snapshot_date"),
        "entries": entries,
    }


_TRACKED_NAMES = {
    "Fastest 1K": "Fastest 1K",
    "Fastest Mile": "Fastest Mile",
    "Fastest 5K": "Fastest 5K",
    "Fastest 10K": "Fastest 10K",
    "Fastest Half Marathon": "Fastest Half Marathon",
    "Longest Run": "Longest Run",
}


def _build_speed_view(snapshot: dict[str, Any]) -> dict[str, Any]:
    garmin = snapshot.get("garmin", {})
    entries = []
    for b in garmin.get("recent_bests", []):
        if not isinstance(b, dict):
            continue
        rtype = str(b.get("record_type") or b.get("name") or "")
        if rtype not in _TRACKED_NAMES:
            continue
        context = b.get("context")
        raw_value = context.get("raw_value") if isinstance(context, dict) else b.get("raw_value")
        entries.append(
            {
                "name": rtype,
                "category": "Running",
                "value": _format_speed_value(rtype, b.get("value"), raw_value),
                "date": b.get("date"),
            }
        )
    return {
        "source": "Garmin personal records",
        "snapshot_date": snapshot.get("snapshot_date"),
        "entries": entries,
    }


def _format_speed_value(record_type: str, value: Any, raw_value: Any = None) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return value
        try:
            numeric_value = float(stripped)
        except ValueError:
            return value
    elif isinstance(value, (int, float)):
        numeric_value = float(value)
    else:
        return value

    numeric_source = raw_value if isinstance(raw_value, (int, float)) else numeric_value
    if record_type == "Longest Run":
        return _format_distance_km(numeric_source)
    return _format_duration(numeric_source)


def _format_duration(seconds: float) -> str:
    whole_seconds = int(math.floor(seconds))
    hours, remainder = divmod(whole_seconds, 3600)
    minutes, sec = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def _format_distance_km(meters: float) -> str:
    return f"{math.floor((meters / 1000) * 100) / 100:.2f} km"


def _infer_snapshot_source(snapshot: dict[str, Any]) -> str:
    cronometer = snapshot.get("cronometer", {})
    garmin = snapshot.get("garmin", {})
    hevy = snapshot.get("hevy", {})
    if (
        (isinstance(cronometer.get("recent_days"), list) and cronometer["recent_days"])
        or (isinstance(garmin.get("recent_runs"), list) and garmin["recent_runs"])
        or (isinstance(hevy.get("recent_workouts"), list) and hevy["recent_workouts"])
    ):
        return "live"
    return "example"


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
