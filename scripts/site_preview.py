#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SITE_OUTPUT = REPO_ROOT / "dist"
CONTAINER_ROOT = Path("/app")
CONTAINER_DEFAULT_SNAPSHOT = (
    CONTAINER_ROOT / "personal_trainer" / "examples" / "snapshot-ready.json"
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build the deploy-like site bundle and serve it locally."
    )
    parser.add_argument(
        "--port", type=int, default=4173, help="Port for the local preview server."
    )
    parser.add_argument(
        "--site-output",
        type=Path,
        default=DEFAULT_SITE_OUTPUT,
        help="Directory that receives the preview site artifacts.",
    )
    parser.add_argument(
        "--snapshot-output",
        type=Path,
        default=DEFAULT_SITE_OUTPUT / "data" / "snapshot.json",
        help="Path to the snapshot JSON used by the site build.",
    )
    parser.add_argument(
        "--sources-file",
        type=Path,
        default=REPO_ROOT / "personal_trainer" / "examples" / "snapshot-ready.json",
        help="Use a captured source payload instead of live commands.",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Capture live sources through the daily runner instead of using the example snapshot.",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Serve the existing site output without rebuilding artifacts first.",
    )
    args = parser.parse_args(argv)

    try:
        if not args.skip_build:
            _build_preview_artifacts(
                site_output=args.site_output,
                snapshot_output=args.snapshot_output,
                sources_file=None if args.live else args.sources_file,
            )
        return _serve_directory(args.site_output, args.port)
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


def _build_preview_artifacts(
    *,
    site_output: Path,
    snapshot_output: Path,
    sources_file: Path | None,
) -> None:
    subprocess.run(["docker", "compose", "build", "app"], cwd=REPO_ROOT, check=True)
    command = [
        "docker",
        "compose",
        "run",
        "--rm",
        "app",
        "python3",
        "scripts/daily_snapshot_runner.py",
        "--snapshot-output",
        str(_container_path(snapshot_output)),
        "--site-output",
        str(_container_path(site_output)),
    ]
    if sources_file is not None:
        command.extend(["--sources-file", str(_container_path(sources_file))])
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def _serve_directory(site_output: Path, port: int) -> int:
    command = [sys.executable, "-m", "http.server", str(port)]
    subprocess.run(command, cwd=site_output, check=True)
    return 0


def _container_path(path: Path) -> Path:
    try:
        relative = path.resolve().relative_to(REPO_ROOT)
    except ValueError:
        return path
    return CONTAINER_ROOT / relative


if __name__ == "__main__":
    raise SystemExit(main())
