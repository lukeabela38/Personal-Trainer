from __future__ import annotations

import unittest

from personal_trainer.hevy_adapter import HevyLiveAdapter, build_hevy_live_adapter


class HevyAdapterTests(unittest.TestCase):
    def test_fetch_uses_injected_callable(self):
        adapter = HevyLiveAdapter(fetch_hevy_payload=lambda: {"freshness": "fresh", "flags": []})

        payload = adapter.fetch()

        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["flags"], [])

    def test_fetch_requires_callable(self):
        adapter = HevyLiveAdapter()

        with self.assertRaises(ValueError):
            adapter.fetch()

    def test_factory_builds_adapter(self):
        adapter = build_hevy_live_adapter(lambda: {"freshness": "fresh", "flags": []})

        self.assertIsInstance(adapter, HevyLiveAdapter)
        self.assertEqual(adapter.fetch()["freshness"], "fresh")


if __name__ == "__main__":
    unittest.main()
