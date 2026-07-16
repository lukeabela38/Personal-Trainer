#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

_PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "personal_trainer" / "src"
if str(_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PACKAGE_ROOT))

from personal_trainer.recommendation import build_daily_recommendation
from personal_trainer.snapshot import _validate_snapshot

from scripts.speed_report import build_report as build_speed_report


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
        page_states = _build_page_states(snapshot_payload)
        snapshot_payload.setdefault("derived", {})["page_states"] = page_states
        output_dir = args.output_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "data").mkdir(parents=True, exist_ok=True)

        _copy_site_shell(args.site_dir, output_dir)
        (output_dir / "data" / "snapshot.json").write_text(
            json.dumps(snapshot_payload, indent=2),
            encoding="utf-8",
        )
        (output_dir / "raw.json").write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        exercise_catalog = _load_exercise_catalog(args.site_dir)
        (output_dir / "strength.json").write_text(
            json.dumps(
                _build_strength_view(snapshot, page_states["strength"], exercise_catalog),
                indent=2,
            ),
            encoding="utf-8",
        )
        (output_dir / "speed.json").write_text(
            json.dumps(
                build_speed_report(
                    {
                        "source": "Garmin speed data",
                        "source_mode": snapshot.get("source") or "example",
                        "snapshot_date": snapshot.get("snapshot_date"),
                        "current_vo2max": snapshot.get("garmin", {}).get("current_vo2max"),
                        "vo2max_trend": snapshot.get("garmin", {}).get("vo2max_trend"),
                        "vo2max_trend_points": snapshot.get("garmin", {}).get("vo2max_trend_points", []),
                        "training_load_trend": snapshot.get("garmin", {}).get("training_load_trend"),
                        "readiness": snapshot.get("garmin", {}).get("readiness", {}),
                        "recent_bests": snapshot.get("garmin", {}).get("recent_bests", []),
                        "recent_runs": snapshot.get("garmin", {}).get("recent_runs", []),
                    },
                    page_state=page_states["speed"],
                ),
                indent=2,
            ),
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
        Path("manifest.webmanifest"),
        Path("food.html"),
        Path("food.js"),
        Path("food/index.html"),
        Path("barcode-scanner.js"),
        Path("data-helpers.js"),
        Path("hevy-live.js"),
        Path("favicon.png"),
        Path("progress.html"),
        Path("progress.js"),
        Path("progress.css"),
        Path("strength.html"),
        Path("strength.css"),
        Path("strength.js"),
        Path("progression.js"),
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

    assets_dir = site_dir / "assets"
    if assets_dir.exists():
        for source in assets_dir.rglob("*"):
            if not source.is_file():
                continue
            destination = output_dir / source.relative_to(site_dir)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

    history_dir = site_dir / "history"
    if history_dir.exists():
        for source in history_dir.rglob("*"):
            if not source.is_file():
                continue
            destination = output_dir / source.relative_to(site_dir)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)


def _build_page_states(snapshot: dict[str, Any]) -> dict[str, dict[str, str]]:
    garmin = snapshot.get("garmin", {})
    hevy = snapshot.get("hevy", {})
    cronometer = snapshot.get("cronometer", {})

    return {
        "food": _build_source_page_state(
            cronometer,
            has_data=bool(cronometer.get("today")) or bool(cronometer.get("recent_days")),
            source_label="Cronometer",
            ready_label="Macro data ready",
            stale_label="Macro data partial",
            missing_label="No macro data available",
        ),
        "strength": _build_source_page_state(
            hevy,
            has_data=bool(hevy.get("recent_bests")) or bool(hevy.get("recent_workouts")),
            source_label="Hevy",
            ready_label="Strength history ready",
            stale_label="Strength history partial",
            missing_label="No strength data available",
        ),
        "speed": _build_source_page_state(
            garmin,
            has_data=bool(garmin.get("recent_bests")) or bool(garmin.get("recent_runs")),
            source_label="Garmin",
            ready_label="Speed history ready",
            stale_label="Speed history partial",
            missing_label="No speed data available",
        ),
    }


def _build_source_page_state(
    source: dict[str, Any],
    *,
    has_data: bool,
    source_label: str,
    ready_label: str,
    stale_label: str,
    missing_label: str,
) -> dict[str, str]:
    freshness = str(source.get("freshness", "missing"))
    if freshness == "fresh" and has_data:
        return {
            "kind": "fresh",
            "label": ready_label,
            "detail": f"{source_label} data is available and current.",
        }
    if freshness in {"stale", "partial"} and has_data:
        return {
            "kind": "stale",
            "label": stale_label,
            "detail": f"{source_label} data exists, but it is not fresh enough to treat as current.",
        }
    return {
        "kind": "missing",
        "label": missing_label,
        "detail": f"{source_label} data is not available for this snapshot.",
    }


def _load_exercise_catalog(site_dir: Path) -> dict[str, dict[str, str]]:
    catalog = _load_json(site_dir / "history" / "exercises" / "index.json")
    entries = catalog.get("exercises", [])
    if not isinstance(entries, list):
        raise ValueError("site/history/exercises/index.json must contain an exercises array")

    by_id: dict[str, dict[str, str]] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        template_id = str(entry.get("exercise_template_id", "")).strip()
        name = str(entry.get("name", "")).strip()
        category = str(entry.get("category", "Strength")).strip() or "Strength"
        if template_id and name:
            by_id[template_id] = {"name": name, "category": category}
    return by_id


def _build_strength_view(
    snapshot: dict[str, Any],
    page_state: dict[str, str],
    exercise_catalog: dict[str, dict[str, str]],
) -> dict[str, Any]:
    hevy = snapshot.get("hevy", {})
    recent_workouts = [workout for workout in hevy.get("recent_workouts", []) if isinstance(workout, dict)]
    entries = []
    for b in hevy.get("recent_bests", []):
        if not isinstance(b, dict):
            continue
        tid = str(b.get("exercise_template_id", ""))
        exercise = exercise_catalog.get(tid, {})
        entries.append(
            {
                "templateId": tid,
                "name": exercise.get("name", tid),
                "category": exercise.get("category", "Strength"),
                "best_set": {
                    "weight_kg": b.get("weight_kg"),
                    "reps": b.get("reps"),
                },
                "estimated_one_rm_kg": b.get("estimated_one_rm_kg"),
                "workout_title": b.get("workout_title"),
            }
        )
    return {
        "source": "Hevy exercise history",
        "snapshot_date": snapshot.get("snapshot_date"),
        "page_state": page_state,
        "entries": entries,
        "recent_workouts": recent_workouts,
    }


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
