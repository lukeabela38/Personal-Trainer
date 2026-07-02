from __future__ import annotations

import argparse
import importlib
import json
import sys
from types import ModuleType
from typing import Any

from .snapshot import build_snapshot
from .source_registry import build_source_adapter_registry, collect_source_payloads


DEFAULT_SOURCE_NAMES = ("garmin", "hevy", "cronometer", "manual_context")


def run_live_smoke(live_module: ModuleType, source_names: tuple[str, ...] = DEFAULT_SOURCE_NAMES) -> dict[str, Any]:
    """Build and print a snapshot from live source fetchers."""

    fetchers = _load_fetchers(live_module, source_names)
    adapters = build_source_adapter_registry(fetchers)
    sources = collect_source_payloads(adapters)
    snapshot = build_snapshot(sources)
    return snapshot


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run a manual live-data smoke test and print the assembled snapshot."
    )
    parser.add_argument(
        "--live-module",
        default="personal_trainer.live_sources",
        help="Module that exports live fetch functions like fetch_garmin_payload",
    )
    parser.add_argument(
        "--source",
        action="append",
        dest="sources",
        choices=list(DEFAULT_SOURCE_NAMES),
        help="Limit the live smoke run to one or more source names",
    )
    args = parser.parse_args(argv)

    try:
        live_module = importlib.import_module(args.live_module)
        snapshot = run_live_smoke(
            live_module,
            tuple(args.sources) if args.sources else DEFAULT_SOURCE_NAMES,
        )
    except (OSError, AttributeError, ImportError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(snapshot, indent=2))
    return 0


def _load_fetchers(module: ModuleType, source_names: tuple[str, ...]) -> dict[str, Any]:
    fetchers: dict[str, Any] = {}
    for source_name in source_names:
        fetcher_name = f"fetch_{source_name}_payload"
        fetcher = getattr(module, fetcher_name, None)
        if fetcher is None:
            raise AttributeError(f"{module.__name__} is missing {fetcher_name}")
        fetchers[source_name] = fetcher
    return fetchers


if __name__ == "__main__":
    raise SystemExit(main())
