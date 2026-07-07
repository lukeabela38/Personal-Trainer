from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from .ingestion import SourceAdapter

SourcePayload = dict[str, Any]
FetchGarminPayload = Callable[[], SourcePayload]


@dataclass(frozen=True)
class GarminLiveAdapter(SourceAdapter):
    """Garmin source adapter backed by an injected live fetch function."""

    source_name: str = "garmin"
    fetch_garmin_payload: FetchGarminPayload | None = None

    def fetch(self) -> SourcePayload:
        if self.fetch_garmin_payload is None:
            raise ValueError("fetch_garmin_payload is required for GarminLiveAdapter")
        return self.fetch_garmin_payload()


def build_garmin_live_adapter(fetch_garmin_payload: FetchGarminPayload) -> GarminLiveAdapter:
    """Factory for the live Garmin adapter."""

    return GarminLiveAdapter(fetch_garmin_payload=fetch_garmin_payload)
