from __future__ import annotations

import json
import unittest
from pathlib import Path

from personal_trainer.snapshot import _validate_snapshot, build_snapshot


EXAMPLES_DIR = Path(__file__).resolve().parents[1] / "examples"


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


if __name__ == "__main__":
    unittest.main()
