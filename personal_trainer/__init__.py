"""Package path shim for the nested Python POC.

This repository keeps the actual Python sources under
`personal_trainer/src/personal_trainer` so the docs and top-level repo
structure stay separate. Adding that directory to the package search path lets
`python -m personal_trainer.*` work from the repository root without needing
`PYTHONPATH`.
"""

from __future__ import annotations

from pathlib import Path
from pkgutil import extend_path

__path__ = extend_path(__path__, __name__)

_nested_package = Path(__file__).resolve().parent / "src" / "personal_trainer"
if _nested_package.is_dir():
    __path__.append(str(_nested_package))

from .recommendation import build_daily_recommendation
from .snapshot import build_snapshot

__all__ = ["build_daily_recommendation", "build_snapshot"]
