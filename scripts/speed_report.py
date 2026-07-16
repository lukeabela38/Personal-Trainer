#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

try:
    from datetime import UTC
except ImportError:  # pragma: no cover - compatibility for older local interpreters
    UTC = UTC

RUN_RECORD_TYPES = {
    "Fastest 1K",
    "Fastest Mile",
    "Fastest 5K",
    "Fastest 10K",
    "Fastest Half Marathon",
    "Longest Run",
}

RUN_TARGETS = (
    ("1K", 1000.0),
    ("Mile", 1609.344),
    ("5K", 5000.0),
    ("10K", 10000.0),
    ("Half Marathon", 21097.5),
    ("Marathon", 42195.0),
)

PREDICTION_STALE_DAYS = 14
PREDICTION_MIN_DISTANCE_RATIO = 0.75


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build site/speed.json from Garmin records.")
    parser.add_argument("--output", type=Path, default=Path("site/speed.json"))
    parser.add_argument("--source", type=Path, default=None)
    parser.add_argument("--source-mode", default="unknown")
    args = parser.parse_args(argv)
    try:
        raw = _load_source(args.source)
        if isinstance(raw, dict):
            raw = {**raw, "source_mode": args.source_mode}
        report = build_report(raw)
        args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(args.output)
    return 0


def _load_source(path: Path | None) -> dict[str, Any]:
    if path:
        return json.loads(path.read_text(encoding="utf-8"))
    command = os.environ.get("PERSONAL_TRAINER_GARMIN_SPEED_COMMAND")
    if not command:
        raise ValueError("set PERSONAL_TRAINER_GARMIN_SPEED_COMMAND or pass --source")
    completed = subprocess.run(command.split(), check=True, capture_output=True, text=True)
    data = json.loads(completed.stdout)
    if not isinstance(data, dict):
        raise ValueError("garmin speed source must be JSON object")
    return data


def build_report(raw: dict[str, Any], *, page_state: dict[str, Any] | None = None) -> dict[str, Any]:
    recent_runs = _extract_recent_runs(raw)
    records = _extract_records(raw, recent_runs)
    predictions = _build_predictions(recent_runs, raw.get("snapshot_date"))
    prediction_summary = _build_prediction_summary(predictions, recent_runs, raw.get("snapshot_date"))
    source = raw.get("source") or "Garmin personal records"
    snapshot_date = raw.get("snapshot_date") or _today().isoformat()
    vo2max_trend_history = _normalize_vo2max_trend_points(
        raw.get("vo2max_trend_history") or raw.get("vo2max_trend_points") or raw.get("vo2max_trend")
    )
    return {
        "source": source,
        "source_mode": str(raw.get("source_mode") or "unknown"),
        "snapshot_date": snapshot_date,
        "page_state": page_state or raw.get("page_state") or {"kind": "fresh", "label": "Ready", "detail": ""},
        "current_vo2max": _coerce_float(raw.get("current_vo2max")),
        "vo2max_trend": _normalize_trend(raw.get("vo2max_trend")),
        "vo2max_trend_points": vo2max_trend_history,
        "vo2max_trend_history": vo2max_trend_history,
        "training_load_trend": _normalize_trend(raw.get("training_load_trend")),
        "readiness": _normalize_readiness(raw.get("readiness")),
        "entries": records,
        "recent_runs": recent_runs,
        "predictions": predictions,
        "prediction_summary": prediction_summary,
    }


def _extract_records(raw: dict[str, Any], recent_runs: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    source = raw.get("result", raw.get("recent_bests", raw))
    if isinstance(source, str):
        source = json.loads(source)
    if not isinstance(source, list):
        return []
    recent_run_index = _recent_run_index(recent_runs or [])
    recent_run_list = recent_runs or []
    results: list[dict[str, Any]] = []
    for entry in source:
        if not isinstance(entry, dict):
            continue
        record_type = str(entry.get("record_type") or entry.get("name") or entry.get("recordType") or "")
        if record_type not in RUN_RECORD_TYPES:
            continue
        raw_value = entry.get("value")
        context = _compact_context(entry)
        if raw_value not in (None, "", [], {}):
            context["raw_value"] = raw_value
        recent_run = _match_recent_run(entry, recent_run_list, recent_run_index)
        if recent_run:
            context.update(_recent_run_context(recent_run))
        results.append(
            {
                "name": record_type,
                "category": "Running",
                "value": _format_record_value(record_type, raw_value),
                "unit": "",
                "date": entry.get("date") or (recent_run.get("date") if recent_run else None),
                "context": context,
            }
        )
    return results


def _extract_recent_runs(raw: dict[str, Any]) -> list[dict[str, Any]]:
    source = raw.get("recent_runs", raw.get("recent_activities", []))
    if isinstance(source, str):
        source = json.loads(source)
    if not isinstance(source, list):
        return []

    normalized: list[dict[str, Any]] = []
    snapshot_date = _parse_date(raw.get("snapshot_date")) or _today()
    for entry in source:
        if not isinstance(entry, dict):
            continue
        run = _normalize_run(entry, snapshot_date)
        if run is not None:
            normalized.append(run)
    return normalized


def _normalize_run(entry: dict[str, Any], snapshot_date: date) -> dict[str, Any] | None:
    distance_m = _coerce_float(
        entry.get("distance_meters") or entry.get("distance_m") or entry.get("distance") or entry.get("meters")
    )
    duration_s = _coerce_float(
        entry.get("duration_seconds")
        or entry.get("duration_s")
        or entry.get("duration")
        or entry.get("movingDuration")
        or entry.get("elapsedDuration")
        or entry.get("moving_duration")
        or entry.get("timerDuration")
    )
    if distance_m is None or duration_s is None or distance_m <= 0 or duration_s <= 0:
        return None

    started_at = _parse_datetime(
        entry.get("start_time") or entry.get("startTimeLocal") or entry.get("startTimeGMT") or entry.get("startTime")
    )
    activity_type = _extract_activity_type(entry)
    name = str(entry.get("name") or entry.get("activityName") or entry.get("title") or activity_type or "Run")
    pace_s_per_km = duration_s / (distance_m / 1000.0)
    age_days = (snapshot_date - started_at.date()).days if started_at else None
    if age_days is not None and age_days < 0:
        age_days = 0

    return {
        "activity_id": entry.get("id") or entry.get("activityId") or entry.get("activity_id"),
        "name": name,
        "activity_type": activity_type,
        "date": _format_display_date(started_at or entry.get("startTimeLocal") or entry.get("startTimeGMT")),
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

    for nested in (
        entry.get("summary"),
        entry.get("metrics"),
        entry.get("stats"),
        entry.get("performance"),
    ):
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


def _normalize_vo2max_trend_points(trend: object) -> list[dict[str, Any]]:
    if not isinstance(trend, list):
        return []
    points: list[dict[str, Any]] = []
    for entry in trend:
        if not isinstance(entry, dict):
            continue
        value = _coerce_float(
            entry.get("vo2Max")
            or entry.get("vo2MaxValue")
            or entry.get("vO2MaxValue")
            or entry.get("vo2max")
            or entry.get("value")
        )
        date = entry.get("calendarDate") or entry.get("date") or entry.get("startDate")
        if date is None and value is None:
            continue
        points.append({"date": date, "vo2max": value})
    return points


def _build_predictions(recent_runs: list[dict[str, Any]], snapshot_date: str | None) -> list[dict[str, Any]]:
    usable = [run for run in recent_runs if _is_run_usable(run)]
    if not usable:
        return []

    snapshot_day = _parse_date(snapshot_date) or _today()
    predictions: list[dict[str, Any]] = []
    for label, target_m in RUN_TARGETS:
        source = _select_source_run(usable, target_m)
        if source is None:
            continue
        predicted_seconds = _riegel_prediction(source["duration_s"], source["distance_m"], target_m)
        source_age_days = source.get("age_days")
        confidence = _prediction_confidence_from_age(source_age_days)
        predictions.append(
            {
                "distance_label": label,
                "target_distance_m": target_m,
                "predicted_time_s": predicted_seconds,
                "predicted_time": _format_duration(predicted_seconds),
                "prediction": _format_duration(predicted_seconds),
                "ci_60": _prediction_interval_label(predicted_seconds, confidence, 0.04),
                "ci_90": _prediction_interval_label(predicted_seconds, confidence, 0.08),
                "ci_68": _prediction_interval_label(predicted_seconds, confidence, 0.05),
                "ci_95": _prediction_interval_label(predicted_seconds, confidence, 0.1),
                "model": "Riegel extrapolation",
                "calibration_points": [_prediction_calibration_point(source)],
                "predicted_pace": f"{_format_duration(predicted_seconds / (target_m / 1000.0))} /km",
                "source_run": {
                    "activity_id": source.get("activity_id"),
                    "name": source["name"],
                    "date": source["date"],
                    "distance": source["distance"],
                    "duration": source["duration"],
                    "avg_heart_rate_bpm": source.get("avg_heart_rate_bpm"),
                    "age_days": source_age_days,
                    "confidence": confidence,
                },
                "confidence": confidence,
                "trend": _prediction_trend(source_age_days),
                "how_to_improve": _prediction_how_to_improve(source_age_days),
                "stale": bool(source_age_days is not None and source_age_days > PREDICTION_STALE_DAYS),
                "generated_on": snapshot_day.isoformat(),
            }
        )
    return predictions


def _build_prediction_summary(
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
        latest_useful = sorted(
            useful_runs,
            key=lambda run: (
                _parse_date(run.get("date")) or date.min,
                _coerce_float(run.get("age_days")) if run.get("age_days") is not None else -1,
            ),
            reverse=True,
        )[0]
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


def _select_source_run(runs: list[dict[str, Any]], target_distance_m: float) -> dict[str, Any] | None:
    eligible = [run for run in runs if run["distance_m"] >= target_distance_m * PREDICTION_MIN_DISTANCE_RATIO]
    if eligible:
        return eligible[0]
    return max(runs, key=lambda run: run["distance_m"], default=None)


def _riegel_prediction(source_seconds: float, source_distance_m: float, target_distance_m: float) -> float:
    return source_seconds * (target_distance_m / source_distance_m) ** 1.06


def _is_run_usable(run: dict[str, Any]) -> bool:
    return isinstance(run.get("distance_m"), (int, float)) and isinstance(run.get("duration_s"), (int, float))


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


def _compact_context(entry: dict[str, Any]) -> dict[str, Any]:
    context: dict[str, Any] = {}
    for key in (
        "raw_value",
        "activity_id",
        "activity_name",
        "activity_type",
        "activity_start_time_local",
        "activity_start_time_gmt",
        "pr_start_time_local",
        "pr_start_time_gmt",
        "type_id",
    ):
        value = entry.get(key)
        if value not in (None, "", [], {}):
            context[key] = value
    return context


def _recent_run_index(runs: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for run in runs:
        if not isinstance(run, dict):
            continue
        key = _source_run_key(run)
        if key:
            index[key] = run
    return index


def _record_type_for_entry(entry: dict[str, Any]) -> str:
    return str(entry.get("record_type") or entry.get("name") or entry.get("recordType") or "")


def _match_recent_run(
    entry: dict[str, Any],
    recent_runs: list[dict[str, Any]],
    recent_run_index: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    entry_date = _record_date_text(entry)
    target_distance_m = _record_target_distance_m(_record_type_for_entry(entry))

    if entry_date:
        same_day_runs = [run for run in recent_runs if _run_date_text(run) == entry_date]
        if same_day_runs:
            return _best_recent_run_match(same_day_runs, target_distance_m)

    activity_id = entry.get("activity_id") or entry.get("activityId") or entry.get("activityIdGarmin")
    if activity_id in (None, ""):
        return None
    return recent_run_index.get(f"activity:{activity_id}")


def _best_recent_run_match(runs: list[dict[str, Any]], target_distance_m: float | None) -> dict[str, Any] | None:
    if not runs:
        return None
    if target_distance_m is None:
        return runs[0]
    return min(
        runs,
        key=lambda run: abs((_coerce_float(run.get("distance_m")) or 0.0) - target_distance_m),
    )


def _record_target_distance_m(record_type: str | None) -> float | None:
    targets = {
        "Fastest 1K": 1000.0,
        "Fastest Mile": 1609.344,
        "Fastest 5K": 5000.0,
        "Fastest 10K": 10000.0,
        "Fastest Half Marathon": 21097.5,
        "Longest Run": 42195.0,
    }
    return targets.get(record_type or "")


def _record_date_text(entry: dict[str, Any]) -> str | None:
    for key in (
        "date",
        "startDate",
        "activityStartDateTimeLocalFormatted",
        "activityStartDateTimeLocal",
        "activityStartDateTimeInGMTFormatted",
        "activityStartDateTimeInGMT",
    ):
        value = entry.get(key)
        if value:
            return _format_display_date(value)
    return None


def _run_date_text(run: dict[str, Any]) -> str | None:
    value = (
        run.get("date")
        or run.get("start_time")
        or run.get("startTimeLocal")
        or run.get("startTimeGMT")
        or run.get("startTime")
    )
    if not value:
        return None
    return _format_display_date(value)


def _recent_run_context(run: dict[str, Any]) -> dict[str, Any]:
    context: dict[str, Any] = {}
    for key, context_key in (
        ("date", "source_run_date"),
        ("duration", "source_run_duration"),
        ("pace", "source_run_pace"),
        ("avg_heart_rate_bpm", "source_run_avg_heart_rate_bpm"),
        ("distance", "source_run_distance"),
        ("activity_id", "source_run_activity_id"),
        ("name", "source_run_name"),
        ("activity_type", "source_run_activity_type"),
    ):
        value = run.get(key)
        if value not in (None, "", [], {}):
            context[context_key] = value
    return context


def _format_record_value(record_type: str, value: object) -> str:
    numeric_value = _coerce_float(value)
    if numeric_value is None:
        return str(value) if value not in (None, "") else ""
    if record_type == "Longest Run":
        return _format_distance_km(numeric_value)
    return _format_duration(numeric_value)


def _format_duration(seconds: float) -> str:
    whole_seconds = int(math.floor(seconds))
    hours, remainder = divmod(whole_seconds, 3600)
    minutes, sec = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def _format_distance_km(meters: float) -> str:
    return f"{math.floor((meters / 1000) * 100) / 100:.2f} km"


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
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str) and value.strip():
        raw = value.strip()
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            try:
                parsed = datetime.strptime(raw[:19], "%Y-%m-%dT%H:%M:%S")
            except ValueError:
                try:
                    parsed = datetime.strptime(raw[:10], "%Y-%m-%d")
                except ValueError:
                    return None
        return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def _confidence_from_age(age_days: int | None) -> str:
    return _prediction_confidence_from_age(age_days)


def _prediction_confidence_from_age(age_days: int | None) -> str:
    if age_days is None:
        return "low"
    if age_days <= 7:
        return "high"
    if age_days <= PREDICTION_STALE_DAYS:
        return "medium"
    return "low"


def _prediction_trend(age_days: int | None) -> str:
    if age_days is None:
        return "stable"
    if age_days <= 7:
        return "improving"
    if age_days <= PREDICTION_STALE_DAYS:
        return "stable"
    return "declining"


def _prediction_how_to_improve(age_days: int | None) -> str:
    if age_days is None:
        return "Add a recent anchor run and another race-distance effort."
    if age_days <= 7:
        return "Add another recent race-distance effort to tighten the fit."
    if age_days <= PREDICTION_STALE_DAYS:
        return "Add a newer anchor run to refresh the prediction."
    return "Add a newer race-distance effort and a second calibration point."


def _prediction_interval_label(predicted_seconds: float, confidence: str, ratio: float) -> str:
    scale = ratio if confidence == "high" else ratio * 1.5 if confidence == "medium" else ratio * 2
    return f"±{_format_duration(predicted_seconds * scale)}"


def _prediction_calibration_point(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "date": source["date"],
        "distance_m": source["distance_m"],
        "duration_s": source["duration_s"],
        "pace_s_per_km": source["pace_s_per_km"],
        "avg_heart_rate_bpm": source.get("avg_heart_rate_bpm"),
        "name": source["name"],
    }


def _normalize_trend(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        return value or None
    if isinstance(value, list):
        return "available" if value else None
    if isinstance(value, dict):
        for key in ("trend", "status", "value", "label", "result"):
            candidate = value.get(key)
            if candidate not in (None, ""):
                return str(candidate)
        return None
    return str(value)


def _normalize_readiness(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    readiness: dict[str, Any] = {}
    sleep_score = value.get("sleep_score")
    if sleep_score in (None, ""):
        sleep_summary = value.get("sleepingQualifierSummary")
        if isinstance(sleep_summary, dict):
            sleep_score = sleep_summary.get("value")
        if sleep_score in (None, ""):
            sleep_score = value.get("sleepingSeconds")
    readiness["sleep_score"] = sleep_score

    resting_hr = value.get("resting_heart_rate_bpm")
    if resting_hr in (None, ""):
        resting_hr = value.get("restingHeartRate") or value.get("lastSevenDaysAvgRestingHeartRate")
    readiness["resting_heart_rate_bpm"] = resting_hr

    raw_hrv = value.get("raw_hrv_ms")
    if raw_hrv in (None, ""):
        hrv_summary = value.get("heartRateVariabilitySummary")
        if isinstance(hrv_summary, dict):
            raw_hrv = hrv_summary.get("value")
        if raw_hrv in (None, ""):
            raw_hrv = value.get("latestHrvValue") or value.get("hrvValue") or value.get("hrvMs")
    readiness["raw_hrv_ms"] = raw_hrv

    hrv = value.get("hrv")
    if hrv in (None, ""):
        hrv_summary = value.get("heartRateVariabilitySummary")
        if isinstance(hrv_summary, dict):
            hrv = hrv_summary.get("value")
    readiness["hrv"] = hrv

    stress = value.get("stress")
    if stress in (None, ""):
        stress_summary = value.get("stressQualifierSummary")
        if isinstance(stress_summary, dict):
            stress = stress_summary.get("value")
    readiness["stress"] = stress

    body_battery = value.get("body_battery")
    if body_battery in (None, ""):
        body_battery = value.get("bodyBatteryChargedValue")
    readiness["body_battery"] = body_battery
    return readiness


def _unique_source_runs(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        date_value = run.get("date")
        if not date_value:
            continue
        key = _source_run_key(run)
        if key in seen:
            continue
        seen.add(key)
        unique.append(run)
    return unique


def _source_run_key(run: dict[str, Any]) -> str:
    activity_id = run.get("activity_id")
    if activity_id not in (None, ""):
        return f"activity:{activity_id}"
    return "|".join(str(run.get(part) or "") for part in ("name", "date", "distance", "duration"))


def _today() -> date:
    return datetime.now(UTC).date()


if __name__ == "__main__":
    raise SystemExit(main())
