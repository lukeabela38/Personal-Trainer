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


class CheckInQuestion(TypedDict):
    id: str
    prompt: str
    options: list[str]


class PredictionCalibrationPoint(TypedDict):
    date: str
    distance_m: float
    duration_s: float
    pace_s_per_km: float
    avg_heart_rate_bpm: float | None
    name: str


class PredictionContract(TypedDict):
    prediction: str
    ci_68: str
    ci_95: str
    model: str
    calibration_points: list[PredictionCalibrationPoint]
    confidence: Literal["high", "medium", "low"]
    trend: Literal["improving", "stable", "declining"]
    how_to_improve: str


class PredictionSourceRun(TypedDict):
    activity_id: int | str | None
    name: str
    date: str
    distance: str
    duration: str
    avg_heart_rate_bpm: float | None
    age_days: int | None
    confidence: Literal["high", "medium", "low"]


class SpeedPrediction(PredictionContract):
    distance_label: str
    target_distance_m: float
    predicted_time_s: float
    predicted_time: str
    predicted_pace: str
    source_run: PredictionSourceRun
    stale: bool
    generated_on: str


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
    check_in_questions: list[CheckInQuestion]
