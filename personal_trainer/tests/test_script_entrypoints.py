from __future__ import annotations

import json
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "personal_trainer" / "src"))
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from personal_trainer import snapshot_cli  # noqa: E402

import generate_history  # noqa: E402

try:  # noqa: SIM105
    import speed_report  # noqa: E402
except ImportError as exc:  # pragma: no cover - exercised only on older local Python
    speed_report = None
    SPEED_REPORT_IMPORT_ERROR = exc
else:
    SPEED_REPORT_IMPORT_ERROR = None


class SnapshotCliTests(TestCase):
    def test_main_normalizes_source_payloads(self) -> None:
        source = REPO_ROOT / "personal_trainer" / "examples" / "sources-ready.json"
        stdout = StringIO()
        stderr = StringIO()

        with redirect_stdout(stdout), redirect_stderr(stderr):
            exit_code = snapshot_cli.main([str(source), "--date", "2026-07-09", "--timezone", "Europe/Malta"])

        self.assertEqual(exit_code, 0)
        self.assertEqual(stderr.getvalue(), "")

        snapshot = json.loads(stdout.getvalue())
        self.assertEqual(snapshot["snapshot_date"], "2026-07-09")
        self.assertEqual(snapshot["timezone"], "Europe/Malta")
        self.assertIn("derived", snapshot)
        self.assertIn("athlete", snapshot)

    def test_main_rejects_non_object_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "sources.json"
            source.write_text(json.dumps([]), encoding="utf-8")
            stdout = StringIO()
            stderr = StringIO()

            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = snapshot_cli.main([str(source)])

        self.assertEqual(exit_code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("sources must be a JSON object", stderr.getvalue())


class SpeedReportTests(TestCase):
    def test_main_writes_filtered_running_prs(self) -> None:
        if speed_report is None:
            self.skipTest(f"speed_report requires Python 3.11+: {SPEED_REPORT_IMPORT_ERROR}")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            source = tmp_path / "speed-source.json"
            output = tmp_path / "speed.json"
            source.write_text(
                json.dumps(
                    {
                        "snapshot_date": "2026-07-09",
                        "result": [
                            {
                                "record_type": "Fastest 5K",
                                "value": 1251.10400390625,
                                "date": "2026-07-01",
                                "raw_value": 1251.10400390625,
                                "activity_id": 22817326323,
                            },
                            {
                                "record_type": "Not Tracked",
                                "value": 999,
                                "date": "2026-07-01",
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )

            stdout = StringIO()
            stderr = StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = speed_report.main(["--source", str(source), "--output", str(output)])

            self.assertEqual(exit_code, 0)
            self.assertEqual(stderr.getvalue(), "")
            self.assertEqual(stdout.getvalue().strip(), str(output))
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["source"], "Garmin personal records")
            self.assertEqual(report["snapshot_date"], "2026-07-09")
            self.assertEqual(len(report["entries"]), 1)
            self.assertEqual(report["entries"][0]["name"], "Fastest 5K")
            self.assertEqual(report["entries"][0]["context"]["activity_id"], 22817326323)


class GenerateHistoryTests(TestCase):
    def test_merge_into_dist_writes_latest_snapshot_and_history(self) -> None:
        snapshots = [
            {"snapshot_date": "2026-07-08", "source": "test", "value": 1},
            {"snapshot_date": "2026-07-09", "source": "test", "value": 2},
        ]

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            with patch.object(generate_history, "REPO_ROOT", tmp_path), patch.object(
                generate_history,
                "_process_snapshot",
                side_effect=lambda payload: {**payload, "recommendation": {"Priority": "aerobic_quality"}},
            ):
                generate_history._merge_into_dist(snapshots, len(snapshots))

            latest = json.loads((tmp_path / "dist" / "data" / "snapshot.json").read_text(encoding="utf-8"))
            history_a = json.loads((tmp_path / "dist" / "history" / "2026-07-08.json").read_text(encoding="utf-8"))
            history_b = json.loads((tmp_path / "dist" / "history" / "2026-07-09.json").read_text(encoding="utf-8"))

            self.assertEqual(latest["recommendation"]["Priority"], "aerobic_quality")
            self.assertEqual(history_a["recommendation"]["Priority"], "aerobic_quality")
            self.assertEqual(history_b["recommendation"]["Priority"], "aerobic_quality")
