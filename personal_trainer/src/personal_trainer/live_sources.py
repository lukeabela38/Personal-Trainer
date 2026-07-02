from __future__ import annotations

import json
import os
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
    export_path = Path(
        os.environ.get(
            "PERSONAL_TRAINER_SOURCES_FILE",
            Path(__file__).resolve().parents[2] / "examples" / "sources-ready.json",
        )
    )
    return json.loads(export_path.read_text(encoding="utf-8"))
