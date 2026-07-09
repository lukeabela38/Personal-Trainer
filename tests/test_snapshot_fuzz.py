from __future__ import annotations

import copy
import json
import re
from pathlib import Path
from unittest import TestCase

from personal_trainer import build_daily_recommendation, build_snapshot
from personal_trainer.snapshot import _validate_snapshot

EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "personal_trainer" / "examples"


class SnapshotFuzzTests(TestCase):
    def test_validate_snapshot_rejects_mutated_variants(self) -> None:
        valid_snapshot = build_snapshot(json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8")))
        cases = [
            (
                "snapshot_date",
                lambda snap: snap.__setitem__("snapshot_date", 20260702),
                "snapshot_date",
            ),
            ("timezone", lambda snap: snap.__setitem__("timezone", 123), "timezone"),
            (
                "athlete.age",
                lambda snap: snap["athlete"].__setitem__("age", "twenty-eight"),
                "athlete.age",
            ),
            (
                "athlete.height",
                lambda snap: snap["athlete"].__setitem__("height_cm", "188"),
                "athlete.height_cm",
            ),
            (
                "athlete.weight",
                lambda snap: snap["athlete"].__setitem__("body_weight_kg", "83.5"),
                "athlete.body_weight_kg",
            ),
            (
                "athlete.block",
                lambda snap: snap["athlete"].__setitem__("current_block", "marathon_peak"),
                "athlete.current_block",
            ),
            (
                "athlete.vo2_waypoint",
                lambda snap: snap["athlete"].__setitem__("current_vo2max_waypoint", "52"),
                "athlete.current_vo2max_waypoint",
            ),
            (
                "derived.data_quality",
                lambda snap: snap["derived"].__setitem__("data_quality", "great"),
                "derived.data_quality",
            ),
            (
                "derived.hard_session",
                lambda snap: snap["derived"].__setitem__("hard_session_allowed", "maybe"),
                "derived.hard_session_allowed",
            ),
            (
                "derived.check_in_required",
                lambda snap: snap["derived"].__setitem__("check_in_required", "yes"),
                "derived.check_in_required",
            ),
            (
                "derived.primary_constraints",
                lambda snap: snap["derived"].__setitem__("primary_constraints", {}),
                "derived.primary_constraints",
            ),
            (
                "derived.likely_conflicts",
                lambda snap: snap["derived"].__setitem__("likely_conflicts", {}),
                "derived.likely_conflicts",
            ),
            (
                "derived.check_in_questions",
                lambda snap: snap["derived"].__setitem__("check_in_questions", {}),
                "derived.check_in_questions",
            ),
            (
                "derived.question.object",
                lambda snap: (
                    snap["derived"]["check_in_questions"].append(
                        {"id": "broken", "prompt": "Broken?", "options": ["yes"]}
                    ),
                    snap["derived"]["check_in_questions"].__setitem__(0, []),
                ),
                "derived.check_in_questions[0]",
            ),
            (
                "derived.question.id",
                lambda snap: (
                    snap["derived"]["check_in_questions"].append(
                        {"id": "broken", "prompt": "Broken?", "options": ["yes"]}
                    ),
                    snap["derived"]["check_in_questions"][0].__setitem__("id", ""),
                ),
                "derived.check_in_questions[0].id",
            ),
            (
                "derived.question.prompt",
                lambda snap: (
                    snap["derived"]["check_in_questions"].append(
                        {"id": "broken", "prompt": "Broken?", "options": ["yes"]}
                    ),
                    snap["derived"]["check_in_questions"][0].__setitem__("prompt", ""),
                ),
                "derived.check_in_questions[0].prompt",
            ),
            (
                "derived.question.options",
                lambda snap: (
                    snap["derived"]["check_in_questions"].append(
                        {"id": "broken", "prompt": "Broken?", "options": ["yes"]}
                    ),
                    snap["derived"]["check_in_questions"][0].__setitem__("options", []),
                ),
                "derived.check_in_questions[0].options",
            ),
            (
                "derived.question.option_item",
                lambda snap: (
                    snap["derived"]["check_in_questions"].append(
                        {"id": "broken", "prompt": "Broken?", "options": ["yes"]}
                    ),
                    snap["derived"]["check_in_questions"][0].__setitem__("options", [""]),
                ),
                "derived.check_in_questions[0].options[0]",
            ),
            (
                "garmin.freshness",
                lambda snap: snap["garmin"].__setitem__("freshness", "expired"),
                "garmin.freshness",
            ),
            (
                "garmin.recent_activities",
                lambda snap: snap["garmin"].__setitem__("recent_activities", {}),
                "garmin.recent_activities",
            ),
            (
                "garmin.recent_runs",
                lambda snap: snap["garmin"].__setitem__("recent_runs", {}),
                "garmin.recent_runs",
            ),
            (
                "garmin.recent_bests",
                lambda snap: snap["garmin"].__setitem__("recent_bests", {}),
                "garmin.recent_bests",
            ),
            (
                "garmin.flags",
                lambda snap: snap["garmin"].__setitem__("flags", {}),
                "garmin.flags",
            ),
            (
                "hevy.fatigue",
                lambda snap: snap["hevy"].__setitem__("muscle_group_fatigue", "not-a-dict"),
                "hevy.muscle_group_fatigue",
            ),
            (
                "hevy.recent_workouts",
                lambda snap: snap["hevy"].__setitem__("recent_workouts", {}),
                "hevy.recent_workouts",
            ),
            (
                "hevy.recent_bests",
                lambda snap: snap["hevy"].__setitem__("recent_bests", {}),
                "hevy.recent_bests",
            ),
            (
                "hevy.flags",
                lambda snap: snap["hevy"].__setitem__("flags", {}),
                "hevy.flags",
            ),
            (
                "hevy.muscle_fatigue_value",
                lambda snap: snap["hevy"]["muscle_group_fatigue"].__setitem__("legs", "sore"),
                "hevy.muscle_group_fatigue.legs",
            ),
            (
                "cronometer.freshness",
                lambda snap: snap["cronometer"].__setitem__("freshness", "expired"),
                "cronometer.freshness",
            ),
            (
                "cronometer.fueling",
                lambda snap: snap["cronometer"].__setitem__("fueling_status", "empty"),
                "cronometer.fueling_status",
            ),
            (
                "cronometer.protein",
                lambda snap: snap["cronometer"].__setitem__("protein_status", "empty"),
                "cronometer.protein_status",
            ),
            (
                "cronometer.carbs",
                lambda snap: snap["cronometer"].__setitem__("carb_availability", "empty"),
                "cronometer.carb_availability",
            ),
            (
                "cronometer.flags",
                lambda snap: snap["cronometer"].__setitem__("flags", {}),
                "cronometer.flags",
            ),
            (
                "manual.sleep",
                lambda snap: snap["manual_context"].__setitem__("sleep_quality", "exhausted"),
                "manual_context.sleep_quality",
            ),
            (
                "manual.motivation",
                lambda snap: snap["manual_context"].__setitem__("motivation", "flat"),
                "manual_context.motivation",
            ),
            (
                "manual.fatigue",
                lambda snap: snap["manual_context"].__setitem__("mental_fatigue", "fried"),
                "manual_context.mental_fatigue",
            ),
            (
                "manual.tt",
                lambda snap: snap["manual_context"].__setitem__("table_tennis_today", "tournament"),
                "manual_context.table_tennis_today",
            ),
            (
                "manual.soreness",
                lambda snap: snap["manual_context"].__setitem__("soreness", {}),
                "manual_context.soreness",
            ),
            (
                "manual.pain",
                lambda snap: snap["manual_context"].__setitem__("pain", {}),
                "manual_context.pain",
            ),
            (
                "manual.constraints",
                lambda snap: snap["manual_context"].__setitem__("constraints", {}),
                "manual_context.constraints",
            ),
        ]

        for name, mutator, expected in cases:
            with self.subTest(name=name):
                mutated = copy.deepcopy(valid_snapshot)
                mutator(mutated)
                with self.assertRaisesRegex(ValueError, re.escape(expected)):
                    _validate_snapshot(mutated)

    def test_partial_sources_still_build_and_recommend(self) -> None:
        snapshot = build_snapshot({})
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(snapshot["derived"]["data_quality"], "low")
        self.assertIn(
            recommendation["Priority"],
            {"aerobic_quality", "aerobic_base", "nutrition_repair", "recovery"},
        )
        self.assertIn(recommendation["Needs check-in"], {"yes", "no"})


if __name__ == "__main__":
    import unittest

    unittest.main()
