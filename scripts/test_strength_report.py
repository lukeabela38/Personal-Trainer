from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from strength_report import build_report


class StrengthReportTests(unittest.TestCase):
    def test_build_report_prefers_best_set(self) -> None:
        raw = [
            {
                "exerciseTemplateId": "79D0BB3A",
                "workoutTitle": "A",
                "weight": 60,
                "reps": 8,
                "workoutStartTime": "2026-01-01T00:00:00Z",
            },
            {
                "exerciseTemplateId": "79D0BB3A",
                "workoutTitle": "B",
                "weight": 70,
                "reps": 4,
                "workoutStartTime": "2026-01-02T00:00:00Z",
            },
        ]
        report = build_report(raw)
        bench = next(entry for entry in report["entries"] if entry["name"] == "Bench Press (Barbell)")
        self.assertEqual(bench["best_set"]["weight_kg"], 70.0)
        self.assertEqual(bench["best_set"]["reps"], 4)
        self.assertEqual(bench["estimated_one_rm_kg"], 79.3)


if __name__ == "__main__":
    unittest.main()
