from __future__ import annotations

import unittest

from personal_trainer.garmin_adapter import GarminLiveAdapter


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


if __name__ == "__main__":
    unittest.main()
