import {
  escapeHtml,
  formatDisplayValue as formatValue,
  hasLiveSnapshotData,
  readNumber,
  readText,
  shouldRenderValue,
  summarizeBests,
} from "./data-helpers.js";

const snapshotUrl = new URL("./data/snapshot.json", import.meta.url);
const grid = document.getElementById("progress-grid");
const trendEl = document.getElementById("progress-trend");
const summaryEl = document.getElementById("progress-summary");
const sourceLabel = document.getElementById("source-label");
const statusBanner = document.getElementById("status-banner");
const dateFrom = document.getElementById("date-from");
const dateTo = document.getElementById("date-to");

const state = {
  previous: readStoredSnapshot(),
  currentSnapshot: null,
  historyMode: null,
};

await loadProgress();
await loadHistoryTrends();
setupDatePickers();

async function loadProgress() {
  try {
    const response = await fetch(`${snapshotUrl.pathname}?v=${Date.now()}`);
    const snapshot = await response.json();
    if (snapshot.source && snapshot.source !== "live") {
      throw new Error("Live snapshot not loaded");
    }
    if (!snapshot.source && !hasLiveSnapshotData(snapshot)) {
      throw new Error("Live snapshot not loaded");
    }
    state.currentSnapshot = snapshot;
    renderProgress(snapshot);
  } catch {
    sourceLabel.textContent = "Live data unavailable";
    statusBanner.textContent = "Waiting for live snapshot";
    if (summaryEl) summaryEl.innerHTML = "";
    grid.innerHTML = `<div class="item"><span>Progress</span><strong>Live snapshot not loaded</strong></div>`;
    if (trendEl) {
      trendEl.innerHTML = `
        <div class="stat-group">
          <div class="stat-group-title">Live data unavailable</div>
          <p class="lede" style="margin:6px 0">This page only shows live snapshot data.</p>
        </div>
      `;
    }
  }
}

async function loadHistoryTrends() {
  const liveSummary = buildLiveHistorySummary(state.currentSnapshot);
  if (liveSummary && trendEl) {
    trendEl.innerHTML = renderLiveHistorySummary(liveSummary);
    return;
  }
  if (trendEl) {
    trendEl.innerHTML = `
      <div class="stat-group">
        <div class="stat-group-title">Live history unavailable</div>
        <p class="lede" style="margin:6px 0">The current live snapshot does not include a recent 30-day window.</p>
        <p class="muted" style="margin:0">Load a snapshot with live Cronometer, Hevy, and Garmin history to enable this section.</p>
      </div>
    `;
  }
}

export function buildLiveHistorySummary(snapshot) {
  const cronometerDays = Array.isArray(snapshot?.cronometer?.recent_days)
    ? snapshot.cronometer.recent_days
    : [];
  const recentRuns = Array.isArray(snapshot?.garmin?.recent_runs)
    ? snapshot.garmin.recent_runs
    : [];
  const currentVo2 = snapshot?.garmin?.current_vo2max ?? null;
  const vo2Trend = snapshot?.garmin?.vo2max_trend ?? "unknown";
  if (!cronometerDays.length && !recentRuns.length) {
    return null;
  }

  const activeDays = cronometerDays.filter(
    (day) => day && typeof day === "object" && day.calories_consumed != null,
  );
  const calories = activeDays.map((day) => Number(day.calories_consumed) || 0);
  const protein = activeDays.map((day) => Number(day.protein_g) || 0);
  const avgCalories = calories.length
    ? Math.round(calories.reduce((sum, value) => sum + value, 0) / calories.length)
    : 0;
  const avgProtein = protein.length
    ? Math.round(protein.reduce((sum, value) => sum + value, 0) / protein.length)
    : 0;

  return {
    days: activeDays.length,
    latestDate: activeDays.at(-1)?.date ?? snapshot?.snapshot_date ?? null,
    avgCalories,
    avgProtein,
    vo2: currentVo2,
    vo2Trend,
  };
}

export function buildLiveRangeSummary(snapshot, fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = fromDate <= toDate ? fromDate : toDate;
  const to = fromDate <= toDate ? toDate : fromDate;

  const recentDays = Array.isArray(snapshot?.cronometer?.recent_days)
    ? snapshot.cronometer.recent_days
    : [];
  const selectedDays = recentDays
    .filter(
      (day) =>
        day &&
        typeof day === "object" &&
        typeof day.date === "string" &&
        day.date >= from &&
        day.date <= to &&
        day.calories_consumed != null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!selectedDays.length) return null;

  const calories = selectedDays.map((day) => Number(day.calories_consumed) || 0);
  const protein = selectedDays.map((day) => Number(day.protein_g) || 0);
  const carbs = selectedDays.map((day) => Number(day.carbs_g) || 0);
  const fat = selectedDays.map((day) => Number(day.fat_g) || 0);
  const remaining = selectedDays.map((day) => Number(day.remaining_kcal) || 0);

  const currentVo2 = snapshot?.garmin?.current_vo2max ?? null;
  const vo2Trend = snapshot?.garmin?.vo2max_trend ?? "unknown";

  return {
    from,
    to,
    days: selectedDays.length,
    startDate: selectedDays[0]?.date ?? from,
    endDate: selectedDays.at(-1)?.date ?? to,
    startCalories: calories[0],
    endCalories: calories.at(-1),
    startProtein: protein[0],
    endProtein: protein.at(-1),
    startCarbs: carbs[0],
    endCarbs: carbs.at(-1),
    avgCarbs: Math.round(carbs.reduce((sum, value) => sum + value, 0) / carbs.length),
    avgFat: Math.round(fat.reduce((sum, value) => sum + value, 0) / fat.length),
    startRemaining: remaining[0],
    endRemaining: remaining.at(-1),
    avgCalories: Math.round(calories.reduce((sum, value) => sum + value, 0) / calories.length),
    avgProtein: Math.round(protein.reduce((sum, value) => sum + value, 0) / protein.length),
    vo2: currentVo2,
    vo2Trend,
    latestDate: selectedDays.at(-1)?.date ?? null,
  };
}

function renderLiveHistorySummary(summary) {
  if (!summary) return "";
  return `
    <div class="stat-group">
      <div class="stat-group-title">Live 30-day window</div>
      <div class="stat-group-grid">
        <div class="stat-item">
          <span class="stat-item-label">Nutrition days</span>
          <span class="stat-item-value">${summary.days}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Avg calories</span>
          <span class="stat-item-value">${summary.avgCalories}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Avg protein</span>
          <span class="stat-item-value">${summary.avgProtein}g</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Current VO2 max</span>
          <span class="stat-item-value">${summary.vo2 ?? "—"}</span>
        </div>
      </div>
      <p class="muted" style="margin:10px 0 0">Latest live date: ${escapeHtml(summary.latestDate ?? "unknown")}</p>
    </div>
  `;
}

function renderLiveRangeSummary(summary) {
  if (!summary) return "";

  return `
    <div class="stat-group">
      <div class="stat-group-title">Live range summary</div>
      <div class="stat-group-grid">
        <div class="stat-item">
          <span class="stat-item-label">Days</span>
          <span class="stat-item-value">${summary.days}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Avg calories</span>
          <span class="stat-item-value">${summary.avgCalories}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Avg protein</span>
          <span class="stat-item-value">${summary.avgProtein}g</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Avg carbs</span>
          <span class="stat-item-value">${summary.avgCarbs}g</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Avg fat</span>
          <span class="stat-item-value">${summary.avgFat}g</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Current VO2 max</span>
          <span class="stat-item-value">${summary.vo2 ?? "—"}</span>
        </div>
      </div>
      <p class="muted" style="margin:10px 0 0">Range: ${escapeHtml(summary.startDate)} → ${escapeHtml(summary.endDate)}</p>
    </div>
  `;
}

function renderProgress(snapshot) {
  const previous = state.previous ?? {};
  sourceLabel.textContent = `${snapshot.source ?? "Snapshot"} · ${snapshot.snapshot_date ?? "unknown date"}`;
  sourceLabel.classList.remove("skeleton");
  statusBanner.classList.remove("skeleton");

  const rows = [
    deltaRow(
      "VO2 max",
      readNumber(previous, ["garmin", "current_vo2max"]),
      readNumber(snapshot, ["garmin", "current_vo2max"]),
    ),
    deltaRow(
      "Fueling",
      readText(previous, ["cronometer", "fueling_status"]),
      readText(snapshot, ["cronometer", "fueling_status"]),
    ),
    deltaRow(
      "Remaining kcal",
      readNumber(previous, ["cronometer", "today", "remaining_kcal"]),
      readNumber(snapshot, ["cronometer", "today", "remaining_kcal"]),
    ),
  ].filter(Boolean);

  renderSummaryStrip([
    summaryTile(
      "Latest",
      snapshot.snapshot_date ?? "Unknown date",
      snapshot.source ?? "Snapshot",
    ),
    summaryTile(
      "Baseline",
      previous.snapshot_date ?? "Previous snapshot",
      previous.snapshot_date ? "Stored locally" : "No prior snapshot",
    ),
    summaryTile(
      "Changes",
      rows.length ? `${rows.length} changed` : "No changes",
      rows.length ? "Compared with previous snapshot" : "Nothing moved",
    ),
  ]);

  statusBanner.textContent = rows.length
    ? `${rows.length} changes`
    : "No changes detected";
  grid.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <article class="item">
        <span>${escapeHtml(row.label)}</span>
        <strong class="${row.deltaClass}" title="${row.tooltip ?? ""}">${escapeHtml(row.value)}</strong>
      </article>
    `,
        )
        .join("")
    : `<div class="item"><span>Progress</span><strong>No change since the previous snapshot</strong></div>`;

  persistSnapshot(snapshot);
  state.previous = snapshot;
}

export function deltaRow(label, previous, current) {
  if (!shouldRenderValue(previous) && !shouldRenderValue(current)) return null;
  if (previous === current) return null;
  const pNum = Number(previous);
  const cNum = Number(current);
  let deltaClass = "";
  let tooltip = "Value changed";
  if (!Number.isNaN(pNum) && !Number.isNaN(cNum) && pNum !== cNum) {
    const isUp = cNum > pNum;
    deltaClass = isUp ? "delta-up" : "delta-down";
    const direction = isUp ? "increased" : "decreased";
    const goodBad = isUp ? "improvement" : "decline";
    tooltip = `${label} ${direction} from ${formatValue(previous)} to ${formatValue(current)} — ${goodBad}`;
  } else {
    tooltip = `${label}: ${formatValue(previous)} → ${formatValue(current)}`;
  }
  return {
    label,
    value: `${formatValue(previous)} → ${formatValue(current)}`,
    deltaClass,
    tooltip,
  };
}

export function summaryTile(label, value, subvalue) {
  return { label, value, subvalue };
}

function renderSummaryStrip(tiles) {
  if (!summaryEl) return;
  summaryEl.innerHTML = tiles
    .map(
      (tile) => `
        <div class="summary-tile">
          <span class="summary-tile-label">${escapeHtml(tile.label)}</span>
          <span class="summary-tile-value">${escapeHtml(tile.value)}</span>
          <span class="summary-tile-subvalue">${escapeHtml(tile.subvalue)}</span>
        </div>
      `,
    )
    .join("");
}

async function setupDatePickers() {
  try {
    const dates = getLiveRangeDates(state.currentSnapshot);
    if (!dates.length || !dateFrom || !dateTo) {
      if (dateFrom) dateFrom.disabled = true;
      if (dateTo) dateTo.disabled = true;
      if (trendEl && !trendEl.innerHTML) {
        trendEl.innerHTML = `
          <div class="stat-group">
            <div class="stat-group-title">Live range unavailable</div>
            <p class="lede" style="margin:6px 0">No live recent-day data was loaded, so the date range controls are disabled.</p>
          </div>
        `;
      }
      return;
    }
    state.historyMode = "live";
    dateFrom.innerHTML = dates
      .map((d) => `<option value="${d}">${d}</option>`)
      .join("");
    dateTo.innerHTML = [...dates]
      .reverse()
      .map((d) => `<option value="${d}">${d}</option>`)
      .join("");
    const defaultStartIndex = Math.max(0, dates.length - 3);
    dateFrom.value = dates[defaultStartIndex];
    dateTo.value = dates[dates.length - 1];
    document
      .getElementById("compare-btn")
      ?.addEventListener("click", compareDates);
  } catch {}
}

async function compareDates() {
  const from = dateFrom?.value;
  const to = dateTo?.value;
  if (!from || !to || from === to) return;
  if (state.historyMode !== "live" || !state.currentSnapshot) return;
  const summary = buildLiveRangeSummary(state.currentSnapshot, from, to);
  if (!summary) {
    statusBanner.textContent = "Live range unavailable";
    grid.innerHTML = `<div class="item"><span>Progress</span><strong>No live daily data exists for that range</strong></div>`;
    return;
  }
  sourceLabel.textContent = `${from} → ${to}`;
  statusBanner.textContent = `${summary.days} live days`;
  renderSummaryStrip([
    summaryTile(
      "Range",
      `${summary.startDate} → ${summary.endDate}`,
      "Selected live window",
    ),
    summaryTile("Days", String(summary.days), "Live nutrition days"),
    summaryTile("Avg calories", String(summary.avgCalories), "Across the selected range"),
  ]);
  grid.innerHTML = renderLiveRangeSummary(summary);
}

function getLiveRangeDates(snapshot) {
  const recentDays = Array.isArray(snapshot?.cronometer?.recent_days)
    ? snapshot.cronometer.recent_days
    : [];
  return [...new Set(recentDays
    .map((day) => (day && typeof day.date === "string" ? day.date : null))
    .filter(Boolean))].sort();
}

function persistSnapshot(snapshot) {
  try {
    localStorage.setItem(
      "personal-trainer:last-snapshot",
      JSON.stringify(snapshot),
    );
  } catch {}
}

function readStoredSnapshot() {
  try {
    const raw = localStorage.getItem("personal-trainer:last-snapshot");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
