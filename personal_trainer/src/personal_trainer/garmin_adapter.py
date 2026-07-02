from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .ingestion import SourceAdapter, SourcePayload


FetchGarminPayload = Callable[[], SourcePayload]


@dataclass(frozen=True)
class GarminLiveAdapter(SourceAdapter):
    """Garmin source adapter backed by an injected live fetch function.

    The adapter itself does not know how to authenticate or call MCP. That
    keeps the repository free of secrets and lets a thin wrapper supply the
    live fetch callable from the local Codex MCP environment.
    """

    source_name: str = "garmin"
    fetch_garmin_payload: FetchGarminPayload | None = None

    def fetch(self) -> SourcePayload:
        if self.fetch_garmin_payload is None:
            raise ValueError("fetch_garmin_payload is required for GarminLiveAdapter")
        return self.fetch_garmin_payload()


def merge_garmin_snapshot(raw: SourcePayload, snapshot: dict[str, Any]) -> dict[str, Any]:
    """Merge a raw Garmin payload into a snapshot skeleton.

    This is intentionally tiny: it lets a live data wrapper build the Garmin
    source payload first, then hand it to the existing snapshot normalization
    logic without expanding the recommendation engine surface area.
    """

    merged = dict(snapshot)
    merged["garmin"] = raw
    return merged
