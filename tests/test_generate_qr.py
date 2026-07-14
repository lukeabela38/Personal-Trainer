from __future__ import annotations

from unittest import TestCase
from unittest.mock import patch

from scripts import generate_qr


class GenerateQrTest(TestCase):
    def test_main_exits_with_error_when_no_url(self) -> None:
        exit_code = generate_qr.main([])
        self.assertEqual(exit_code, 1)

    def test_main_saves_qr_to_path(self) -> None:
        with (
            patch.object(generate_qr.qrcode, "make") as mock_make,
            patch.object(generate_qr.Path, "open"),
        ):
            mock_qr = mock_make.return_value
            exit_code = generate_qr.main(["https://example.com", "/tmp/test.png"])
        self.assertEqual(exit_code, 0)
        mock_make.assert_called_once_with("https://example.com")
        mock_qr.save.assert_called_once()
