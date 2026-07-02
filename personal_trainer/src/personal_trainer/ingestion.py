from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


SourcePayload = dict[str, Any]


class SourceAdapter(Protocol):
    """Minimal interface for future live-data ingestion adapters."""

    source_name: str

    def fetch(self) -> SourcePayload:
        """Return a raw source payload ready for normalization."""


@dataclass(frozen=True)
class StaticSourceAdapter:
    """Adapter that returns a preloaded payload.

    This keeps the ingestion boundary explicit without introducing networked
    dependencies into the recommendation package.
    """

    source_name: str
    payload: SourcePayload

    def fetch(self) -> SourcePayload:
        return self.payload


def collect_source_payloads(adapters: list[SourceAdapter]) -> dict[str, SourcePayload]:
    """Collect raw payloads from adapters into the normalized source map."""
    return {adapter.source_name: adapter.fetch() for adapter in adapters}


def collect_source_payloads_from_mapping(adapters: dict[str, SourceAdapter]) -> dict[str, SourcePayload]:
    """Collect raw payloads from a named adapter mapping.

    This is convenient for live-data wrappers where the source names are known
    up front and the caller wants deterministic keys in the source map.
    """

    return {name: adapter.fetch() for name, adapter in adapters.items()}
