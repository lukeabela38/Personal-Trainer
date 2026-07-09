from __future__ import annotations

import ast
import json
from pathlib import Path
from unittest import TestCase

from personal_trainer import build_daily_recommendation, build_snapshot

EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "personal_trainer" / "examples"
GOLDEN_DIR = Path(__file__).resolve().parent / "golden" / "recommendation"


class RecommendationGoldenTests(TestCase):
    def _load_expected(self, name: str) -> dict:
        return ast.literal_eval((GOLDEN_DIR / f"{name}.py").read_text(encoding="utf-8"))

    def test_ready_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("ready"))

    def test_under_fueled_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["cronometer"]["fueling_status"] = "low"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("under_fueled"))

    def test_recovery_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["manual_context"]["sleep_quality"] = "poor"
        sources["manual_context"]["mental_fatigue"] = "high"
        sources["manual_context"]["motivation"] = "low"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("recovery"))

    def test_aerobic_base_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["hevy"]["muscle_group_fatigue"]["legs"] = "high"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("aerobic_base"))

    def test_strength_progression_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["athlete"]["current_block"] = "hybrid_balanced"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("strength_progression"))

    def test_power_and_athleticism_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["athlete"]["current_block"] = "strength_focus"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("power_and_athleticism"))

    def test_table_tennis_readiness_snapshot_matches_golden(self) -> None:
        sources = json.loads((EXAMPLES_DIR / "sources-ready.json").read_text(encoding="utf-8"))
        sources["manual_context"]["table_tennis_today"] = "match"
        snapshot = build_snapshot(sources)
        recommendation = build_daily_recommendation(snapshot)

        self.assertEqual(recommendation, self._load_expected("table_tennis_readiness"))


if __name__ == "__main__":
    import unittest

    unittest.main()
