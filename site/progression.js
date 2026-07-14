const GOAL_RULES = {
  strength: { targetReps: 5, incrementKg: 2.5, label: "Strength" },
  hypertrophy: { targetReps: 10, incrementKg: 2.5, label: "Hypertrophy" },
  endurance: { targetReps: 15, incrementKg: 1.0, label: "Endurance" },
};

export function buildProgressionState(
  entry,
  gain = null,
  goal = "strength",
  equipment = null,
) {
  const rule = GOAL_RULES[normalizeGoal(goal)] ?? GOAL_RULES.strength;
  const bestSet = isObject(entry?.best_set) ? entry.best_set : {};
  const sourceSet = isObject(entry?.last_set)
    ? entry.last_set
    : isObject(entry?.latest_set)
      ? entry.latest_set
      : bestSet;
  const weightKg = toFloat(sourceSet.weight_kg);
  const reps = toInt(sourceSet.reps);
  const current = isObject(gain) ? toFloat(gain.current) : null;
  const peak = isObject(gain) ? (toFloat(gain.peak) ?? current) : current;
  const stalled = Boolean(isObject(gain) && gain.stalled);
  const equipmentLimited = isEquipmentLimited(entry, bestSet, equipment);
  const incrementKg = resolveIncrement(goal, weightKg, equipment);
  const targetReps = rule.targetReps;
  const goalLabel = rule.label;
  const declinePct = declinePctFrom(current, peak);

  let state = "accumulate";
  let summary = `${goalLabel}: hold the line`;
  let detail = "Keep the current load and continue building volume.";
  let nextWeightKg = null;
  const reasons = [];

  if (weightKg == null && reps == null && current == null) {
    state = "baseline";
    summary = `${goalLabel}: establish a baseline`;
    detail = "No recent loaded set is available yet.";
    reasons.push("No recent best set to progress from");
  } else if (declinePct != null && declinePct >= 10) {
    state = "deload";
    summary = `Deload: ${declinePct.toFixed(0)}% below peak`;
    detail =
      "Performance has moved materially off peak, so back the load off and rebuild.";
    reasons.push(`Current 1RM is ${declinePct.toFixed(1)}% below peak`);
    if (peak != null && current != null) {
      reasons.push(`Peak ${fmtNum(peak)} kg vs current ${fmtNum(current)} kg`);
    }
  } else if (stalled) {
    state = "stalled";
    summary = "Stalled: hold load and refine execution";
    detail = "4+ weeks of flat estimated 1RM means the lift is not moving yet.";
    reasons.push("Stalled trend flagged over the recent window");
  } else if (equipmentLimited) {
    state = "constrained";
    summary = `${goalLabel}: progress with reps or tempo`;
    detail =
      "The load is capped, so the next gain has to come from volume, tempo, or range of motion.";
    reasons.push("Equipment or movement pattern limits additional load");
  } else if (reps != null && reps >= targetReps && weightKg != null) {
    state = "ready_to_progress";
    nextWeightKg = roundToIncrement(weightKg + incrementKg, incrementKg);
    summary = `Ready: add ${formatIncrement(incrementKg)} kg next`;
    detail = `${reps} reps clear the ${goalLabel.toLowerCase()} target, so step the load up.`;
    reasons.push(
      `${reps} reps meets the ${goalLabel.toLowerCase()} threshold of ${targetReps}`,
    );
    reasons.push(`Increase the load by ${formatIncrement(incrementKg)} kg`);
  } else if (reps == null) {
    state = "baseline";
    summary = `${goalLabel}: build a clean baseline`;
    detail = "There is not enough rep data yet to advance the load.";
    reasons.push("Missing rep count for progression");
  } else if (reps < targetReps) {
    state = "accumulate";
    const needed = targetReps - reps;
    summary = `Accumulate: add ${needed} more reps`;
    detail = `Hold the current load until you reach ${targetReps} reps.`;
    reasons.push(`${reps}/${targetReps} reps complete at the current load`);
  } else {
    state = "accumulate";
    summary = `${goalLabel}: hold load and keep volume steady`;
    detail =
      "The lift is not stalled, but the set does not yet justify a load increase.";
    reasons.push("Reps are on target but the set is not ready to progress yet");
  }

  return {
    goal: normalizeGoal(goal),
    goal_label: goalLabel,
    state,
    state_label: stateLabel(state),
    summary,
    detail,
    current_weight_kg: weightKg,
    current_reps: reps,
    target_reps: targetReps,
    increment_kg: incrementKg,
    next_weight_kg: nextWeightKg,
    stalled,
    deload: state === "deload",
    equipment_limited: equipmentLimited,
    reasons,
  };
}

function isEquipmentLimited(entry, bestSet, equipment) {
  if (isObject(equipment)) {
    if (equipment.kind === "bodyweight" || equipment.kind === "capped") {
      return true;
    }
    const maxWeightKg = toFloat(equipment.max_weight_kg);
    const weightKg = toFloat(bestSet.weight_kg);
    if (maxWeightKg != null && weightKg != null && weightKg >= maxWeightKg) {
      return true;
    }
  }

  const weightKg = toFloat(bestSet.weight_kg);
  if (weightKg == null) {
    return true;
  }

  return false;
}

function resolveIncrement(goal, weightKg, equipment) {
  if (isObject(equipment)) {
    const incrementKg = toFloat(equipment.increment_kg);
    if (incrementKg != null && incrementKg > 0) {
      return incrementKg;
    }
  }
  if (weightKg != null && weightKg < 20) {
    return 1.0;
  }
  return GOAL_RULES[normalizeGoal(goal)]?.incrementKg ?? 2.5;
}

function roundToIncrement(value, increment) {
  if (!(increment > 0)) return Math.round(value * 10) / 10;
  return Math.round(value / increment) * increment;
}

function declinePctFrom(current, peak) {
  if (!(current > 0) || !(peak > 0)) return null;
  return Math.max(0, ((peak - current) / peak) * 100);
}

function normalizeGoal(goal) {
  const normalized = String(goal ?? "strength").toLowerCase();
  return normalized in GOAL_RULES ? normalized : "strength";
}

function stateLabel(state) {
  return {
    baseline: "Baseline",
    accumulate: "Accumulate",
    ready_to_progress: "Ready to progress",
    stalled: "Stalled",
    deload: "Deload",
    constrained: "Constrained",
  }[state];
}

function toFloat(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fmtNum(value) {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 10) / 10);
}

function formatIncrement(value) {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 10) / 10);
}
