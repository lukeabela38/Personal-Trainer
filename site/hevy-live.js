const HEVY_API_BASE = "https://api.hevyapp.com/v1";
const HEVY_WORKOUT_LIMIT = 30;
const HEVY_PAGE_SIZE = 10;
const HEVY_API_KEY_STORAGE_KEY = "personal-trainer:hevy-api-key";
const HEVY_WINDOW_STORAGE_KEY = "personal-trainer:hevy-workout-window";
const HEVY_LIVE_STORAGE_KEY = "personal-trainer:hevy-live-strength";
const HEVY_CATALOG_URL = new URL(
  "./history/exercises/index.json",
  import.meta.url,
);

let exerciseCatalogPromise = null;

export function readStoredHevyApiKey() {
  try {
    return localStorage.getItem(HEVY_API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveStoredHevyApiKey(apiKey) {
  try {
    const value = String(apiKey ?? "").trim();
    if (value) {
      localStorage.setItem(HEVY_API_KEY_STORAGE_KEY, value);
    }
  } catch {}
}

export function readStoredHevyWorkoutWindow() {
  try {
    const raw = localStorage.getItem(HEVY_WINDOW_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : HEVY_WORKOUT_LIMIT;
    return normalizeHevyWorkoutWindow(parsed);
  } catch {
    return HEVY_WORKOUT_LIMIT;
  }
}

export function saveStoredHevyWorkoutWindow(value) {
  try {
    localStorage.setItem(
      HEVY_WINDOW_STORAGE_KEY,
      String(normalizeHevyWorkoutWindow(value)),
    );
  } catch {}
}

export function readStoredHevyLiveStrength() {
  try {
    const raw = localStorage.getItem(HEVY_LIVE_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function saveStoredHevyLiveStrength(payload) {
  try {
    localStorage.setItem(HEVY_LIVE_STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export function clearStoredHevyLiveStrength() {
  try {
    localStorage.removeItem(HEVY_LIVE_STORAGE_KEY);
  } catch {}
}

export function formatHevyRefreshLabel(payload) {
  if (!payload?.refreshed_at) return "via daily pipeline";
  const timestamp = new Date(payload.refreshed_at);
  if (Number.isNaN(timestamp.getTime())) return "just now";
  const minutes = Math.max(
    0,
    Math.round((Date.now() - timestamp.getTime()) / 60000),
  );
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function formatHevyWorkoutWindowLabel(value) {
  const windowSize = normalizeHevyWorkoutWindow(value);
  return `${windowSize} workout${windowSize === 1 ? "" : "s"}`;
}

export function mergeHevyStrengthView(baseView, liveView) {
  if (!liveView) return baseView;
  return {
    ...baseView,
    ...liveView,
    page_state: liveView.page_state ?? baseView.page_state,
    source: liveView.source ?? baseView.source,
  };
}

export function mergeHevySnapshot(snapshot, liveView) {
  if (!liveView) return snapshot;
  const mergedHevy = {
    ...(snapshot?.hevy ?? {}),
    ...liveView,
  };
  const pageStates = {
    ...(snapshot?.derived?.page_states ?? {}),
    strength: liveView.page_state ?? snapshot?.derived?.page_states?.strength,
  };
  return {
    ...snapshot,
    hevy: mergedHevy,
    derived: {
      ...(snapshot?.derived ?? {}),
      page_states: pageStates,
    },
  };
}

export async function refreshHevyStrength(
  apiKey = readStoredHevyApiKey(),
  options = {},
) {
  clearStoredHevyLiveStrength();
  const normalizedKey = String(apiKey ?? "").trim();
  if (!normalizedKey) {
    throw new Error("Hevy API key is missing");
  }
  const workoutWindow = normalizeHevyWorkoutWindow(
    options.workoutWindow ?? readStoredHevyWorkoutWindow(),
  );

  const [catalog, workouts] = await Promise.all([
    loadExerciseCatalog(),
    fetchRecentWorkouts(normalizedKey, workoutWindow),
  ]);
  const payload = buildHevyStrengthView(workouts, catalog);
  const liveStrength = {
    ...payload,
    source: "Hevy browser refresh",
    refreshed_at: new Date().toISOString(),
    refresh_window: workoutWindow,
  };
  saveStoredHevyLiveStrength(liveStrength);
  saveStoredHevyApiKey(normalizedKey);
  saveStoredHevyWorkoutWindow(workoutWindow);
  return liveStrength;
}

async function fetchRecentWorkouts(apiKey, workoutWindow = HEVY_WORKOUT_LIMIT) {
  const recent = [];
  let page = 1;
  const limit = normalizeHevyWorkoutWindow(workoutWindow);

  while (recent.length < limit) {
    const remaining = limit - recent.length;
    const pageSize = Math.min(HEVY_PAGE_SIZE, remaining);
    const payload = await fetchHevyJson(
      `/workouts?page=${page}&pageSize=${pageSize}`,
      apiKey,
    );
    const workouts = Array.isArray(payload?.workouts) ? payload.workouts : [];
    if (!workouts.length) break;
    recent.push(...workouts.filter(isObject));
    if (workouts.length < pageSize) break;
    page += 1;
  }

  return recent.slice(0, limit);
}

async function fetchHevyJson(path, apiKey) {
  const response = await fetch(`${HEVY_API_BASE}${path}`, {
    headers: {
      "Api-Key": apiKey,
    },
  });
  if (!response.ok) {
    const body = await safeReadResponseText(response);
    throw new Error(
      `Hevy API ${response.status} for ${path}${body ? `: ${body}` : ""}`,
    );
  }
  return response.json();
}

async function loadExerciseCatalog() {
  if (!exerciseCatalogPromise) {
    exerciseCatalogPromise = fetch(
      `${HEVY_CATALOG_URL.pathname}?v=${Date.now()}`,
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        const exercises = Array.isArray(payload?.exercises)
          ? payload.exercises
          : [];
        return new Map(
          exercises
            .filter(
              (exercise) => exercise?.exercise_template_id && exercise?.name,
            )
            .map((exercise) => [
              String(exercise.exercise_template_id),
              {
                name: String(exercise.name),
                category: String(exercise.category ?? "Strength") || "Strength",
              },
            ]),
        );
      })
      .catch(() => new Map());
  }
  return exerciseCatalogPromise;
}

export function buildHevyStrengthView(workouts, exerciseCatalog) {
  const recentWorkouts = [];
  const bestByTemplateId = new Map();

  for (const workout of workouts) {
    if (!isObject(workout)) continue;
    recentWorkouts.push(summarizeWorkout(workout));

    const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
    for (const exercise of exercises) {
      if (!isObject(exercise)) continue;
      const templateId = normalizeTemplateId(exercise.exercise_template_id);
      if (!templateId) continue;

      const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
      for (const set of sets) {
        const summary = summarizeSet(set, workout, exercise, templateId);
        if (!summary) continue;
        const current = bestByTemplateId.get(templateId);
        if (!current || summary.score > current.score) {
          bestByTemplateId.set(templateId, summary);
        }
      }
    }
  }

  const entriesWithIds = [];
  for (const [templateId, exercise] of exerciseCatalog.entries()) {
    const best = bestByTemplateId.get(templateId);
    if (!best) continue;
    entriesWithIds.push({
      templateId,
      name: exercise.name,
      category: exercise.category,
      workout_title: best.workout_title,
      best_set: {
        weight_kg: best.weight_kg,
        reps: best.reps,
        workout_start_date: best.workout_start_date,
      },
      estimated_one_rm_kg: best.estimated_one_rm_kg,
    });
  }

  for (const [templateId, best] of bestByTemplateId.entries()) {
    if (exerciseCatalog.has(templateId)) continue;
    entriesWithIds.push({
      templateId,
      name: best.exercise_name,
      category: "Strength",
      workout_title: best.workout_title,
      best_set: {
        weight_kg: best.weight_kg,
        reps: best.reps,
        workout_start_date: best.workout_start_date,
      },
      estimated_one_rm_kg: best.estimated_one_rm_kg,
    });
  }

  entriesWithIds.sort((a, b) => a.name.localeCompare(b.name));
  const entries = entriesWithIds.map(
    ({ templateId: _templateId, workout_title: _workoutTitle, ...entry }) =>
      entry,
  );

  const latestWorkoutDate = recentWorkouts[0]?.start_time?.slice(0, 10) ?? null;
  const pageState = buildPageState(recentWorkouts.length > 0);

  return {
    freshness: recentWorkouts.length > 0 ? "fresh" : "missing",
    source: "Hevy browser refresh",
    snapshot_date: latestWorkoutDate ?? new Date().toISOString().slice(0, 10),
    refreshed_at: new Date().toISOString(),
    page_state: pageState,
    entries,
    recent_workouts: recentWorkouts,
    last_workout: recentWorkouts[0] ?? null,
    muscle_group_fatigue: recentWorkouts[0]
      ? inferFatigue(recentWorkouts[0])
      : {
          legs: "unknown",
          posterior_chain: "unknown",
          push: "unknown",
          pull: "unknown",
          shoulders_arms: "unknown",
          core: "unknown",
        },
    strength_trend: recentWorkouts.length > 1 ? "unknown" : "unknown",
    recent_bests: entriesWithIds.map((entry) => ({
      exercise_template_id: entry.templateId,
      weight_kg: entry.best_set.weight_kg,
      reps: entry.best_set.reps,
      estimated_one_rm_kg: entry.estimated_one_rm_kg,
      workout_start_date: entry.best_set.workout_start_date,
      workout_title: entry.workout_title ?? "",
    })),
    flags: recentWorkouts.length > 0 ? [] : ["no_workouts"],
  };
}

function buildPageState(hasData) {
  if (!hasData) {
    return {
      kind: "missing",
      label: "No strength data available",
      detail: "Hevy returned no workouts for this browser refresh.",
    };
  }
  return {
    kind: "fresh",
    label: "Strength history ready",
    detail: "Hevy data is available and current.",
  };
}

function summarizeWorkout(workout) {
  const startTime = String(workout.start_time ?? workout.startTime ?? "");
  const endTime = String(workout.end_time ?? workout.endTime ?? "");
  const exercises = Array.isArray(workout.exercises)
    ? workout.exercises.map(summarizeExercise).filter(Boolean)
    : [];
  return {
    title: String(workout.title ?? workout.name ?? ""),
    start_time: startTime,
    end_time: endTime,
    exercise_count: exercises.length,
    exercises,
  };
}

function summarizeExercise(exercise) {
  if (!isObject(exercise)) return null;
  const sets = Array.isArray(exercise.sets)
    ? exercise.sets.map(summarizeWorkoutSet).filter(Boolean)
    : [];
  return {
    exercise_template_id: String(exercise.exercise_template_id ?? ""),
    name: String(exercise.name ?? exercise.title ?? ""),
    sets,
  };
}

function summarizeWorkoutSet(set) {
  if (!isObject(set)) return null;
  const reps = parseInteger(set.reps);
  const weight = parseFloatNumber(set.weight_kg);
  if (weight == null && reps == null) return null;
  const payload = {
    weight_kg: weight,
    reps,
  };
  const rpe = parseFloatNumber(set.rpe);
  if (rpe != null) {
    payload.rpe = rpe;
  }
  return payload;
}

function summarizeSet(set, workout, exercise, templateId) {
  if (!isObject(set)) return null;
  const reps = parseInteger(set.reps);
  if (reps == null) return null;

  const weight = parseFloatNumber(set.weight_kg);
  const startTime = String(workout.start_time ?? workout.startTime ?? "");
  const workoutDate = startTime ? startTime.slice(0, 10) : "";
  const workoutTitle = String(workout.title ?? workout.name ?? "");
  const exerciseName = String(
    exercise.name ?? exercise.title ?? templateId ?? "",
  );
  const usesWeight = weight != null && weight > 0;
  return {
    score: usesWeight ? weight * (1 + reps / 30) : reps,
    weight_kg: usesWeight ? weight : null,
    reps,
    estimated_one_rm_kg: usesWeight
      ? roundOneDecimal(weight * (1 + reps / 30))
      : null,
    workout_start_date: workoutDate,
    workout_title: workoutTitle,
    exercise_name: exerciseName,
  };
}

function inferFatigue(workout) {
  const fatigue = {
    legs: "unknown",
    posterior_chain: "unknown",
    push: "unknown",
    pull: "unknown",
    shoulders_arms: "unknown",
    core: "unknown",
  };
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  for (const exercise of exercises) {
    if (!isObject(exercise)) continue;
    const templateId = String(exercise.exercise_template_id ?? "");
    if (templateId === "D04AC939") {
      fatigue.legs = "high";
      fatigue.posterior_chain = "moderate";
    } else if (templateId === "5E10D0E6") {
      fatigue.legs = "high";
    } else if (["79D0BB3A", "28BB4A95", "392887AA"].includes(templateId)) {
      fatigue.push = "high";
      fatigue.shoulders_arms = "moderate";
    } else if (["29083183", "F1E57334"].includes(templateId)) {
      fatigue.pull = "high";
      fatigue.posterior_chain = "moderate";
    } else if (templateId === "8347DFD1") {
      fatigue.shoulders_arms = "high";
    }
  }
  return fatigue;
}

function normalizeTemplateId(value) {
  const templateId = String(value ?? "").trim();
  return templateId ? templateId : "";
}

function normalizeHevyWorkoutWindow(value) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return HEVY_WORKOUT_LIMIT;
  return Math.min(Math.max(Math.trunc(parsed), 1), 90);
}

function parseFloatNumber(value) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value) {
  if (value == null || value === "") return null;
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function roundOneDecimal(value) {
  return Math.round(value * 10) / 10;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function safeReadResponseText(response) {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}
