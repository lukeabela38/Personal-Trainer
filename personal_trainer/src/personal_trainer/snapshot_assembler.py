from __future__ import annotations

from typing import Any

from .ingestion import SourceAdapter, collect_source_payloads
from .snapshot import build_snapshot


def build_snapshot_from_adapters(
    adapters: dict[str, SourceAdapter],
    *,
    snapshot_date: str | None = None,
    timezone: str = "Europe/Malta",
    athlete: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Collect source payloads from adapters and normalize them into a snapshot."""

    sources = collect_source_payloads(adapters)
    if snapshot_date is not None:
        sources["snapshot_date"] = snapshot_date
    if timezone is not None:
        sources["timezone"] = timezone
    if athlete is not None:
        sources["athlete"] = athlete
    return build_snapshot(sources, snapshot_date=snapshot_date, timezone=timezone, athlete=athlete)
