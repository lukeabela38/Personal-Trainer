from __future__ import annotations

import copy
import json
from pathlib import Path
from unittest import TestCase

from personal_trainer import build_daily_recommendation, build_snapshot
from personal_trainer.snapshot import _validate_snapshot

EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "personal_trainer" / "examples"


class SnapshotFuzzTests(TestCase):
    def test_validate_snapshot_rejects_mutated_variants(self) -> None:
        valid_snapshot = build_snapshot(
            json.loads(
                (EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8")
            )
        )
        cases = [
            (
                "athlete.age",
                lambda snap: snap["athlete"].__setitem__("age", "twenty-eight"),
                "athlete.age",
            ),
            (
                "athlete.block",
                lambda snap: snap["athlete"].__setitem__(
                    "current_block", "marathon_peak"
                ),
                "athlete.current_block",
            ),
            (
                "garmin.freshness",
                lambda snap: snap["garmin"].__setitem__("freshness", "expired"),
                "garmin.freshness",
            ),
            (
                "hevy.fatigue",
                lambda snap: snap["hevy"].__setitem__(
                    "muscle_group_fatigue", "not-a-dict"
                ),
                "hevy.muscle_group_fatigue",
            ),
            (
                "derived.checkin",
                lambda snap: snap["derived"].__setitem__("check_in_required", "yes"),
                "check_in_required",
            ),
            (
                "derived.options",
                lambda snap: snap["derived"]["check_in_questions"].append(
                    {"id": "broken", "prompt": "Broken?", "options": [""]},
                ),
                "derived.check_in_questions",
            ),
        ]

        for name, mutator, expected in cases:
            with self.subTest(name=name):
                mutated = copy.deepcopy(valid_snapshot)
                mutator(mutated)
                with self.assertRaisesRegex(ValueError, expected):
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
