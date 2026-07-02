from __future__ import annotations

import unittest

from personal_trainer.source_registry import CallableSourceAdapter, build_source_adapter_registry, collect_source_payloads


class SourceRegistryTests(unittest.TestCase):
    def test_builds_named_callable_adapters(self):
        registry = build_source_adapter_registry(
            {
                "garmin": lambda: {"freshness": "fresh", "flags": []},
                "hevy": lambda: {"freshness": "fresh", "flags": []},
            }
        )

        self.assertIsInstance(registry["garmin"], CallableSourceAdapter)
        self.assertEqual(registry["garmin"].fetch()["freshness"], "fresh")
        self.assertEqual(registry["hevy"].fetch()["flags"], [])

    def test_collects_payloads_from_registry(self):
        registry = build_source_adapter_registry({"garmin": lambda: {"freshness": "fresh", "flags": []}})

        payloads = collect_source_payloads(registry)

        self.assertEqual(payloads["garmin"]["freshness"], "fresh")


if __name__ == "__main__":
    unittest.main()
