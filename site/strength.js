import { renderSparkline, fmtNum } from "./goals.js";
import {
  formatHevyRefreshLabel,
  formatHevyWorkoutWindowLabel,
  readStoredHevyApiKey,
  readStoredHevyLiveStrength,
  readStoredHevyWorkoutWindow,
  mergeHevyStrengthView,
  refreshHevyStrength,
  saveStoredHevyApiKey,
  saveStoredHevyWorkoutWindow,
} from "./hevy-live.js";

const strengthUrl = new URL("./strength.json", import.meta.url);
const grid = document.getElementById("strength-grid");
const historyContent = document.getElementById("history-content");
const historyWindowChip = document.getElementById("history-window-chip");
const historyResultsCount = document.getElementById("history-results-count");
const historySearchInput = document.getElementById("history-search");
const heroNote = document.getElementById("strength-hero-note");
const exercisesPanel = document.getElementById("exercises-panel");
const highlightsPanel = document.getElementById("strength-highlights");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");
const summaryEl = document.getElementById("strength-summary");
const controls = document.getElementById("strength-controls");
const hevyRefreshButton = document.getElementById("refresh-hevy");
const hevySetKeyButton = document.getElementById("set-hevy-key");
const hevyWindowInput = document.getElementById("hevy-workout-window");
const hevyRefreshStatus = document.getElementById("hevy-refresh-status");
const hevyWindowStatus = document.getElementById("hevy-window-status");
const filterPills = document.getElementById("filter-pills");
const sortButtons = document.querySelectorAll(".sort-btn");
const searchInput = document.getElementById("strength-search");
const tabButtons = document.querySelectorAll(".strength-tab");
const tabPanels = document.querySelectorAll("[data-strength-tab-panel]");
const exerciseCatalogUrl = new URL("./history/exercises/index.json", import.meta.url);

let entries = [];
let recentWorkouts = [];
let activeCategory = "All";
let activeSort = "date";
let activeTab = "history";
let searchQuery = "";
let historyQuery = "";
let compactView = false;
let gainsCache = null;
let exerciseIdByName = new Map();
let exerciseCatalogLoaded = false;
let tabsBound = false;

await loadExerciseCatalog();
loadStrength();

hevyRefreshButton?.addEventListener("click", handleHevyRefresh);
hevySetKeyButton?.addEventListener("click", handleHevySetKey);
hevyWindowInput?.addEventListener("change", handleHevyWindowChange);
historySearchInput?.addEventListener("input", () => {
  historyQuery = historySearchInput.value.toLowerCase().trim();
  renderHistory();
});
grid?.addEventListener("click", async (event) => {
  const card = event.target.closest(".exercise-card");
  if (!card) return;
  if (event.target.closest(".pill, .sort-btn, .search-input, .filter-pills, .strength-tab")) {
    return;
  }
  const templateId = card.dataset.templateId;
  if (!templateId) return;
  try {
    const response = await fetch(`./history/exercises/${templateId}.json?v=${Date.now()}`);
    const history = await response.json();
    renderTrendModal(card.dataset.exerciseName ?? templateId, history);
  } catch {
    // no history available
  }
});

async function loadStrength() {
  try {
    const [response] = await Promise.all([
      fetch(`${strengthUrl.pathname}?v=${Date.now()}`),
      loadExerciseCatalog(),
    ]);
    const basePayload = await response.json();
    const payload = mergeHevyStrengthView(
      basePayload,
      readStoredHevyLiveStrength(),
    );
    const pageState = payload.page_state ?? {
      kind: "fresh",
      label: "Ready",
      detail: "",
    };
    if (pageState.kind === "missing") {
      renderUnavailableStrength(
        pageState.detail ?? "No strength data available",
      );
      return;
    }

    sourceLabel.textContent = `${payload.source ?? "Hevy"} · ${payload.snapshot_date ?? "unknown date"}`;
    sourceLabel.classList.remove("skeleton");
    statusBanner.textContent = `${(payload.entries ?? []).length} lifts · ${formatHevyRefreshLabel(payload)}`;
    statusBanner.classList.remove("skeleton");
    syncHevyWindowUI(
      payload.refresh_window ?? readStoredHevyWorkoutWindow(),
      payload,
    );
    entries = Array.isArray(payload.entries) ? payload.entries : [];
    recentWorkouts = Array.isArray(payload.recent_workouts)
      ? payload.recent_workouts
      : [];

    renderControls();
    renderSummary();
    renderHighlights();
    renderCoachNote();
    renderTabs();
    renderCurrentTab();
    controls.removeAttribute("hidden");
    loadGains().then(() => {
      renderSummary();
      renderHighlights();
      renderCoachNote();
      renderCurrentTab();
    });
  } catch {
    renderUnavailableStrength("Could not load strength data");
  }
}

function renderUnavailableStrength(message) {
  entries = [];
  recentWorkouts = [];
  sourceLabel.textContent = "Unavailable";
  statusBanner.textContent = message;
  controls?.removeAttribute("hidden");
  if (filterPills) filterPills.innerHTML = "";
  syncHevyWindowUI(readStoredHevyWorkoutWindow());
  if (hevyRefreshStatus) hevyRefreshStatus.textContent = message;
  if (summaryEl) summaryEl.innerHTML = "";
  if (highlightsPanel) highlightsPanel.innerHTML = "";
  if (highlightsPanel) highlightsPanel.hidden = true;
  if (heroNote) {
    heroNote.textContent = message;
    heroNote.classList.remove("skeleton");
  }
  if (historyContent) {
    historyContent.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-kicker">Hevy</span>
        <strong>Failed to load workout history</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
  if (grid) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-kicker">Exercises</span>
        <strong>Failed to load data</strong>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }
  renderTabs();
}

async function loadGains() {
  if (gainsCache) return gainsCache;
  try {
    const resp = await fetch(`./history/exercises/_gains.json?v=${Date.now()}`);
    gainsCache = await resp.json();
    return gainsCache;
  } catch {
    gainsCache = {};
    return gainsCache;
  }
}

async function loadExerciseCatalog() {
  if (exerciseCatalogLoaded) return exerciseIdByName;
  try {
    const resp = await fetch(`${exerciseCatalogUrl.pathname}?v=${Date.now()}`);
    const payload = await resp.json();
    const exercises = Array.isArray(payload?.exercises)
      ? payload.exercises
      : [];
    exerciseIdByName = new Map(
      exercises
        .filter((exercise) => exercise?.exercise_template_id && exercise?.name)
        .map((exercise) => [
          String(exercise.name),
          String(exercise.exercise_template_id),
        ]),
    );
  } catch {
    exerciseIdByName = new Map();
  } finally {
    exerciseCatalogLoaded = true;
  }
  return exerciseIdByName;
}

function renderControls() {
  const counts = {};
  entries.forEach((entry) => {
    const category = normalizeCategory(entry.category);
    counts[category] = (counts[category] || 0) + 1;
  });
  const categories = [
    "All",
    ...new Set(entries.map((entry) => normalizeCategory(entry.category)).filter(Boolean)),
  ];

  if (filterPills) {
    filterPills.innerHTML = categories
      .map((category) => {
        const count = category === "All" ? entries.length : (counts[category] ?? 0);
        return `<button class="pill${category === activeCategory ? " is-active" : ""}" data-category="${escapeHtml(category)}" type="button">${escapeHtml(category)} (${count})</button>`;
      })
      .join("");
  }

  if (tabsBound) return;
  tabsBound = true;

  filterPills?.addEventListener("click", (event) => {
    const btn = event.target.closest(".pill");
    if (!btn) return;
    filterPills
      .querySelectorAll(".pill")
      .forEach((pill) => pill.classList.remove("is-active"));
    btn.classList.add("is-active");
    activeCategory = btn.dataset.category;
    renderCurrentTab();
  });

  sortButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      sortButtons.forEach((button) => button.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeSort = btn.dataset.sort;
      renderCurrentTab();
    });
  });

  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value.toLowerCase().trim();
    renderCurrentTab();
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab ?? "history");
    });
  });
}

function renderSummary() {
  if (!summaryEl) return;

  if (!entries.length && !recentWorkouts.length) {
    summaryEl.innerHTML = "";
    return;
  }

  const categories = new Set(entries.map((entry) => normalizeCategory(entry.category)).filter(Boolean));
  const latestWorkout = recentWorkouts[0] ?? null;
  const topEntry = [...entries].reduce((best, entry) => {
    const current = entry.estimated_one_rm_kg ?? entry.best_set?.weight_kg ?? 0;
    const bestValue =
      best?.estimated_one_rm_kg ?? best?.best_set?.weight_kg ?? 0;
    return current > bestValue ? entry : best;
  }, entries[0] ?? null);
  const topMover = getTopMoverEntry();
  const latestDate =
    latestWorkout?.start_time?.slice(0, 10) ??
    latestWorkout?.start_date?.slice?.(0, 10) ??
    entries
      .map((entry) => entry.best_set?.workout_start_date ?? "")
      .filter(Boolean)
      .sort()
      .at(-1);

  summaryEl.innerHTML = [
    {
      label: "Momentum",
      value: topMover?.gain?.gain_pct != null ? `+${fmtNum(topMover.gain.gain_pct)}%` : "—",
      subvalue: topMover?.entry?.name ?? "No gain history yet",
      className: "summary-tile--lead",
    },
    {
      label: "Workouts",
      value: `${recentWorkouts.length}`,
      subvalue: "Recent Hevy sessions",
    },
    {
      label: "Exercises",
      value: `${entries.length}`,
      subvalue: `${categories.size} categories tracked`,
    },
    {
      label: "Top 1RM",
      value: `${fmtNum(topEntry?.estimated_one_rm_kg ?? topEntry?.best_set?.weight_kg ?? 0)} kg`,
      subvalue: topEntry?.name ?? "Highest current estimate",
    },
    {
      label: "Latest session",
      value: latestDate ?? "Unknown date",
      subvalue: latestWorkout?.title ?? "Most recent workout",
    },
  ]
    .map(
      (tile) => `
        <div class="summary-tile${tile.className ? ` ${tile.className}` : ""}">
          <span class="summary-tile-label">${escapeHtml(tile.label)}</span>
          <span class="summary-tile-value">${escapeHtml(tile.value)}</span>
          <span class="summary-tile-subvalue">${escapeHtml(tile.subvalue)}</span>
        </div>
      `,
    )
    .join("");
}

function renderHighlights() {
  if (!highlightsPanel) return;

  const topMover = getTopMoverEntry();
  const latestWorkout = recentWorkouts[0] ?? null;
  const stalledLift = getStalledLiftEntry();
  const tiles = [];

  if (topMover) {
    tiles.push({
      label: "Top mover",
      value: topMover.gain.gain_pct != null ? `+${fmtNum(topMover.gain.gain_pct)}%` : "Rising",
      subvalue: `${topMover.entry.name} · ${fmtNum(topMover.gain.current ?? 0)} kg now`,
    });
  }

  if (latestWorkout) {
    tiles.push({
      label: "Most recent",
      value: workoutDate(latestWorkout),
      subvalue: `${workoutTitle(latestWorkout)} · ${workoutSummaryExerciseCount(latestWorkout)} exercises`,
    });
  }

  if (stalledLift) {
    const gap = Math.max(0, stalledLift.gain.peak - stalledLift.gain.current);
    tiles.push({
      label: "Stalled lift",
      value: stalledLift.entry.name,
      subvalue: gap ? `${fmtNum(gap)} kg from peak` : "At peak",
    });
  }

  if (!tiles.length) {
    highlightsPanel.innerHTML = "";
    highlightsPanel.hidden = true;
    return;
  }

  highlightsPanel.innerHTML = tiles
    .slice(0, 3)
    .map(
      (tile) => `
        <article class="strength-highlight">
          <span class="strength-highlight-label">${escapeHtml(tile.label)}</span>
          <strong class="strength-highlight-value">${escapeHtml(tile.value)}</strong>
          <span class="strength-highlight-subvalue">${escapeHtml(tile.subvalue)}</span>
        </article>
      `,
    )
    .join("");
  highlightsPanel.hidden = false;
}

function renderCoachNote() {
  if (!heroNote) return;

  const topMover = getTopMoverEntry();
  const stalledLift = getStalledLiftEntry();
  const latestWorkout = recentWorkouts[0] ?? null;
  const fragments = [];

  if (topMover?.gain?.gain_pct != null) {
    fragments.push(
      `${topMover.entry.name} is leading the field at +${fmtNum(topMover.gain.gain_pct)}%`,
    );
  }

  if (stalledLift?.gain?.current != null && stalledLift?.gain?.peak != null) {
    const gap = Math.max(0, stalledLift.gain.peak - stalledLift.gain.current);
    fragments.push(
      `${stalledLift.entry.name} is ${gap ? `${fmtNum(gap)} kg off peak` : "back at peak"}`,
    );
  }

  if (latestWorkout) {
    fragments.push(`latest session: ${workoutTitle(latestWorkout)} on ${workoutDate(latestWorkout)}`);
  }

  heroNote.textContent =
    fragments.length > 0
      ? fragments.join(" · ")
      : "Sync Hevy to turn this into a live coaching view.";
  heroNote.classList.remove("skeleton");
}

function getTopMoverEntry() {
  if (!gainsCache) return null;
  let best = null;
  for (const entry of entries) {
    const gain = gainsCache[exerciseTemplateKey(entry)];
    if (!gain || gain.gain_pct == null) continue;
    if (!best || gain.gain_pct > best.gain.gain_pct) {
      best = { entry, gain };
    }
  }
  return best;
}

function getStalledLiftEntry() {
  if (!gainsCache) return null;
  const stalled = entries
    .map((entry) => {
      const gain = gainsCache[exerciseTemplateKey(entry)];
      if (!gain || !gain.stalled) return null;
      if (gain.current == null || gain.peak == null) return null;
      return { entry, gain };
    })
    .filter(Boolean);

  if (!stalled.length) return null;

  stalled.sort(
    (a, b) => a.gain.current / a.gain.peak - b.gain.current / b.gain.peak,
  );
  return stalled[0];
}

function setActiveTab(tab) {
  activeTab = tab === "exercises" ? "exercises" : "history";
  renderTabs();
  renderCurrentTab();
}

function renderTabs() {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.strengthTabPanel === activeTab;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });
}

function renderCurrentTab() {
  renderHistoryOrExercises();
}

function renderHistory() {
  if (!historyContent) return;
  const visibleWorkouts = recentWorkouts.filter((workout) =>
    historyMatchesQuery(workout, historyQuery),
  );
  const totalWorkouts = recentWorkouts.length;
  const totalExercises = recentWorkouts.reduce(
    (sum, workout) => sum + workoutSummaryExerciseCount(workout),
    0,
  );
  const activeWindow = formatHevyWorkoutWindowLabel(readStoredHevyWorkoutWindow());
  const resultsSummary = `${visibleWorkouts.length} of ${totalWorkouts} workouts · ${totalExercises} exercises`;

  if (historyWindowChip) {
    historyWindowChip.textContent = `Window ${activeWindow}`;
  }
  if (historyResultsCount) {
    historyResultsCount.textContent = resultsSummary;
  }

  if (historySearchInput && historySearchInput.value !== historyQuery) {
    historySearchInput.value = historyQuery;
  }

  if (!visibleWorkouts.length) {
    renderHistoryFallback();
    return;
  }

  historyContent.innerHTML = `
    <div class="workout-stack">
      ${visibleWorkouts
        .map((workout, index) => renderWorkoutCard(workout, index))
        .join("")}
    </div>
  `;
}

function renderWorkoutCard(workout, index) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
  const title = workoutTitle(workout);
  const date = workoutDate(workout);
  const range = workoutDuration(workout);
  return `
    <details class="workout-card card" ${index === 0 ? "open" : ""}>
      <summary class="workout-summary">
        <div class="workout-summary-main">
          <span class="workout-summary-date">${escapeHtml(date)}</span>
          <span class="workout-summary-title">${escapeHtml(title)}</span>
          <span class="workout-summary-meta">${escapeHtml(`${exercises.length} exercises${range ? ` · ${range}` : ""}`)}</span>
        </div>
        <div class="workout-summary-badges">
          <span class="workout-summary-chip">${escapeHtml(`${exercises.length} exercises`)}</span>
          ${range ? `<span class="workout-summary-chip is-soft">${escapeHtml(range)}</span>` : ""}
          ${index === 0 ? `<span class="workout-summary-chip is-accent">Latest</span>` : ""}
        </div>
      </summary>
      <div class="workout-body">
        ${exercises.map((exercise) => renderWorkoutExercise(exercise, date)).join("")}
      </div>
    </details>
  `;
}

function renderWorkoutExercise(exercise, workoutDate) {
  if (!exercise || typeof exercise !== "object") return "";
  const name = String(exercise.name ?? exercise.title ?? "Exercise");
  const templateId = normalizeTemplateId(exercise.exercise_template_id);
  const sets = Array.isArray(exercise.sets) ? exercise.sets.filter(isObject) : [];
  return `
    <div class="workout-exercise" data-template-id="${escapeHtml(templateId)}">
      <div class="workout-exercise-head">
        <span class="workout-exercise-name">${escapeHtml(name)}</span>
        <span class="workout-exercise-count">${sets.length ? `${sets.length} sets` : "No sets"}</span>
      </div>
      <div class="workout-set-list">
        ${sets.length
          ? sets.map((set) => renderWorkoutSet(set)).join("")
          : `<span class="workout-set workout-set-empty">No sets recorded</span>`}
      </div>
      <div class="workout-exercise-meta">
        <span>${escapeHtml(workoutDate)}</span>
        ${templateId ? `<span>${escapeHtml(templateId)}</span>` : ""}
      </div>
    </div>
  `;
}

function renderWorkoutSet(set) {
  const parts = [];
  const reps = parseInteger(set.reps);
  const weight = parseFloatNumber(set.weight_kg);
  const rpe = parseFloatNumber(set.rpe);
  if (weight != null) parts.push(`${fmtNum(weight)} kg`);
  if (reps != null) parts.push(`${reps} reps`);
  if (weight == null && reps == null) parts.push("Set");
  if (rpe != null) parts.push(`RPE ${fmtNum(rpe)}`);
  return `<span class="workout-set">${escapeHtml(parts.join(" · "))}</span>`;
}

function workoutTitle(workout) {
  return String(workout?.title ?? workout?.name ?? "Workout");
}

function workoutDate(workout) {
  return String(
    workout?.start_time?.slice?.(0, 10) ??
      workout?.start_date?.slice?.(0, 10) ??
      workout?.workout_start_date ??
      "Unknown date",
  );
}

function workoutDuration(workout) {
  const start = workout?.start_time ?? workout?.startTime ?? "";
  const end = workout?.end_time ?? workout?.endTime ?? "";
  if (!start || !end) return "";
  const startTime = new Date(start);
  const endTime = new Date(end);
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    return "";
  }
  const minutes = Math.max(0, Math.round((endTime.getTime() - startTime.getTime()) / 60000));
  if (minutes < 1) return "under a minute";
  if (minutes === 1) return "1 minute";
  return `${minutes} minutes`;
}

function workoutSummaryExerciseCount(workout) {
  return Array.isArray(workout?.exercises)
    ? workout.exercises.filter(isObject).length
    : 0;
}

function historyMatchesQuery(workout, query) {
  if (!query) return true;
  const haystack = [
    workoutTitle(workout),
    workoutDate(workout),
    ...((Array.isArray(workout?.exercises) ? workout.exercises : [])
      .filter(isObject)
      .flatMap((exercise) => [
        String(exercise.name ?? exercise.title ?? ""),
        String(exercise.exercise_template_id ?? ""),
      ])),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderExercises() {
  if (!grid) return;

  const lastSessionByExercise = buildLastSessionLookup();
  let visible = entries.map((entry) => ({
    entry,
    category: normalizeCategory(entry.category),
    session: getLatestSessionForEntry(entry, lastSessionByExercise),
  }));

  if (activeCategory !== "All") {
    visible = visible.filter(({ category }) => category === activeCategory);
  }

  if (searchQuery) {
    visible = visible.filter(({ entry, session }) => {
      const haystack = [
        entry.name,
        entry.category,
        session?.workout?.title,
        session?.exercise?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    });
  }

  visible = [...visible].sort((a, b) => {
    if (activeSort === "weight") {
      const wa = a.entry.estimated_one_rm_kg ?? a.entry.best_set?.weight_kg ?? 0;
      const wb = b.entry.estimated_one_rm_kg ?? b.entry.best_set?.weight_kg ?? 0;
      return wb - wa;
    }
    if (activeSort === "gain") {
      if (!gainsCache) loadGains().then(() => renderExercises());
      const ga = gainsCache?.[exerciseTemplateKey(a.entry)]?.gain_pct ?? 0;
      const gb = gainsCache?.[exerciseTemplateKey(b.entry)]?.gain_pct ?? 0;
      return gb - ga;
    }
    const da =
      a.session?.workout?.start_time?.slice?.(0, 10) ??
      a.entry.best_set?.workout_start_date ??
      "";
    const db =
      b.session?.workout?.start_time?.slice?.(0, 10) ??
      b.entry.best_set?.workout_start_date ??
      "";
    return db.localeCompare(da);
  });

  if (!visible.length) {
    renderExercisesFallback();
    renderInsights();
    return;
  }

  grid.innerHTML = visible
    .map(({ entry, session }) => renderExerciseCard(entry, session))
    .join("");
  renderInsights();
}

function renderExerciseCard(entry, session) {
  const best = entry.best_set ?? {};
  const templateId = exerciseTemplateKey(entry);
  const category = normalizeCategory(entry.category);
  const categoryClass = categoryClassFor(category);
  const lastSet = session?.sets?.length ? session.sets[session.sets.length - 1] : null;
  const bestLine = buildSetLine(best, {
    allowNoWeight: true,
    fallback: "No best set",
  });
  const lastLine = buildSetLine(lastSet, {
    allowNoWeight: true,
    fallback: "No recent set",
  });
  const lastSessionMeta = session
    ? `${workoutDate(session.workout)} · ${workoutTitle(session.workout)}`
    : "No recent session";
  const bestMeta = entry.estimated_one_rm_kg != null
    ? `Est. 1RM ${fmtNum(entry.estimated_one_rm_kg)} kg`
    : "No 1RM estimate";
  const gain = gainsCache?.[templateId];
  const recommendation = buildProgressionRecommendation(entry, session, gain);
  const progressText = buildProgressionText(entry, gain);

  return `
    <article class="exercise-card card" data-template-id="${escapeHtml(templateId)}" data-exercise-name="${escapeHtml(entry.name)}">
      <div class="exercise-head">
        <div class="exercise-name">${escapeHtml(entry.name)}</div>
        <span class="exercise-category ${categoryClass}">${escapeHtml(category)}</span>
      </div>
      <div class="exercise-metrics">
        <div class="exercise-metric exercise-metric--lead">
          <span class="exercise-metric-label">Last session</span>
          <span class="exercise-metric-value">${escapeHtml(lastLine)}</span>
          <span class="exercise-metric-subvalue">${escapeHtml(lastSessionMeta)}</span>
        </div>
        <div class="exercise-metric exercise-metric--secondary">
          <span class="exercise-metric-label">Best ever</span>
          <span class="exercise-metric-value">${escapeHtml(bestLine)}</span>
          <span class="exercise-metric-subvalue">${escapeHtml(bestMeta)}</span>
        </div>
      </div>
      <div class="exercise-footer">
        <span class="exercise-recommendation">${escapeHtml(recommendation)}</span>
        <span class="exercise-progress">${escapeHtml(progressText)}</span>
      </div>
    </article>
  `;
}

function buildProgressionRecommendation(entry, session, gain) {
  const lastSet = session?.sets?.length ? session.sets[session.sets.length - 1] : null;
  const currentWeight =
    parseFloatNumber(lastSet?.weight_kg) ??
    parseFloatNumber(entry.best_set?.weight_kg) ??
    parseFloatNumber(gain?.current) ??
    null;
  const reps = parseInteger(lastSet?.reps) ?? parseInteger(entry.best_set?.reps);

  if (currentWeight != null) {
    const nextWeight = roundToIncrement(currentWeight + 2.5, 2.5);
    return `Try ${fmtNum(nextWeight)} kg next`;
  }
  if (reps != null) {
    return `Aim for ${reps + 1} reps next`;
  }
  return "Keep it moving forward";
}

function buildProgressionText(entry, gain) {
  const parts = [];
  if (gain?.gain_pct != null) {
    parts.push(`+${fmtNum(gain.gain_pct)}% vs start`);
  }
  if (gain?.peak != null) {
    parts.push(`Peak ${fmtNum(gain.peak)} kg`);
  }
  if (!parts.length && entry.estimated_one_rm_kg != null) {
    parts.push(`Est. ${fmtNum(entry.estimated_one_rm_kg)} kg 1RM`);
  }
  return parts.length ? parts.join(" · ") : "No progression history yet";
}

function buildProgressionSummary(entry, gain) {
  if (!gain) return "No history file";
  if (gain.stalled) return "Stalled";
  if (gain.current == null || gain.peak == null) return "Building history";
  const gap = Math.max(0, gain.peak - gain.current);
  if (!gap) return "At peak";
  return `Gap ${fmtNum(gap)} kg`;
}

function renderInsights() {
  const el = document.getElementById("insights");
  if (!el || !gainsCache || activeTab !== "exercises") {
    if (el) el.hidden = true;
    return;
  }

  const withGain = entries
    .map((entry) => ({ entry, gain: gainsCache[exerciseTemplateKey(entry)] }))
    .filter((item) => item.gain?.current != null && item.gain?.peak != null);

  if (withGain.length < 2) {
    el.hidden = true;
    return;
  }

  const catStats = {};
  withGain.forEach(({ entry, gain }) => {
    const cat = normalizeCategory(entry.category);
    if (!catStats[cat]) catStats[cat] = { count: 0, totalPct: 0, totalGain: 0 };
    catStats[cat].count += 1;
    catStats[cat].totalPct += (gain.current / gain.peak) * 100;
    catStats[cat].totalGain += gain.gain_pct;
  });
  const catHealth = Object.entries(catStats).map(([cat, stats]) => ({
    cat,
    pct: Math.round(stats.totalPct / stats.count),
    gain: fmtNum(stats.totalGain / stats.count),
  }));

  const stalls = [];
  withGain.forEach(({ entry, gain }) => {
    if (gain.stalled && gain.current < gain.peak * 0.9) {
      stalls.push({ name: entry.name, current: gain.current, peak: gain.peak });
    }
  });

  const sorted = [...withGain].sort(
    (a, b) => a.gain.current / a.gain.peak - b.gain.current / b.gain.peak,
  );
  const biggestGap = sorted[0];

  const parts = [];

  if (catHealth.length) {
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Category health - lower means more room to grow</div>
        <div class="stat-grid">
          ${catHealth
            .sort((a, b) => a.pct - b.pct)
            .map(
              (c) => `
            <div class="macro-row">
              <div class="macro-row-header">
                <span class="macro-row-label">${escapeHtml(c.cat)}</span>
                <span class="macro-row-numbers">avg ${c.pct}% of peak · +${c.gain}% gain</span>
              </div>
              <div class="macro-track">
                <div class="macro-fill macro-fill-${c.pct >= 80 ? "high" : c.pct >= 60 ? "medium" : "low"}" style="width:${c.pct}%"></div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `);
  }

  if (stalls.length) {
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Stalled - no progress in 30+ days</div>
        <div class="stack-list">
          ${stalls
            .slice(0, 5)
            .map(
              (stall) => `
            <div class="item">
              <span>${escapeHtml(stall.name)}</span>
              <strong class="delta-down">${fmtNum(stall.current)} kg · ${Math.round((stall.current / stall.peak) * 100)}% of peak</strong>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `);
  }

  if (biggestGap) {
    const bg = biggestGap.gain;
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Biggest opportunity - far from peak</div>
        <div class="stat-group-grid">
          <div class="stat-item">
            <span class="stat-item-label">Exercise</span>
            <span class="stat-item-value">${escapeHtml(biggestGap.entry.name)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Current 1RM</span>
            <span class="stat-item-value">${fmtNum(bg.current)} kg</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Peak 1RM</span>
            <span class="stat-item-value">${fmtNum(bg.peak)} kg</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Gap</span>
            <span class="stat-item-value delta-down">-${fmtNum(bg.peak - bg.current)} kg</span>
          </div>
        </div>
      </div>
    `);
  }

  el.innerHTML = parts.join("");
  el.hidden = false;
}

function buildLastSessionLookup() {
  const lookup = new Map();
  for (const workout of recentWorkouts) {
    const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];
    for (const exercise of exercises) {
      if (!exercise || typeof exercise !== "object") continue;
      const templateId = normalizeTemplateId(exercise.exercise_template_id);
      const nameKey = normalizeNameKey(exercise.name ?? exercise.title ?? "");
      const key = templateId || nameKey;
      if (!key || lookup.has(key)) continue;
      const sets = Array.isArray(exercise.sets) ? exercise.sets.filter(isObject) : [];
      lookup.set(key, {
        workout,
        exercise,
        sets,
      });
      if (templateId) lookup.set(templateId, lookup.get(key));
      if (nameKey) lookup.set(nameKey, lookup.get(key));
    }
  }
  return lookup;
}

function getLatestSessionForEntry(entry, lookup) {
  const templateId = exerciseTemplateKey(entry);
  return (
    lookup.get(templateId) ??
    lookup.get(normalizeNameKey(entry.name)) ??
    null
  );
}

function exerciseTemplateKey(entry) {
  return normalizeTemplateId(entry.templateId ?? exerciseIdByName.get(entry.name) ?? "");
}

function normalizeNameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function findTemplateId(name) {
  return exerciseIdByName.get(String(name)) ?? null;
}

function renderCard(entry) {
  const best = entry.best_set ?? {};
  const category = normalizeCategory(entry.category);
  const categoryClass = categoryClassFor(category);
  const hasWeight = best.weight_kg != null;
  const bestLine = hasWeight
    ? `${fmtNum(best.weight_kg)} kg × ${best.reps}`
    : `${best.reps ?? "—"} reps`;
  const oneRm = entry.estimated_one_rm_kg ?? best.weight_kg ?? null;
  const oneRmStr = oneRm != null ? `${fmtNum(oneRm)} kg` : "—";
  const date = best.workout_start_date ?? "";
  const tid = exerciseTemplateKey(entry);
  const gain = gainsCache?.[tid];

  return `
    <article class="exercise-card card" data-template-id="${escapeHtml(tid)}" data-exercise-name="${escapeHtml(entry.name)}">
      <div class="exercise-head">
        <div class="exercise-name">${escapeHtml(entry.name)}</div>
        <span class="exercise-category ${categoryClass}">${escapeHtml(category)}</span>
      </div>
      <div class="exercise-metrics">
        <div class="exercise-metric">
          <span class="exercise-metric-label">Best set</span>
          <span class="exercise-metric-value">${escapeHtml(bestLine)}</span>
          <span class="exercise-metric-subvalue">${escapeHtml(date || "No best-set date")}</span>
        </div>
        <div class="exercise-metric">
          <span class="exercise-metric-label">Est. 1RM</span>
          <span class="exercise-metric-value">${escapeHtml(oneRmStr)}</span>
          <span class="exercise-metric-subvalue">${escapeHtml(buildProgressionSummary(entry, gain))}</span>
        </div>
      </div>
      <div class="exercise-footer">
        <span class="exercise-recommendation">${escapeHtml(buildProgressionRecommendation(entry, getLatestSessionForEntry(entry, buildLastSessionLookup()), gain))}</span>
        <span class="exercise-progress">${escapeHtml(buildProgressionText(entry, gain))}</span>
      </div>
    </article>
  `;
}

function buildSetLine(set, options = {}) {
  if (!set || typeof set !== "object") return options.fallback ?? "—";
  const parts = [];
  const weight = parseFloatNumber(set.weight_kg);
  const reps = parseInteger(set.reps);
  const rpe = parseFloatNumber(set.rpe);
  if (weight != null) parts.push(`${fmtNum(weight)} kg`);
  if (reps != null) parts.push(`${reps} reps`);
  if (weight == null && reps == null) parts.push("Set");
  if (rpe != null) parts.push(`RPE ${fmtNum(rpe)}`);
  return parts.join(" · ");
}

function buildWorkoutSetLine(set) {
  return buildSetLine(set, { fallback: "Set" });
}

function normalizeCategory(value) {
  const category = String(value ?? "Strength").trim() || "Strength";
  if (/lower/i.test(category)) return "Lower body";
  if (/push/i.test(category)) return "Push";
  if (/pull/i.test(category)) return "Pull";
  if (/accessory/i.test(category)) return "Accessory";
  return category;
}

function categoryClassFor(category) {
  if (/lower/i.test(category)) return "cat-Lower";
  if (/push/i.test(category)) return "cat-Push";
  if (/pull/i.test(category)) return "cat-Pull";
  if (/accessory/i.test(category)) return "cat-Accessory";
  return "cat-Accessory";
}

function handleHevyRefresh() {
  return refreshHevy();
}

async function refreshHevy() {
  if (hevyRefreshButton) hevyRefreshButton.disabled = true;
  const workoutWindow = readStoredHevyWorkoutWindow();
  if (hevyRefreshStatus) {
    hevyRefreshStatus.textContent = `Refreshing Hevy... · ${formatHevyWorkoutWindowLabel(workoutWindow)}`;
  }
  try {
    const livePayload = await refreshHevyStrength(undefined, {
      workoutWindow,
    });
    if (livePayload.page_state?.kind === "missing") {
      entries = [];
      recentWorkouts = [];
      renderUnavailableStrength(
        livePayload.page_state.detail ?? "No strength data available",
      );
      renderSummary();
      renderHighlights();
      renderTabs();
      return;
    }
    entries = Array.isArray(livePayload.entries) ? livePayload.entries : [];
    recentWorkouts = Array.isArray(livePayload.recent_workouts)
      ? livePayload.recent_workouts
      : [];
    sourceLabel.textContent = `${livePayload.source ?? "Hevy"} · ${livePayload.snapshot_date ?? "unknown date"}`;
    statusBanner.textContent = `${entries.length} lifts · ${formatHevyRefreshLabel(livePayload)}`;
    syncHevyWindowUI(livePayload.refresh_window ?? workoutWindow, livePayload);
    controls?.removeAttribute("hidden");
    renderControls();
    renderSummary();
    renderHighlights();
    renderTabs();
    renderCurrentTab();
    await loadGains();
    renderHighlights();
    renderCurrentTab();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (hevyRefreshStatus) hevyRefreshStatus.textContent = message;
  } finally {
    if (hevyRefreshButton) hevyRefreshButton.disabled = false;
  }
}

function handleHevySetKey() {
  const current = readStoredHevyApiKey();
  const next = window.prompt("Paste your Hevy API key", current);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed) {
    if (hevyRefreshStatus) hevyRefreshStatus.textContent = "Hevy key not saved";
    return;
  }
  saveStoredHevyApiKey(trimmed);
  if (hevyRefreshStatus) {
    hevyRefreshStatus.textContent = "Hevy key saved locally";
  }
}

function handleHevyWindowChange() {
  const value = hevyWindowInput?.value ?? "";
  saveStoredHevyWorkoutWindow(value);
  syncHevyWindowUI(value);
}

function syncHevyWindowUI(windowValue, payload) {
  const normalizedWindow = formatHevyWorkoutWindowLabel(windowValue);
  if (hevyWindowInput) hevyWindowInput.value = String(windowValue);
  if (hevyWindowStatus) {
    const refreshLabel = payload ? formatHevyRefreshLabel(payload) : "";
    hevyWindowStatus.textContent = payload
      ? `Window ${normalizedWindow} · ${refreshLabel}`
      : `Window ${normalizedWindow}`;
  }
  if (hevyRefreshStatus && payload) {
    hevyRefreshStatus.textContent = `${formatHevyRefreshLabel(payload)} · ${normalizedWindow}`;
  } else if (hevyRefreshStatus && !payload) {
    hevyRefreshStatus.textContent = `Window ${normalizedWindow}`;
  }
}

function toggleView() {
  compactView = !compactView;
  grid?.classList.toggle("compact", compactView);
  document.querySelectorAll(".view-toggle").forEach((button) => {
    button.textContent = compactView ? "Grid" : "Compact";
  });
}

function renderExercisesFallback() {
  if (!grid) return;
  grid.innerHTML = `
    <div class="empty-state">
      <span class="empty-state-kicker">Exercises</span>
      <strong>No exercises match your search</strong>
      <p>Try a different category or clear the search filter.</p>
    </div>
  `;
}

function renderHistoryFallback() {
  if (!historyContent) return;
  historyContent.innerHTML = `
    <div class="empty-state">
      <span class="empty-state-kicker">History</span>
      <strong>No workouts yet</strong>
      <p>Sync your Hevy data to populate the workout timeline.</p>
    </div>
  `;
}

function renderHistoryOrExercises() {
  if (activeTab === "history") {
    renderHistory();
  } else {
    renderExercises();
  }
}

function buildProgressionSummaryText(gain) {
  if (!gain) return "No history file";
  if (gain.stalled) return "Stalled";
  if (gain.current == null || gain.peak == null) return "Building history";
  const gap = Math.max(0, gain.peak - gain.current);
  if (!gap) return "At peak";
  return `Gap ${fmtNum(gap)} kg`;
}

function roundToIncrement(value, increment) {
  return Math.round(value / increment) * increment;
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

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTemplateId(value) {
  const templateId = String(value ?? "").trim();
  return templateId ? templateId : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildWorkoutSetValue(set) {
  return buildWorkoutSetLine(set);
}

function renderWorkoutSetSummary(set) {
  return `<span class="workout-set">${escapeHtml(buildWorkoutSetValue(set))}</span>`;
}

function buildProgressionRecommendationForSession(entry, session, gain) {
  return buildProgressionRecommendation(entry, session, gain);
}

function renderTrendModal(name, history) {
  const oneRms = history
    .map((item) => item.estimated_one_rm_kg)
    .filter((value) => value != null);
  const weights = history.map((item) => item.weight_kg).filter((value) => value != null);
  const latest = history[history.length - 1];
  const firstOneRm = oneRms[0];
  const lastOneRm = oneRms[oneRms.length - 1];
  const oneRmChange = lastOneRm - firstOneRm;
  const oneRmPct = firstOneRm ? Math.round((oneRmChange / firstOneRm) * 100) : 0;
  const peak = Math.max(...oneRms);
  const trendUp = oneRmChange >= 0;
  const recent = history.slice(-10).reverse();

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content card">
      <div class="modal-header">
        <h2>${escapeHtml(name)}</h2>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="modal-progression">
        <span class="modal-progression-value ${trendUp ? "delta-up" : "delta-down"}">
          ${firstOneRm} kg → ${lastOneRm} kg
        </span>
        <span class="modal-progression-pct ${trendUp ? "delta-up" : "delta-down"}">
          ${trendUp ? "+" : ""}${oneRmPct}% over ${history.length} days
        </span>
      </div>
      ${
        oneRms.length > 1
          ? `
        <div class="modal-section">
          <p class="label">Estimated 1RM trend</p>
          ${renderSparkline(oneRms, 300, 72, { dots: true, labels: true, color: "var(--accent)" })}
        </div>
      `
          : ""
      }
      ${
        weights.length > 1
          ? `
        <div class="modal-section">
          <p class="label">Working weight trend</p>
          ${renderSparkline(weights, 300, 56, { dots: true, color: "var(--accent-2)" })}
        </div>
      `
          : ""
      }
      <div class="modal-stats">
        <div class="stat-item">
          <span class="stat-item-label">Current 1RM</span>
          <span class="stat-item-value">${lastOneRm} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label" title="Highest estimated 1RM ever recorded for this exercise">Peak 1RM</span>
          <span class="stat-item-value">${peak} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Start 1RM</span>
          <span class="stat-item-value">${firstOneRm} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Latest set</span>
          <span class="stat-item-value">${latest?.weight_kg ?? "—"} kg × ${latest?.reps ?? "—"}</span>
        </div>
      </div>
      <details class="modal-history">
        <summary><span class="label">Recent history (last ${recent.length})</span></summary>
        <div class="modal-history-list">
          ${recent
            .map(
              (item) => `
            <div class="modal-history-row">
              <span class="modal-history-date">${escapeHtml(String(item.date).slice(5))}</span>
              <span>${item.weight_kg != null ? `${item.weight_kg} kg × ${item.reps}` : `${item.reps} reps`}</span>
              <span class="modal-history-1rm">${item.estimated_one_rm_kg != null ? `${item.estimated_one_rm_kg} kg` : "—"}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </details>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest(".modal-close")) {
      modal.remove();
      document.body.focus();
    }
  });

  document.body.appendChild(modal);

  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length) {
    const first = focusable[0];
    setTimeout(() => first.focus(), 50);
  }

  document.addEventListener("keydown", function trap(event) {
    if (!document.querySelector(".modal-overlay")) {
      document.removeEventListener("keydown", trap);
      return;
    }
    if (event.key === "Escape") {
      const activeModal = document.querySelector(".modal-overlay");
      if (activeModal) {
        activeModal.remove();
        document.body.focus();
      }
      return;
    }
    if (event.key === "Tab" && focusable.length) {
      const focusables = document.querySelectorAll(
        '.modal-content button, .modal-content [href], .modal-content input, .modal-content select, .modal-content textarea, .modal-content [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

window.toggleView = toggleView;
export { escapeHtml, fmtNum as formatNum };
