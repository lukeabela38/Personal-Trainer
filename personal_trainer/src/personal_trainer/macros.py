from __future__ import annotations

from .contracts import Macros, Priority
from .nutrition import _build_targets


def build_macros(
    *,
    weight_kg: float,
    height_cm: float,
    age: int,
    priority: Priority | str,
) -> Macros:
    return _build_targets(weight_kg, height_cm, age, priority)
