from __future__ import annotations

import unittest

from personal_trainer.garmin_adapter import GarminLiveAdapter, build_garmin_live_adapter


class GarminAdapterTests(unittest.TestCase):
    def test_fetch_uses_injected_callable(self):
        adapter = GarminLiveAdapter(fetch_garmin_payload=lambda: {"freshness": "fresh", "flags": []})

        payload = adapter.fetch()

        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["flags"], [])

    def test_fetch_requires_callable(self):
        adapter = GarminLiveAdapter()

        with self.assertRaises(ValueError):
            adapter.fetch()

    def test_factory_builds_adapter(self):
        adapter = build_garmin_live_adapter(lambda: {"freshness": "fresh", "flags": []})

        self.assertIsInstance(adapter, GarminLiveAdapter)
        self.assertEqual(adapter.fetch()["freshness"], "fresh")


if __name__ == "__main__":
    unittest.main()
