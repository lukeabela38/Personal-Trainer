from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from scripts import site_preview


class SitePreviewTest(TestCase):
    def test_main_builds_example_preview_before_serving(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            site_output = tmp_path / "dist"
            site_output.mkdir()

            with patch.object(
                site_preview.subprocess,
                "run",
                side_effect=lambda *args, **kwargs: subprocess.CompletedProcess(
                    args[0], 0
                ),
            ) as run:
                exit_code = site_preview.main(
                    [
                        "--site-output",
                        str(site_output),
                        "--snapshot-output",
                        str(site_output / "data" / "snapshot.json"),
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(run.call_count, 2)
            build_call = run.call_args_list[0]
            self.assertEqual(
                build_call.args[0],
                [
                    "docker",
                    "compose",
                    "run",
                    "--rm",
                    "app",
                    "python3",
                    "scripts/daily_snapshot_runner.py",
                    "--snapshot-output",
                    str(site_output / "data" / "snapshot.json"),
                    "--site-output",
                    str(site_output),
                    "--sources-file",
                    str(site_preview.DEFAULT_SNAPSHOT),
                ],
            )
            self.assertEqual(build_call.kwargs["cwd"], site_preview.REPO_ROOT)
            serve_call = run.call_args_list[1]
            self.assertEqual(
                serve_call.args[0],
                [site_preview.sys.executable, "-m", "http.server", "4173"],
            )
            self.assertEqual(serve_call.kwargs["cwd"], site_output)

    def test_main_live_mode_omits_example_sources_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            site_output = tmp_path / "dist"
            site_output.mkdir()

            with patch.object(
                site_preview.subprocess,
                "run",
                side_effect=lambda *args, **kwargs: subprocess.CompletedProcess(
                    args[0], 0
                ),
            ) as run:
                exit_code = site_preview.main(
                    [
                        "--live",
                        "--site-output",
                        str(site_output),
                        "--snapshot-output",
                        str(site_output / "data" / "snapshot.json"),
                    ]
                )

            self.assertEqual(exit_code, 0)
            build_call = run.call_args_list[0]
            self.assertNotIn("--sources-file", build_call.args[0])
