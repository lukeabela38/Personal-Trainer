from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


SourcePayload = dict[str, Any]
FetchGarminPayload = Callable[[], SourcePayload]


@dataclass(frozen=True)
class GarminLiveAdapter:
    """Garmin source adapter backed by an injected live fetch function."""

    source_name: str = "garmin"
    fetch_garmin_payload: FetchGarminPayload | None = None

    def fetch(self) -> SourcePayload:
        if self.fetch_garmin_payload is None:
            raise ValueError("fetch_garmin_payload is required for GarminLiveAdapter")
        return self.fetch_garmin_payload()
