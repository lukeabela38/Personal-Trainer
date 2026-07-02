from __future__ import annotations

import unittest

from personal_trainer.garmin_adapter import GarminLiveAdapter
from personal_trainer.ingestion import collect_source_payloads_from_mapping


class IngestionTests(unittest.TestCase):
    def test_garmin_live_adapter_uses_injected_fetch_callable(self):
        adapter = GarminLiveAdapter(fetch_garmin_payload=lambda: {"freshness": "fresh", "flags": []})

        payload = adapter.fetch()

        self.assertEqual(payload["freshness"], "fresh")
        self.assertEqual(payload["flags"], [])

    def test_collect_source_payloads_from_mapping_uses_adapter_names(self):
        adapters = {
            "garmin": GarminLiveAdapter(fetch_garmin_payload=lambda: {"freshness": "fresh", "flags": []}),
        }

        payloads = collect_source_payloads_from_mapping(adapters)

        self.assertIn("garmin", payloads)
        self.assertEqual(payloads["garmin"]["freshness"], "fresh")


if __name__ == "__main__":
    unittest.main()
