from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any

SourcePayload = dict[str, Any]


def fetch_garmin_payload() -> SourcePayload:
    return _load_source_payload("garmin")


def fetch_hevy_payload() -> SourcePayload:
    return _load_source_payload("hevy")


def fetch_cronometer_payload() -> SourcePayload:
    return _load_source_payload("cronometer")


def fetch_manual_context_payload() -> SourcePayload:
    return _load_source_payload("manual_context")


def _load_source_payload(source_name: str) -> SourcePayload:
    sources = _load_sources_export()
    payload = sources.get(source_name)
    if not isinstance(payload, dict):
        raise ValueError(f"missing {source_name} payload in live sources export")
    return payload


def _load_sources_export() -> dict[str, Any]:
    command = os.environ.get("PERSONAL_TRAINER_SOURCES_COMMAND")
    if command:
        return _load_sources_from_command(command)

    export_path = Path(
        os.environ.get(
            "PERSONAL_TRAINER_SOURCES_FILE",
            Path(__file__).resolve().parents[2] / "examples" / "sources-ready.json",
        )
    )
    return json.loads(export_path.read_text(encoding="utf-8"))


def _load_sources_from_command(command: str) -> dict[str, Any]:
    completed = subprocess.run(
        shlex.split(command),
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(completed.stdout)
    if not isinstance(data, dict):
        raise ValueError("live sources command must emit a JSON object")
    return data
