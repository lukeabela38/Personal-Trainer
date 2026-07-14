from __future__ import annotations

from unittest import TestCase

from scripts import generate_qr


class GenerateQrTest(TestCase):
    def test_main_exits_with_error_when_no_url(self) -> None:
        exit_code = generate_qr.main([])
        self.assertEqual(exit_code, 1)

    def test_main_exits_when_qrcode_missing(self) -> None:
        import builtins

        original_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "qrcode":
                raise ImportError("no qrcode")
            return original_import(name, *args, **kwargs)

        builtins.__import__ = fake_import
        try:
            exit_code = generate_qr.main(["https://x.com"])
            self.assertEqual(exit_code, 1)
        finally:
            builtins.__import__ = original_import
