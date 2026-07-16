from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from math import exp, floor, log, sqrt
from typing import Any

PREDICTION_STALE_DAYS = 14
PREDICTION_MIN_DISTANCE_RATIO = 0.75

RUN_TARGETS = (
    ("1K", 1000.0),
    ("Mile", 1609.344),
    ("5K", 5000.0),
    ("10K", 10000.0),
    ("Half Marathon", 21097.5),
    ("Marathon", 42195.0),
)

CONFIDENCE_ORDER = ("low", "medium", "high")


@dataclass(frozen=True)
class VdotPaceBand:
    name: str
    low_fraction: float
    high_fraction: float


VDOT_PACE_BANDS = (
    VdotPaceBand("Easy", 0.60, 0.75),
    VdotPaceBand("Marathon", 0.80, 0.87),
    VdotPaceBand("Threshold", 0.88, 0.92),
    VdotPaceBand("Interval", 0.95, 1.00),
    VdotPaceBand("Repetition", 1.03, 1.08),
)


def build_speed_predictions(
    recent_runs: list[dict[str, Any]],
    snapshot_date: str | None,
) -> list[dict[str, Any]]:
    anchors = _normalize_anchors(recent_runs, snapshot_date)
    if not anchors:
        return []

    vdot_source = _select_vdot_source_run(anchors)
    training_paces = _build_training_paces(vdot_source) if vdot_source is not None else None

    predictions: list[dict[str, Any]] = []
    for label, target_distance_m in RUN_TARGETS:
        candidates = _build_candidates(anchors, target_distance_m)
        selected = _select_candidate(label, target_distance_m, candidates)
        if selected is None:
            continue
        selected = _apply_agreement_rules(selected, candidates)
        prediction = _candidate_to_prediction(
            selected,
            label,
            target_distance_m,
            training_paces,
        )
        predictions.append(prediction)

    return predictions


def build_speed_prediction_summary(
    predictions: list[dict[str, Any]],
    recent_runs: list[dict[str, Any]],
    snapshot_date: str | None,
) -> dict[str, Any]:
    snapshot_day = _parse_date(snapshot_date) or _today()
    useful_runs = _unique_source_runs(
        [pred["source_run"] for pred in predictions if isinstance(pred.get("source_run"), dict)]
    )
    latest_useful = None
    if useful_runs:
        latest_useful = max(
            useful_runs,
            key=lambda run: (
                _parse_date(run.get("date")) or date.min,
                _coerce_float(run.get("age_days")) if run.get("age_days") is not None else -1,
            ),
        )
    latest_recent = recent_runs[0] if recent_runs else None
    selected = latest_useful or latest_recent
    stale = bool(selected and selected.get("age_days") is not None and selected["age_days"] > PREDICTION_STALE_DAYS)
    warning = ""
    if stale:
        warning = "Predictions are based on a run older than 14 days."
    elif selected:
        warning = f"Based on {selected['date']}."
    return {
        "snapshot_date": snapshot_day.isoformat(),
        "latest_useful_run": selected,
        "stale": stale,
        "warning": warning,
        "useful_run_count": len(useful_runs),
    }


def linear_regression(xs: list[float], ys: list[float]) -> tuple[float, float]:
    if len(xs) != len(ys) or len(xs) < 2:
        raise ValueError("linear regression requires at least two points")
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator == 0:
        raise ValueError("linear regression requires distinct x values")
    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    return slope, intercept


def _build_candidates(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    baseline = _build_riegel_candidate(anchors, target_distance_m)
    if baseline is not None:
        candidates.append(baseline)
    calibrated = _build_calibrated_riegel_candidate(anchors, target_distance_m)
    if calibrated is not None:
        candidates.append(calibrated)
    critical_speed = _build_critical_speed_candidate(anchors, target_distance_m)
    if critical_speed is not None:
        candidates.append(critical_speed)
    return candidates


def _build_riegel_candidate(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> dict[str, Any] | None:
    source = _select_source_run(anchors, target_distance_m)
    if source is None:
        return None
    predicted_seconds = source["duration_s"] * (target_distance_m / source["distance_m"]) ** 1.06
    source_age_days = source.get("age_days")
    sigma_seconds = _baseline_sigma(predicted_seconds, source_age_days, target_distance_m / source["distance_m"])
    confidence = _confidence_from_sigma_and_age(predicted_seconds, sigma_seconds, source_age_days)
    return {
        "model": "Riegel extrapolation",
        "predicted_seconds": predicted_seconds,
        "sigma_seconds": sigma_seconds,
        "confidence": confidence,
        "calibration_points": [_prediction_calibration_point(source)],
        "source_run": _prediction_source_run(source, confidence),
        "trend": _prediction_trend(source_age_days),
        "how_to_improve": _prediction_how_to_improve(source_age_days, "riegel", len(anchors)),
        "stale": bool(source_age_days is not None and source_age_days > PREDICTION_STALE_DAYS),
        "flags": [],
        "supporting_models": [],
    }


def _build_calibrated_riegel_candidate(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> dict[str, Any] | None:
    usable = _calibration_points_for_target(anchors, target_distance_m)
    if len(usable) < 2:
        return None
    xs = [log(anchor["distance_m"]) for anchor in usable]
    ys = [log(anchor["duration_s"]) for anchor in usable]
    try:
        slope, intercept = linear_regression(xs, ys)
    except ValueError:
        return None
    predicted_seconds = exp(intercept + slope * log(target_distance_m))
    residual_sigma = _log_residual_sigma(xs, ys, slope, intercept)
    sigma_seconds = max(predicted_seconds * 0.03, predicted_seconds * residual_sigma)
    source = usable[0]
    confidence = _confidence_from_fit(usable, sigma_seconds, predicted_seconds)
    return {
        "model": "Calibrated Riegel",
        "predicted_seconds": predicted_seconds,
        "sigma_seconds": sigma_seconds,
        "confidence": confidence,
        "calibration_points": [_prediction_calibration_point(anchor) for anchor in usable],
        "source_run": _prediction_source_run(source, confidence),
        "trend": _prediction_trend(source.get("age_days")),
        "how_to_improve": _prediction_how_to_improve(source.get("age_days"), "calibrated", len(usable)),
        "stale": bool(source.get("age_days") is not None and source["age_days"] > PREDICTION_STALE_DAYS),
        "flags": [],
        "supporting_models": [],
        "fit": {
            "slope": slope,
            "intercept": intercept,
        },
    }


def _build_critical_speed_candidate(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> dict[str, Any] | None:
    usable = _critical_speed_points(anchors, target_distance_m)
    if len(usable) < 2:
        return None
    xs = [anchor["duration_s"] for anchor in usable]
    ys = [anchor["distance_m"] for anchor in usable]
    try:
        slope, intercept = linear_regression(xs, ys)
    except ValueError:
        return None
    if slope <= 0:
        return None
    predicted_seconds = (target_distance_m - intercept) / slope
    if predicted_seconds <= 0:
        return None
    sigma_seconds = max(_linear_residual_sigma(xs, ys, slope, intercept) / slope, predicted_seconds * 0.025)
    source = usable[0]
    confidence = _confidence_from_fit(usable, sigma_seconds, predicted_seconds)
    return {
        "model": "Critical Speed",
        "predicted_seconds": predicted_seconds,
        "sigma_seconds": sigma_seconds,
        "confidence": confidence,
        "calibration_points": [_prediction_calibration_point(anchor) for anchor in usable],
        "source_run": _prediction_source_run(source, confidence),
        "trend": _prediction_trend(source.get("age_days")),
        "how_to_improve": _prediction_how_to_improve(source.get("age_days"), "critical_speed", len(usable)),
        "stale": bool(source.get("age_days") is not None and source["age_days"] > PREDICTION_STALE_DAYS),
        "flags": [],
        "supporting_models": [],
        "fit": {
            "cs_m_per_s": slope,
            "d_prime_m": intercept,
        },
    }


def _select_candidate(
    label: str,
    target_distance_m: float,
    candidates: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not candidates:
        return None
    priority = _priority_for_target(label, target_distance_m)
    by_model = {candidate["model"]: candidate for candidate in candidates}
    for model_name in priority:
        candidate = by_model.get(model_name)
        if candidate is not None:
            return candidate
    return candidates[0]


def _apply_agreement_rules(
    selected: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    if len(candidates) < 2:
        return selected
    selected_sigma = selected["sigma_seconds"]
    agreeing = []
    for candidate in candidates:
        if candidate is selected:
            continue
        if _predictions_agree(selected["predicted_seconds"], selected_sigma, candidate):
            agreeing.append(candidate)

    updated = dict(selected)
    supporting_models = []
    for candidate in candidates:
        supporting_models.append(
            {
                "model": candidate["model"],
                "predicted_time": _format_duration(candidate["predicted_seconds"]),
                "ci_68": _prediction_interval_label(candidate["predicted_seconds"], candidate["confidence"], 0.05),
                "ci_95": _prediction_interval_label(candidate["predicted_seconds"], candidate["confidence"], 0.10),
                "confidence": candidate["confidence"],
            }
        )
    updated["supporting_models"] = supporting_models

    confidence = selected["confidence"]
    if agreeing:
        confidence = _upgrade_confidence(confidence)
    if len(agreeing) == 0 and len(candidates) >= 2:
        spread = max(
            abs(selected["predicted_seconds"] - candidate["predicted_seconds"])
            for candidate in candidates
            if candidate is not selected
        )
        if spread > selected_sigma * 2:
            confidence = _downgrade_confidence(confidence)
            flags = list(updated.get("flags", []))
            if "model_disagreement" not in flags:
                flags.append("model_disagreement")
            updated["flags"] = flags
    updated["confidence"] = confidence
    return updated


def _candidate_to_prediction(
    candidate: dict[str, Any],
    distance_label: str,
    target_distance_m: float,
    training_paces: dict[str, Any] | None,
) -> dict[str, Any]:
    predicted_seconds = candidate["predicted_seconds"]
    confidence = candidate["confidence"]
    result = {
        "distance_label": distance_label,
        "target_distance_m": target_distance_m,
        "predicted_time_s": predicted_seconds,
        "predicted_time": _format_duration(predicted_seconds),
        "prediction": _format_duration(predicted_seconds),
        "ci_60": _prediction_interval_label(predicted_seconds, confidence, 0.04),
        "ci_90": _prediction_interval_label(predicted_seconds, confidence, 0.08),
        "ci_68": _prediction_interval_label(predicted_seconds, confidence, 0.05),
        "ci_95": _prediction_interval_label(predicted_seconds, confidence, 0.10),
        "model": candidate["model"],
        "calibration_points": candidate["calibration_points"],
        "predicted_pace": _format_pace(predicted_seconds / (target_distance_m / 1000.0)),
        "source_run": candidate["source_run"],
        "confidence": confidence,
        "trend": candidate["trend"],
        "how_to_improve": candidate["how_to_improve"],
        "stale": candidate["stale"],
        "generated_on": _today().isoformat(),
        "supporting_models": candidate.get("supporting_models", []),
        "flags": candidate.get("flags", []),
    }
    if training_paces is not None:
        result["training_paces"] = training_paces
        result["training_paces_summary"] = _training_paces_summary(training_paces)
    return result


def _build_training_paces(source_run: dict[str, Any] | None) -> dict[str, Any] | None:
    if source_run is None:
        return None
    vdot = _vdot_from_race_performance(source_run["distance_m"], source_run["duration_s"])
    if vdot is None:
        return None
    bands = []
    for band in VDOT_PACE_BANDS:
        fast = _pace_seconds_per_km_from_fraction(vdot, band.high_fraction)
        slow = _pace_seconds_per_km_from_fraction(vdot, band.low_fraction)
        if fast is None or slow is None:
            continue
        bands.append(
            {
                "name": band.name,
                "min_fraction": band.low_fraction,
                "max_fraction": band.high_fraction,
                "min_seconds_per_km": slow,
                "max_seconds_per_km": fast,
                "label": f"{_format_duration(fast)}-{_format_duration(slow)} /km",
            }
        )
    return {
        "vdot": round(vdot, 1),
        "source_run": _prediction_source_run(source_run, "high" if source_run.get("age_days", 0) <= 7 else "medium"),
        "bands": bands,
    }


def _training_paces_summary(training_paces: dict[str, Any]) -> str:
    bands = training_paces.get("bands", [])
    if not bands:
        return "No pace bands available"
    return " · ".join(f"{band['name']} {band['label']}" for band in bands)


def _build_race_prediction_for_target(
    source_run: dict[str, Any],
    target_distance_m: float,
) -> float:
    return source_run["duration_s"] * (target_distance_m / source_run["distance_m"]) ** 1.06


def _build_training_paces_source(runs: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not runs:
        return None
    return max(
        runs,
        key=lambda run: (
            _coerce_float(run.get("distance_m")) or 0.0,
            -(_coerce_float(run.get("age_days")) or 0.0),
            _parse_date(run.get("date")) or date.min,
        ),
    )


def _select_vdot_source_run(anchors: list[dict[str, Any]]) -> dict[str, Any] | None:
    return _build_training_paces_source(anchors)


def _calibration_points_for_target(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> list[dict[str, Any]]:
    ordered = sorted(
        anchors,
        key=lambda anchor: (
            abs(anchor["distance_m"] - target_distance_m),
            anchor.get("age_days") if anchor.get("age_days") is not None else 9999,
            _parse_date(anchor.get("date")) or date.min,
        ),
    )
    usable = ordered[:3]
    if not usable:
        return []
    if len(usable) == 1:
        return usable
    spread = max(anchor["distance_m"] for anchor in usable) / min(anchor["distance_m"] for anchor in usable)
    if spread < 1.25 and len(anchors) > 1:
        return sorted(
            anchors,
            key=lambda anchor: (
                anchor.get("age_days") if anchor.get("age_days") is not None else 9999,
                _parse_date(anchor.get("date")) or date.min,
            ),
        )[:3]
    return usable


def _critical_speed_points(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> list[dict[str, Any]]:
    usable = [anchor for anchor in anchors if anchor["distance_m"] >= target_distance_m * 0.5]
    if len(usable) < 2:
        usable = anchors
    ordered = sorted(
        usable,
        key=lambda anchor: (
            abs(anchor["distance_m"] - target_distance_m),
            anchor.get("age_days") if anchor.get("age_days") is not None else 9999,
            _parse_date(anchor.get("date")) or date.min,
        ),
    )
    return ordered[:3]


def _predictions_agree(
    selected_seconds: float,
    selected_sigma: float,
    candidate: dict[str, Any],
) -> bool:
    delta = abs(selected_seconds - candidate["predicted_seconds"])
    sigma = sqrt(selected_sigma**2 + candidate["sigma_seconds"] ** 2)
    return delta <= sigma * 2.0


def _upgrade_confidence(confidence: str) -> str:
    index = CONFIDENCE_ORDER.index(confidence)
    return CONFIDENCE_ORDER[min(index + 1, len(CONFIDENCE_ORDER) - 1)]


def _downgrade_confidence(confidence: str) -> str:
    index = CONFIDENCE_ORDER.index(confidence)
    return CONFIDENCE_ORDER[max(index - 1, 0)]


def _confidence_from_fit(
    anchors: list[dict[str, Any]],
    sigma_seconds: float,
    predicted_seconds: float,
) -> str:
    relative_sigma = sigma_seconds / predicted_seconds
    age_days = max((anchor.get("age_days") or 0) for anchor in anchors)
    if age_days > PREDICTION_STALE_DAYS:
        relative_sigma *= 1.2
    if len(anchors) >= 3 and relative_sigma <= 0.04:
        return "high"
    if relative_sigma <= 0.08:
        return "medium"
    return "low"


def _baseline_sigma(
    predicted_seconds: float,
    age_days: int | None,
    extrapolation_ratio: float,
) -> float:
    day_factor = 0.02
    if age_days is None:
        day_factor = 0.04
    elif age_days <= 7:
        day_factor = 0.015
    elif age_days <= PREDICTION_STALE_DAYS:
        day_factor = 0.025
    else:
        day_factor = 0.04
    extrapolation_factor = 0.01 * max(0.0, log(max(extrapolation_ratio, 1.0)))
    return predicted_seconds * sqrt(day_factor**2 + extrapolation_factor**2)


def _log_residual_sigma(
    xs: list[float],
    ys: list[float],
    slope: float,
    intercept: float,
) -> float:
    if len(xs) < 3:
        return 0.035
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    return sqrt(sum(residual**2 for residual in residuals) / max(len(residuals) - 2, 1))


def _linear_residual_sigma(
    xs: list[float],
    ys: list[float],
    slope: float,
    intercept: float,
) -> float:
    if len(xs) < 3:
        return max(ys) * 0.03
    residuals = [y - (intercept + slope * x) for x, y in zip(xs, ys)]
    return sqrt(sum(residual**2 for residual in residuals) / max(len(residuals) - 2, 1))


def _prediction_calibration_point(anchor: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": anchor["date"],
        "distance_m": anchor["distance_m"],
        "duration_s": anchor["duration_s"],
        "pace_s_per_km": anchor["pace_s_per_km"],
        "avg_heart_rate_bpm": anchor.get("avg_heart_rate_bpm"),
        "name": anchor["name"],
    }


def _prediction_source_run(anchor: dict[str, Any], confidence: str) -> dict[str, Any]:
    return {
        "activity_id": anchor.get("activity_id"),
        "name": anchor["name"],
        "date": anchor["date"],
        "distance": anchor["distance"],
        "duration": anchor["duration"],
        "avg_heart_rate_bpm": anchor.get("avg_heart_rate_bpm"),
        "age_days": anchor.get("age_days"),
        "confidence": confidence,
    }


def _prediction_trend(age_days: int | None) -> str:
    if age_days is None:
        return "stable"
    if age_days <= 7:
        return "improving"
    if age_days <= PREDICTION_STALE_DAYS:
        return "stable"
    return "declining"


def _prediction_how_to_improve(age_days: int | None, model: str, anchor_count: int) -> str:
    if model == "critical_speed":
        if anchor_count >= 3:
            return "Add a faster short effort to tighten CS and D'."
        return "Add a 1K or 5K effort plus one longer run to stabilize CS."
    if model == "calibrated":
        if anchor_count >= 3:
            return "Add a third anchor at a different distance to tighten the fit."
        return "Add a longer or shorter anchor to spread the calibration points."
    if age_days is None:
        return "Add a recent anchor run and another race-distance effort."
    if age_days <= 7:
        return "Add another recent race-distance effort to tighten the fit."
    if age_days <= PREDICTION_STALE_DAYS:
        return "Add a newer anchor run to refresh the prediction."
    return "Add a newer race-distance effort and a second calibration point."


def _priority_for_target(label: str, target_distance_m: float) -> list[str]:
    if target_distance_m >= 42195.0:
        return ["Calibrated Riegel", "Critical Speed", "Riegel extrapolation"]
    if target_distance_m >= 5000.0:
        return ["Critical Speed", "Calibrated Riegel", "Riegel extrapolation"]
    if target_distance_m >= 1000.0:
        return ["Critical Speed", "Calibrated Riegel", "Riegel extrapolation"]
    return ["Calibrated Riegel", "Critical Speed", "Riegel extrapolation"]


def _training_paces_summary(training_paces: dict[str, Any]) -> str:
    bands = training_paces.get("bands", [])
    if not bands:
        return "No pace bands available"
    return " · ".join(f"{band['name']} {band['label']}" for band in bands)


def _select_source_run(
    anchors: list[dict[str, Any]],
    target_distance_m: float,
) -> dict[str, Any] | None:
    eligible = [
        anchor for anchor in anchors if anchor["distance_m"] >= target_distance_m * PREDICTION_MIN_DISTANCE_RATIO
    ]
    pool = eligible if eligible else anchors
    if not pool:
        return None
    return min(
        pool,
        key=lambda anchor: (
            abs(anchor["distance_m"] - target_distance_m),
            anchor.get("age_days") if anchor.get("age_days") is not None else 9999,
            _parse_date(anchor.get("date")) or date.min,
        ),
    )


def _normalize_anchors(
    recent_runs: list[dict[str, Any]],
    snapshot_date: str | None,
) -> list[dict[str, Any]]:
    snapshot = _parse_date(snapshot_date) or _today()
    anchors: list[dict[str, Any]] = []
    for entry in recent_runs:
        if not isinstance(entry, dict):
            continue
        anchor = _normalize_anchor(entry, snapshot)
        if anchor is not None:
            anchors.append(anchor)
    anchors.sort(
        key=lambda anchor: (
            anchor.get("age_days") if anchor.get("age_days") is not None else 9999,
            _parse_date(anchor.get("date")) or date.min,
        )
    )
    return anchors


def _normalize_anchor(entry: dict[str, Any], snapshot_date: date) -> dict[str, Any] | None:
    distance_m = _coerce_float(
        entry.get("distance_m") or entry.get("distance_meters") or entry.get("distance") or entry.get("meters")
    )
    duration_s = _coerce_float(
        entry.get("duration_s")
        or entry.get("duration_seconds")
        or entry.get("duration")
        or entry.get("movingDuration")
        or entry.get("elapsedDuration")
        or entry.get("moving_duration")
        or entry.get("timerDuration")
    )
    if distance_m is None or duration_s is None or distance_m <= 0 or duration_s <= 0:
        return None
    started_at = _parse_datetime(
        entry.get("start_time")
        or entry.get("startTimeLocal")
        or entry.get("startTimeGMT")
        or entry.get("startTime")
        or entry.get("date")
    )
    activity_type = _extract_activity_type(entry)
    name = str(entry.get("name") or entry.get("activityName") or entry.get("title") or activity_type or "Run")
    pace_s_per_km = duration_s / (distance_m / 1000.0)
    age_days = (snapshot_date - started_at.date()).days if started_at else None
    if age_days is not None and age_days < 0:
        age_days = 0
    return {
        "activity_id": entry.get("activity_id")
        or entry.get("activityId")
        or entry.get("id")
        or entry.get("activityID"),
        "name": name,
        "activity_type": activity_type,
        "date": _format_display_date(
            started_at or entry.get("startTimeLocal") or entry.get("startTimeGMT") or entry.get("date")
        ),
        "distance_m": distance_m,
        "distance": _format_distance_km(distance_m),
        "duration_s": duration_s,
        "duration": _format_duration(duration_s),
        "pace_s_per_km": pace_s_per_km,
        "pace": f"{_format_duration(pace_s_per_km)} /km",
        "avg_heart_rate_bpm": _extract_avg_heart_rate(entry),
        "age_days": age_days,
        "source": "Garmin",
    }


def _extract_activity_type(entry: dict[str, Any]) -> str:
    activity_type = entry.get("activity_type") or entry.get("type") or entry.get("sport")
    if isinstance(activity_type, dict):
        activity_type = activity_type.get("typeKey") or activity_type.get("typeName")
    if activity_type:
        return str(activity_type)
    nested = entry.get("activityType")
    if isinstance(nested, dict):
        return str(nested.get("typeKey") or nested.get("typeName") or nested.get("name") or "")
    return ""


def _extract_avg_heart_rate(entry: dict[str, Any]) -> float | None:
    for candidate in (
        entry.get("avg_heart_rate_bpm"),
        entry.get("averageHeartRateInBeatsPerMinute"),
        entry.get("averageHeartRate"),
        entry.get("averageHR"),
        entry.get("average_hr"),
        entry.get("avgHeartRate"),
        entry.get("avg_hr"),
    ):
        value = _coerce_float(candidate)
        if value is not None:
            return value
    for nested in (entry.get("summary"), entry.get("metrics"), entry.get("stats"), entry.get("performance")):
        if not isinstance(nested, dict):
            continue
        for key in (
            "averageHeartRateInBeatsPerMinute",
            "averageHeartRate",
            "averageHR",
            "average_hr",
            "avgHeartRate",
            "avg_hr",
        ):
            value = _coerce_float(nested.get(key))
            if value is not None:
                return value
    return None


def _unique_source_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for run in runs:
        key = _source_run_key(run)
        if key and key not in seen:
            seen.add(key)
            unique.append(run)
    return unique


def _source_run_key(run: dict[str, Any]) -> str:
    activity_id = run.get("activity_id")
    if activity_id not in (None, ""):
        return f"activity:{activity_id}"
    return f"{run.get('name', '')}|{run.get('date', '')}|{run.get('distance_m', '')}|{run.get('duration_s', '')}"


def _format_duration(seconds: float) -> str:
    whole_seconds = int(floor(seconds))
    hours, remainder = divmod(whole_seconds, 3600)
    minutes, sec = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def _format_pace(seconds_per_km: float) -> str:
    return f"{_format_duration(seconds_per_km)} /km"


def _format_distance_km(meters: float) -> str:
    return f"{floor((meters / 1000) * 100) / 100:.2f} km"


def _prediction_interval_label(predicted_seconds: float, confidence: str, ratio: float) -> str:
    scale = ratio if confidence == "high" else ratio * 1.5 if confidence == "medium" else ratio * 2
    return f"±{_format_duration(predicted_seconds * scale)}"


def _confidence_from_sigma(relative_sigma: float) -> str:
    if relative_sigma <= 0.035:
        return "high"
    if relative_sigma <= 0.075:
        return "medium"
    return "low"


def _vdot_from_race_performance(distance_m: float, duration_s: float) -> float | None:
    if distance_m <= 0 or duration_s <= 0:
        return None
    velocity_m_per_min = distance_m / duration_s * 60.0
    oxygen_cost = -4.60 + 0.182258 * velocity_m_per_min + 0.000104 * (velocity_m_per_min**2)
    minutes = duration_s / 60.0
    fraction = 0.8 + 0.1894393 * exp(-0.012778 * minutes) + 0.2989558 * exp(-0.1932605 * minutes)
    if fraction <= 0:
        return None
    return oxygen_cost / fraction


def _pace_seconds_per_km_from_fraction(vdot: float, fraction: float) -> float | None:
    desired_oxygen = vdot * fraction
    a = 0.000104
    b = 0.182258
    c = -4.60 - desired_oxygen
    discriminant = (b * b) - (4 * a * c)
    if discriminant < 0:
        return None
    velocity_m_per_min = (-b + sqrt(discriminant)) / (2 * a)
    if velocity_m_per_min <= 0:
        return None
    return 60000.0 / velocity_m_per_min


def _prediction_interval_label_for_sigma(
    predicted_seconds: float,
    sigma_seconds: float,
    confidence: str,
    multiplier: float,
) -> str:
    scale = sigma_seconds * multiplier
    if confidence == "medium":
        scale *= 1.1
    elif confidence == "low":
        scale *= 1.25
    return f"±{_format_duration(scale)}"


def _candidate_to_prediction(
    candidate: dict[str, Any],
    label: str,
    target_distance_m: float,
    training_paces: dict[str, Any] | None,
) -> dict[str, Any]:
    predicted_seconds = candidate["predicted_seconds"]
    sigma_seconds = candidate["sigma_seconds"]
    confidence = candidate["confidence"]
    result = {
        "distance_label": label,
        "target_distance_m": target_distance_m,
        "predicted_time_s": predicted_seconds,
        "predicted_time": _format_duration(predicted_seconds),
        "prediction": _format_duration(predicted_seconds),
        "ci_60": _prediction_interval_label_for_sigma(predicted_seconds, sigma_seconds, confidence, 0.84),
        "ci_90": _prediction_interval_label_for_sigma(predicted_seconds, sigma_seconds, confidence, 1.645),
        "ci_68": _prediction_interval_label_for_sigma(predicted_seconds, sigma_seconds, confidence, 1.0),
        "ci_95": _prediction_interval_label_for_sigma(predicted_seconds, sigma_seconds, confidence, 1.96),
        "model": candidate["model"],
        "calibration_points": candidate["calibration_points"],
        "predicted_pace": _format_pace(predicted_seconds / (target_distance_m / 1000.0)),
        "source_run": candidate["source_run"],
        "confidence": confidence,
        "trend": candidate["trend"],
        "how_to_improve": candidate["how_to_improve"],
        "stale": candidate["stale"],
        "generated_on": _today().isoformat(),
        "supporting_models": candidate.get("supporting_models", []),
        "flags": candidate.get("flags", []),
    }
    if training_paces is not None:
        result["training_paces"] = training_paces
        result["training_paces_summary"] = _training_paces_summary(training_paces)
    return result


def _confidence_from_sigma_and_age(
    predicted_seconds: float,
    sigma_seconds: float,
    age_days: int | None,
) -> str:
    relative_sigma = sigma_seconds / predicted_seconds
    if age_days is not None and age_days > PREDICTION_STALE_DAYS:
        relative_sigma *= 1.2
    return _confidence_from_sigma(relative_sigma)


def _today() -> date:
    return date.today()


def _parse_date(value: object) -> date | None:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        raw = value.strip()
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            try:
                return datetime.strptime(raw[:10], "%Y-%m-%d").date()
            except ValueError:
                return None
    return None


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        raw = value.strip()
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            try:
                return datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                try:
                    return datetime.strptime(raw[:10], "%Y-%m-%d")
                except ValueError:
                    return None
    return None


def _format_display_date(value: object) -> str:
    if isinstance(value, str):
        return value.replace(" ", "T").split("T")[0]
    if isinstance(value, datetime):
        return value.date().isoformat()
    return ""


def _coerce_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
