from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


SourcePayload = dict[str, Any]
FetchHevyPayload = Callable[[], SourcePayload]


@dataclass(frozen=True)
class HevyLiveAdapter:
    """Hevy source adapter backed by an injected live fetch function."""

    source_name: str = "hevy"
    fetch_hevy_payload: FetchHevyPayload | None = None

    def fetch(self) -> SourcePayload:
        if self.fetch_hevy_payload is None:
            raise ValueError("fetch_hevy_payload is required for HevyLiveAdapter")
        return self.fetch_hevy_payload()
