const speedUrl = new URL("./speed.json", import.meta.url);
const table = document.getElementById("speed-table");
const runsContainer = document.getElementById("speed-runs");
const predictionsContainer = document.getElementById("speed-predictions");
const predictionNote = document.getElementById("speed-prediction-note");
const analyticsPanel = document.getElementById("speed-analytics");
const analyticsBody = document.getElementById("speed-analytics-body");
const analyticsToggle = document.getElementById("speed-analytics-toggle");
const analyticsWarning = document.getElementById("speed-analytics-warning");
const lastSyncedEl = document.getElementById("speed-last-synced");
const summaryEl = document.getElementById("speed-summary");
const readinessEl = document.getElementById("speed-readiness");
const runsDateFromInput = document.getElementById("speed-run-date-from");
const runsDateToInput = document.getElementById("speed-run-date-to");
const runsDateRangeReset = document.getElementById("speed-run-range-reset");
const runsNoteEl = document.getElementById("speed-runs-note");
const liveBanner = document.getElementById("speed-live-banner");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");

const PREDICTION_TARGETS = [
  { label: "1K", distanceMeters: 1000 },
  { label: "Mile", distanceMeters: 1609.344 },
  { label: "5K", distanceMeters: 5000 },
  { label: "10K", distanceMeters: 10000 },
  { label: "Half Marathon", distanceMeters: 21097.5 },
  { label: "Marathon", distanceMeters: 42195 },
];

const PREDICTION_MODEL_ORDER = [
  "Critical Speed",
  "Calibrated Riegel",
  "Riegel extrapolation",
];

const ANALYTICS_TARGETS = new Set(["5K", "10K", "Half Marathon", "Marathon"]);
const PREDICTION_MIN_DISTANCE_RATIO = 0.75;
const PREDICTION_STALE_DAYS = 14;
const DISTANCE_BUCKET_METERS = 500;
const SCROLL_STORAGE_KEY = "personal-trainer:speed-scroll-y";
const ANALYTICS_STORAGE_KEY = "personal-trainer:speed-show-analytics";
const PREDICTION_INTERVAL_STORAGE_KEY =
  "personal-trainer:speed-prediction-confidence-interval";
const RUN_DATE_RANGE_STORAGE_KEY = "personal-trainer:speed-run-date-range";

let showAnalytics = readStoredAnalyticsVisibility();
let selectedRunDateRange = readStoredRunDateRange();
let selectedPredictionInterval = readStoredPredictionInterval();
let currentSpeedPayload = null;
let activeRunDetailPanel = null;
let activeRunDetailCleanup = null;
let activeRunDetailAnchor = null;

loadSpeed();
setupAnalyticsVisibility();
setupScrollPersistence();
setupRecentRunDateRangeControl();
setupRunDateRangeUiPersistence();

async function loadSpeed() {
  try {
    const response = await fetch(`${speedUrl.pathname}?v=${Date.now()}`);
    const payload = await response.json();
    const pageState = payload.page_state ?? {
      kind: "fresh",
      label: "Ready",
      detail: "",
    };
    renderLiveBanner(payload.source_mode, payload.source, pageState);
    if (pageState.kind === "missing") {
      renderUnavailableSpeed(pageState.detail ?? "No speed data available");
      return;
    }
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const recentRuns = Array.isArray(payload.recent_runs)
      ? payload.recent_runs
      : [];

    currentSpeedPayload = {
      entries,
      recentRuns,
      featureFlags: {
        speedPredictions: Boolean(payload.feature_flags?.speed_predictions),
      },
      analytics: {
        currentVo2max: toNumber(payload.current_vo2max),
        vo2maxTrend: toText(payload.vo2max_trend),
        vo2maxTrendPoints: normalizeVo2maxTrendPoints(
          payload.vo2max_trend_points ?? payload.vo2max_trend,
        ),
        trainingLoadTrend: toText(payload.training_load_trend),
        readiness: normalizeReadiness(payload.readiness),
      },
      snapshotDate: payload.snapshot_date,
      source: payload.source,
      pageState,
    };

    sourceLabel.textContent = `${payload.source ?? "Garmin"} · ${
      payload.snapshot_date ?? "unknown date"
    }`;
    sourceLabel.classList.remove("skeleton");
    renderLastSynced(payload.snapshot_date);
    selectedRunDateRange = resolveInitialRunDateRange(
      recentRuns,
      payload.snapshot_date,
      selectedRunDateRange,
    );
    applyRunDateRangeControls(selectedRunDateRange, { persist: false });
    renderSpeedView();
  } catch {
    renderUnavailableSpeed("Could not load speed data");
  }
}

function renderUnavailableSpeed(message) {
  currentSpeedPayload = null;
  sourceLabel.textContent = "Unavailable";
  if (lastSyncedEl) {
    lastSyncedEl.textContent = "Last synced unavailable";
    lastSyncedEl.classList.remove("skeleton");
  }
  statusBanner.textContent = message;
  if (liveBanner) liveBanner.setAttribute("hidden", "");
  if (summaryEl) summaryEl.innerHTML = "";
  if (runsContainer) runsContainer.innerHTML = "";
  if (predictionsContainer) predictionsContainer.innerHTML = "";
  if (predictionNote) {
    predictionNote.textContent = "";
    predictionNote.setAttribute("hidden", "");
  }
  if (analyticsWarning) {
    analyticsWarning.textContent = "";
    analyticsWarning.setAttribute("hidden", "");
  }
  if (runsNoteEl) {
    runsNoteEl.textContent = "";
    runsNoteEl.setAttribute("hidden", "");
  }
  table.innerHTML = `<div class="speed-empty">Failed to load speed data.</div>`;
}

function renderSpeedView() {
  if (!currentSpeedPayload) return;

  const entries = currentSpeedPayload.entries ?? [];
  const recentRuns = currentSpeedPayload.recentRuns ?? [];
  const analytics = currentSpeedPayload.analytics ?? {};
  const filteredRuns = filterRecentRunsByDateRange(
    recentRuns,
    selectedRunDateRange,
  );
  const visibleRuns = filteredRuns;
  const predictionsEnabled = Boolean(
    currentSpeedPayload.featureFlags?.speedPredictions,
  );
  const predictions = predictionsEnabled
    ? (currentSpeedPayload.predictions ??
      buildPredictions(recentRuns, currentSpeedPayload.snapshotDate))
    : [];
  const analyticsPredictions = filterAnalyticsPredictions(predictions);
  const predictionSummary =
    currentSpeedPayload.prediction_summary ??
    buildPredictionSummary(
      predictions,
      recentRuns,
      currentSpeedPayload.snapshotDate,
    );

  statusBanner.textContent =
    currentSpeedPayload.pageState?.kind === "fresh"
      ? `${entries.length} bests · ${visibleRuns.length} runs`
      : `${entries.length} bests · ${formatRecentRunWindowLabel(
          visibleRuns.length,
          recentRuns.length,
          selectedRunDateRange,
        )} · ${currentSpeedPayload.pageState?.label ?? "Ready"}`;
  statusBanner.classList.remove("skeleton");

  renderSummary(
    entries,
    recentRuns,
    analytics,
    predictionSummary,
    predictionsEnabled,
  );
  renderAnalyticsNotice(
    analytics,
    recentRuns,
    predictionsEnabled ? predictionSummary : null,
  );
  renderReadiness(analytics.readiness);
  renderRecentRuns(visibleRuns, recentRuns.length, selectedRunDateRange);
  renderPredictions(
    analyticsPredictions,
    predictionSummary,
    predictionsEnabled,
  );
  renderTable(entries);
}

function renderLiveBanner(sourceMode, sourceLabelText, pageState) {
  if (!liveBanner) return;
  const normalizedMode = toText(sourceMode).toLowerCase();
  const isLive = normalizedMode === "live";
  const isExample = normalizedMode === "example";
  if (isLive) {
    liveBanner.setAttribute("hidden", "");
    return;
  }

  const label =
    isExample || normalizedMode === "fixture"
      ? "Example data loaded"
      : "Live Garmin data is not loaded";
  const details = [];
  if (sourceLabelText) details.push(String(sourceLabelText));
  if (pageState?.kind && pageState.kind !== "fresh") {
    details.push(pageState.label ?? pageState.kind);
  }
  liveBanner.textContent = `${label}. ${
    details.join(" · ") || "This preview is using a non-live speed payload."
  }`;
  liveBanner.removeAttribute("hidden");
}

function setupScrollPersistence() {
  if (!window?.localStorage) return;
  const restoredY = Number(window.localStorage.getItem(SCROLL_STORAGE_KEY));
  if (Number.isFinite(restoredY) && restoredY > 0) {
    window.addEventListener(
      "load",
      () => {
        window.scrollTo({ top: restoredY, behavior: "auto" });
      },
      { once: true },
    );
  }

  let rafId = null;
  const persistScroll = () => {
    rafId = null;
    try {
      window.localStorage.setItem(
        SCROLL_STORAGE_KEY,
        String(Math.max(0, Math.floor(window.scrollY || 0))),
      );
    } catch {
      // Ignore storage quota or private browsing failures.
    }
  };

  window.addEventListener(
    "scroll",
    () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(persistScroll);
    },
    { passive: true },
  );
  window.addEventListener("pagehide", persistScroll);
}

function setupAnalyticsVisibility() {
  if (!analyticsPanel || !analyticsBody || !analyticsToggle) return;
  applyAnalyticsVisibility(showAnalytics, { persist: false });
  analyticsToggle.addEventListener("click", () => {
    showAnalytics = !showAnalytics;
    applyAnalyticsVisibility(showAnalytics);
  });
}

function applyAnalyticsVisibility(visible, { persist = true } = {}) {
  if (!analyticsPanel || !analyticsBody || !analyticsToggle) return;
  analyticsPanel.classList.toggle("is-collapsed", !visible);
  analyticsBody.hidden = !visible;
  analyticsToggle.textContent = visible ? "Hide analytics" : "Show analytics";
  analyticsToggle.setAttribute("aria-expanded", String(visible));
  if (persist) saveStoredAnalyticsVisibility(visible);
}

function readStoredAnalyticsVisibility() {
  try {
    if (!window?.localStorage) return true;
    const raw = window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (raw == null) return !isMobileViewport();
    return raw !== "false";
  } catch {
    return !isMobileViewport();
  }
}

function readStoredPredictionInterval() {
  try {
    if (!window?.localStorage) return "95";
    const raw = window.localStorage.getItem(PREDICTION_INTERVAL_STORAGE_KEY);
    return normalizePredictionInterval(raw);
  } catch {
    return "95";
  }
}

function saveStoredPredictionInterval(value) {
  try {
    if (!window?.localStorage) return;
    window.localStorage.setItem(
      PREDICTION_INTERVAL_STORAGE_KEY,
      normalizePredictionInterval(value),
    );
  } catch {
    // Ignore storage failures.
  }
}

function setupRecentRunDateRangeControl() {
  applyRunDateRangeControls(selectedRunDateRange, { persist: false });
  if (runsDateFromInput) {
    runsDateFromInput.addEventListener("change", () => {
      selectedRunDateRange = normalizeRunDateRange({
        from: runsDateFromInput.value,
        to: runsDateToInput?.value,
      });
      saveStoredRunDateRange(selectedRunDateRange);
      applyRunDateRangeControls(selectedRunDateRange, { persist: false });
      renderSpeedView();
    });
  }
  if (runsDateToInput) {
    runsDateToInput.addEventListener("change", () => {
      selectedRunDateRange = normalizeRunDateRange({
        from: runsDateFromInput?.value,
        to: runsDateToInput.value,
      });
      saveStoredRunDateRange(selectedRunDateRange);
      applyRunDateRangeControls(selectedRunDateRange, { persist: false });
      renderSpeedView();
    });
  }
  if (runsDateRangeReset) {
    runsDateRangeReset.addEventListener("click", () => {
      selectedRunDateRange = getDefaultRecentRunDateRange(
        currentSpeedPayload?.recentRuns ?? [],
        currentSpeedPayload?.snapshotDate,
      );
      saveStoredRunDateRange(selectedRunDateRange);
      applyRunDateRangeControls(selectedRunDateRange, { persist: false });
      renderSpeedView();
    });
  }
}

function setupRunDateRangeUiPersistence() {
  const syncUi = () => {
    applyRunDateRangeControls(selectedRunDateRange, { persist: false });
  };

  window.addEventListener("load", syncUi, { once: true });
  window.addEventListener("pageshow", syncUi);
}

function normalizePredictionInterval(value) {
  const text = String(value ?? "").trim();
  if (text === "60" || text === "90" || text === "95") return text;
  return "95";
}

function saveStoredAnalyticsVisibility(visible) {
  try {
    if (!window?.localStorage) return;
    window.localStorage.setItem(
      ANALYTICS_STORAGE_KEY,
      String(Boolean(visible)),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function filterRecentRunsByDateRange(recentRuns, range) {
  if (!Array.isArray(recentRuns) || !recentRuns.length) return [];
  const normalized = normalizeRunDateRange(range);
  if (!normalized.from && !normalized.to) return [...recentRuns];
  return recentRuns.filter((run) => {
    const date = typeof run?.date === "string" ? run.date : "";
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    if (normalized.from && date < normalized.from) return false;
    if (normalized.to && date > normalized.to) return false;
    return true;
  });
}

function readStoredRunDateRange() {
  try {
    if (!window?.localStorage) return { from: null, to: null };
    const raw = window.localStorage.getItem(RUN_DATE_RANGE_STORAGE_KEY);
    if (!raw) return { from: null, to: null };
    const parsed = JSON.parse(raw);
    return normalizeRunDateRange(parsed);
  } catch {
    return { from: null, to: null };
  }
}

function saveStoredRunDateRange(range) {
  try {
    if (!window?.localStorage) return;
    window.localStorage.setItem(
      RUN_DATE_RANGE_STORAGE_KEY,
      JSON.stringify(normalizeRunDateRange(range)),
    );
  } catch {
    // Ignore storage failures.
  }
}

function applyRunDateRangeControls(range, { persist = true } = {}) {
  if (runsDateFromInput) runsDateFromInput.value = range?.from ?? "";
  if (runsDateToInput) runsDateToInput.value = range?.to ?? "";
  if (persist) saveStoredRunDateRange(range);
}

function normalizeRunDateRange(range) {
  const from = normalizeDateInputValue(range?.from);
  const to = normalizeDateInputValue(range?.to);
  if (from && to && from > to) {
    return { from: to, to: from };
  }
  return { from, to };
}

function normalizeDateInputValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return parseIsoDate(trimmed) ? trimmed : null;
}

function resolveInitialRunDateRange(recentRuns, snapshotDate, storedRange) {
  const normalizedStoredRange = normalizeRunDateRange(storedRange);
  if (hasRunDateRange(normalizedStoredRange)) {
    return normalizedStoredRange;
  }
  return getDefaultRecentRunDateRange(recentRuns, snapshotDate);
}

export function getDefaultRecentRunDateRange(recentRuns, snapshotDate = null) {
  const anchorDate =
    findLatestRunDate(recentRuns) ??
    normalizeDateInputValue(snapshotDate) ??
    null;
  if (!anchorDate) return { from: null, to: null };
  return {
    from: addIsoDateDays(anchorDate, -6),
    to: anchorDate,
  };
}

function findLatestRunDate(recentRuns) {
  if (!Array.isArray(recentRuns) || !recentRuns.length) return null;
  let latest = null;
  for (const run of recentRuns) {
    const date = normalizeDateInputValue(run?.date);
    if (!date) continue;
    if (!latest || date > latest) {
      latest = date;
    }
  }
  return latest;
}

function addIsoDateDays(dateText, days) {
  const parsed = parseIsoDate(dateText);
  if (!parsed) return null;
  const shifted = new Date(parsed.getTime());
  shifted.setDate(shifted.getDate() + days);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(shifted.getDate()).padStart(2, "0")}`;
}

function hasRunDateRange(range) {
  return Boolean(range?.from || range?.to);
}

function isMobileViewport() {
  return Boolean(window?.matchMedia?.("(max-width: 768px)")?.matches);
}

function renderLastSynced(snapshotDate) {
  if (!lastSyncedEl) return;
  lastSyncedEl.textContent = snapshotDate
    ? `Synced ${snapshotDate}`
    : "Synced unavailable";
  lastSyncedEl.classList.remove("skeleton");
}

function renderSummary(
  entries,
  recentRuns,
  analytics,
  predictionSummary,
  predictionsEnabled = true,
) {
  if (!summaryEl) return;
  const coverageTile = predictionsEnabled
    ? renderPredictionCoverage(predictionSummary)
    : "";
  const tiles = [
    {
      label: "VO2 max",
      value:
        analytics.currentVo2max != null
          ? formatVo2max(analytics.currentVo2max)
          : "Unavailable",
      subvalue:
        analytics.currentVo2max != null
          ? analytics.vo2maxTrend
            ? `Trend: ${formatTrendLabel(analytics.vo2maxTrend)}`
            : "Garmin current value"
          : "Not present in this snapshot",
      unavailable: analytics.currentVo2max == null,
    },
    {
      label: "VO2 trend",
      value: analytics.vo2maxTrendPoints?.length
        ? `${analytics.vo2maxTrendPoints.length} samples`
        : "Unavailable",
      subvalue: analytics.vo2maxTrendPoints?.length
        ? formatVo2maxTrendSummary(analytics.vo2maxTrendPoints)
        : "Trend array not present in this snapshot",
      unavailable: !analytics.vo2maxTrendPoints?.length,
    },
    {
      label: "Training load",
      value: analytics.trainingLoadTrend
        ? formatTrendLabel(analytics.trainingLoadTrend)
        : "Unavailable",
      subvalue: analytics.trainingLoadTrend
        ? "Garmin load trend"
        : "Not present in this snapshot",
      unavailable: !analytics.trainingLoadTrend,
    },
  ];
  summaryEl.innerHTML = tiles.map(renderSummaryTile).join("") + coverageTile;
}

function renderSummaryTile(tile) {
  return `
    <div class="summary-tile${
      tile.unavailable ? " summary-tile-unavailable" : ""
    }">
      <span class="summary-tile-label">${escapeHtml(tile.label)}</span>
      <span class="summary-tile-value">${escapeHtml(tile.value)}</span>
      <span class="summary-tile-subvalue">${escapeHtml(tile.subvalue)}</span>
    </div>
  `;
}

function renderPredictionCoverage(predictionSummary) {
  const latestUsefulRun = predictionSummary?.latest_useful_run ?? null;
  return `
    <div class="summary-tile summary-tile-coverage">
      <span class="summary-tile-label">Prediction set</span>
      <span class="summary-tile-value">${escapeHtml(
        `${predictionSummary?.useful_run_count ?? 0} useful runs`,
      )}</span>
      <span class="summary-tile-subvalue">${escapeHtml(
        latestUsefulRun?.date && latestUsefulRun?.distance
          ? `Latest anchor ${latestUsefulRun.distance} · ${latestUsefulRun.date}`
          : predictionSummary?.warning ||
              "Runs that can anchor prediction targets",
      )}</span>
    </div>
  `;
}

function renderReadiness(readiness) {
  if (!readinessEl) return;
  readinessEl.innerHTML = `
    <div class="summary-tile summary-tile-readiness">
      <span class="summary-tile-label">Readiness</span>
      <span class="summary-tile-subvalue">Garmin recovery signals with sleep shown in the most legible format available.</span>
      <div class="readiness-grid">
        ${readinessRows(readiness)
          .map(
            (row) => `
              <div class="readiness-row">
                <div class="readiness-row-copy">
                  <span class="readiness-row-label">${escapeHtml(
                    row.label,
                  )}</span>
                  <span class="readiness-row-helper">${escapeHtml(
                    row.helper,
                  )}</span>
                </div>
                <span class="readiness-row-value">${escapeHtml(
                  row.value,
                )}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderAnalyticsNotice(analytics, recentRuns, predictionSummary) {
  if (!analyticsWarning) return;
  const message = buildAnalyticsNotice(
    analytics,
    recentRuns,
    predictionSummary,
  );
  if (!message) {
    analyticsWarning.textContent = "";
    analyticsWarning.setAttribute("hidden", "");
    return;
  }
  analyticsWarning.textContent = message;
  analyticsWarning.removeAttribute("hidden");
}

export function buildAnalyticsNotice(analytics, recentRuns, predictionSummary) {
  const missing = collectMissingAnalyticsSignals(analytics, recentRuns);
  if (!missing.length) {
    if (predictionSummary?.stale && predictionSummary?.warning) {
      return predictionSummary.warning;
    }
    return null;
  }
  if (missing.length === 1 && missing[0] === "training load") {
    return "Garmin did not return training load for this snapshot. The other live analytics are shown where available.";
  }
  return `Some Garmin metrics are missing from this snapshot: ${formatMissingList(
    missing,
  )}. We show the live data we do have and leave the rest blank.`;
}

export function buildCompletenessSuffix(analytics, recentRuns) {
  const missing = collectMissingAnalyticsSignals(analytics, recentRuns);
  return missing.length ? ` · partial data (${missing.length})` : "";
}

export function collectMissingAnalyticsSignals(analytics, recentRuns) {
  const missing = [];
  if (analytics.currentVo2max == null) missing.push("VO2 max");
  if (!analytics.vo2maxTrendPoints?.length) missing.push("VO2 trend");
  if (!analytics.trainingLoadTrend) missing.push("training load");
  if (!analytics.readiness || !Object.keys(analytics.readiness).length)
    missing.push("readiness");
  if (analytics.readiness?.restingHeartRateBpm == null)
    missing.push("resting heart rate");
  if (analytics.readiness?.rawHrvMs == null) missing.push("raw HRV");
  if (!Array.isArray(recentRuns) || !recentRuns.length)
    missing.push("recent runs");
  return missing;
}

function filterAnalyticsPredictions(predictions) {
  return predictions.filter((prediction) =>
    ANALYTICS_TARGETS.has(prediction.distance_label),
  );
}

function renderRecentRuns(
  recentRuns,
  totalRuns,
  dateRange = { from: null, to: null },
) {
  if (!runsContainer) return;
  if (!recentRuns.length) {
    const hasDateFilter = Boolean(dateRange?.from || dateRange?.to);
    runsContainer.innerHTML = hasDateFilter
      ? `
        <div class="speed-empty">
          <div class="speed-empty-copy">No runs match the selected date range.</div>
          <button class="speed-empty-action" type="button" data-reset-display-range>
            Reset to latest 7 days
          </button>
        </div>
      `
      : `<div class="speed-empty">No recent Garmin runs yet.</div>`;
    if (runsNoteEl) {
      runsNoteEl.textContent = hasDateFilter
        ? `No runs found between ${formatRunDateRangeLabel(
            dateRange,
          )}. Reset to the latest 7 days to restore the default view.`
        : "No recent runs available in the selected window.";
      runsNoteEl.removeAttribute("hidden");
    }
    runsContainer
      .querySelectorAll("[data-reset-display-range]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          selectedRunDateRange = getDefaultRecentRunDateRange(
            currentSpeedPayload?.recentRuns ?? [],
            currentSpeedPayload?.snapshotDate,
          );
          saveStoredRunDateRange(selectedRunDateRange);
          applyRunDateRangeControls(selectedRunDateRange, {
            persist: false,
          });
          renderSpeedView();
        });
      });
    return;
  }

  if (runsNoteEl) {
    const rangeLabel = formatRunDateRangeLabel(dateRange);
    const baseLabel =
      totalRuns > recentRuns.length
        ? `Showing ${recentRuns.length} of ${totalRuns} recent runs`
        : `Showing all ${totalRuns} recent runs`;
    runsNoteEl.textContent = rangeLabel
      ? `${baseLabel} from ${rangeLabel}.`
      : `${baseLabel}.`;
    runsNoteEl.removeAttribute("hidden");
  }

  const groups = new Map();
  recentRuns.forEach((run, index) => {
    const date = run.date ?? "Unknown date";
    const group = groups.get(date) ?? [];
    group.push({ run, index });
    groups.set(date, group);
  });

  runsContainer.innerHTML = [...groups.entries()]
    .map(
      ([date, runs]) => `
        <details class="speed-run-date-group">
          <summary class="speed-run-date-group-summary">
            <div class="speed-run-date-group-copy">
              <span class="speed-run-date-group-kicker">Run day</span>
              <span class="speed-run-date-group-label">${escapeHtml(
                formatRunGroupLabel(date),
              )}</span>
              <span class="speed-run-date-group-meta">${escapeHtml(
                runs.length === 1 ? "1 workout" : `${runs.length} workouts`,
              )}</span>
            </div>
            <span class="speed-run-date-group-action" aria-hidden="true"></span>
          </summary>
          <div class="speed-run-date-group-list" hidden>
            ${runs
              .map(({ run, index }) => {
                const name = run.name ?? "Run";
                const distance =
                  run.distance ?? formatDistanceKm(run.distance_m);
                const duration = run.duration ?? formatDuration(run.duration_s);
                const pace = run.pace ?? formatPace(run.pace_s_per_km);
                return `
                  <button
                    class="speed-row speed-run-row speed-run-row-button"
                    type="button"
                    data-run-index="${index}"
                    aria-expanded="false"
                    aria-label="Open details for ${escapeHtml(
                      name,
                    )} on ${escapeHtml(date)}"
                  >
                    <span class="speed-row-name">${escapeHtml(name)}</span>
                    <span class="speed-row-value">${escapeHtml(distance)}</span>
                    <span class="speed-row-meta">${escapeHtml(
                      `${duration} · ${pace}`,
                    )}</span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </details>
      `,
    )
    .join("");

  runsContainer.querySelectorAll(".speed-run-row-button").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.runIndex);
      const run = Number.isInteger(index) ? recentRuns[index] : null;
      if (run) openRunDetailsModal(run, button);
    });
  });

  runsContainer.querySelectorAll(".speed-run-date-group").forEach((group) => {
    const list = group.querySelector(".speed-run-date-group-list");
    if (!list) return;
    group.addEventListener("toggle", () => {
      list.hidden = !group.open;
      if (
        !group.open &&
        activeRunDetailPanel &&
        group.contains(activeRunDetailPanel)
      ) {
        closeRunDetailsModal();
      }
    });
  });
}

function openRunDetailsModal(run, anchorButton = null) {
  openInlineDetailPanel(
    {
      kicker: "Recent run",
      title: run.name ?? "Run",
      heroValue: run.distance ?? formatDistanceKm(run.distance_m),
      heroMeta: `${run.duration ?? formatDuration(run.duration_s)} · ${
        run.pace ?? formatPace(run.pace_s_per_km)
      }`,
      items: [
        renderDetailItem("Date", run.date ?? "—"),
        renderDetailItem(
          "Duration",
          run.duration ?? formatDuration(run.duration_s),
        ),
        renderDetailItem("Pace", run.pace ?? formatPace(run.pace_s_per_km)),
        ...(run.avg_heart_rate_bpm != null
          ? [
              renderDetailItem(
                "Avg heart rate",
                formatHeartRate(run.avg_heart_rate_bpm),
              ),
            ]
          : []),
      ],
    },
    anchorButton,
  );
}

function openPersonalBestDetailsModal(entry, anchorButton = null) {
  openInlineDetailPanel(buildPersonalBestDetail(entry), anchorButton);
}

function openPredictionDetailsModal(prediction, anchorButton = null) {
  openInlineDetailPanel(buildPredictionDetail(prediction), anchorButton);
}

export function buildPredictionDetail(prediction) {
  const selectedInterval = normalizePredictionInterval(
    selectedPredictionInterval,
  );
  const intervalValueMap = {
    60: prediction?.ci_60 ?? prediction?.ci_68,
    90: prediction?.ci_90 ?? prediction?.ci_95,
    95: prediction?.ci_95 ?? prediction?.ci_90,
  };
  const selectedIntervalValue = intervalValueMap[selectedInterval] ?? "—";
  return {
    kicker: "Prediction details",
    title: prediction?.distance_label ?? "Run prediction",
    heroValue: prediction?.predicted_time ?? "—",
    heroMeta: formatPredictionHeroMeta(prediction),
    beforeGrid: `
      <div class="speed-prediction-selector">
        <label class="speed-prediction-selector-label" for="speed-prediction-interval-select">
          Confidence interval
        </label>
        <select
          class="speed-prediction-interval-select"
          id="speed-prediction-interval-select"
          data-prediction-interval-select
        >
          <option value="60">60%</option>
          <option value="90">90%</option>
          <option value="95">95%</option>
        </select>
      </div>
      <div class="speed-prediction-selected-interval">
        <span class="speed-run-detail-label">Selected interval</span>
        <span
          class="speed-prediction-selected-interval-value"
          data-prediction-selected-interval-value
        >
          ${escapeHtml(
            formatConfidenceIntervalSummary(
              selectedInterval,
              selectedIntervalValue,
            ),
          )}
        </span>
      </div>
    `,
    items: [
      renderPredictionIntervalItem(
        "60% CI",
        prediction?.ci_60 ?? prediction?.ci_68,
      ),
      renderPredictionIntervalItem(
        "90% CI",
        prediction?.ci_90 ?? prediction?.ci_95,
      ),
      renderPredictionModelItem(prediction),
      renderPredictionModelBreakdownItem(prediction),
      renderPredictionTrainingPacesItem(prediction?.training_paces_summary),
      renderPredictionTrendItem(prediction?.trend),
      renderPredictionHowToImproveItem(prediction?.how_to_improve),
    ],
    onMount(panel) {
      const select = panel.querySelector("[data-prediction-interval-select]");
      const selectedValue = panel.querySelector(
        "[data-prediction-selected-interval-value]",
      );
      if (!select || !selectedValue) return;
      select.value = selectedInterval;
      select.addEventListener("change", () => {
        const normalized = normalizePredictionInterval(select.value);
        selectedPredictionInterval = normalized;
        saveStoredPredictionInterval(normalized);
        selectedValue.textContent = formatConfidenceIntervalSummary(
          normalized,
          intervalValueMap[normalized] ?? "—",
        );
      });
    },
  };
}

export function buildPersonalBestDetail(entry) {
  const rawValue = entry?.context?.raw_value ?? null;
  const sourceRunDate = entry?.context?.source_run_date ?? entry?.date ?? "—";
  const sourceRunDuration =
    entry?.context?.source_run_duration ?? entry?.context?.duration ?? null;
  const sourceRunPace =
    entry?.context?.source_run_pace ?? entry?.context?.pace ?? null;
  const sourceRunHeartRate =
    entry?.context?.source_run_avg_heart_rate_bpm ??
    entry?.context?.avg_heart_rate_bpm ??
    null;
  return {
    kicker: "Personal best",
    title: entry?.name ?? "Record",
    heroValue: formatSpeedValue(entry?.name, entry?.value, rawValue),
    heroMeta: sourceRunDate ?? "",
    items: [
      renderDetailItem("Record", entry?.name ?? "—"),
      renderDetailItem(
        "Value",
        formatSpeedValue(entry?.name, entry?.value, rawValue),
      ),
      renderDetailItem("Date", sourceRunDate ?? "—"),
      ...(sourceRunDuration
        ? [renderDetailItem("Duration", sourceRunDuration)]
        : []),
      ...(sourceRunPace ? [renderDetailItem("Pace", sourceRunPace)] : []),
      ...(sourceRunHeartRate != null
        ? [
            renderDetailItem(
              "Avg heart rate",
              formatHeartRate(sourceRunHeartRate),
            ),
          ]
        : []),
    ],
  };
}

function openInlineDetailPanel(detail, anchorButton = null) {
  if (
    anchorButton &&
    activeRunDetailAnchor === anchorButton &&
    activeRunDetailPanel
  ) {
    closeRunDetailsModal();
    return;
  }

  closeRunDetailsModal();

  const panel = document.createElement("div");
  panel.className = "card speed-run-modal speed-run-inline-panel";
  panel.setAttribute("role", "region");
  panel.innerHTML = `
    <div class="speed-run-modal-heading">
      <div class="speed-run-modal-heading-copy">
        <div class="modal-header">
          <p class="label">${escapeHtml(detail.kicker ?? "Details")}</p>
          <h2>${escapeHtml(detail.title ?? "Item")}</h2>
        </div>
        <button class="modal-close" type="button" aria-label="Close run details">&times;</button>
      </div>
      <div class="speed-run-modal-hero">
        <span class="speed-run-modal-hero-value">${escapeHtml(
          detail.heroValue ?? "—",
        )}</span>
        <span class="speed-run-modal-hero-meta">${escapeHtml(
          detail.heroMeta ?? "",
        )}</span>
      </div>
      ${detail.beforeGrid ?? ""}
      <div class="speed-run-modal-grid">
        ${(detail.items ?? []).join("")}
      </div>
      ${detail.afterGrid ?? ""}
    </div>
  `;

  const close = () => closeRunDetailsModal();
  panel.addEventListener("click", (event) => {
    if (event.target.closest(".modal-close")) {
      close();
    }
  });

  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeyDown);

  const cleanup = () => {
    document.removeEventListener("keydown", onKeyDown);
  };

  if (anchorButton?.parentElement) {
    anchorButton.insertAdjacentElement("afterend", panel);
    anchorButton.setAttribute("aria-expanded", "true");
  } else {
    document.body.appendChild(panel);
  }

  activeRunDetailPanel = panel;
  activeRunDetailCleanup = cleanup;
  activeRunDetailAnchor = anchorButton ?? null;
  detail.onMount?.(panel);
  panel.querySelector(".modal-close")?.focus();
}

function closeRunDetailsModal() {
  if (!activeRunDetailPanel) return;
  activeRunDetailCleanup?.();
  activeRunDetailCleanup = null;
  if (activeRunDetailAnchor) {
    activeRunDetailAnchor.setAttribute("aria-expanded", "false");
  }
  activeRunDetailPanel.remove();
  activeRunDetailPanel = null;
  activeRunDetailAnchor = null;
}

function renderDetailItem(label, value) {
  return `
    <div class="speed-run-detail-item">
      <span class="speed-run-detail-label">${escapeHtml(label)}</span>
      <span class="speed-run-detail-value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderPredictionIntervalItem(label, value) {
  return `
    <div class="speed-run-detail-item speed-prediction-interval-card">
      <span class="speed-run-detail-label">${escapeHtml(label)}</span>
      <span class="speed-prediction-interval-value">${escapeHtml(
        value ?? "—",
      )}</span>
    </div>
  `;
}

function renderPredictionTrendItem(trend) {
  return `
    <div class="speed-run-detail-item speed-prediction-interval-card speed-prediction-interval-card--trend">
      <span class="speed-run-detail-label">Trend</span>
      <span class="speed-prediction-trend-chip">${escapeHtml(
        formatTrendLabel(trend),
      )}</span>
    </div>
  `;
}

function renderPredictionModelItem(prediction) {
  return renderDetailItem("Model", formatPredictionModelSummary(prediction));
}

function renderPredictionModelBreakdownItem(prediction) {
  const models = Array.isArray(prediction?.supporting_models)
    ? prediction.supporting_models
    : [];
  const modelRows = PREDICTION_MODEL_ORDER.map((modelName) =>
    renderPredictionModelBreakdownRow(
      modelName,
      models.find((model) => model?.model === modelName) ?? null,
      prediction?.model ?? null,
    ),
  );
  return `
    <div class="speed-run-detail-item speed-run-detail-item--stacked">
      <span class="speed-run-detail-label">Model breakdown</span>
      <div class="speed-prediction-model-breakdown">
        ${modelRows.join("")}
      </div>
    </div>
  `;
}

function renderPredictionTrainingPacesItem(trainingPacesSummary) {
  const trainingPaces =
    typeof trainingPacesSummary === "object" && trainingPacesSummary
      ? trainingPacesSummary
      : null;
  const bands = Array.isArray(trainingPaces?.bands) ? trainingPaces.bands : [];
  if (!trainingPaces || !bands.length) {
    return renderDetailItem(
      "Training paces",
      formatPredictionTrainingPacesSummary(trainingPacesSummary),
    );
  }

  const metaParts = [];
  if (trainingPaces.vdot != null) {
    metaParts.push(`VDOT ${Number(trainingPaces.vdot).toFixed(1)}`);
  }
  const sourceRunName = trainingPaces?.source_run?.name
    ? String(trainingPaces.source_run.name)
    : "";
  if (sourceRunName) metaParts.push(`Source run ${sourceRunName}`);

  return `
    <div class="speed-run-detail-item speed-run-detail-item--stacked">
      <span class="speed-run-detail-label">Training paces</span>
      <div class="speed-prediction-training-paces">
        ${
          metaParts.length
            ? `<p class="speed-prediction-training-paces-meta">${escapeHtml(
                metaParts.join(" · "),
              )}</p>`
            : ""
        }
        <div class="speed-prediction-training-paces-list">
          ${bands.map((band) => renderPredictionTrainingPaceRow(band)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderPredictionHowToImproveItem(howToImprove) {
  return renderDetailItem(
    "How to improve",
    formatPredictionHowToImproveSummary(howToImprove),
  );
}

function formatPredictionHeroMeta(prediction) {
  const model = prediction?.model ? String(prediction.model) : "";
  const confidence = formatPredictionConfidenceLabel(prediction?.confidence);
  const parts = [];
  if (model) parts.push(model);
  if (confidence) parts.push(confidence);
  return parts.length ? parts.join(" · ") : "Confidence intervals and trend";
}

function formatPredictionConfidenceLabel(confidence) {
  if (!confidence) return "";
  return `${formatTrendLabel(confidence)} confidence`;
}

function formatPredictionModelSummary(prediction) {
  if (!prediction) return "—";
  const parts = [];
  if (prediction.model) parts.push(String(prediction.model));
  const confidence = formatPredictionConfidenceLabel(prediction.confidence);
  if (confidence) parts.push(confidence);
  const supportingModels = Array.isArray(prediction.supporting_models)
    ? prediction.supporting_models.length
    : 0;
  if (supportingModels > 1) {
    parts.push(`${supportingModels} models considered`);
  }
  return parts.length ? parts.join(" · ") : "—";
}

function renderPredictionModelBreakdownRow(
  modelName,
  model,
  selectedModelName,
) {
  const isSelected = Boolean(
    selectedModelName && modelName === selectedModelName,
  );
  const confidence = model?.confidence
    ? formatPredictionConfidenceLabel(model.confidence)
    : "";
  const predictedTime = model?.predicted_time
    ? String(model.predicted_time)
    : "—";
  const ci68 = model?.ci_68 ?? "—";
  const ci95 = model?.ci_95 ?? "—";
  const metaParts = [
    model
      ? isSelected
        ? "Selected model"
        : "Comparison model"
      : "No valid fit",
  ];
  if (confidence) metaParts.push(confidence);
  return `
    <div class="speed-prediction-model-row ${isSelected ? "is-selected" : ""}">
      <div class="speed-prediction-model-copy">
        <span class="speed-prediction-model-name">${escapeHtml(
          modelName,
        )}</span>
        <span class="speed-prediction-model-meta">${escapeHtml(
          metaParts.join(" · "),
        )}</span>
      </div>
      <div class="speed-prediction-model-stats">
        <span class="speed-prediction-model-stat">${escapeHtml(
          `Predicted ${predictedTime}`,
        )}</span>
        <span class="speed-prediction-model-stat">${escapeHtml(
          `68% ${ci68} · 95% ${ci95}`,
        )}</span>
      </div>
    </div>
  `;
}

function renderPredictionTrainingPaceRow(band) {
  const bandName = band?.name ? String(band.name) : "Pace";
  const paceLabel = band?.label ? String(band.label) : "—";
  const minFraction =
    typeof band?.min_fraction === "number"
      ? Math.round(band.min_fraction * 100)
      : null;
  const maxFraction =
    typeof band?.max_fraction === "number"
      ? Math.round(band.max_fraction * 100)
      : null;
  const fractionLabel =
    minFraction != null && maxFraction != null
      ? `${minFraction}%–${maxFraction}%`
      : minFraction != null
        ? `${minFraction}%`
        : "";
  return `
    <div class="speed-prediction-training-paces-row">
      <div class="speed-prediction-training-paces-copy">
        <span class="speed-prediction-training-paces-name">${escapeHtml(
          bandName,
        )}</span>
        ${
          fractionLabel
            ? `<span class="speed-prediction-training-paces-meta">${escapeHtml(
                fractionLabel,
              )}</span>`
            : ""
        }
      </div>
      <span class="speed-prediction-training-paces-value">${escapeHtml(
        paceLabel,
      )}</span>
    </div>
  `;
}

function formatPredictionTrainingPacesSummary(trainingPacesSummary) {
  if (!trainingPacesSummary) return "—";
  return String(trainingPacesSummary);
}

function formatPredictionHowToImproveSummary(howToImprove) {
  if (!howToImprove) return "—";
  return String(howToImprove);
}

function formatConfidenceIntervalSummary(interval, value) {
  return `${normalizePredictionInterval(interval)}% CI ${value}`;
}

function formatRunGroupLabel(dateText) {
  const date = parseIsoDate(dateText);
  if (!date) return dateText ?? "Unknown day";

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatRunDateRangeLabel(range) {
  const from = normalizeDateInputValue(range?.from);
  const to = normalizeDateInputValue(range?.to);
  if (!from && !to) return "";
  if (from && to) return `${from} to ${to}`;
  if (from) return `from ${from}`;
  return `until ${to}`;
}

function formatRecentRunWindowLabel(selectedCount, totalCount, range) {
  if (!totalCount) return "0 runs";
  const runLabel = `${selectedCount} ${selectedCount === 1 ? "run" : "runs"}`;
  const rangeLabel = formatRunDateRangeLabel(range);
  if (rangeLabel) return `${runLabel} from ${rangeLabel}`;
  if (selectedCount >= totalCount) {
    return `${totalCount} ${totalCount === 1 ? "run" : "runs"}`;
  }
  return `${runLabel} of ${totalCount} recent runs`;
}

function parseIsoDate(dateText) {
  if (typeof dateText !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function renderPredictions(
  predictions,
  predictionSummary,
  predictionsEnabled = true,
) {
  if (!predictionsContainer) return;
  if (!predictionsEnabled) {
    predictionsContainer.innerHTML = `
      <div class="speed-empty">
        <div class="speed-empty-copy">Speed predictions are currently disabled.</div>
        <div class="speed-empty-copy">The rest of the speed page remains active.</div>
      </div>
    `;
    if (predictionNote) {
      predictionNote.textContent = "";
      predictionNote.setAttribute("hidden", "");
    }
    return;
  }
  if (!predictions.length) {
    predictionsContainer.innerHTML = `<div class="speed-empty">No predicted times yet.</div>`;
    if (predictionNote) {
      predictionNote.textContent = "";
      predictionNote.setAttribute("hidden", "");
    }
    return;
  }

  predictionsContainer.innerHTML = predictions
    .map((prediction, index) => {
      return `
        <button
          class="speed-prediction-card speed-prediction-card-button"
          type="button"
          data-prediction-index="${index}"
          aria-expanded="false"
          aria-label="Open prediction details for ${escapeHtml(
            prediction.distance_label ?? "Distance",
          )}"
        >
          <div class="speed-row speed-prediction-row">
            <span class="speed-row-name">${escapeHtml(
              prediction.distance_label ?? "Distance",
            )}</span>
            <span class="speed-row-value">${escapeHtml(
              prediction.predicted_time ?? "-",
            )}</span>
          </div>
        </button>
      `;
    })
    .join("");

  predictionsContainer
    .querySelectorAll(".speed-prediction-card-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.predictionIndex);
        const prediction = Number.isInteger(index) ? predictions[index] : null;
        if (prediction) openPredictionDetailsModal(prediction, button);
      });
    });

  if (!predictionNote) return;
  if (predictionSummary?.warning) {
    predictionNote.textContent = predictionSummary.warning;
    predictionNote.removeAttribute("hidden");
  } else {
    predictionNote.textContent = "";
    predictionNote.setAttribute("hidden", "");
  }
}

function renderTable(entries) {
  if (!entries.length) {
    table.innerHTML = `<div class="speed-empty">No personal records yet.</div>`;
    return;
  }

  const sorted = sortEntries(entries);
  table.innerHTML = sorted
    .map(
      (entry, index) => `
        <button
          class="speed-row speed-run-row-button speed-pb-row-button"
          type="button"
          data-entry-index="${index}"
          aria-expanded="false"
          aria-label="Open details for ${escapeHtml(entry.name)}"
        >
          <span class="speed-row-name">${escapeHtml(entry.name)}</span>
          <span class="speed-row-value" title="All-time personal best — set on ${escapeHtml(
            entry.date ?? "unknown date",
          )}">
            ${escapeHtml(
              formatSpeedValue(
                entry.name,
                entry.value,
                entry.context?.raw_value,
              ),
            )}
            <span class="pb-badge">PB</span>
          </span>
          <span class="speed-row-date">${escapeHtml(entry.date ?? "")}</span>
        </button>
      `,
    )
    .join("");

  table.querySelectorAll(".speed-pb-row-button").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.entryIndex);
      const entry = Number.isInteger(index) ? sorted[index] : null;
      if (entry) openPersonalBestDetailsModal(entry, button);
    });
  });
}

export function buildPredictions(recentRuns, snapshotDate = null) {
  const runs = normalizeRuns(recentRuns, snapshotDate);
  const predictions = [];
  const trainingPacesSource = selectVdotSourceRun(runs);
  const trainingPaces = buildTrainingPaces(trainingPacesSource);
  for (const target of PREDICTION_TARGETS) {
    const candidates = buildPredictionCandidates(runs, target.distanceMeters);
    const selectedCandidate = selectPredictionCandidate(
      target.label,
      target.distanceMeters,
      candidates,
    );
    if (!selectedCandidate) continue;
    const selected = applyAgreementRules(selectedCandidate, candidates);
    predictions.push(buildPredictionRecord(selected, target, trainingPaces));
  }
  return predictions;
}

export function buildPredictionSummary(
  predictions,
  recentRuns,
  snapshotDate = null,
) {
  const normalizedRuns = normalizeRuns(recentRuns, snapshotDate);
  const usefulRuns = uniqueSourceRuns(
    predictions.map((prediction) => prediction.source_run),
  );
  const latestUsefulRun = usefulRuns.length
    ? [...usefulRuns].sort((a, b) =>
        String(b.date).localeCompare(String(a.date)),
      )[0]
    : (normalizedRuns[0] ?? null);
  const stale = Boolean(
    latestUsefulRun &&
    latestUsefulRun.age_days != null &&
    latestUsefulRun.age_days > PREDICTION_STALE_DAYS,
  );
  return {
    snapshot_date: snapshotDate ?? null,
    latest_useful_run: latestUsefulRun,
    stale,
    warning: stale
      ? "Predictions are based on a run older than 14 days."
      : latestUsefulRun
        ? `Based on ${latestUsefulRun.date}.`
        : "",
    useful_run_count: usefulRuns.length,
  };
}

export function sortEntries(entries) {
  const order = [
    "Fastest 1K",
    "Fastest Mile",
    "Fastest 5K",
    "Fastest 10K",
    "Fastest Half Marathon",
    "Longest Run",
  ];
  return [...entries].sort(
    (a, b) => order.indexOf(a.name) - order.indexOf(b.name),
  );
}

export function formatSpeedValue(recordType, value, rawValue = null) {
  if (value == null || value === "") return "-";
  const type = String(recordType ?? "");
  const numeric = typeof value === "number" ? value : Number(value);
  const rawNumeric =
    rawValue == null || rawValue === ""
      ? null
      : typeof rawValue === "number"
        ? rawValue
        : Number(rawValue);
  const source = Number.isFinite(rawNumeric) ? rawNumeric : numeric;

  if (type === "Longest Run") {
    if (!Number.isFinite(source)) return String(value);
    return `${formatDistanceKm(source)} km`;
  }

  if (type.startsWith("Fastest ")) {
    if (!Number.isFinite(source)) return String(value);
    return formatDuration(source);
  }

  return String(value);
}

export function formatDuration(seconds) {
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  if (hours > 0)
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      secs,
    ).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatDistanceKm(meters) {
  return (Math.floor((meters / 1000) * 100) / 100)
    .toFixed(2)
    .replace(/\.00$/, "");
}

export function formatPace(secondsPerKm) {
  if (!Number.isFinite(secondsPerKm)) return "-";
  return `${formatDuration(secondsPerKm)} /km`;
}

export function formatHeartRate(value) {
  const numeric = toNumber(value);
  return numeric == null ? "—" : `${Math.round(numeric)} bpm`;
}

export function formatMilliseconds(value) {
  const numeric = toNumber(value);
  return numeric == null ? "—" : `${Math.round(numeric)} ms`;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRuns(recentRuns, snapshotDate) {
  if (!Array.isArray(recentRuns)) return [];
  const snapshot = parseDate(snapshotDate) ?? new Date();
  return recentRuns
    .map((run) => normalizeRun(run, snapshot))
    .filter((run) => run != null);
}

function normalizeRun(run, snapshotDate) {
  if (!run || typeof run !== "object") return null;
  const distanceMeters = numberFrom(
    run.distance_m ?? run.distance_meters ?? run.distance ?? run.meters,
  );
  const durationSeconds = numberFrom(
    run.duration_s ??
      run.duration_seconds ??
      run.duration ??
      run.movingDuration ??
      run.elapsedDuration ??
      run.moving_duration ??
      run.timerDuration,
  );
  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationSeconds) ||
    distanceMeters <= 0 ||
    durationSeconds <= 0
  ) {
    return null;
  }
  const startedAt = parseDateTime(
    run.start_time ??
      run.startTimeLocal ??
      run.startTimeGMT ??
      run.startTime ??
      run.date,
  );
  const ageDays =
    run.age_days != null
      ? Number(run.age_days)
      : startedAt
        ? Math.max(0, Math.floor((snapshotDate - startedAt) / 86400000))
        : null;
  const paceSeconds = durationSeconds / (distanceMeters / 1000);
  const name = String(
    run.name ?? run.activityName ?? run.title ?? run.activity_type ?? "Run",
  );
  return {
    name,
    activity_type: String(run.activity_type ?? run.type ?? run.sport ?? ""),
    activity_id:
      run.activity_id ?? run.activityId ?? run.id ?? run.activityID ?? null,
    date: formatDisplayDate(
      run.date ??
        startedAt ??
        run.startTimeLocal ??
        run.startTimeGMT ??
        run.startTime,
    ),
    distance_m: distanceMeters,
    distance: run.distance ?? `${formatDistanceKm(distanceMeters)} km`,
    duration_s: durationSeconds,
    duration: run.duration ?? formatDuration(durationSeconds),
    pace_s_per_km: paceSeconds,
    pace: run.pace ?? formatPace(paceSeconds),
    avg_heart_rate_bpm: numberFrom(
      run.avg_heart_rate_bpm ??
        run.averageHeartRateInBeatsPerMinute ??
        run.averageHeartRate ??
        run.average_hr ??
        run.avgHeartRate ??
        run.avg_hr,
    ),
    age_days: ageDays,
  };
}

function normalizeVo2maxTrendPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const vo2max = numberFrom(
        point.vo2max ??
          point.vo2Max ??
          point.vo2MaxValue ??
          point.vO2MaxValue ??
          point.value,
      );
      const date = toText(point.date ?? point.calendarDate ?? point.startDate);
      if (!Number.isFinite(vo2max) && !date) return null;
      return {
        date: date || null,
        vo2max: Number.isFinite(vo2max) ? vo2max : null,
      };
    })
    .filter(Boolean);
}

function selectSourceRun(runs, targetDistanceMeters) {
  const eligible = runs.filter(
    (run) =>
      run.distance_m >= targetDistanceMeters * PREDICTION_MIN_DISTANCE_RATIO,
  );
  if (eligible.length)
    return rankAnchorCandidates(eligible, targetDistanceMeters)[0];
  return runs.reduce((best, run) => {
    if (!best) return run;
    return run.distance_m > best.distance_m ? run : best;
  }, null);
}

function selectVdotSourceRun(runs) {
  return selectSourceRun(runs, 10000);
}

function rankAnchorCandidates(runs, targetDistanceMeters) {
  return [...runs].sort((a, b) => {
    const distanceDeltaA =
      Math.abs(a.distance_m - targetDistanceMeters) / targetDistanceMeters;
    const distanceDeltaB =
      Math.abs(b.distance_m - targetDistanceMeters) / targetDistanceMeters;
    if (distanceDeltaA !== distanceDeltaB)
      return distanceDeltaA - distanceDeltaB;
    const paceA = a.pace_s_per_km ?? Number.POSITIVE_INFINITY;
    const paceB = b.pace_s_per_km ?? Number.POSITIVE_INFINITY;
    if (paceA !== paceB) return paceA - paceB;
    const durationA = a.duration_s ?? Number.POSITIVE_INFINITY;
    const durationB = b.duration_s ?? Number.POSITIVE_INFINITY;
    if (durationA !== durationB) return durationA - durationB;
    const ageA = a.age_days ?? 9999;
    const ageB = b.age_days ?? 9999;
    if (ageA !== ageB) return ageA - ageB;
    return b.distance_m - a.distance_m;
  });
}

function anchorFitRankKey(anchor) {
  return [
    anchor.pace_s_per_km ?? Number.POSITIVE_INFINITY,
    anchor.duration_s ?? Number.POSITIVE_INFINITY,
    anchor.age_days ?? 9999,
    parseDate(anchor.date) ?? new Date("9999-12-31T00:00:00Z"),
    -anchor.distance_m,
  ];
}

function distanceBucket(distanceMeters) {
  return Math.round(distanceMeters / DISTANCE_BUCKET_METERS);
}

function collapseDistanceBuckets(runs) {
  const bestByBucket = new Map();
  const sorted = [...runs].sort((a, b) =>
    compareKeys(anchorFitRankKey(a), anchorFitRankKey(b)),
  );
  for (const run of sorted) {
    const bucket = distanceBucket(run.distance_m);
    if (!bestByBucket.has(bucket)) {
      bestByBucket.set(bucket, run);
    }
  }
  return [...bestByBucket.values()];
}

function compareKeys(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function anchorSubsetScore(combo, fitKind, targetDistanceMeters) {
  if (combo.length < 2) return null;
  let slope;
  let intercept;
  let predictedSeconds;
  let residualSigma;
  if (fitKind === "log") {
    const xs = combo.map((anchor) => Math.log(anchor.distance_m));
    const ys = combo.map((anchor) => Math.log(anchor.duration_s));
    try {
      [slope, intercept] = linearRegression(xs, ys);
    } catch {
      return null;
    }
    predictedSeconds = Math.exp(
      intercept + slope * Math.log(targetDistanceMeters),
    );
    residualSigma = logResidualSigma(xs, ys, slope, intercept);
  } else if (fitKind === "linear") {
    const xs = combo.map((anchor) => anchor.duration_s);
    const ys = combo.map((anchor) => anchor.distance_m);
    try {
      [slope, intercept] = linearRegression(xs, ys);
    } catch {
      return null;
    }
    if (slope <= 0) return null;
    predictedSeconds = (targetDistanceMeters - intercept) / slope;
    if (predictedSeconds <= 0) return null;
    residualSigma = linearResidualSigma(xs, ys, slope, intercept) / slope;
  } else {
    return null;
  }
  if (predictedSeconds <= 0) return null;
  const distances = combo.map((anchor) => anchor.distance_m);
  const span = Math.max(...distances) / Math.min(...distances);
  const averageAge =
    combo.reduce((sum, anchor) => sum + (anchor.age_days ?? 9999), 0) /
    combo.length;
  const sizePenalty = combo.length >= 3 ? 0.0 : 0.01;
  return [residualSigma, -span, averageAge, sizePenalty];
}

function bestAnchorSubset(
  runs,
  targetDistanceMeters,
  fitKind,
  minSize = 2,
  maxSize = 3,
) {
  const ranked = rankAnchorCandidates(
    collapseDistanceBuckets(runs),
    targetDistanceMeters,
  );
  if (ranked.length <= minSize) return ranked.slice(0, maxSize);
  const pool = ranked.slice(0, Math.min(ranked.length, 10));
  let bestCombo = null;
  let bestScore = null;

  const choose = (start, combo, size) => {
    if (combo.length === size) {
      const score = anchorSubsetScore(combo, fitKind, targetDistanceMeters);
      if (!score) return;
      if (
        !bestScore ||
        score[0] < bestScore[0] ||
        (score[0] === bestScore[0] &&
          (score[1] < bestScore[1] ||
            (score[1] === bestScore[1] &&
              (score[2] < bestScore[2] ||
                (score[2] === bestScore[2] && score[3] < bestScore[3])))))
      ) {
        bestScore = score;
        bestCombo = combo.slice();
      }
      return;
    }
    for (let index = start; index < pool.length; index += 1) {
      combo.push(pool[index]);
      choose(index + 1, combo, size);
      combo.pop();
    }
  };

  for (let size = Math.min(maxSize, pool.length); size >= minSize; size -= 1) {
    choose(0, [], size);
  }

  if (bestCombo) return bestCombo;
  return pool.slice(0, maxSize);
}

function buildPredictionCandidates(runs, targetDistanceMeters) {
  const candidates = [];
  const riegelCandidate = buildRiegelCandidate(runs, targetDistanceMeters);
  if (riegelCandidate) candidates.push(riegelCandidate);
  const calibratedCandidate = buildCalibratedRiegelCandidate(
    runs,
    targetDistanceMeters,
  );
  if (calibratedCandidate) candidates.push(calibratedCandidate);
  const criticalSpeedCandidate = buildCriticalSpeedCandidate(
    runs,
    targetDistanceMeters,
  );
  if (criticalSpeedCandidate) candidates.push(criticalSpeedCandidate);
  return candidates;
}

function buildRiegelCandidate(runs, targetDistanceMeters) {
  const source = selectSourceRun(runs, targetDistanceMeters);
  if (!source) return null;
  const predictedSeconds = riegelPrediction(
    source.duration_s,
    source.distance_m,
    targetDistanceMeters,
  );
  const sigmaSeconds = baselineSigma(
    predictedSeconds,
    source.age_days,
    targetDistanceMeters / source.distance_m,
  );
  const confidence = confidenceFromSigmaAndAge(
    predictedSeconds,
    sigmaSeconds,
    source.age_days,
  );
  return {
    model: "Riegel extrapolation",
    predicted_seconds: predictedSeconds,
    sigma_seconds: sigmaSeconds,
    confidence,
    calibration_points: [buildCalibrationPoint(source)],
    source_run: buildPredictionSourceRun(source, confidence),
    trend: predictionTrendFromAge(source.age_days),
    how_to_improve: predictionHowToImprove(source),
    stale: Boolean(
      source.age_days != null && source.age_days > PREDICTION_STALE_DAYS,
    ),
    flags: [],
    supporting_models: [],
  };
}

function buildCalibratedRiegelCandidate(runs, targetDistanceMeters) {
  const usable = calibrationPointsForTarget(runs, targetDistanceMeters);
  if (usable.length < 2) return null;
  const xs = usable.map((anchor) => Math.log(anchor.distance_m));
  const ys = usable.map((anchor) => Math.log(anchor.duration_s));
  let slope;
  let intercept;
  try {
    [slope, intercept] = linearRegression(xs, ys);
  } catch {
    return null;
  }
  const predictedSeconds = Math.exp(
    intercept + slope * Math.log(targetDistanceMeters),
  );
  const residualSigma = logResidualSigma(xs, ys, slope, intercept);
  const sigmaSeconds = Math.max(
    predictedSeconds * 0.03,
    predictedSeconds * residualSigma,
  );
  const source = usable[0];
  const confidence = confidenceFromFit(usable, sigmaSeconds, predictedSeconds);
  return {
    model: "Calibrated Riegel",
    predicted_seconds: predictedSeconds,
    sigma_seconds: sigmaSeconds,
    confidence,
    calibration_points: usable.map((anchor) => buildCalibrationPoint(anchor)),
    source_run: buildPredictionSourceRun(source, confidence),
    trend: predictionTrendFromAge(source.age_days),
    how_to_improve: predictionHowToImprove(source),
    stale: Boolean(
      source.age_days != null && source.age_days > PREDICTION_STALE_DAYS,
    ),
    flags: [],
    supporting_models: [],
    fit: { slope, intercept },
  };
}

function buildCriticalSpeedCandidate(runs, targetDistanceMeters) {
  const usable = criticalSpeedPoints(runs, targetDistanceMeters);
  if (usable.length < 2) return null;
  const xs = usable.map((anchor) => anchor.duration_s);
  const ys = usable.map((anchor) => anchor.distance_m);
  let slope;
  let intercept;
  try {
    [slope, intercept] = linearRegression(xs, ys);
  } catch {
    return null;
  }
  if (slope <= 0) return null;
  const predictedSeconds = (targetDistanceMeters - intercept) / slope;
  if (predictedSeconds <= 0) return null;
  const sigmaSeconds = Math.max(
    linearResidualSigma(xs, ys, slope, intercept) / slope,
    predictedSeconds * 0.025,
  );
  const source = usable[0];
  const confidence = confidenceFromFit(usable, sigmaSeconds, predictedSeconds);
  return {
    model: "Critical Speed",
    predicted_seconds: predictedSeconds,
    sigma_seconds: sigmaSeconds,
    confidence,
    calibration_points: usable.map((anchor) => buildCalibrationPoint(anchor)),
    source_run: buildPredictionSourceRun(source, confidence),
    trend: predictionTrendFromAge(source.age_days),
    how_to_improve: predictionHowToImprove(source),
    stale: Boolean(
      source.age_days != null && source.age_days > PREDICTION_STALE_DAYS,
    ),
    flags: [],
    supporting_models: [],
    fit: {
      cs_m_per_s: slope,
      d_prime_m: intercept,
    },
  };
}

function selectPredictionCandidate(label, targetDistanceMeters, candidates) {
  if (!candidates.length) return null;
  const priority = predictionPriorityForTarget(label, targetDistanceMeters);
  const byModel = new Map(
    candidates.map((candidate) => [candidate.model, candidate]),
  );
  for (const modelName of priority) {
    const candidate = byModel.get(modelName);
    if (candidate) return candidate;
  }
  return candidates[0] ?? null;
}

function applyAgreementRules(selected, candidates) {
  const updated = { ...selected };
  updated.supporting_models = candidates.map((candidate) => ({
    model: candidate.model,
    predicted_time: formatDuration(candidate.predicted_seconds),
    ci_68: predictionIntervalLabelForSigma(
      candidate.predicted_seconds,
      candidate.sigma_seconds,
      candidate.confidence,
      1.0,
    ),
    ci_95: predictionIntervalLabelForSigma(
      candidate.predicted_seconds,
      candidate.sigma_seconds,
      candidate.confidence,
      1.96,
    ),
    confidence: candidate.confidence,
  }));
  if (candidates.length < 2) return updated;
  const agreeing = candidates.filter(
    (candidate) =>
      candidate !== selected &&
      predictionsAgree(
        selected.predicted_seconds,
        selected.sigma_seconds,
        candidate,
      ),
  );
  let confidence = updated.confidence;
  if (agreeing.length > 0) {
    confidence = upgradeConfidence(confidence);
  }
  if (agreeing.length === 0 && candidates.length >= 2) {
    const spread = Math.max(
      ...candidates
        .filter((candidate) => candidate !== selected)
        .map((candidate) =>
          Math.abs(selected.predicted_seconds - candidate.predicted_seconds),
        ),
    );
    if (spread > selected.sigma_seconds * 2) {
      confidence = downgradeConfidence(confidence);
      const flags = Array.isArray(updated.flags) ? [...updated.flags] : [];
      if (!flags.includes("model_disagreement")) {
        flags.push("model_disagreement");
      }
      updated.flags = flags;
    }
  }
  updated.confidence = confidence;
  return updated;
}

function buildPredictionRecord(candidate, target, trainingPaces) {
  const predictedSeconds = candidate.predicted_seconds;
  const confidence = candidate.confidence;
  const record = {
    distance_label: target.label,
    target_distance_m: target.distanceMeters,
    predicted_time_s: predictedSeconds,
    predicted_time: formatDuration(predictedSeconds),
    prediction: formatDuration(predictedSeconds),
    ci_60: predictionIntervalLabelForSigma(
      predictedSeconds,
      candidate.sigma_seconds,
      confidence,
      0.84,
    ),
    ci_90: predictionIntervalLabelForSigma(
      predictedSeconds,
      candidate.sigma_seconds,
      confidence,
      1.645,
    ),
    ci_68: predictionIntervalLabelForSigma(
      predictedSeconds,
      candidate.sigma_seconds,
      confidence,
      1.0,
    ),
    ci_95: predictionIntervalLabelForSigma(
      predictedSeconds,
      candidate.sigma_seconds,
      confidence,
      1.96,
    ),
    model: candidate.model,
    calibration_points: candidate.calibration_points,
    predicted_pace: formatPace(
      predictedSeconds / (target.distanceMeters / 1000),
    ),
    source_run: candidate.source_run,
    confidence,
    trend: candidate.trend,
    how_to_improve: candidate.how_to_improve,
    stale: candidate.stale,
    generated_on: new Date().toISOString().slice(0, 10),
    supporting_models: candidate.supporting_models ?? [],
    flags: candidate.flags ?? [],
  };
  if (trainingPaces) {
    record.training_paces = trainingPaces;
    record.training_paces_summary = trainingPacesSummary(trainingPaces);
  }
  return record;
}

function buildPredictionSourceRun(sourceRun, confidence) {
  return {
    name: sourceRun.name,
    date: sourceRun.date,
    distance: sourceRun.distance,
    duration: sourceRun.duration,
    avg_heart_rate_bpm: sourceRun.avg_heart_rate_bpm,
    age_days: sourceRun.age_days,
    confidence,
  };
}

function predictionPriorityForTarget(label, targetDistanceMeters) {
  if (targetDistanceMeters >= 42195) {
    return ["Calibrated Riegel", "Critical Speed", "Riegel extrapolation"];
  }
  if (targetDistanceMeters >= 5000) {
    return ["Critical Speed", "Calibrated Riegel", "Riegel extrapolation"];
  }
  if (targetDistanceMeters >= 1000) {
    return ["Critical Speed", "Calibrated Riegel", "Riegel extrapolation"];
  }
  return ["Calibrated Riegel", "Critical Speed", "Riegel extrapolation"];
}

function calibrationPointsForTarget(runs, targetDistanceMeters) {
  if (!runs.length) return [];
  const selected = bestAnchorSubset(runs, targetDistanceMeters, "log");
  if (selected.length) return selected;
  return rankAnchorCandidates(
    collapseDistanceBuckets(runs),
    targetDistanceMeters,
  ).slice(0, 3);
}

function criticalSpeedPoints(runs, targetDistanceMeters) {
  const collapsed = collapseDistanceBuckets(runs);
  const usable = collapsed.filter(
    (run) => run.distance_m >= targetDistanceMeters * 0.5,
  );
  const selected = bestAnchorSubset(
    usable.length >= 2 ? usable : collapsed,
    targetDistanceMeters,
    "linear",
  );
  if (selected.length) return selected;
  return rankAnchorCandidates(
    usable.length >= 2 ? usable : collapsed,
    targetDistanceMeters,
  ).slice(0, 3);
}

function trainingPacesSummary(trainingPaces) {
  const bands = Array.isArray(trainingPaces?.bands) ? trainingPaces.bands : [];
  if (!bands.length) return "No pace bands available";
  return bands.map((band) => `${band.name} ${band.label}`).join(" · ");
}

function buildTrainingPaces(sourceRun) {
  if (!sourceRun) return null;
  const vdot = vdotFromRacePerformance(
    sourceRun.distance_m,
    sourceRun.duration_s,
  );
  if (vdot == null) return null;
  const bands = [];
  const paceBands = [
    { name: "Easy", low: 0.6, high: 0.75 },
    { name: "Marathon", low: 0.8, high: 0.87 },
    { name: "Threshold", low: 0.88, high: 0.92 },
    { name: "Interval", low: 0.95, high: 1.0 },
    { name: "Repetition", low: 1.03, high: 1.08 },
  ];
  for (const band of paceBands) {
    const fast = paceSecondsPerKmFromFraction(vdot, band.high);
    const slow = paceSecondsPerKmFromFraction(vdot, band.low);
    if (fast == null || slow == null) continue;
    bands.push({
      name: band.name,
      min_fraction: band.low,
      max_fraction: band.high,
      min_seconds_per_km: slow,
      max_seconds_per_km: fast,
      label: `${formatDuration(fast)}-${formatDuration(slow)} /km`,
    });
  }
  return {
    vdot: Number(vdot.toFixed(1)),
    source_run: buildPredictionSourceRun(
      sourceRun,
      sourceRun.age_days != null && sourceRun.age_days <= 7 ? "high" : "medium",
    ),
    bands,
  };
}

function vdotFromRacePerformance(distanceM, durationS) {
  if (!(distanceM > 0) || !(durationS > 0)) return null;
  const velocityMPerMin = (distanceM / durationS) * 60;
  const oxygenCost =
    -4.6 + 0.182258 * velocityMPerMin + 0.000104 * velocityMPerMin ** 2;
  const minutes = durationS / 60;
  const fraction =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes);
  if (!(fraction > 0)) return null;
  return oxygenCost / fraction;
}

function paceSecondsPerKmFromFraction(vdot, fraction) {
  const desiredOxygen = vdot * fraction;
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - desiredOxygen;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const velocityMPerMin = (-b + Math.sqrt(discriminant)) / (2 * a);
  if (!(velocityMPerMin > 0)) return null;
  return 60000 / velocityMPerMin;
}

function linearRegression(xs, ys) {
  if (
    !Array.isArray(xs) ||
    !Array.isArray(ys) ||
    xs.length !== ys.length ||
    xs.length < 2
  ) {
    throw new Error("linear regression requires at least two points");
  }
  const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce(
    (sum, x, index) => sum + (x - xMean) * (ys[index] - yMean),
    0,
  );
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  if (denominator === 0) {
    throw new Error("linear regression requires distinct x values");
  }
  return [numerator / denominator, yMean - (numerator / denominator) * xMean];
}

function predictionsAgree(selectedSeconds, selectedSigma, candidate) {
  const delta = Math.abs(selectedSeconds - candidate.predicted_seconds);
  const sigma = Math.sqrt(selectedSigma ** 2 + candidate.sigma_seconds ** 2);
  return delta <= sigma * 2;
}

function upgradeConfidence(confidence) {
  const order = ["low", "medium", "high"];
  const index = order.indexOf(confidence);
  if (index < 0) return confidence;
  return order[Math.min(index + 1, order.length - 1)];
}

function downgradeConfidence(confidence) {
  const order = ["low", "medium", "high"];
  const index = order.indexOf(confidence);
  if (index < 0) return confidence;
  return order[Math.max(index - 1, 0)];
}

function confidenceFromFit(anchors, sigmaSeconds, predictedSeconds) {
  let relativeSigma = sigmaSeconds / predictedSeconds;
  const ageDays = Math.max(...anchors.map((anchor) => anchor.age_days ?? 0));
  if (ageDays > PREDICTION_STALE_DAYS) {
    relativeSigma *= 1.2;
  }
  if (anchors.length >= 3 && relativeSigma <= 0.04) return "high";
  if (relativeSigma <= 0.08) return "medium";
  return "low";
}

function confidenceFromSigmaAndAge(predictedSeconds, sigmaSeconds, ageDays) {
  let relativeSigma = sigmaSeconds / predictedSeconds;
  if (ageDays != null && ageDays > PREDICTION_STALE_DAYS) {
    relativeSigma *= 1.2;
  }
  if (relativeSigma <= 0.035) return "high";
  if (relativeSigma <= 0.075) return "medium";
  return "low";
}

function baselineSigma(predictedSeconds, ageDays, extrapolationRatio) {
  let dayFactor = 0.04;
  if (ageDays == null) {
    dayFactor = 0.04;
  } else if (ageDays <= 7) {
    dayFactor = 0.015;
  } else if (ageDays <= PREDICTION_STALE_DAYS) {
    dayFactor = 0.025;
  }
  const extrapolationFactor =
    0.01 * Math.max(0, Math.log(Math.max(extrapolationRatio, 1)));
  return (
    predictedSeconds * Math.sqrt(dayFactor ** 2 + extrapolationFactor ** 2)
  );
}

function logResidualSigma(xs, ys, slope, intercept) {
  if (xs.length < 3) return 0.035;
  const residuals = xs.map((x, index) => ys[index] - (intercept + slope * x));
  const variance =
    residuals.reduce((sum, residual) => sum + residual ** 2, 0) /
    Math.max(residuals.length - 2, 1);
  return Math.sqrt(variance);
}

function linearResidualSigma(xs, ys, slope, intercept) {
  if (xs.length < 3) return Math.max(...ys) * 0.03;
  const residuals = xs.map((x, index) => ys[index] - (intercept + slope * x));
  const variance =
    residuals.reduce((sum, residual) => sum + residual ** 2, 0) /
    Math.max(residuals.length - 2, 1);
  return Math.sqrt(variance);
}

function predictionIntervalLabelForSigma(
  predictedSeconds,
  sigmaSeconds,
  confidence,
  multiplier,
) {
  let scale = sigmaSeconds * multiplier;
  if (confidence === "medium") {
    scale *= 1.1;
  } else if (confidence === "low") {
    scale *= 1.25;
  }
  return `±${formatDuration(scale)}`;
}

function riegelPrediction(
  sourceSeconds,
  sourceDistanceMeters,
  targetDistanceMeters,
) {
  return sourceSeconds * (targetDistanceMeters / sourceDistanceMeters) ** 1.06;
}

function predictionTrendFromAge(ageDays) {
  if (ageDays == null) return "stable";
  if (ageDays <= 7) return "improving";
  if (ageDays <= PREDICTION_STALE_DAYS) return "stable";
  return "declining";
}

function predictionHowToImprove(sourceRun) {
  if (!sourceRun || typeof sourceRun !== "object") {
    return "Add a recent anchor run and another race-distance effort.";
  }
  if (sourceRun.age_days == null) {
    return "Add a recent anchor run and another race-distance effort.";
  }
  if (sourceRun.age_days <= 7) {
    return "Add another recent race-distance effort to tighten the fit.";
  }
  if (sourceRun.age_days <= PREDICTION_STALE_DAYS) {
    return "Add a newer anchor run to refresh the prediction.";
  }
  return "Add a newer race-distance effort and a second calibration point.";
}

function buildCalibrationPoint(sourceRun) {
  return {
    date: sourceRun.date,
    distance_m: sourceRun.distance_m,
    duration_s: sourceRun.duration_s,
    pace_s_per_km: sourceRun.pace_s_per_km,
    avg_heart_rate_bpm: sourceRun.avg_heart_rate_bpm ?? null,
    name: sourceRun.name,
  };
}

export function normalizeReadiness(readiness) {
  if (!readiness || typeof readiness !== "object") return {};
  return {
    sleepScore: toNumber(
      readiness.sleep_score ??
        readiness.sleepingSeconds ??
        readiness.sleepingQualifierSummary?.value,
    ),
    restingHeartRateBpm: toNumber(
      readiness.resting_heart_rate_bpm ??
        readiness.restingHeartRate ??
        readiness.lastSevenDaysAvgRestingHeartRate,
    ),
    rawHrvMs: toNumber(
      readiness.raw_hrv_ms ??
        readiness.hrv_ms ??
        readiness.hrvMs ??
        readiness.latestHrvValue ??
        readiness.heartRateVariabilityMs,
    ),
    hrv: toText(
      readiness.hrv ??
        readiness.heartRateVariabilitySummary?.value ??
        readiness.heartRateVariabilitySummary,
    ),
    stress: toText(readiness.stress ?? readiness.stressQualifierSummary?.value),
    bodyBattery: toNumber(
      readiness.body_battery ?? readiness.bodyBatteryChargedValue,
    ),
  };
}

function formatVo2maxTrendSummary(points) {
  if (!Array.isArray(points) || !points.length)
    return "No trend samples available";
  const numericPoints = points.filter((point) =>
    Number.isFinite(point?.vo2max),
  );
  if (!numericPoints.length) return `${points.length} trend samples retained`;
  const first = numericPoints[0].vo2max;
  const last = numericPoints[numericPoints.length - 1].vo2max;
  const delta = last - first;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return `${first.toFixed(1)} -> ${last.toFixed(1)} (${direction})`;
}

export function formatSleepMetric(value) {
  const numeric = toNumber(value);
  if (numeric == null) return "—";
  if (numeric > 1000) return formatSleepDuration(numeric);
  return `${Math.round(numeric)}/100`;
}

export function formatVo2max(value) {
  const numeric = toNumber(value);
  return numeric == null ? "—" : `${numeric.toFixed(1)} ml/kg/min`;
}

export function formatTrendLabel(value) {
  const text = toText(value);
  if (!text) return "Unknown";
  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMissingList(values) {
  if (!values.length) return "";
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function readinessRows(readiness) {
  return [
    {
      label:
        readiness?.sleepScore != null && readiness.sleepScore > 1000
          ? "Sleep duration"
          : "Sleep score",
      helper:
        readiness?.sleepScore != null && readiness.sleepScore > 1000
          ? "Overnight duration"
          : "Nightly recovery score",
      value: formatSleepMetric(readiness?.sleepScore),
    },
    {
      label: "Resting HR",
      helper: "Current baseline",
      value: formatHeartRate(readiness?.restingHeartRateBpm),
    },
    {
      label: "Raw HRV",
      helper: "Milliseconds",
      value: formatMilliseconds(readiness?.rawHrvMs),
    },
    {
      label: "Body battery",
      helper: "Remaining energy",
      value:
        readiness?.bodyBattery != null
          ? `${Math.round(readiness.bodyBattery)}/100`
          : "—",
    },
    {
      label: "Stress",
      helper: "Current load",
      value: readiness?.stress ? formatTrendLabel(readiness.stress) : "—",
    },
  ];
}

function formatSleepDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function uniqueSourceRuns(sourceRuns) {
  const seen = new Set();
  const unique = [];
  for (const run of sourceRuns) {
    if (!run || typeof run !== "object" || !run.date) continue;
    const key = sourceRunKey(run);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(run);
  }
  return unique;
}

function sourceRunKey(run) {
  if (run.activity_id != null && run.activity_id !== "") {
    return `activity:${run.activity_id}`;
  }
  return [
    run.name ?? "",
    run.date ?? "",
    run.distance_m ?? "",
    run.duration_s ?? "",
  ].join("|");
}

function numberFrom(value) {
  if (value == null || value === "") return Number.NaN;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function parseDate(value) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const dateValue = new Date(
    value.includes("T") ? value : `${value}T00:00:00Z`,
  );
  return Number.isNaN(dateValue.getTime()) ? null : dateValue;
}

function parseDateTime(value) {
  if (value instanceof Date) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const candidate = new Date(value.replace(" ", "T"));
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function formatDisplayDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.replace(" ", "T").split("T")[0];
  return "";
}
