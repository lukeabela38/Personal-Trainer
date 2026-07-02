from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from personal_trainer import live_sources


class LiveSourcesTests(unittest.TestCase):
    def test_fetchers_read_export_file(self):
        export = {
            "garmin": {"freshness": "fresh", "flags": []},
            "hevy": {"freshness": "fresh", "flags": []},
            "cronometer": {"freshness": "fresh", "flags": []},
            "manual_context": {"freshness": "fresh", "motivation": "normal"},
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            export_path = Path(tmpdir) / "sources.json"
            export_path.write_text(json.dumps(export), encoding="utf-8")
            previous = os.environ.get("PERSONAL_TRAINER_SOURCES_FILE")
            os.environ["PERSONAL_TRAINER_SOURCES_FILE"] = str(export_path)
            try:
                self.assertEqual(live_sources.fetch_garmin_payload()["freshness"], "fresh")
                self.assertEqual(live_sources.fetch_hevy_payload()["freshness"], "fresh")
                self.assertEqual(live_sources.fetch_cronometer_payload()["freshness"], "fresh")
                self.assertEqual(live_sources.fetch_manual_context_payload()["freshness"], "fresh")
            finally:
                if previous is None:
                    os.environ.pop("PERSONAL_TRAINER_SOURCES_FILE", None)
                else:
                    os.environ["PERSONAL_TRAINER_SOURCES_FILE"] = previous


if __name__ == "__main__":
    unittest.main()
