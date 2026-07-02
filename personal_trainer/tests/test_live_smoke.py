from __future__ import annotations

import sys
import types
import unittest

from personal_trainer.live_smoke import run_live_smoke


class LiveSmokeTests(unittest.TestCase):
    def test_runs_with_synthetic_live_module(self):
        module = types.ModuleType("personal_trainer.live_sources")
        module.fetch_garmin_payload = lambda: {"freshness": "fresh", "flags": []}
        module.fetch_hevy_payload = lambda: {"freshness": "fresh", "flags": []}
        module.fetch_cronometer_payload = lambda: {
            "freshness": "fresh",
            "fueling_status": "adequate",
            "protein_status": "adequate",
            "carb_availability": "adequate",
            "today": {"log_completeness": "complete"},
            "flags": [],
        }
        module.fetch_manual_context_payload = lambda: {
            "freshness": "fresh",
            "sleep_quality": "good",
            "soreness": [],
            "pain": [],
            "motivation": "normal",
            "mental_fatigue": "low",
            "table_tennis_today": "none",
        }
        sys.modules[module.__name__] = module

        snapshot = run_live_smoke(module)

        self.assertEqual(snapshot["garmin"]["freshness"], "fresh")
        self.assertEqual(snapshot["hevy"]["freshness"], "fresh")
        self.assertEqual(snapshot["cronometer"]["fueling_status"], "adequate")
        self.assertEqual(snapshot["derived"]["data_quality"], "high")


if __name__ == "__main__":
    unittest.main()
