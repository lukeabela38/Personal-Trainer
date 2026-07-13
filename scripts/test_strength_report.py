from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from strength_report import build_catalog, build_report


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

    def test_build_report_includes_dynamic_exercises(self) -> None:
        raw = [
            {
                "exerciseTemplateId": "D04AC939",
                "exerciseName": "Squat (Barbell)",
                "workoutTitle": "A",
                "weight": 100,
                "reps": 5,
                "workoutStartTime": "2026-01-01T00:00:00Z",
            },
            {
                "exerciseTemplateId": "ABCD1234",
                "exerciseName": "Incline Dumbbell Curl",
                "workoutTitle": "B",
                "weight": 20,
                "reps": 10,
                "workoutStartTime": "2026-01-02T00:00:00Z",
            },
        ]
        report = build_report(raw)
        names = [entry["name"] for entry in report["entries"]]
        self.assertIn("Squat (Barbell)", names)
        self.assertIn("Incline Dumbbell Curl", names)
        curl = next(entry for entry in report["entries"] if entry["name"] == "Incline Dumbbell Curl")
        self.assertEqual(curl["category"], "Accessory")
        self.assertEqual(curl["best_set"]["weight_kg"], 20.0)

    def test_build_catalog_discovers_new_exercises(self) -> None:
        raw = [
            {
                "exerciseTemplateId": "ABCD1234",
                "exerciseName": "Incline Dumbbell Curl",
                "workoutTitle": "B",
                "weight": 20,
                "reps": 10,
                "workoutStartTime": "2026-01-02T00:00:00Z",
            }
        ]
        catalog = build_catalog(raw)
        entry = next(item for item in catalog["exercises"] if item["exercise_template_id"] == "ABCD1234")
        self.assertEqual(entry["name"], "Incline Dumbbell Curl")
        self.assertEqual(entry["category"], "Accessory")


if __name__ == "__main__":
    unittest.main()
