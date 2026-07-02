from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .contracts import Recommendation
Snapshot = dict[str, Any]


@dataclass(frozen=True)
class Decision:
    priority: str
    session: str
    nutrition: str
    reason: str
    guardrail: str
    confidence: str
    needs_check_in: str

    def as_dict(self) -> Recommendation:
        return {
            "Priority": self.priority,
            "Session": self.session,
            "Nutrition": self.nutrition,
            "Reason": self.reason,
            "Guardrail": self.guardrail,
            "Confidence": self.confidence,
            "Needs check-in": self.needs_check_in,
        }


def build_daily_recommendation(snapshot: Snapshot) -> Recommendation:
    """Build a daily recommendation from a normalized data snapshot.

    The first version is intentionally rule-based and transparent. It follows
    the contracts in docs/daily-recommendation-contract.md and
    docs/data-snapshot-contract.md without pretending to be a final scoring
    model.
    """
    derived = snapshot.get("derived", {})
    constraints = set(_list(derived.get("primary_constraints")))
    conflicts = set(_list(derived.get("likely_conflicts")))

    garmin = snapshot.get("garmin", {})
    hevy = snapshot.get("hevy", {})
    cronometer = snapshot.get("cronometer", {})
    manual = snapshot.get("manual_context", {})

    flags = _source_flags(garmin, hevy, cronometer)
    check_in_required = bool(derived.get("check_in_required"))

    if _has_any(constraints, {"pain_risk", "poor_recovery"}) or _manual_high_fatigue(manual):
        return Decision(
            priority="recovery",
            session="rest, mobility, or an easy walk depending on soreness",
            nutrition="eat at maintenance or slight deficit only if protein is protected",
            reason=_first_reason(
                [
                    ("pain_risk" in constraints, "pain or movement-quality risk is present"),
                    ("poor_recovery" in constraints, "recovery is currently the limiting factor"),
                    (_manual_high_fatigue(manual), "manual fatigue signal is high"),
                ]
            ),
            guardrail="do not turn a low-readiness day into intensity or heavy lifting",
            confidence=_confidence(snapshot, fallback="medium"),
            needs_check_in=_yes_no(check_in_required or _manual_context_missing(manual)),
        ).as_dict()

    if _has_any(constraints, {"under_fueled"}) or _has_any(flags, {"under_fueled_today", "protein_low_today"}):
        return Decision(
            priority="nutrition_repair",
            session="easy walk, light mobility, or rest",
            nutrition="close the calorie, protein, or carbohydrate gap before adding stress",
            reason="recent fueling does not support another hard session",
            guardrail="avoid combining a large deficit with intensity",
            confidence=_confidence(snapshot, fallback="medium"),
            needs_check_in=_yes_no(True),
        ).as_dict()

    if "table_tennis_conflict" in constraints or _table_tennis_is_important(manual):
        return Decision(
            priority="table_tennis_readiness",
            session="protect freshness; avoid grip-heavy, shoulder-heavy, or leg-depleting work",
            nutrition="normal fueling with protein protected",
            reason="table tennis readiness is a meaningful constraint today",
            guardrail="do not add fatigue that reduces coordination or shoulder/arm quality",
            confidence=_confidence(snapshot, fallback="medium"),
            needs_check_in=_yes_no(check_in_required),
        ).as_dict()

    if _hard_session_allowed(snapshot) and _aerobic_block(snapshot) and not _has_any(
        constraints, {"leg_fatigue", "under_fueled"}
    ):
        return Decision(
            priority="aerobic_quality",
            session="threshold, tempo, or VO2-focused run selected after warm-up readiness",
            nutrition="higher-carbohydrate day, protein target protected",
            reason="aerobic block is active and no major constraint blocks quality work",
            guardrail="do not add heavy lower-body volume after the run",
            confidence=_confidence(snapshot, fallback="medium"),
            needs_check_in=_yes_no(check_in_required),
        ).as_dict()

    if "heavy_legs_vs_quality_run" in conflicts or "leg_fatigue" in constraints:
        return Decision(
            priority="aerobic_base",
            session="easy aerobic work only, keeping legs fresh for the next quality session",
            nutrition="normal fueling; do not force a large deficit",
            reason="leg fatigue conflicts with hard running or heavy lower-body work",
            guardrail="keep the session easy enough to improve recovery, not compete with it",
            confidence=_confidence(snapshot, fallback="medium"),
            needs_check_in=_yes_no(check_in_required),
        ).as_dict()

    if _strength_available(flags, hevy):
        return Decision(
            priority="strength_progression",
            session="gym session with progression intent and controlled volume",
            nutrition="normal or slight surplus around training, protein target protected",
            reason="recent training state supports productive strength work",
            guardrail="keep lower-body work compatible with the next quality run",
            confidence=_confidence(snapshot, fallback="medium"),
            needs_check_in=_yes_no(check_in_required),
        ).as_dict()

    return Decision(
        priority="aerobic_base",
        session="easy run, low-intensity cardio, or brisk walk",
        nutrition="normal fueling with protein protected",
        reason="no higher-priority hard session is clearly supported by the snapshot",
        guardrail="do not drift into a medium-hard session without a reason",
        confidence=_confidence(snapshot, fallback="low"),
        needs_check_in=_yes_no(check_in_required or _data_quality(snapshot) == "low"),
    ).as_dict()


def _source_flags(*sources: dict[str, Any]) -> set[str]:
    flags: set[str] = set()
    for source in sources:
        flags.update(_list(source.get("flags")))
    return flags


def _list(value: Any) -> list[str]:
    return value if isinstance(value, list) else []


def _has_any(values: set[str], targets: set[str]) -> bool:
    return bool(values & targets)


def _yes_no(value: bool) -> str:
    return "yes" if value else "no"


def _data_quality(snapshot: Snapshot) -> str:
    quality = snapshot.get("derived", {}).get("data_quality")
    return quality if quality in {"high", "medium", "low"} else "low"


def _confidence(snapshot: Snapshot, fallback: str) -> str:
    quality = _data_quality(snapshot)
    if quality == "high":
        return "high"
    if quality == "medium":
        return "medium"
    return fallback if fallback in {"medium", "low"} else "low"


def _hard_session_allowed(snapshot: Snapshot) -> bool:
    return snapshot.get("derived", {}).get("hard_session_allowed") in {"yes", "conditional"}


def _aerobic_block(snapshot: Snapshot) -> bool:
    athlete = snapshot.get("athlete", {})
    return athlete.get("current_block") == "hybrid_aggressive"


def _manual_high_fatigue(manual: dict[str, Any]) -> bool:
    return manual.get("mental_fatigue") == "high" or manual.get("motivation") == "low"


def _manual_context_missing(manual: dict[str, Any]) -> bool:
    return manual.get("freshness") in {None, "missing", "stale"}


def _table_tennis_is_important(manual: dict[str, Any]) -> bool:
    return manual.get("table_tennis_today") == "match"


def _strength_available(flags: set[str], hevy: dict[str, Any]) -> bool:
    if "strength_progression_available" in flags:
        return True
    return hevy.get("strength_trend") in {"improving", "stable"}


def _first_reason(options: list[tuple[bool, str]]) -> str:
    for condition, reason in options:
        if condition:
            return reason
    return "snapshot constraints favor the selected priority"
