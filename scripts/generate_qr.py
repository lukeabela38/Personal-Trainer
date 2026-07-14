#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def main(argv: list[str] | None = None) -> int:
    try:
        import qrcode
    except ImportError:
        print("error: qrcode library not installed. Run: pip install qrcode pillow", file=sys.stderr)
        return 1
    args = argv if argv is not None else sys.argv[1:]
    if not args:
        print("usage: generate_qr.py <url> [output_path]", file=sys.stderr)
        print("  If output_path is omitted, prints to stdout as ANSI block chars.", file=sys.stderr)
        return 1

    url = args[0]
    output_path = Path(args[1]) if len(args) > 1 else None

    qr = qrcode.make(url)

    if output_path:
        qr.save(output_path)
        print(f"QR code saved to {output_path}", file=sys.stderr)
    else:
        _print_ansi(qr)

    return 0


def _print_ansi(qr) -> None:
    pixels = qr.resize((40, 40)).convert("1")
    for y in range(pixels.height):
        line = ""
        for x in range(pixels.width):
            line += "  " if pixels.getpixel((x, y)) else "██"
        print(line)


if __name__ == "__main__":
    raise SystemExit(main())
