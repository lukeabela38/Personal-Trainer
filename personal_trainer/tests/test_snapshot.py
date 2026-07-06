from __future__ import annotations

import json
import unittest
from pathlib import Path

from personal_trainer.snapshot import _validate_snapshot, build_snapshot


EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"


def _valid_snapshot() -> dict:
    return {
        "snapshot_date": "2026-07-06",
        "timezone": "Europe/Malta",
        "athlete": {"age": 28, "height_cm": 188},
        "garmin": {
            "freshness": "fresh",
            "current_vo2max": 51,
            "vo2max_trend": "unknown",
            "recent_activities": [],
            "recent_runs": [],
            "recent_bests": [],
            "flags": [],
        },
        "hevy": {
            "freshness": "fresh",
            "recent_workouts": [],
            "recent_bests": [],
            "muscle_group_fatigue": {
                "legs": "low",
                "posterior_chain": "unknown",
                "push": "unknown",
                "pull": "unknown",
                "shoulders_arms": "low",
                "core": "unknown",
            },
            "strength_trend": "unknown",
            "flags": [],
        },
        "cronometer": {
            "freshness": "fresh",
            "fueling_status": "adequate",
            "protein_status": "adequate",
            "carb_availability": "adequate",
            "today": {"log_completeness": "complete"},
            "recent_days": [],
            "flags": [],
        },
        "manual_context": {
            "freshness": "fresh",
            "sleep_quality": "good",
            "soreness": [],
            "pain": [],
            "motivation": "normal",
            "mental_fatigue": "low",
            "table_tennis_today": "none",
            "constraints": [],
        },
        "derived": {
            "data_quality": "high",
            "hard_session_allowed": "yes",
            "primary_constraints": [],
            "likely_conflicts": [],
            "check_in_required": False,
            "check_in_questions": [],
        },
    }


class SnapshotContractTests(unittest.TestCase):
    def test_ready_example_builds_and_validates(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        snapshot = build_snapshot(sources)

        self.assertEqual(snapshot["derived"]["data_quality"], "high")
        self.assertEqual(snapshot["derived"]["hard_session_allowed"], "yes")
        self.assertIn("snapshot_date", snapshot)

    def test_validate_snapshot_rejects_missing_required_sections(self) -> None:
        with self.assertRaisesRegex(ValueError, "derived"):
            _validate_snapshot(
                {
                    "snapshot_date": "2026-07-02",
                    "timezone": "Europe/Malta",
                    "athlete": {},
                    "garmin": {},
                    "hevy": {},
                    "cronometer": {},
                    "manual_context": {},
                }
            )

    def test_valid_snapshot_passes_validation(self) -> None:
        result = _validate_snapshot(_valid_snapshot())
        self.assertEqual(result["derived"]["data_quality"], "high")

    def test_rejects_invalid_freshness(self) -> None:
        snap = _valid_snapshot()
        snap["garmin"]["freshness"] = "expired"
        with self.assertRaisesRegex(ValueError, "garmin.freshness"):
            _validate_snapshot(snap)

    def test_rejects_invalid_data_quality(self) -> None:
        snap = _valid_snapshot()
        snap["derived"]["data_quality"] = "superb"
        with self.assertRaisesRegex(ValueError, "derived.data_quality"):
            _validate_snapshot(snap)

    def test_rejects_invalid_hard_session_allowed(self) -> None:
        snap = _valid_snapshot()
        snap["derived"]["hard_session_allowed"] = "maybe"
        with self.assertRaisesRegex(ValueError, "derived.hard_session_allowed"):
            _validate_snapshot(snap)

    def test_rejects_invalid_muscle_fatigue_value(self) -> None:
        snap = _valid_snapshot()
        snap["hevy"]["muscle_group_fatigue"]["legs"] = "extreme"
        with self.assertRaisesRegex(ValueError, "hevy.muscle_group_fatigue.legs"):
            _validate_snapshot(snap)

    def test_rejects_invalid_nutrition_status(self) -> None:
        snap = _valid_snapshot()
        snap["cronometer"]["fueling_status"] = "excessive"
        with self.assertRaisesRegex(ValueError, "cronometer.fueling_status"):
            _validate_snapshot(snap)

    def test_rejects_invalid_sleep_quality(self) -> None:
        snap = _valid_snapshot()
        snap["manual_context"]["sleep_quality"] = "fantastic"
        with self.assertRaisesRegex(ValueError, "manual_context.sleep_quality"):
            _validate_snapshot(snap)

    def test_rejects_invalid_motivation(self) -> None:
        snap = _valid_snapshot()
        snap["manual_context"]["motivation"] = "extreme"
        with self.assertRaisesRegex(ValueError, "manual_context.motivation"):
            _validate_snapshot(snap)

    def test_rejects_invalid_mental_fatigue(self) -> None:
        snap = _valid_snapshot()
        snap["manual_context"]["mental_fatigue"] = "critical"
        with self.assertRaisesRegex(ValueError, "manual_context.mental_fatigue"):
            _validate_snapshot(snap)

    def test_rejects_invalid_table_tennis_value(self) -> None:
        snap = _valid_snapshot()
        snap["manual_context"]["table_tennis_today"] = "competition"
        with self.assertRaisesRegex(ValueError, "manual_context.table_tennis_today"):
            _validate_snapshot(snap)

    def test_rejects_non_list_garmin_recent_activities(self) -> None:
        snap = _valid_snapshot()
        snap["garmin"]["recent_activities"] = "not a list"
        with self.assertRaisesRegex(ValueError, "garmin.recent_activities"):
            _validate_snapshot(snap)

    def test_rejects_non_list_garmin_flags(self) -> None:
        snap = _valid_snapshot()
        snap["garmin"]["flags"] = "not a list"
        with self.assertRaisesRegex(ValueError, "garmin.flags"):
            _validate_snapshot(snap)

    def test_rejects_non_list_hevy_flags(self) -> None:
        snap = _valid_snapshot()
        snap["hevy"]["flags"] = "not a list"
        with self.assertRaisesRegex(ValueError, "hevy.flags"):
            _validate_snapshot(snap)

    def test_rejects_non_dict_muscle_fatigue(self) -> None:
        snap = _valid_snapshot()
        snap["hevy"]["muscle_group_fatigue"] = "not a dict"
        with self.assertRaisesRegex(ValueError, "hevy.muscle_group_fatigue"):
            _validate_snapshot(snap)

    def test_rejects_non_bool_check_in_required(self) -> None:
        snap = _valid_snapshot()
        snap["derived"]["check_in_required"] = "yes"
        with self.assertRaisesRegex(ValueError, "check_in_required"):
            _validate_snapshot(snap)

    def test_rejects_non_string_snapshot_date(self) -> None:
        snap = _valid_snapshot()
        snap["snapshot_date"] = 20260706
        with self.assertRaisesRegex(ValueError, "snapshot_date"):
            _validate_snapshot(snap)

    def test_allows_nullable_nutrition_fields(self) -> None:
        snap = _valid_snapshot()
        snap["cronometer"]["fueling_status"] = None
        snap["cronometer"]["protein_status"] = None
        snap["cronometer"]["carb_availability"] = None
        _validate_snapshot(snap)

    def test_allows_nullable_manual_fields(self) -> None:
        snap = _valid_snapshot()
        snap["manual_context"]["sleep_quality"] = None
        snap["manual_context"]["motivation"] = None
        snap["manual_context"]["mental_fatigue"] = None
        snap["manual_context"]["table_tennis_today"] = None
        _validate_snapshot(snap)


if __name__ == "__main__":
    unittest.main()
