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
import { loadAll, loadIndex, loadRange } from "./history.js";
import { buildProgressionState } from "./progression.js";

const strengthUrl = new URL("./strength.json", import.meta.url);
const grid = document.getElementById("strength-grid");
const historyContent = document.getElementById("history-content");
const historyWindowChip = document.getElementById("history-window-chip");
const historyResultsCount = document.getElementById("history-results-count");
const historySearchInput = document.getElementById("history-search");
const analyticsPanel = document.getElementById("strength-analytics");
const analyticsToggle = document.getElementById("strength-analytics-toggle");
const heroNote = document.getElementById("strength-hero-note");
const highlightsPanel = document.getElementById("strength-highlights");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");
const summaryEl = document.getElementById("strength-summary");
const controls = document.getElementById("strength-controls");
const heatmapSummary = document.getElementById("heatmap-summary");
const heatmapFigure = document.getElementById("heatmap-figure");
const heatmapDetail = document.getElementById("heatmap-detail");
const heatmapWindowControls = document.getElementById(
  "heatmap-window-controls",
);
const hevyRefreshButton = document.getElementById("refresh-hevy");
const hevySetKeyButton = document.getElementById("set-hevy-key");
const hevyWindowInput = document.getElementById("hevy-workout-window");
const hevyRefreshStatus = document.getElementById("hevy-refresh-status");
const hevyWindowStatus = document.getElementById("hevy-window-status");
const filterPills = document.getElementById("filter-pills");
const progressionGoalPills = document.getElementById("progression-goals");
const sortButtons = document.querySelectorAll(".sort-btn");
const searchInput = document.getElementById("strength-search");
const tabButtons = document.querySelectorAll(".strength-tab");
const tabPanels = document.querySelectorAll("[data-strength-tab-panel]");
const exerciseCatalogUrl = new URL(
  "./history/exercises/index.json",
  import.meta.url,
);
const heatmapSvgUrl = new URL("./assets/strength-heatmap.svg", import.meta.url);
const activeTabStorageKey = "personal-trainer:strength-active-tab";
const activeHeatmapZoneStorageKey = "personal-trainer:strength-heatmap-zone";
const analyticsVisibilityStorageKey =
  "personal-trainer:strength-show-analytics";

let entries = [];
let recentWorkouts = [];
let activeCategory = "All";
let activeSort = "date";
let activeTab = readStoredStrengthTab();
let searchQuery = "";
let historyQuery = "";
let compactView = false;
let gainsCache = null;
let exerciseIdByName = new Map();
let exerciseCategoryByName = new Map();
let exerciseCatalogLoaded = false;
let tabsBound = false;
let activeProgressionGoal = readStoredProgressionGoal();
let activeHeatmapWindow = readStoredHeatmapWindow();
let heatmapDataCache = new Map();
let heatmapPending = null;
let activeHeatmapZone = readStoredHeatmapZone();
let activeHeatmapSessionKey = null;
let activeHeatmapActivityOpen = false;
let heatmapSvgMarkup = null;
let heatmapSvgPending = null;
let heatmapSvgLoadState = "idle";
let showStrengthAnalytics = readStoredStrengthAnalytics();

const HEATMAP_WINDOWS = {
  "7d": { label: "7d", days: 7 },
  "30d": { label: "30d", days: 30 },
  all: { label: "All-time", days: null },
};

const HEATMAP_SCALE_STEPS = [
  { label: "Gray", tone: "is-gray" },
  { label: "Cool", tone: "is-cool" },
  { label: "Warm", tone: "is-warm" },
  { label: "Hot", tone: "is-hot" },
];

const HEATMAP_ZONES = [
  {
    id: "front-shoulders",
    label: "Delts",
    side: "front",
    left: "18%",
    top: "8%",
    width: "64%",
    height: "13%",
  },
  {
    id: "front-chest",
    label: "Chest",
    side: "front",
    left: "20%",
    top: "22%",
    width: "60%",
    height: "15%",
  },
  {
    id: "front-arms",
    label: "Biceps",
    side: "front",
    left: "6%",
    top: "24%",
    width: "14%",
    height: "34%",
  },
  {
    id: "front-core",
    label: "Abs",
    side: "front",
    left: "28%",
    top: "39%",
    width: "44%",
    height: "15%",
  },
  {
    id: "front-quads",
    label: "Quads",
    side: "front",
    left: "22%",
    top: "56%",
    width: "56%",
    height: "21%",
  },
  {
    id: "front-calves",
    label: "Calves",
    side: "front",
    left: "28%",
    top: "79%",
    width: "44%",
    height: "12%",
  },
  {
    id: "back-rear-delts",
    label: "Rear delts",
    side: "back",
    left: "18%",
    top: "8%",
    width: "64%",
    height: "13%",
  },
  {
    id: "back-upper-back",
    label: "Traps",
    side: "back",
    left: "18%",
    top: "22%",
    width: "64%",
    height: "15%",
  },
  {
    id: "back-lats",
    label: "Lats",
    side: "back",
    left: "14%",
    top: "34%",
    width: "72%",
    height: "16%",
  },
  {
    id: "back-arms",
    label: "Triceps",
    side: "back",
    left: "6%",
    top: "24%",
    width: "14%",
    height: "34%",
  },
  {
    id: "back-glutes",
    label: "Glutes",
    side: "back",
    left: "26%",
    top: "53%",
    width: "48%",
    height: "15%",
  },
  {
    id: "back-hamstrings",
    label: "Hamstrings",
    side: "back",
    left: "22%",
    top: "68%",
    width: "56%",
    height: "18%",
  },
  {
    id: "back-calves",
    label: "Calves",
    side: "back",
    left: "28%",
    top: "82%",
    width: "44%",
    height: "10%",
  },
];

const HEATMAP_REGION_TARGETS = {
  "front-shoulders": ["front-delts"],
  "front-chest": ["front-chest"],
  "front-arms": ["front-biceps"],
  "front-core": ["front-core"],
  "front-quads": ["front-quads"],
  "front-calves": ["front-calves"],
  "back-rear-delts": ["back-rear-delts"],
  "back-upper-back": ["back-traps"],
  "back-lats": ["back-lats"],
  "back-arms": ["back-triceps"],
  "back-glutes": ["back-glutes"],
  "back-hamstrings": ["back-hamstrings"],
  "back-calves": ["back-calves"],
};

loadExerciseCatalog();
loadStrength();

hevyRefreshButton?.addEventListener("click", handleHevyRefresh);
hevySetKeyButton?.addEventListener("click", handleHevySetKey);
hevyWindowInput?.addEventListener("change", handleHevyWindowChange);
historySearchInput?.addEventListener("input", () => {
  historyQuery = historySearchInput.value.toLowerCase().trim();
  renderHistory();
});
analyticsToggle?.addEventListener("click", () => {
  setStrengthAnalyticsVisible(!showStrengthAnalytics);
});
historyContent?.addEventListener("click", (event) => {
  const button = event.target.closest(".workout-exercise");
  if (!button) return;
  const payload = button.dataset.workoutExercise;
  if (!payload) return;
  try {
    renderWorkoutExerciseModal(JSON.parse(payload));
  } catch {
    // ignore malformed payloads
  }
});
renderStrengthAnalyticsVisibility();
heatmapWindowControls?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-heatmap-window]");
  if (!button) return;
  setHeatmapWindow(button.dataset.heatmapWindow ?? "30d");
});
heatmapDetail?.addEventListener("click", handleHeatmapDetailClick);
heatmapFigure?.addEventListener("click", handleHeatmapFigureClick);
heatmapFigure?.addEventListener("keydown", handleHeatmapFigureKeydown);
grid?.addEventListener("click", async (event) => {
  const card = event.target.closest(".exercise-card");
  if (!card) return;
  if (
    event.target.closest(
      ".pill, .sort-btn, .search-input, .filter-pills, .strength-tab",
    )
  ) {
    return;
  }
  const templateId = card.dataset.templateId;
  if (!templateId) return;
  try {
    const response = await fetch(
      `./history/exercises/${templateId}.json?v=${Date.now()}`,
    );
    if (!response.ok) {
      renderEmptyModal(card.dataset.exerciseName ?? templateId);
      return;
    }
    const history = await response.json();
    if (!Array.isArray(history) || history.length === 0) {
      renderEmptyModal(card.dataset.exerciseName ?? templateId);
      return;
    }
    renderTrendModal(card.dataset.exerciseName ?? templateId, history);
  } catch {
    renderEmptyModal(card.dataset.exerciseName ?? templateId);
  }
});

async function loadStrength() {
  try {
    const response = await fetch(`${strengthUrl.pathname}?v=${Date.now()}`);
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

    sourceLabel.textContent = `${payload.source ?? "Hevy"} · ${
      payload.snapshot_date ?? "unknown date"
    }`;
    sourceLabel.classList.remove("skeleton");
    statusBanner.textContent = `${
      (payload.entries ?? []).length
    } lifts · ${formatHevyRefreshLabel(payload)}`;
    statusBanner.classList.remove("skeleton");
    syncHevyWindowUI(
      payload.refresh_window ?? readStoredHevyWorkoutWindow(),
      payload,
    );
    entries = Array.isArray(payload.entries) ? payload.entries : [];
    recentWorkouts = Array.isArray(payload.recent_workouts)
      ? payload.recent_workouts
      : [];
    resetHeatmapCache();

    renderControls();
    renderSummary();
    renderHighlights();
    renderCoachNote();
    renderStrengthAnalyticsVisibility();
    renderTabs();
    renderCurrentTab();
    controls.removeAttribute("hidden");
    loadExerciseCatalog().then(() => {
      renderSummary();
      renderHighlights();
      renderCoachNote();
      renderStrengthAnalyticsVisibility();
      renderCurrentTab();
    });
    loadGains().then(() => {
      renderSummary();
      renderHighlights();
      renderCoachNote();
      renderStrengthAnalyticsVisibility();
      renderCurrentTab();
    });
  } catch {
    renderUnavailableStrength("Could not load strength data");
  }
}

function renderUnavailableStrength(message) {
  entries = [];
  recentWorkouts = [];
  resetHeatmapCache();
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
  renderStrengthAnalyticsVisibility();
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
    exerciseCategoryByName = new Map(
      exercises
        .filter((exercise) => exercise?.name)
        .map((exercise) => [
          String(exercise.name),
          String(exercise.category ?? ""),
        ]),
    );
  } catch {
    exerciseIdByName = new Map();
    exerciseCategoryByName = new Map();
  } finally {
    exerciseCatalogLoaded = true;
  }
  return exerciseIdByName;
}

function renderControls() {
  renderProgressionGoalControls();
  const counts = {};
  entries.forEach((entry) => {
    const category = normalizeCategory(entry.category);
    counts[category] = (counts[category] || 0) + 1;
  });
  const categories = [
    "All",
    ...new Set(
      entries.map((entry) => normalizeCategory(entry.category)).filter(Boolean),
    ),
  ];

  if (filterPills) {
    filterPills.innerHTML = categories
      .map((category) => {
        const count =
          category === "All" ? entries.length : (counts[category] ?? 0);
        return `<button class="pill${
          category === activeCategory ? " is-active" : ""
        }" data-category="${escapeHtml(category)}" type="button">${escapeHtml(
          category,
        )} (${count})</button>`;
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

  progressionGoalPills?.addEventListener("click", (event) => {
    const btn = event.target.closest(".progression-goal-btn");
    if (!btn) return;
    activeProgressionGoal = normalizeProgressionGoal(btn.dataset.goal);
    saveStoredProgressionGoal(activeProgressionGoal);
    renderProgressionGoalControls();
    renderCurrentTab();
    renderCoachNote();
  });

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab ?? "history");
    });
  });
}

function renderProgressionGoalControls() {
  if (!progressionGoalPills) return;

  const goals = ["strength", "hypertrophy", "endurance"];
  progressionGoalPills.innerHTML = goals
    .map((goal) => {
      const isActive = goal === activeProgressionGoal;
      return `<button class="pill progression-goal-btn${
        isActive ? " is-active" : ""
      }" data-goal="${escapeHtml(goal)}" type="button">${escapeHtml(
        progressionGoalLabel(goal),
      )}</button>`;
    })
    .join("");
}

function renderSummary() {
  if (!summaryEl) return;

  if (!entries.length && !recentWorkouts.length) {
    summaryEl.innerHTML = "";
    return;
  }

  const categories = new Set(
    entries.map((entry) => normalizeCategory(entry.category)).filter(Boolean),
  );
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
      value:
        topMover?.gain?.gain_pct != null
          ? `+${fmtNum(topMover.gain.gain_pct)}%`
          : "—",
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
      value: `${fmtNum(
        topEntry?.estimated_one_rm_kg ?? topEntry?.best_set?.weight_kg ?? 0,
      )} kg`,
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
          <span class="summary-tile-subvalue">${escapeHtml(
            tile.subvalue,
          )}</span>
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
      value:
        topMover.gain.gain_pct != null
          ? `+${fmtNum(topMover.gain.gain_pct)}%`
          : "Rising",
      subvalue: `${topMover.entry.name} · ${fmtNum(
        topMover.gain.current ?? 0,
      )} kg now`,
    });
  }

  if (latestWorkout) {
    tiles.push({
      label: "Most recent",
      value: workoutDate(latestWorkout),
      subvalue: `${workoutTitle(latestWorkout)} · ${workoutSummaryExerciseCount(
        latestWorkout,
      )} exercises`,
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
          <span class="strength-highlight-label">${escapeHtml(
            tile.label,
          )}</span>
          <strong class="strength-highlight-value">${escapeHtml(
            tile.value,
          )}</strong>
          <span class="strength-highlight-subvalue">${escapeHtml(
            tile.subvalue,
          )}</span>
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
      `${topMover.entry.name} is leading the field at +${fmtNum(
        topMover.gain.gain_pct,
      )}%`,
    );
  }

  if (stalledLift?.gain?.current != null && stalledLift?.gain?.peak != null) {
    const gap = Math.max(0, stalledLift.gain.peak - stalledLift.gain.current);
    fragments.push(
      `${stalledLift.entry.name} is ${
        gap ? `${fmtNum(gap)} kg off peak` : "back at peak"
      }`,
    );
  }

  if (latestWorkout) {
    fragments.push(
      `latest session: ${workoutTitle(latestWorkout)} on ${workoutDate(
        latestWorkout,
      )}`,
    );
  }

  const goalLabel = progressionGoalLabel(activeProgressionGoal);
  heroNote.textContent = [
    `${goalLabel} goal active`,
    fragments.length > 0
      ? fragments.join(" · ")
      : "Sync Hevy to turn this into a live coaching view.",
  ].join(" · ");
  heroNote.classList.remove("skeleton");
}

function setStrengthAnalyticsVisible(visible) {
  showStrengthAnalytics = visible;
  saveStoredStrengthAnalytics(visible);
  renderStrengthAnalyticsVisibility();
}

function renderStrengthAnalyticsVisibility() {
  if (analyticsPanel) {
    analyticsPanel.classList.toggle("is-collapsed", !showStrengthAnalytics);
  }
  if (analyticsToggle) {
    analyticsToggle.textContent = showStrengthAnalytics
      ? "Hide analytics"
      : "Show analytics";
    analyticsToggle.setAttribute(
      "aria-expanded",
      showStrengthAnalytics ? "true" : "false",
    );
  }
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
  activeTab = ["history", "heatmap", "exercises"].includes(tab)
    ? tab
    : "history";
  saveStoredStrengthTab(activeTab);
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
  if (activeTab === "history") {
    renderHistory();
  } else if (activeTab === "heatmap") {
    renderHeatmap();
  } else {
    renderExercises();
  }
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
  const activeWindow = formatHevyWorkoutWindowLabel(
    readStoredHevyWorkoutWindow(),
  );
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

function renderHeatmap() {
  if (!heatmapSummary || !heatmapFigure || !heatmapDetail) return;
  renderHeatmapWindowControls();

  const cached = heatmapDataCache.get(activeHeatmapWindow);
  if (!cached) {
    renderHeatmapLoading();
    if (heatmapPending !== activeHeatmapWindow) {
      const windowKey = activeHeatmapWindow;
      heatmapPending = windowKey;
      loadHeatmapWindow(windowKey)
        .then((data) => {
          heatmapDataCache.set(windowKey, data);
        })
        .catch(() => {
          heatmapDataCache.set(windowKey, buildEmptyHeatmapData(windowKey));
        })
        .finally(() => {
          if (heatmapPending === windowKey) {
            heatmapPending = null;
          }
          if (activeTab === "heatmap" && activeHeatmapWindow === windowKey) {
            renderHeatmap();
          }
        });
    }
    return;
  }

  const data = cached;
  if (!data.zones.length || data.totalVolume <= 0) {
    renderHeatmapEmpty(data);
    return;
  }

  if (
    !activeHeatmapZone ||
    !data.zones.some((zone) => zone.id === activeHeatmapZone)
  ) {
    activeHeatmapZone = data.topZone?.id ?? data.zones[0]?.id ?? null;
    if (activeHeatmapZone) {
      saveStoredHeatmapZone(activeHeatmapZone);
    }
  }

  renderHeatmapContent(data);
}

function renderHeatmapLoading() {
  void ensureHeatmapSvg();
  if (heatmapSummary) {
    heatmapSummary.innerHTML = `
      <div class="heatmap-summary-card skeleton" style="min-height: 84px"></div>
      <div class="heatmap-summary-card skeleton" style="min-height: 84px"></div>
      <div class="heatmap-summary-card skeleton" style="min-height: 84px"></div>
    `;
  }
  if (heatmapFigure) {
    heatmapFigure.innerHTML = `
      <div class="skeleton skeleton-card heatmap-figure-skeleton" style="min-height: 640px"></div>
    `;
  }
  if (heatmapDetail) {
    heatmapDetail.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-kicker">Heatmap</span>
        <strong>Loading muscle-group volume</strong>
        <p>Computing the selected window from the historical snapshots.</p>
      </div>
    `;
  }
}

function renderHeatmapEmpty(data) {
  if (heatmapSummary) {
    heatmapSummary.innerHTML = `
      <div class="heatmap-summary-card">
        <span class="heatmap-summary-label">Window</span>
        <span class="heatmap-summary-value">${escapeHtml(
          heatmapWindowLabel(activeHeatmapWindow),
        )}</span>
        <span class="heatmap-summary-subvalue">No workouts found in the selected window</span>
      </div>
      <div class="heatmap-summary-card">
        <span class="heatmap-summary-label">Total volume</span>
        <span class="heatmap-summary-value">0 kg</span>
        <span class="heatmap-summary-subvalue">Nothing to color yet</span>
      </div>
      <div class="heatmap-summary-card">
        <span class="heatmap-summary-label">Top zone</span>
        <span class="heatmap-summary-value">None</span>
        <span class="heatmap-summary-subvalue">Sync more strength sessions</span>
      </div>
    `;
  }
  if (heatmapFigure) {
    renderHeatmapFigure(data);
  }
  if (heatmapDetail) {
    heatmapDetail.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-kicker">Heatmap</span>
        <strong>No volume to display</strong>
        <p>
          This window has no recorded load yet, so the map stays gray. Try a
          wider time window or sync more workouts.
        </p>
      </div>
    `;
  }
}

function renderHeatmapContent(data) {
  renderHeatmapSummary(data);
  renderHeatmapFigure(data);
  if (heatmapDetail) {
    const selected =
      data.zones.find((zone) => zone.id === activeHeatmapZone) ??
      data.topZone ??
      data.zones[0] ??
      null;
    if (selected) {
      const sessionKeys = new Set(
        (selected.sessions ?? []).map((session) => session.key),
      );
      if (
        !activeHeatmapSessionKey ||
        !sessionKeys.has(activeHeatmapSessionKey)
      ) {
        activeHeatmapSessionKey = selected.sessions?.[0]?.key ?? null;
      }
    } else {
      activeHeatmapSessionKey = null;
      activeHeatmapActivityOpen = false;
    }
    heatmapDetail.innerHTML = selected
      ? renderHeatmapDetail(selected)
      : `
        <div class="empty-state">
          <span class="empty-state-kicker">Heatmap</span>
          <strong>Select a body region</strong>
          <p>Tap a zone to inspect volume and the exercises feeding it.</p>
        </div>
      `;
  }
}

function renderHeatmapFigure(data) {
  if (!heatmapFigure) return;

  if (heatmapSvgLoadState === "failed" || !heatmapSvgMarkup) {
    if (heatmapSvgLoadState === "idle") {
      void ensureHeatmapSvg().then(() => {
        if (activeTab === "heatmap" && activeHeatmapWindow === data.window) {
          renderHeatmapFigure(data);
        }
      });
    }

    heatmapFigure.innerHTML = `
      <div class="empty-state heatmap-figure-empty">
        <span class="empty-state-kicker">Heatmap</span>
        <strong>Loading body map</strong>
        <p>The SVG asset is still loading.</p>
      </div>
    `;
    return;
  }

  heatmapFigure.innerHTML = `
    ${renderHeatmapLegend(data)}
    ${heatmapSvgMarkup}
  `;
  const svg = heatmapFigure.querySelector("svg");
  if (!svg) return;

  svg.classList.add("strength-heatmap-svg");
  decorateHeatmapSvg(svg, data);
}

function renderHeatmapLegend(data) {
  const note =
    data.totalVolume > 0
      ? "Intensity is relative to the strongest region in this window."
      : "Gray means this window has no recorded load yet.";
  return `
    <div id="heatmap-legend" class="heatmap-legend" aria-label="Heatmap color scale">
      <div class="heatmap-legend-head">
        <span class="heatmap-legend-label heatmap-legend-kicker">Scale</span>
        <p class="heatmap-legend-copy">${escapeHtml(note)}</p>
      </div>
      ${HEATMAP_SCALE_STEPS.map(
        (step) => `
          <div class="heatmap-legend-item">
            <span class="heatmap-legend-swatch ${
              step.tone
            }" aria-hidden="true"></span>
            <span class="heatmap-legend-label">${escapeHtml(step.label)}</span>
          </div>
        `,
      ).join("")}
    </div>
  `;
}

function renderHeatmapSummary(data) {
  if (!heatmapSummary) return;
  heatmapSummary.innerHTML = `
    <div class="heatmap-summary-card">
      <span class="heatmap-summary-label">Window</span>
      <span class="heatmap-summary-value">${escapeHtml(
        heatmapWindowLabel(data.window),
      )}</span>
      <span class="heatmap-summary-subvalue">${escapeHtml(
        pluralize(data.workoutCount, "workout"),
      )} · ${escapeHtml(pluralize(data.exerciseCount, "exercise"))}</span>
    </div>
    <div class="heatmap-summary-card">
      <span class="heatmap-summary-label">Load</span>
      <span class="heatmap-summary-value">${escapeHtml(
        formatVolume(data.totalVolume),
      )}</span>
      <span class="heatmap-summary-subvalue">${escapeHtml(
        pluralize(data.setCount, "set"),
      )} weighted by load</span>
    </div>
  `;
}

function renderHeatmapDetail(zone) {
  const sessions = Array.isArray(zone.sessions) ? zone.sessions : [];
  const selectedSession =
    sessions.find((session) => session.key === activeHeatmapSessionKey) ??
    sessions[0] ??
    null;
  return `
    <div class="heatmap-detail-head">
      <span class="heatmap-summary-label">${escapeHtml(
        zone.side === "front" ? "Front" : "Back",
      )} region</span>
      <span class="heatmap-detail-region-pill">${escapeHtml(zone.label)}</span>
      <div class="heatmap-detail-title">${escapeHtml(zone.label)}</div>
      <p class="heatmap-detail-copy">
        ${escapeHtml(
          zone.volume > 0
            ? "Load accumulated in the selected window."
            : "No work landed here in the selected window yet.",
        )}
      </p>
    </div>
    ${
      zone.volume <= 0
        ? `
      <div class="heatmap-detail-tip">
        Try 30d or all-time if you want more context.
      </div>
    `
        : ""
    }
    <div class="heatmap-detail-grid">
      <div class="heatmap-detail-stat">
        <span class="heatmap-detail-stat-label">Weighted volume</span>
        <span class="heatmap-detail-stat-value">${escapeHtml(
          formatVolume(zone.volume),
        )}</span>
      </div>
      <div class="heatmap-detail-stat">
        <span class="heatmap-detail-stat-label">Share of total load</span>
        <span class="heatmap-detail-stat-value">${escapeHtml(
          formatPct(zone.share),
        )}</span>
      </div>
    </div>
    ${renderHeatmapActivity(zone, sessions, selectedSession)}
  `;
}

function renderHeatmapActivity(zone, sessions, selectedSession) {
  const sessionCount = sessions.length;
  const sessionSummary =
    sessionCount > 0
      ? `${pluralize(sessionCount, "session")} · ${pluralize(
          zone.exerciseCount,
          "exercise",
        )}`
      : "No sessions in this window";
  const isOpen = activeHeatmapActivityOpen && sessionCount > 0;
  return `
    <div class="heatmap-activity">
      <button
        class="heatmap-activity-toggle"
        type="button"
        data-heatmap-activity-toggle="true"
        aria-expanded="${isOpen ? "true" : "false"}"
      >
        <span class="heatmap-activity-label">Activity</span>
        <span class="heatmap-activity-copy">${escapeHtml(sessionSummary)}</span>
      </button>
      ${
        isOpen && sessionCount
          ? `
        <div class="heatmap-session-list">
          ${sessions
            .map(
              (session) => `
                ${renderHeatmapSessionButton(
                  session,
                  zone,
                  session.key === selectedSession?.key,
                )}
              `,
            )
            .join("")}
        </div>
      `
          : `
        <div class="heatmap-activity-hint">
          Tap Activity to browse sessions for this region.
        </div>
      `
      }
    </div>
  `;
}

function renderHeatmapSessionButton(session, zone, isActive) {
  const exercises = filterHeatmapSessionExercises(session, zone);
  return `
    <div class="heatmap-session-thread">
                <button
                  class="heatmap-session-item${isActive ? " is-active" : ""}"
                  type="button"
                  data-heatmap-session="${escapeHtml(session.key)}"
                >
                  <span class="heatmap-session-date">${escapeHtml(
                    session.date || "Unknown date",
                  )}</span>
                  <span class="heatmap-session-title">${escapeHtml(
                    session.title || "Workout",
                  )}</span>
                  <span class="heatmap-session-meta">${escapeHtml(
                    pluralize(exercises.length, "exercise"),
                  )}</span>
                </button>
      ${isActive ? renderHeatmapSessionDetail(session, zone) : ""}
    </div>
  `;
}

function renderHeatmapSessionDetail(session, zone) {
  const exercises = filterHeatmapSessionExercises(session, zone);
  return `
    <div class="heatmap-session-detail-head">
      <span class="heatmap-session-detail-label">Selected session</span>
      <strong>${escapeHtml(session.title || "Workout")}</strong>
      <span class="heatmap-session-detail-meta">${escapeHtml(
        session.date || "Unknown date",
      )}</span>
    </div>
    <div class="heatmap-session-exercises">
      ${
        exercises.length
          ? exercises
              .map((exercise) =>
                renderWorkoutExercise(
                  exercise,
                  session.date || "Unknown date",
                  session.title || "Workout",
                ),
              )
              .join("")
          : `
            <div class="heatmap-session-empty">
              No exercises recorded for this session.
            </div>
          `
      }
    </div>
  `;
}

function filterHeatmapSessionExercises(session, zone) {
  const exercises = Array.isArray(session?.exercises)
    ? session.exercises.filter(isObject)
    : [];
  if (!zone) return exercises;
  return exercises.filter((exercise) => {
    const targets = resolveHeatmapTargets(exercise);
    return targets.some((target) => target.id === zone.id);
  });
}

function renderHeatmapWindowControls() {
  if (!heatmapWindowControls) return;
  heatmapWindowControls
    .querySelectorAll("[data-heatmap-window]")
    .forEach((button) => {
      const isActive = button.dataset.heatmapWindow === activeHeatmapWindow;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    });
}

async function ensureHeatmapSvg() {
  if (heatmapSvgLoadState === "loaded") return heatmapSvgMarkup;
  if (heatmapSvgLoadState === "failed") return null;
  if (heatmapSvgPending) return heatmapSvgPending;

  heatmapSvgLoadState = "loading";
  heatmapSvgPending = fetch(`${heatmapSvgUrl.href}?v=${Date.now()}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load heatmap SVG: ${response.status}`);
      }
      return response.text();
    })
    .then((markup) => {
      heatmapSvgMarkup = markup;
      heatmapSvgLoadState = "loaded";
      return markup;
    })
    .catch(() => {
      heatmapSvgMarkup = null;
      heatmapSvgLoadState = "failed";
      return null;
    })
    .finally(() => {
      heatmapSvgPending = null;
    });

  return heatmapSvgPending;
}

function decorateHeatmapSvg(svg, data) {
  const selectedZone =
    data.zones.find((zone) => zone.id === activeHeatmapZone) ?? null;
  const selectedZoneId = selectedZone?.id ?? null;

  for (const zone of data.zones) {
    const targetIds = HEATMAP_REGION_TARGETS[zone.id] ?? [];
    const fill = getHeatmapFill(zone);
    const isSelected = zone.id === selectedZoneId;

    for (const targetId of targetIds) {
      const region = svg.querySelector(`#${targetId}`);
      if (!region) continue;

      region.setAttribute("data-heatmap-region", zone.id);
      region.classList.add("heatmap-region");
      region.classList.toggle("is-selected", isSelected);
      region.classList.toggle("is-empty", zone.volume <= 0);
      region.setAttribute("role", "button");
      region.setAttribute("tabindex", "0");
      region.setAttribute("aria-pressed", isSelected ? "true" : "false");
      region.setAttribute(
        "aria-label",
        `${zone.label}, ${formatVolume(zone.volume)}, ${pluralize(
          zone.workoutCount,
          "session",
        )}`,
      );

      region.querySelectorAll(".muscle").forEach((path) => {
        path.style.fill = fill;
        path.style.fillOpacity = zone.volume > 0 ? "1" : "0.42";
      });
    }
  }
}

function getHeatmapFill(zone) {
  const palette = {
    "is-gray": [136, 145, 165],
    "is-cool": [84, 197, 212],
    "is-warm": [255, 177, 76],
    "is-hot": [255, 107, 97],
  };
  const base = palette[zone.intensityClass] ?? palette["is-gray"];
  const alpha =
    zone.volume <= 0
      ? 0.34
      : Math.min(0.86, 0.28 + Math.max(zone.heatmapStrength ?? 0, 0));
  return `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha.toFixed(2)})`;
}

function selectHeatmapRegion(regionId) {
  if (!regionId) return;
  activeHeatmapZone = regionId;
  activeHeatmapSessionKey = null;
  activeHeatmapActivityOpen = false;
  saveStoredHeatmapZone(regionId);
  const data = heatmapDataCache.get(activeHeatmapWindow);
  if (!data) return;
  if (data.totalVolume <= 0) {
    renderHeatmapEmpty(data);
    return;
  }
  renderHeatmapContent(data);
}

function handleHeatmapFigureClick(event) {
  const region = event.target.closest?.("[data-heatmap-region]");
  if (!region) return;
  selectHeatmapRegion(region.getAttribute("data-heatmap-region"));
}

function handleHeatmapFigureKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const region = event.target.closest?.("[data-heatmap-region]");
  if (!region) return;
  event.preventDefault();
  selectHeatmapRegion(region.getAttribute("data-heatmap-region"));
}

function handleHeatmapDetailClick(event) {
  const exerciseButton = event.target.closest?.(".workout-exercise");
  if (exerciseButton) {
    const payload = exerciseButton.dataset.workoutExercise;
    if (!payload) return;
    try {
      renderWorkoutExerciseModal(JSON.parse(payload));
    } catch {
      // ignore malformed payloads
    }
    return;
  }

  const toggle = event.target.closest?.("[data-heatmap-activity-toggle]");
  if (toggle) {
    activeHeatmapActivityOpen = !activeHeatmapActivityOpen;
    const data = heatmapDataCache.get(activeHeatmapWindow);
    if (data) {
      renderHeatmapContent(data);
    }
    return;
  }

  const sessionButton = event.target.closest?.("[data-heatmap-session]");
  if (!sessionButton) return;
  const sessionKey = sessionButton.getAttribute("data-heatmap-session");
  if (!sessionKey) return;
  activeHeatmapSessionKey = sessionKey;
  activeHeatmapActivityOpen = true;
  const data = heatmapDataCache.get(activeHeatmapWindow);
  if (data) {
    renderHeatmapContent(data);
  }
}

function resetHeatmapCache() {
  heatmapDataCache = new Map();
  heatmapPending = null;
  activeHeatmapSessionKey = null;
  activeHeatmapActivityOpen = false;
}

function setHeatmapWindow(windowKey) {
  const normalized = normalizeHeatmapWindow(windowKey);
  if (normalized === activeHeatmapWindow) return;
  activeHeatmapWindow = normalized;
  saveStoredHeatmapWindow(normalized);
  renderHeatmapWindowControls();
  renderHeatmap();
}

async function loadHeatmapWindow(windowKey) {
  const snapshots = await loadHeatmapSnapshots(windowKey);
  const liveWorkouts = Array.isArray(recentWorkouts) ? recentWorkouts : [];
  return buildHeatmapData(windowKey, snapshots, liveWorkouts);
}

async function loadHeatmapSnapshots(windowKey) {
  const normalized = normalizeHeatmapWindow(windowKey);
  if (normalized === "all") {
    return loadAll();
  }

  const index = await loadIndex();
  const dates = Array.isArray(index?.dates) ? index.dates : [];
  const latestDate = dates.at(-1);
  if (!latestDate) return [];

  const windowDays = HEATMAP_WINDOWS[normalized]?.days ?? 30;
  const end = new Date(`${latestDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return [];
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  const startDate = start.toISOString().slice(0, 10);
  return loadRange(startDate, latestDate);
}

function buildHeatmapData(windowKey, snapshots, liveWorkouts) {
  const normalized = normalizeHeatmapWindow(windowKey);
  const orderedSnapshots = [...snapshots].sort((a, b) =>
    String(a?.snapshot_date ?? "").localeCompare(
      String(b?.snapshot_date ?? ""),
    ),
  );
  const liveFallbackWeight = orderedSnapshots
    .map((snapshot) => parseFloatNumber(snapshot?.athlete?.body_weight_kg))
    .filter((value) => value != null)
    .at(-1);
  const workouts = new Map();

  for (const snapshot of orderedSnapshots) {
    const snapshotWeight =
      parseFloatNumber(snapshot?.athlete?.body_weight_kg) ?? liveFallbackWeight;
    const sourceWorkouts = Array.isArray(snapshot?.hevy?.recent_workouts)
      ? snapshot.hevy.recent_workouts
      : [];
    for (const workout of sourceWorkouts) {
      const key = workoutKey(workout);
      if (!key) continue;
      workouts.set(key, {
        workout,
        workoutDate:
          workoutDateFromWorkout(workout) ?? snapshot?.snapshot_date ?? "",
        bodyWeightKg: snapshotWeight,
      });
    }
  }

  const liveWeight = liveFallbackWeight;
  for (const workout of liveWorkouts) {
    const key = workoutKey(workout);
    if (!key) continue;
    workouts.set(key, {
      workout,
      workoutDate:
        workoutDateFromWorkout(workout) ??
        String(workout?.start_time ?? "").slice(0, 10),
      bodyWeightKg: liveWeight ?? liveFallbackWeight ?? null,
    });
  }

  const windowEnd =
    [...orderedSnapshots, ...liveWorkouts]
      .map(
        (item) =>
          workoutDateFromWorkout(item) ||
          String(item?.snapshot_date ?? "").trim(),
      )
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
  const windowStart = windowStartDate(normalized, windowEnd);
  const zoneStats = new Map(
    HEATMAP_ZONES.map((zone) => [
      zone.id,
      {
        ...zone,
        volume: 0,
        setCount: 0,
        workoutKeys: new Set(),
        exerciseKeys: new Set(),
        sessions: new Map(),
        exerciseTotals: new Map(),
        lastTrained: null,
      },
    ]),
  );
  let totalVolume = 0;
  let totalSets = 0;
  let workoutCount = 0;
  let exerciseCount = 0;

  for (const { workout, workoutDate, bodyWeightKg } of workouts.values()) {
    if (windowStart && workoutDate && workoutDate < windowStart) continue;
    if (windowEnd && workoutDate && workoutDate > windowEnd) continue;
    const workoutExercises = Array.isArray(workout?.exercises)
      ? workout.exercises.filter(isObject)
      : [];
    if (!workoutExercises.length) continue;

    workoutCount += 1;
    const workoutId = workoutKey(workout);
    const workoutTitleValue = workoutTitle(workout);

    for (const exercise of workoutExercises) {
      const targets = resolveHeatmapTargets(exercise);
      if (!targets.length) continue;
      const sets = Array.isArray(exercise.sets)
        ? exercise.sets.filter(isObject)
        : [];
      if (!sets.length) continue;

      exerciseCount += 1;
      const exerciseVolume = computeExerciseVolume(exercise, bodyWeightKg);
      totalVolume += exerciseVolume;
      totalSets += sets.length;
      const exerciseKey = normalizeNameKey(
        `${exercise.exercise_template_id ?? ""}:${
          exercise.name ?? exercise.title ?? ""
        }`,
      );
      const targetTotal =
        targets.reduce((sum, target) => sum + target.share, 0) || 1;

      for (const target of targets) {
        const zone = zoneStats.get(target.id);
        if (!zone) continue;
        const zoneVolume = (exerciseVolume * target.share) / targetTotal;
        zone.volume += zoneVolume;
        zone.setCount += sets.length;
        if (workoutId) zone.workoutKeys.add(workoutId);
        if (exerciseKey) zone.exerciseKeys.add(exerciseKey);
        if (workoutId) {
          const session = zone.sessions.get(workoutId) ?? {
            key: workoutId,
            title: workoutTitleValue,
            date: workoutDate,
            workout: isObject(workout) ? workout : {},
            exercises: workoutExercises,
            volume: 0,
          };
          session.volume += zoneVolume;
          zone.sessions.set(workoutId, session);
        }
        if (
          workoutDate &&
          (!zone.lastTrained || workoutDate > zone.lastTrained)
        ) {
          zone.lastTrained = workoutDate;
        }
        const exerciseName = String(
          exercise.name ?? exercise.title ?? "Exercise",
        );
        zone.exerciseTotals.set(
          exerciseName,
          (zone.exerciseTotals.get(exerciseName) ?? 0) + zoneVolume,
        );
      }
    }
  }

  const zones = [...zoneStats.values()].map((zone) => {
    const share = totalVolume > 0 ? zone.volume / totalVolume : 0;
    const maxVolume = Math.max(
      ...[...zoneStats.values()].map((item) => item.volume),
      0,
    );
    const ratio = maxVolume > 0 ? zone.volume / maxVolume : 0;
    const intensityClass = heatmapIntensityClass(zone.volume, maxVolume);
    const heatmapStrength =
      zone.volume <= 0 ? 0.16 : Math.min(0.28 + ratio * 0.55, 0.86);
    return {
      ...zone,
      share,
      workoutCount: zone.workoutKeys.size,
      exerciseCount: zone.exerciseKeys.size,
      sessions: [...zone.sessions.values()].sort(
        (a, b) =>
          String(b.date ?? "").localeCompare(String(a.date ?? "")) ||
          String(b.key ?? "").localeCompare(String(a.key ?? "")),
      ),
      topExercises: [...zone.exerciseTotals.entries()]
        .map(([name, volume]) => ({ name, volume }))
        .sort((a, b) => b.volume - a.volume),
      heatmapLabel:
        intensityClass === "is-hot"
          ? "Hot"
          : intensityClass === "is-warm"
            ? "Warm"
            : intensityClass === "is-cool"
              ? "Cool"
              : "Gray",
      heatmapStrength,
      intensityClass,
    };
  });

  const topZone = [...zones].sort((a, b) => b.volume - a.volume)[0] ?? null;
  return {
    window: normalized,
    startDate: windowStart,
    endDate: windowEnd,
    workoutCount,
    exerciseCount,
    setCount: totalSets,
    totalVolume,
    zones,
    topZone,
  };
}

function buildEmptyHeatmapData(windowKey) {
  const zones = HEATMAP_ZONES.map((zone) => ({
    ...zone,
    volume: 0,
    share: 0,
    workoutCount: 0,
    exerciseCount: 0,
    setCount: 0,
    lastTrained: null,
    sessions: [],
    topExercises: [],
    heatmapLabel: "Gray",
    heatmapStrength: 0.16,
    intensityClass: "is-gray",
  }));
  return {
    window: normalizeHeatmapWindow(windowKey),
    startDate: null,
    endDate: null,
    workoutCount: 0,
    exerciseCount: 0,
    setCount: 0,
    totalVolume: 0,
    zones,
    topZone: null,
  };
}

function normalizeHeatmapWindow(windowKey) {
  return windowKey === "7d" || windowKey === "30d" || windowKey === "all"
    ? windowKey
    : "30d";
}

function heatmapWindowLabel(windowKey) {
  return HEATMAP_WINDOWS[normalizeHeatmapWindow(windowKey)]?.label ?? "30d";
}

function windowStartDate(windowKey, endDate) {
  const normalized = normalizeHeatmapWindow(windowKey);
  if (normalized === "all" || !endDate) return null;
  const windowDays = HEATMAP_WINDOWS[normalized]?.days ?? 30;
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return null;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return start.toISOString().slice(0, 10);
}

function workoutKey(workout) {
  if (!isObject(workout)) return "";
  const startTime = String(
    workout.start_time ?? workout.startTime ?? "",
  ).trim();
  const title = String(workout.title ?? workout.name ?? "").trim();
  return `${startTime}|${title}`.trim();
}

function workoutDateFromWorkout(workout) {
  return String(
    workout?.start_time?.slice?.(0, 10) ??
      workout?.start_date?.slice?.(0, 10) ??
      workout?.workout_start_date ??
      "",
  ).trim();
}

function computeExerciseVolume(exercise, bodyWeightKg) {
  const sets = Array.isArray(exercise?.sets)
    ? exercise.sets.filter(isObject)
    : [];
  const bodyweightExercise = isBodyweightExercise(exercise);
  let volume = 0;
  let repsOnly = 0;

  for (const set of sets) {
    const reps = parseInteger(set.reps);
    if (reps == null) continue;
    const loadKg = resolveSetLoadKg(set, bodyweightExercise, bodyWeightKg);
    if (loadKg != null && loadKg > 0) {
      volume += loadKg * reps;
    } else {
      repsOnly += reps;
    }
  }

  return volume > 0 ? volume : repsOnly;
}

function resolveSetLoadKg(set, bodyweightExercise, bodyWeightKg) {
  const weightKg = parseFloatNumber(set?.weight_kg);
  if (bodyweightExercise) {
    const baseline = parseFloatNumber(bodyWeightKg);
    if (baseline != null && baseline > 0) {
      return baseline + Math.max(weightKg ?? 0, 0);
    }
    return weightKg != null && weightKg > 0 ? weightKg : null;
  }
  return weightKg;
}

function isBodyweightExercise(exercise) {
  const templateId = normalizeTemplateId(exercise?.exercise_template_id);
  const name = normalizeNameKey(exercise?.name ?? exercise?.title ?? "");
  if (
    ["29083183", "28BB4A95", "392887AA"].includes(templateId) ||
    /chin\s*up|pull\s*up|dip|push\s*up|bodyweight|calisthenic/.test(name)
  ) {
    return true;
  }
  return false;
}

function resolveHeatmapTargets(exercise) {
  const templateId = normalizeTemplateId(exercise?.exercise_template_id);
  const name = normalizeNameKey(exercise?.name ?? exercise?.title ?? "");
  const catalogCategory =
    exerciseCategoryByName.get(
      String(exercise?.name ?? exercise?.title ?? ""),
    ) ?? "";
  const category = normalizeCategory(
    exercise?.category ?? catalogCategory ?? "",
  );

  if (
    templateId === "D04AC939" ||
    /squat|leg press|lunge|split squat|hack squat|bulgarian/.test(name)
  ) {
    return [
      { id: "front-quads", share: 0.48 },
      { id: "back-glutes", share: 0.26 },
      { id: "back-hamstrings", share: 0.16 },
      { id: "front-calves", share: 0.1 },
    ];
  }

  if (
    templateId === "79D0BB3A" ||
    /bench press|chest press|push up/.test(name)
  ) {
    return [
      { id: "front-chest", share: 0.54 },
      { id: "front-shoulders", share: 0.24 },
      { id: "back-arms", share: 0.22 },
    ];
  }

  if (templateId === "29083183" || /chin\s*up|pull\s*up/.test(name)) {
    return [
      { id: "back-lats", share: 0.46 },
      { id: "back-upper-back", share: 0.28 },
      { id: "back-arms", share: 0.26 },
    ];
  }

  if (templateId === "F1E57334" || /row/.test(name)) {
    return [
      { id: "back-upper-back", share: 0.38 },
      { id: "back-lats", share: 0.3 },
      { id: "back-rear-delts", share: 0.17 },
      { id: "back-arms", share: 0.15 },
    ];
  }

  if (templateId === "28BB4A95" || /dip/.test(name)) {
    return [
      { id: "front-chest", share: 0.42 },
      { id: "back-arms", share: 0.38 },
      { id: "front-shoulders", share: 0.2 },
    ];
  }

  if (
    /deadlift|romanian deadlift|rdl|hip thrust|good morning|back extension/.test(
      name,
    )
  ) {
    return [
      { id: "back-hamstrings", share: 0.42 },
      { id: "back-glutes", share: 0.33 },
      { id: "back-upper-back", share: 0.25 },
    ];
  }

  if (/shoulder press|overhead press|arnold press/.test(name)) {
    return [
      { id: "front-shoulders", share: 0.52 },
      { id: "back-arms", share: 0.25 },
      { id: "front-chest", share: 0.13 },
      { id: "back-rear-delts", share: 0.1 },
    ];
  }

  if (/curl|bicep/.test(name)) {
    return [
      { id: "back-arms", share: 0.62 },
      { id: "back-upper-back", share: 0.38 },
    ];
  }

  if (/tricep|extension/.test(name)) {
    return [
      { id: "back-arms", share: 0.72 },
      { id: "front-shoulders", share: 0.28 },
    ];
  }

  if (/plank|crunch|leg raise|ab wheel|core/.test(name)) {
    return [{ id: "front-core", share: 1 }];
  }

  if (/calf/.test(name)) {
    return [
      { id: "front-calves", share: 0.5 },
      { id: "back-calves", share: 0.5 },
    ];
  }

  if (category === "Lower body") {
    return [
      { id: "front-quads", share: 0.4 },
      { id: "back-glutes", share: 0.3 },
      { id: "back-hamstrings", share: 0.18 },
      { id: "front-calves", share: 0.12 },
    ];
  }

  if (category === "Push") {
    return [
      { id: "front-chest", share: 0.48 },
      { id: "front-shoulders", share: 0.28 },
      { id: "back-arms", share: 0.24 },
    ];
  }

  if (category === "Pull") {
    return [
      { id: "back-upper-back", share: 0.4 },
      { id: "back-lats", share: 0.3 },
      { id: "back-arms", share: 0.18 },
      { id: "back-rear-delts", share: 0.12 },
    ];
  }

  if (category === "Accessory") {
    return [
      { id: "front-core", share: 0.5 },
      { id: "back-arms", share: 0.25 },
      { id: "front-shoulders", share: 0.25 },
    ];
  }

  return [{ id: "front-core", share: 1 }];
}

function heatmapIntensityClass(volume, maxVolume = null) {
  if (!(volume > 0)) return "is-gray";
  const ratio = maxVolume && maxVolume > 0 ? volume / maxVolume : 0;
  if (ratio >= 0.72) return "is-hot";
  if (ratio >= 0.38) return "is-warm";
  return "is-cool";
}

function formatVolume(value) {
  if (!(value > 0)) return "0 kg";
  return `${fmtNum(value)} kg`;
}

function formatPct(value) {
  if (!(value > 0)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function readStoredHeatmapWindow() {
  try {
    return normalizeHeatmapWindow(
      localStorage.getItem("personal-trainer:strength-heatmap-window"),
    );
  } catch {
    return "30d";
  }
}

function saveStoredHeatmapWindow(windowKey) {
  try {
    localStorage.setItem(
      "personal-trainer:strength-heatmap-window",
      normalizeHeatmapWindow(windowKey),
    );
  } catch {}
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
          <span class="workout-summary-meta">${escapeHtml(
            `${exercises.length} exercises${range ? ` · ${range}` : ""}`,
          )}</span>
        </div>
        <div class="workout-summary-badges">
          <span class="workout-summary-chip">${escapeHtml(
            `${exercises.length} exercises`,
          )}</span>
          ${
            range
              ? `<span class="workout-summary-chip is-soft">${escapeHtml(
                  range,
                )}</span>`
              : ""
          }
          ${
            index === 0
              ? `<span class="workout-summary-chip is-accent">Latest</span>`
              : ""
          }
        </div>
      </summary>
      <div class="workout-body">
        ${exercises
          .map((exercise) => renderWorkoutExercise(exercise, date, title))
          .join("")}
      </div>
    </details>
  `;
}

function renderWorkoutExercise(exercise, workoutDate, workoutTitle) {
  if (!exercise || typeof exercise !== "object") return "";
  const name = String(exercise.name ?? exercise.title ?? "Exercise");
  const templateId = normalizeTemplateId(exercise.exercise_template_id);
  const sets = Array.isArray(exercise.sets)
    ? exercise.sets.filter(isObject)
    : [];
  const payload = {
    name,
    templateId,
    workoutDate,
    workoutTitle,
    sets,
  };
  return `
    <button
      class="workout-exercise"
      type="button"
      data-template-id="${escapeHtml(templateId)}"
      data-workout-exercise="${escapeHtml(JSON.stringify(payload))}"
    >
      <div class="workout-exercise-head">
        <span class="workout-exercise-name">${escapeHtml(name)}</span>
        <span class="workout-exercise-count">${
          sets.length ? `${sets.length} sets` : "No sets"
        }</span>
      </div>
      <div class="workout-set-list">
        ${
          sets.length
            ? sets.map((set) => renderWorkoutSet(set)).join("")
            : `<span class="workout-set workout-set-empty">No sets recorded</span>`
        }
      </div>
      <div class="workout-exercise-meta">
        <span>${escapeHtml(workoutDate)}</span>
        ${templateId ? `<span>${escapeHtml(templateId)}</span>` : ""}
      </div>
    </button>
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
  const minutes = Math.max(
    0,
    Math.round((endTime.getTime() - startTime.getTime()) / 60000),
  );
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
    ...(Array.isArray(workout?.exercises) ? workout.exercises : [])
      .filter(isObject)
      .flatMap((exercise) => [
        String(exercise.name ?? exercise.title ?? ""),
        String(exercise.exercise_template_id ?? ""),
      ]),
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
      const wa =
        a.entry.estimated_one_rm_kg ?? a.entry.best_set?.weight_kg ?? 0;
      const wb =
        b.entry.estimated_one_rm_kg ?? b.entry.best_set?.weight_kg ?? 0;
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
  const lastSet = session?.sets?.length
    ? session.sets[session.sets.length - 1]
    : null;
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
  const bestMeta =
    entry.estimated_one_rm_kg != null
      ? `Est. 1RM ${fmtNum(entry.estimated_one_rm_kg)} kg`
      : "No 1RM estimate";
  const gain = gainsCache?.[templateId];
  const progression = buildProgressionState(
    {
      ...entry,
      last_set: lastSet,
    },
    gain,
    activeProgressionGoal,
  );
  const progressionStateClass = progressionStateClassName(progression.state);

  return `
    <article class="exercise-card card" data-template-id="${escapeHtml(
      templateId,
    )}" data-exercise-name="${escapeHtml(entry.name)}">
      <div class="exercise-head">
        <div class="exercise-name">${escapeHtml(entry.name)}</div>
        <span class="exercise-category ${categoryClass}">${escapeHtml(
          category,
        )}</span>
      </div>
      <div class="exercise-metrics">
        <div class="exercise-metric exercise-metric--lead">
          <span class="exercise-metric-label">Last session</span>
          <span class="exercise-metric-value">${escapeHtml(lastLine)}</span>
          <span class="exercise-metric-subvalue">${escapeHtml(
            lastSessionMeta,
          )}</span>
        </div>
        <div class="exercise-metric exercise-metric--secondary">
          <span class="exercise-metric-label">Best ever</span>
          <span class="exercise-metric-value">${escapeHtml(bestLine)}</span>
          <span class="exercise-metric-subvalue">${escapeHtml(bestMeta)}</span>
        </div>
      </div>
      <div class="exercise-footer">
        <div class="exercise-progression">
          <span class="exercise-progression-goal">${escapeHtml(
            progression.goal_label,
          )}</span>
          <span class="exercise-progression-badge ${progressionStateClass}">${escapeHtml(
            progression.state_label,
          )}</span>
          <span class="exercise-recommendation">${escapeHtml(
            progression.summary,
          )}</span>
          <span class="exercise-progress">${escapeHtml(
            progression.detail,
          )}</span>
        </div>
        ${
          progression.next_weight_kg != null
            ? `<span class="exercise-next-weight">Next ${escapeHtml(
                fmtNum(progression.next_weight_kg),
              )} kg</span>`
            : ""
        }
      </div>
    </article>
  `;
}

function makeWarmupSets(workingKg) {
  const roundPlate = (w) => Math.round(w / 2.5) * 2.5;
  const bar = 20;
  const steps = [
    { pct: 0, reps: 10, label: "Bar" },
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.8, reps: 3 },
    { pct: 0.9, reps: 1 },
  ];
  return steps
    .map((s) => {
      if (s.pct === 0) return { weight: bar, reps: s.reps, label: s.label };
      const w = roundPlate(workingKg * s.pct);
      if (w <= bar) return null;
      return { weight: w, reps: s.reps, label: `${fmtNum(w)} kg` };
    })
    .filter(Boolean);
}

function renderWarmupHtml(sets, workingKg) {
  return `
    <details class="exercise-warmup">
      <summary class="exercise-warmup-toggle">Warm-up — ${escapeHtml(
        fmtNum(workingKg),
      )} kg</summary>
      <div class="exercise-warmup-list">
        ${sets
          .map(
            (s) =>
              `<span class="exercise-warmup-set">${escapeHtml(s.label)} × ${
                s.reps
              }</span>`,
          )
          .join("")}
      </div>
    </details>
  `;
}

function makeRestLabel(goal) {
  const map = {
    Strength: "Rest: 3-5 min",
    Hypertrophy: "Rest: 60-90 sec",
    Endurance: "Rest: 30-60 sec",
    "Power / athleticism": "Rest: 3-5 min",
  };
  return map[goal] ?? null;
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
                <span class="macro-row-numbers">avg ${c.pct}% of peak · +${
                  c.gain
                }% gain</span>
              </div>
              <div class="macro-track">
                <div class="macro-fill macro-fill-${
                  c.pct >= 80 ? "high" : c.pct >= 60 ? "medium" : "low"
                }" style="width:${c.pct}%"></div>
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
              <strong class="delta-down">${fmtNum(
                stall.current,
              )} kg · ${Math.round(
                (stall.current / stall.peak) * 100,
              )}% of peak</strong>
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
            <span class="stat-item-value">${escapeHtml(
              biggestGap.entry.name,
            )}</span>
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
            <span class="stat-item-value delta-down">-${fmtNum(
              bg.peak - bg.current,
            )} kg</span>
          </div>
        </div>
      </div>
    `);
  }

  el.innerHTML = parts.join("");
  el.hidden = false;
}

function progressionGoalLabel(goal) {
  return {
    strength: "Strength",
    hypertrophy: "Hypertrophy",
    endurance: "Endurance",
  }[normalizeProgressionGoal(goal)];
}

function normalizeProgressionGoal(goal) {
  const normalized = String(goal ?? "strength").toLowerCase();
  return ["strength", "hypertrophy", "endurance"].includes(normalized)
    ? normalized
    : "strength";
}

function readStoredProgressionGoal() {
  try {
    const raw = localStorage.getItem("personal-trainer:strength-goal");
    return normalizeProgressionGoal(raw);
  } catch {
    return "strength";
  }
}

function saveStoredProgressionGoal(goal) {
  try {
    localStorage.setItem(
      "personal-trainer:strength-goal",
      normalizeProgressionGoal(goal),
    );
  } catch {}
}

function readStoredStrengthTab() {
  try {
    const raw = localStorage.getItem(activeTabStorageKey);
    return ["history", "heatmap", "exercises"].includes(raw) ? raw : "history";
  } catch {
    return "history";
  }
}

function saveStoredStrengthTab(tab) {
  try {
    localStorage.setItem(
      activeTabStorageKey,
      ["history", "heatmap", "exercises"].includes(tab) ? tab : "history",
    );
  } catch {}
}

function readStoredHeatmapZone() {
  try {
    const raw = localStorage.getItem(activeHeatmapZoneStorageKey);
    return raw ? raw.trim() : null;
  } catch {
    return null;
  }
}

function saveStoredHeatmapZone(zoneId) {
  try {
    if (!zoneId) {
      localStorage.removeItem(activeHeatmapZoneStorageKey);
      return;
    }
    localStorage.setItem(activeHeatmapZoneStorageKey, zoneId);
  } catch {}
}

function readStoredStrengthAnalytics() {
  try {
    const raw = localStorage.getItem(analyticsVisibilityStorageKey);
    return raw == null ? true : raw !== "false";
  } catch {
    return true;
  }
}

function saveStoredStrengthAnalytics(visible) {
  try {
    localStorage.setItem(
      analyticsVisibilityStorageKey,
      visible ? "true" : "false",
    );
  } catch {}
}

function progressionStateClassName(state) {
  return (
    {
      baseline: "is-baseline",
      accumulate: "is-accumulate",
      ready_to_progress: "is-ready",
      stalled: "is-stalled",
      deload: "is-deload",
      constrained: "is-constrained",
    }[state] ?? "is-accumulate"
  );
}

function buildLastSessionLookup() {
  const lookup = new Map();
  for (const workout of recentWorkouts) {
    const exercises = Array.isArray(workout?.exercises)
      ? workout.exercises
      : [];
    for (const exercise of exercises) {
      if (!exercise || typeof exercise !== "object") continue;
      const templateId = normalizeTemplateId(exercise.exercise_template_id);
      const nameKey = normalizeNameKey(exercise.name ?? exercise.title ?? "");
      const key = templateId || nameKey;
      if (!key || lookup.has(key)) continue;
      const sets = Array.isArray(exercise.sets)
        ? exercise.sets.filter(isObject)
        : [];
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
    lookup.get(templateId) ?? lookup.get(normalizeNameKey(entry.name)) ?? null
  );
}

function exerciseTemplateKey(entry) {
  return normalizeTemplateId(
    entry.templateId ?? exerciseIdByName.get(entry.name) ?? "",
  );
}

function normalizeNameKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function findTemplateId(name) {
  return exerciseIdByName.get(String(name)) ?? null;
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
    hevyRefreshStatus.textContent = `Refreshing Hevy... · ${formatHevyWorkoutWindowLabel(
      workoutWindow,
    )}`;
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
    resetHeatmapCache();
    sourceLabel.textContent = `${livePayload.source ?? "Hevy"} · ${
      livePayload.snapshot_date ?? "unknown date"
    }`;
    statusBanner.textContent = `${
      entries.length
    } lifts · ${formatHevyRefreshLabel(livePayload)}`;
    syncHevyWindowUI(livePayload.refresh_window ?? workoutWindow, livePayload);
    controls?.removeAttribute("hidden");
    renderControls();
    renderSummary();
    renderHighlights();
    renderStrengthAnalyticsVisibility();
    renderTabs();
    renderCurrentTab();
    await loadGains();
    renderHighlights();
    renderStrengthAnalyticsVisibility();
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
    hevyRefreshStatus.textContent = `${formatHevyRefreshLabel(
      payload,
    )} · ${normalizedWindow}`;
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

function formatHistorySetLabel(set) {
  if (!set || typeof set !== "object") return "—";
  const weight = parseFloatNumber(set.weight_kg);
  const reps = parseInteger(set.reps);
  if (weight == null && reps == null) return "—";
  if (weight == null) {
    return reps != null ? `Bodyweight · ${reps} reps` : "Bodyweight";
  }
  if (reps == null) return `${fmtNum(weight)} kg`;
  return `${fmtNum(weight)} kg × ${reps}`;
}

function formatVolumeLabel(set) {
  if (!set || typeof set !== "object") return "—";
  const weight = parseFloatNumber(set.weight_kg);
  const reps = parseInteger(set.reps);
  if (reps == null) return "—";
  const volume = weight != null ? weight * reps : reps;
  return weight != null
    ? `${fmtNum(volume)} kg total`
    : `${fmtNum(volume)} reps total`;
}

function getBestVolumeSet(history) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const weight = parseFloatNumber(item.weight_kg);
    const reps = parseInteger(item.reps);
    if (reps == null) continue;
    const score = weight != null ? weight * reps : reps;
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

function fmtModalNumber(value) {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 10) / 10);
}

function renderWorkoutExerciseModal(payload) {
  if (!payload || typeof payload !== "object") return;
  const name = String(payload.name ?? "Exercise");
  const workoutTitle = String(payload.workoutTitle ?? "Workout");
  const workoutDate = String(payload.workoutDate ?? "Unknown date");
  const templateId = String(payload.templateId ?? "");
  const sets = Array.isArray(payload.sets) ? payload.sets.filter(isObject) : [];
  const stats = getWorkoutExerciseStats(sets);
  const recentSets = sets.slice(-8).reverse();

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content card">
      <div class="modal-header">
        <h2>${escapeHtml(name)}</h2>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="modal-progression">
        <span class="modal-progression-value">${escapeHtml(workoutTitle)}</span>
        <span class="modal-progression-pct">${escapeHtml(workoutDate)}${
          templateId ? ` · ${escapeHtml(templateId)}` : ""
        }</span>
      </div>
      <div class="modal-stats">
        <div class="stat-item">
          <span class="stat-item-label">Sets</span>
          <span class="stat-item-value">${stats.totalSets}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Total reps</span>
          <span class="stat-item-value">${stats.totalReps}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Total volume</span>
          <span class="stat-item-value">${escapeHtml(
            stats.totalVolumeLabel,
          )}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Best volume set</span>
          <span class="stat-item-value">${escapeHtml(
            stats.bestVolumeSetLabel,
          )}</span>
          <span class="stat-item-subvalue">${escapeHtml(
            stats.bestVolumeTotalLabel,
          )}</span>
        </div>
      </div>
      <details class="modal-history" open>
        <summary><span class="label">Sets</span></summary>
        <div class="modal-history-list">
          ${recentSets
            .map(
              (set, index) => `
            <div class="modal-history-row">
              <span class="modal-history-date">#${
                recentSets.length - index
              }</span>
              <span>${escapeHtml(formatHistorySetLabel(set))}</span>
              <span class="modal-history-1rm">${escapeHtml(
                formatVolumeLabel(set),
              )}</span>
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
      modal.remove();
    }
  });
}

function getWorkoutExerciseStats(sets) {
  let totalSets = 0;
  let totalReps = 0;
  let totalVolume = 0;
  let bestVolumeSet = null;
  let bestVolume = -Infinity;

  for (const set of sets) {
    const reps = parseInteger(set.reps);
    if (reps == null) continue;
    totalSets += 1;
    totalReps += reps;
    const weight = parseFloatNumber(set.weight_kg);
    const volume = weight != null ? weight * reps : reps;
    totalVolume += volume;
    if (volume > bestVolume) {
      bestVolume = volume;
      bestVolumeSet = set;
    }
  }

  return {
    totalSets,
    totalReps,
    totalVolumeLabel: totalSets
      ? `${fmtNum(totalVolume)} ${
          bestVolumeSet?.weight_kg != null ? "kg total" : "reps total"
        }`
      : "—",
    bestVolumeSetLabel: bestVolumeSet
      ? formatHistorySetLabel(bestVolumeSet)
      : "—",
    bestVolumeTotalLabel: bestVolumeSet
      ? formatVolumeLabel(bestVolumeSet)
      : "—",
  };
}

function renderEmptyModal(name) {
  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content card">
      <div class="modal-header">
        <h2>${escapeHtml(name)}</h2>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="modal-progression">
        <span class="modal-progression-value">No history yet</span>
        <span class="modal-progression-pct">Log this exercise in Hevy to see trend data here.</span>
      </div>
    </div>
  `;
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest(".modal-close")) {
      modal.remove();
    }
  });
  document.body.appendChild(modal);
}

function renderTrendModal(name, history) {
  const oneRms = history
    .map((item) => item.estimated_one_rm_kg)
    .filter((value) => value != null);
  const weights = history
    .map((item) => item.weight_kg)
    .filter((value) => value != null);
  const reps = history
    .map((item) => item.reps)
    .filter((value) => value != null);
  const latest = history[history.length - 1];
  const bestVolumeSet = getBestVolumeSet(history);
  const hasOneRmTrend = oneRms.length > 0;
  const firstOneRm = hasOneRmTrend ? oneRms[0] : null;
  const lastOneRm = hasOneRmTrend ? oneRms[oneRms.length - 1] : null;
  const oneRmChange =
    firstOneRm != null && lastOneRm != null ? lastOneRm - firstOneRm : null;
  const oneRmPct =
    firstOneRm != null && firstOneRm > 0 && oneRmChange != null
      ? Math.round((oneRmChange / firstOneRm) * 100)
      : null;
  const peak = hasOneRmTrend ? Math.max(...oneRms) : null;
  const trendUp = oneRmChange == null ? true : oneRmChange >= 0;
  const trendSeries =
    weights.length > 1 ? weights : reps.length > 1 ? reps : [];
  const trendLabel = weights.length > 1 ? "Working weight trend" : "Rep trend";
  const recent = history.slice(-10).reverse();
  const latestWeight = latest?.weight_kg;
  const modalWarmup =
    latestWeight != null ? makeWarmupSets(latestWeight) : null;
  const avgRep =
    reps.length > 0 ? reps.reduce((a, b) => a + b, 0) / reps.length : null;
  const modalRest =
    avgRep != null
      ? avgRep <= 5
        ? "Rest: 3-5 min"
        : avgRep <= 12
          ? "Rest: 60-90 sec"
          : "Rest: 30-60 sec"
      : null;

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content card">
      <div class="modal-header">
        <h2>${escapeHtml(name)}</h2>
        <button class="modal-close" type="button">&times;</button>
      </div>
      ${
        hasOneRmTrend && firstOneRm != null && lastOneRm != null
          ? `
        <div class="modal-progression">
          <span class="modal-progression-value ${
            trendUp ? "delta-up" : "delta-down"
          }">
            ${fmtModalNumber(firstOneRm)} kg → ${fmtModalNumber(lastOneRm)} kg
          </span>
          ${
            oneRmPct != null
              ? `<span class="modal-progression-pct ${
                  trendUp ? "delta-up" : "delta-down"
                }">${oneRmPct >= 0 ? "+" : ""}${oneRmPct}% over ${
                  history.length
                } days</span>`
              : `<span class="modal-progression-pct">No comparable 1RM trend yet</span>`
          }
        </div>
      `
          : `
        <div class="modal-progression">
          <span class="modal-progression-value">No estimated 1RM trend yet</span>
          <span class="modal-progression-pct">This exercise is tracked as a rep-based movement.</span>
        </div>
      `
      }
      ${modalWarmup ? renderWarmupHtml(modalWarmup, latestWeight) : ""}
      ${
        modalRest
          ? `<p class="modal-rest-label">${escapeHtml(modalRest)}</p>`
          : ""
      }
      ${
        trendSeries.length > 1
          ? `
        <div class="modal-section">
          <p class="label">${trendLabel}</p>
          ${renderSparkline(trendSeries, 300, 72, {
            dots: true,
            labels: true,
            color: weights.length > 1 ? "var(--accent)" : "var(--accent-2)",
          })}
        </div>
      `
          : ""
      }
      <div class="modal-stats">
        <div class="stat-item">
          <span class="stat-item-label">Current 1RM</span>
          <span class="stat-item-value">${
            lastOneRm != null ? `${fmtModalNumber(lastOneRm)} kg` : "—"
          }</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label" title="Highest estimated 1RM ever recorded for this exercise">Peak 1RM</span>
          <span class="stat-item-value">${
            peak != null ? `${fmtModalNumber(peak)} kg` : "—"
          }</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Start 1RM</span>
          <span class="stat-item-value">${
            firstOneRm != null ? `${fmtModalNumber(firstOneRm)} kg` : "—"
          }</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Latest set</span>
          <span class="stat-item-value">${escapeHtml(
            formatHistorySetLabel(latest),
          )}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Best volume set</span>
          <span class="stat-item-value">${escapeHtml(
            bestVolumeSet ? formatHistorySetLabel(bestVolumeSet) : "—",
          )}</span>
          <span class="stat-item-subvalue">${escapeHtml(
            bestVolumeSet ? formatVolumeLabel(bestVolumeSet) : "—",
          )}</span>
        </div>
      </div>
      <details class="modal-history">
        <summary><span class="label">Recent history (last ${
          recent.length
        })</span></summary>
        <div class="modal-history-list">
          ${recent
            .map(
              (item) => `
            <div class="modal-history-row">
              <span class="modal-history-date">${escapeHtml(
                String(item.date).slice(5),
              )}</span>
              <span>${escapeHtml(formatHistorySetLabel(item))}</span>
              <span class="modal-history-1rm">${
                item.estimated_one_rm_kg != null
                  ? `${item.estimated_one_rm_kg} kg`
                  : "—"
              }</span>
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
export { escapeHtml, fmtNum as formatNum, makeWarmupSets, makeRestLabel };
