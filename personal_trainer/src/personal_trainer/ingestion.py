from __future__ import annotations

from typing import Any, Protocol


SourcePayload = dict[str, Any]


class SourceAdapter(Protocol):
    source_name: str

    def fetch(self) -> SourcePayload:
        """Return a raw source payload ready for normalization."""


def collect_source_payloads(adapters: dict[str, SourceAdapter]) -> dict[str, SourcePayload]:
    """Collect source payloads from named adapters."""

    return {name: adapter.fetch() for name, adapter in adapters.items()}
