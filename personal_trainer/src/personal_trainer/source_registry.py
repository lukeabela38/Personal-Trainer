from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol


SourcePayload = dict[str, Any]
FetchSourcePayload = Callable[[], SourcePayload]


class SourceAdapter(Protocol):
    source_name: str

    def fetch(self) -> SourcePayload:
        """Return a raw source payload ready for normalization."""


@dataclass(frozen=True)
class CallableSourceAdapter:
    """Generic adapter for a named source payload fetch function."""

    source_name: str
    fetch_payload: FetchSourcePayload

    def fetch(self) -> SourcePayload:
        return self.fetch_payload()


def build_source_adapter_registry(fetchers: dict[str, FetchSourcePayload]) -> dict[str, SourceAdapter]:
    """Wrap source fetch callables into a named adapter registry."""

    return {name: CallableSourceAdapter(source_name=name, fetch_payload=fetch_payload) for name, fetch_payload in fetchers.items()}


def collect_source_payloads(adapters: dict[str, SourceAdapter]) -> dict[str, SourcePayload]:
    """Collect source payloads from a named adapter registry."""

    return {name: adapter.fetch() for name, adapter in adapters.items()}
