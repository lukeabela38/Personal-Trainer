from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .ingestion import SourceAdapter, SourcePayload

FetchCronometerPayload = Callable[[], SourcePayload]


@dataclass(frozen=True)
class CronometerLiveAdapter(SourceAdapter):
    """Cronometer source adapter backed by an injected live fetch function."""

    source_name: str = "cronometer"
    fetch_cronometer_payload: FetchCronometerPayload | None = None

    def fetch(self) -> SourcePayload:
        if self.fetch_cronometer_payload is None:
            raise ValueError("fetch_cronometer_payload is required for CronometerLiveAdapter")
        return self.fetch_cronometer_payload()


def build_cronometer_live_adapter(fetch_cronometer_payload: FetchCronometerPayload) -> CronometerLiveAdapter:
    return CronometerLiveAdapter(fetch_cronometer_payload=fetch_cronometer_payload)
