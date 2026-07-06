from __future__ import annotations

from typing import Literal, TypedDict

Priority = Literal[
    "aerobic_quality",
    "aerobic_base",
    "strength_progression",
    "power_and_athleticism",
    "table_tennis_readiness",
    "recovery",
    "nutrition_repair",
]

Confidence = Literal["high", "medium", "low"]
CheckInAnswer = Literal["yes", "no"]
Freshness = Literal["fresh", "stale", "missing", "partial"]
HardSessionAllowed = Literal["yes", "no", "conditional", "unknown"]
MuscleFatigue = Literal["low", "moderate", "high", "unknown"]
ManualQuality = Literal["poor", "okay", "good", "great", "unknown"]
ManualIntensity = Literal["low", "normal", "high", "unknown"]
TableTennisState = Literal["none", "light", "training", "match", "unknown"]


class Macros(TypedDict):
    calories: int
    protein_g: int
    carbs_g: int
    fat_g: int


Recommendation = TypedDict(
    "Recommendation",
    {
        "Priority": Priority,
        "Session": str,
        "Nutrition": str,
        "Macros": Macros,
        "Reason": str,
        "Guardrail": str,
        "Confidence": Confidence,
        "Needs check-in": CheckInAnswer,
    },
)


class DerivedContext(TypedDict):
    data_quality: Literal["high", "medium", "low"]
    hard_session_allowed: HardSessionAllowed
    primary_constraints: list[str]
    likely_conflicts: list[str]
    check_in_required: bool
    check_in_questions: list[str]
