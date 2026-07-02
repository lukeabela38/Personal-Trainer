from __future__ import annotations

import unittest

from personal_trainer.cronometer_adapter import CronometerLiveAdapter
from personal_trainer.snapshot_assembler import build_snapshot_from_adapters


class _DummyAdapter:
    def __init__(self, source_name: str, payload: dict[str, object]) -> None:
        self.source_name = source_name
        self._payload = payload

    def fetch(self) -> dict[str, object]:
        return self._payload


class SnapshotAssemblerTests(unittest.TestCase):
    def test_builds_snapshot_from_live_adapters(self):
        adapters = {
            "garmin": _DummyAdapter("garmin", {"freshness": "fresh", "flags": []}),
            "hevy": _DummyAdapter("hevy", {"freshness": "fresh", "flags": []}),
            "cronometer": CronometerLiveAdapter(
                fetch_cronometer_payload=lambda: {
                    "freshness": "fresh",
                    "fueling_status": "adequate",
                    "protein_status": "adequate",
                    "carb_availability": "adequate",
                    "today": {"log_completeness": "complete"},
                    "flags": [],
                }
            ),
            "manual_context": _DummyAdapter(
                "manual_context",
                {
                    "freshness": "fresh",
                    "sleep_quality": "good",
                    "soreness": [],
                    "pain": [],
                    "motivation": "normal",
                    "mental_fatigue": "low",
                    "table_tennis_today": "none",
                },
            ),
        }

        snapshot = build_snapshot_from_adapters(adapters)

        self.assertEqual(snapshot["garmin"]["freshness"], "fresh")
        self.assertEqual(snapshot["hevy"]["freshness"], "fresh")
        self.assertEqual(snapshot["cronometer"]["fueling_status"], "adequate")
        self.assertEqual(snapshot["derived"]["data_quality"], "high")


if __name__ == "__main__":
    unittest.main()
