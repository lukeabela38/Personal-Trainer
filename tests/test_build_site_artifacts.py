from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest import TestCase

from scripts import build_site_artifacts


class BuildSiteArtifactsTest(TestCase):
    def test_builds_all_site_artifacts_from_one_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            snapshot = tmp_path / "snapshot.json"
            site_dir = tmp_path / "site"
            output_dir = tmp_path / "dist"
            site_dir.mkdir()
            for name in (
                "index.html",
                "styles.css",
                "app.js",
                "progress.html",
                "progress.js",
                "strength.html",
                "strength.css",
                "strength.js",
                "speed.html",
                "speed.css",
                "speed.js",
            ):
                (site_dir / name).write_text(name, encoding="utf-8")
            snapshot.write_text(
                json.dumps(
                    {
                        "snapshot_date": "2026-07-06",
                        "hevy": {
                            "recent_bests": [
                                {
                                    "name": "Squat",
                                    "best_set": {"weight_kg": 100, "reps": 5},
                                }
                            ]
                        },
                        "garmin": {
                            "recent_bests": [{"name": "Fastest 5K", "value": "20:15"}]
                        },
                    }
                ),
                encoding="utf-8",
            )

            exit_code = build_site_artifacts.main(
                [
                    "--snapshot",
                    str(snapshot),
                    "--site-dir",
                    str(site_dir),
                    "--output-dir",
                    str(output_dir),
                ]
            )

            self.assertEqual(exit_code, 0)
            self.assertTrue((output_dir / "data" / "snapshot.json").exists())
            self.assertTrue((output_dir / "raw.json").exists())
            self.assertTrue((output_dir / "progress.html").exists())
            self.assertTrue((output_dir / "progress.js").exists())
            self.assertTrue((output_dir / "strength.json").exists())
            self.assertTrue((output_dir / "speed.json").exists())
