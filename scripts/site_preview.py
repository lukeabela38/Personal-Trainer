#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SITE_OUTPUT = REPO_ROOT / "dist"
CONTAINER_ROOT = Path("/app")
CONTAINER_DEFAULT_SNAPSHOT = CONTAINER_ROOT / "personal_trainer" / "examples" / "snapshot-ready.json"

tunnel_process: subprocess.Popen | None = None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the deploy-like site bundle and serve it locally.")
    parser.add_argument("--port", type=int, default=4173, help="Port for the local preview server.")
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
    parser.add_argument(
        "--tunnel",
        action="store_true",
        help="Start a cloudflared tunnel for mobile testing. Falls back to Docker if cloudflared is not installed locally.",
    )
    args = parser.parse_args(argv)

    try:
        if not args.skip_build:
            _build_preview_artifacts(
                site_output=args.site_output,
                snapshot_output=args.snapshot_output,
                sources_file=None if args.live else args.sources_file,
            )
        if args.tunnel:
            _start_tunnel(args.port)
        return _serve_directory(args.site_output, args.port)
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        _stop_tunnel()


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
    command = [
        sys.executable,
        "-m",
        "http.server",
        str(port),
        "--bind",
        "127.0.0.1",
    ]
    subprocess.run(command, cwd=site_output, check=True)
    return 0


tunnel_process: subprocess.Popen | None = None


def _start_tunnel(port: int) -> None:
    global tunnel_process
    url = f"http://localhost:{port}"

    if _cloudflared_installed():
        tunnel_process = subprocess.Popen(
            ["cloudflared", "tunnel", "--url", url],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
    else:
        print(
            "cloudflared not found locally, using Docker image (cloudflare/cloudflared)...",
            file=sys.stderr,
        )
        tunnel_process = subprocess.Popen(
            [
                "docker",
                "compose",
                "run",
                "--rm",
                "--service-ports",
                "--name",
                "personal-trainer-tunnel",
                "tunnel",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=REPO_ROOT,
        )

    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    tunnel_url = None
    if tunnel_process.stdout:
        for line in tunnel_process.stdout:
            line = line.strip()
            print(line, file=sys.stderr)
            match = url_pattern.search(line)
            if match:
                tunnel_url = match.group(0)
                break
    if tunnel_url:
        print(f"\n  Tunnel URL: {tunnel_url}")
        print("  Open this URL on your phone to test from a mobile device.\n")
    else:
        print("error: could not determine tunnel URL", file=sys.stderr)


def _stop_tunnel() -> None:
    global tunnel_process
    if tunnel_process:
        tunnel_process.terminate()
        try:
            tunnel_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            tunnel_process.kill()
            tunnel_process.wait()
        tunnel_process = None


def _cloudflared_installed() -> bool:
    try:
        subprocess.run(["cloudflared", "--version"], capture_output=True, check=False)
        return True
    except FileNotFoundError:
        return False


def _container_path(path: Path) -> Path:
    try:
        relative = path.resolve().relative_to(REPO_ROOT)
    except ValueError:
        return path
    return CONTAINER_ROOT / relative


if __name__ == "__main__":
    raise SystemExit(main())
