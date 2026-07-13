from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SetRecord:
    name: str
    category: str
    weight_kg: float | None
    reps: int
    workout_start_time: str


ALIASES = {
    "D04AC939": "Squat (Barbell)",
    "79D0BB3A": "Bench Press (Barbell)",
    "29083183": "Chin Up",
    "28BB4A95": "Triceps Dip",
    "392887AA": "Push Up",
    "F1E57334": "Dumbbell Row",
    "5E10D0E6": "Sumo Squat (Kettlebell)",
    "8347DFD1": "Single Arm Tricep Extension (Dumbbell)",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build site/strength.json from Hevy history.")
    parser.add_argument("--output", type=Path, default=Path("site/strength.json"))
    parser.add_argument("--source", type=Path, default=None)
    args = parser.parse_args(argv)
    try:
        if args.source:
            raw = json.loads(args.source.read_text(encoding="utf-8"))
        else:
            raw = _load_from_command()
        report = build_report(raw)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(args.output)
    return 0


def _load_from_command() -> Any:
    command = os.environ.get("PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND")
    if not command:
        raise ValueError("set PERSONAL_TRAINER_HEVY_STRENGTH_COMMAND or pass --source")
    completed = subprocess.run(command.split(), check=True, capture_output=True, text=True)
    return json.loads(completed.stdout)


def build_report(raw: Any) -> dict[str, Any]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in _extract_records(raw):
        template_id = str(
            row.get("exerciseTemplateId") or row.get("exercise_template_id") or row.get("template_id") or ""
        )
        name = str(
            row.get("exerciseName")
            or row.get("_exercise_name")
            or row.get("exercise_name")
            or ALIASES.get(template_id, template_id)
        ).strip()
        if not name:
            continue
        key = template_id or name
        grouped.setdefault(
            key,
            {
                "name": name,
                "records": [],
            },
        )["records"].append(
            SetRecord(
                name=name,
                category="",
                weight_kg=_to_float(row.get("weight") or row.get("weight_kg")),
                reps=int(row.get("reps") or 0),
                workout_start_time=str(
                    row.get("workoutStartTime") or row.get("workout_start_time") or row.get("start_time") or ""
                ),
            )
        )

    entries = []
    for group in grouped.values():
        records = group["records"]
        best = _best_record(records)
        if best is None:
            continue
        entries.append(
            {
                "name": group["name"],
                "category": _category_for(group["name"]),
                "best_set": {
                    "weight_kg": best.weight_kg,
                    "reps": best.reps,
                    "workout_start_date": best.workout_start_time[:10],
                },
                "estimated_one_rm_kg": _estimate_one_rm(best.weight_kg, best.reps),
            }
        )
    entries.sort(key=lambda entry: entry["best_set"]["workout_start_date"], reverse=True)
    return {
        "source": "Hevy exercise history",
        "snapshot_date": datetime.now(UTC).date().isoformat(),
        "entries": entries,
    }


def _extract_records(raw: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if isinstance(raw, list):
        rows = [row for row in raw if isinstance(row, dict)]
    elif isinstance(raw, dict):
        if isinstance(raw.get("recent_exercises"), list):
            rows.extend(row for row in raw["recent_exercises"] if isinstance(row, dict))
        elif isinstance(raw.get("entries"), list):
            rows.extend(row for row in raw["entries"] if isinstance(row, dict))
        else:
            for value in raw.values():
                if isinstance(value, list):
                    rows.extend(row for row in value if isinstance(row, dict))
    return rows


def _best_record(records: Iterable[SetRecord]) -> SetRecord | None:
    records = list(records)
    if not records:
        return None
    return max(records, key=lambda r: ((r.weight_kg or 0) * (1 + r.reps / 30), r.reps))


def _estimate_one_rm(weight_kg: float | None, reps: int) -> float | None:
    if weight_kg is None:
        return None
    return round(weight_kg * (1 + reps / 30), 1)


def _category_for(name: str) -> str:
    if "squat" in name.lower():
        return "Lower body"
    if "bench" in name.lower():
        return "Push"
    if "row" in name.lower() or "chin" in name.lower():
        return "Pull"
    return "Accessory"


def _to_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    return float(value)


if __name__ == "__main__":
    raise SystemExit(main())
