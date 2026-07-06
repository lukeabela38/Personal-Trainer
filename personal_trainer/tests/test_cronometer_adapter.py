from __future__ import annotations

import unittest

from personal_trainer.cronometer_adapter import CronometerLiveAdapter, build_cronometer_live_adapter


class CronometerAdapterTests(unittest.TestCase):
    def test_fetch_uses_injected_callable(self):
        adapter = CronometerLiveAdapter(fetch_cronometer_payload=lambda: {"freshness": "fresh", "flags": []})

        payload = adapter.fetch()

        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["flags"], [])

    def test_fetch_requires_callable(self):
        adapter = CronometerLiveAdapter()

        with self.assertRaises(ValueError):
            adapter.fetch()

    def test_factory_builds_adapter(self):
        adapter = build_cronometer_live_adapter(lambda: {"freshness": "fresh", "flags": []})

        self.assertIsInstance(adapter, CronometerLiveAdapter)
        self.assertEqual(adapter.fetch()["freshness"], "fresh")


if __name__ == "__main__":
    unittest.main()
