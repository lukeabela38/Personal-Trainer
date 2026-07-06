#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build the static site artifacts from one captured snapshot."
    )
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

    snapshot = _load_json(args.snapshot)
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "data").mkdir(parents=True, exist_ok=True)

    _copy_site_shell(args.site_dir, output_dir)
    (output_dir / "data" / "snapshot.json").write_text(
        json.dumps(snapshot, indent=2),
        encoding="utf-8",
    )
    (output_dir / "raw.json").write_text(
        json.dumps(snapshot, indent=2), encoding="utf-8"
    )
    (output_dir / "strength.json").write_text(
        json.dumps(_build_strength_view(snapshot), indent=2),
        encoding="utf-8",
    )
    (output_dir / "speed.json").write_text(
        json.dumps(_build_speed_view(snapshot), indent=2),
        encoding="utf-8",
    )
    print(output_dir)
    return 0


def _copy_site_shell(site_dir: Path, output_dir: Path) -> None:
    for name in (
        "index.html",
        "styles.css",
        "app.js",
        "progress.html",
        "progress.js",
        "strength.html",
        "strength.css",
        "strength.js",
        "speed.html",
        "speed.css",
        "speed.js",
    ):
        shutil.copy2(site_dir / name, output_dir / name)


_EXERCISE_NAMES = {
    "D04AC939": "Squat (Barbell)",
    "79D0BB3A": "Bench Press (Barbell)",
    "29083183": "Chin Up",
    "28BB4A95": "Triceps Dip",
    "392887AA": "Push Up",
    "F1E57334": "Dumbbell Row",
    "5E10D0E6": "Sumo Squat (Kettlebell)",
    "8347DFD1": "Single Arm Tricep Extension (Dumbbell)",
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
        entries.append(
            {
                "name": rtype,
                "category": "Running",
                "value": b.get("value"),
                "date": b.get("date"),
            }
        )
    return {
        "source": "Garmin personal records",
        "snapshot_date": snapshot.get("snapshot_date"),
        "entries": entries,
    }


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
