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
    (output_dir / "raw.json").write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
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


def _build_strength_view(snapshot: dict[str, Any]) -> dict[str, Any]:
    hevy = snapshot.get("hevy", {})
    return {
        "source": "Hevy exercise history",
        "snapshot_date": snapshot.get("snapshot_date"),
        "entries": hevy.get("recent_bests", []),
    }


def _build_speed_view(snapshot: dict[str, Any]) -> dict[str, Any]:
    garmin = snapshot.get("garmin", {})
    return {
        "source": "Garmin personal records",
        "snapshot_date": snapshot.get("snapshot_date"),
        "entries": garmin.get("recent_bests", []),
    }


def _load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
