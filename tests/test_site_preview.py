from __future__ import annotations

import subprocess
from unittest import TestCase
from unittest.mock import patch

from scripts import site_preview


class SitePreviewTest(TestCase):
    def test_main_builds_example_preview_before_serving(self) -> None:
        site_output = site_preview.DEFAULT_SITE_OUTPUT

        with patch.object(
            site_preview.subprocess,
            "run",
            side_effect=lambda *args, **kwargs: subprocess.CompletedProcess(args[0], 0),
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
        self.assertEqual(run.call_count, 3)
        image_build_call = run.call_args_list[0]
        self.assertEqual(
            image_build_call.args[0], ["docker", "compose", "build", "app"]
        )
        self.assertEqual(image_build_call.kwargs["cwd"], site_preview.REPO_ROOT)
        build_call = run.call_args_list[1]
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
                "/app/dist/data/snapshot.json",
                "--site-output",
                "/app/dist",
                "--sources-file",
                "/app/personal_trainer/examples/snapshot-ready.json",
            ],
        )
        self.assertEqual(build_call.kwargs["cwd"], site_preview.REPO_ROOT)
        serve_call = run.call_args_list[2]
        self.assertEqual(
            serve_call.args[0],
            [site_preview.sys.executable, "-m", "http.server", "4173"],
        )
        self.assertEqual(serve_call.kwargs["cwd"], site_output)

    def test_main_live_mode_omits_example_sources_file(self) -> None:
        site_output = site_preview.DEFAULT_SITE_OUTPUT

        with patch.object(
            site_preview.subprocess,
            "run",
            side_effect=lambda *args, **kwargs: subprocess.CompletedProcess(args[0], 0),
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
        image_build_call = run.call_args_list[0]
        self.assertEqual(
            image_build_call.args[0], ["docker", "compose", "build", "app"]
        )
        build_call = run.call_args_list[1]
        self.assertNotIn("--sources-file", build_call.args[0])
