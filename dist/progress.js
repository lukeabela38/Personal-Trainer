import {
  loadLastDays,
  extractVo2,
  extractBodyWeight,
  weeklySummary,
  loadIndex,
  loadSnapshot,
} from "./history.js";
import { renderSparkline, fmtNum } from "./goals.js";
import {
  escapeHtml,
  formatDisplayValue as formatValue,
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
};

loadProgress();
loadHistoryTrends();
setupDatePickers();

async function loadProgress() {
  try {
    const response = await fetch(`${snapshotUrl.pathname}?v=${Date.now()}`);
    const snapshot = await response.json();
    renderProgress(snapshot);
  } catch {
    sourceLabel.textContent = "Unavailable";
    statusBanner.textContent = "Could not load snapshot data";
    if (summaryEl) summaryEl.innerHTML = "";
    grid.innerHTML = `<div class="item"><span>Progress</span><strong>Failed to load data</strong></div>`;
  }
}

async function loadHistoryTrends() {
  try {
    const snaps = await loadLastDays(60);
    const vo2 = extractVo2(snaps);
    const bw = extractBodyWeight(snaps);
    const summary = weeklySummary(snaps);
    if (trendEl) {
      const parts = [];
      if (summary) {
        parts.push(`
          <div class="stat-group">
            <div class="stat-group-title">Last 7 days</div>
            <div class="stat-group-grid">
              <div class="stat-item">
                <span class="stat-item-label">Quality sessions</span>
                <span class="stat-item-value">${summary.hardDays}</span>
              </div>
              <div class="stat-item">
                <span class="stat-item-label">Recovery days</span>
                <span class="stat-item-value">${summary.recoveryDays}</span>
              </div>
              <div class="stat-item">
                <span class="stat-item-label">Avg calories</span>
                <span class="stat-item-value">${summary.avgCalories}</span>
              </div>
              <div class="stat-item">
                <span class="stat-item-label">Avg protein</span>
                <span class="stat-item-value">${summary.avgProtein}g</span>
              </div>
            </div>
          </div>
        `);
      }
      if (vo2.length > 1) {
        const vals = vo2.map((d) => d.value);
        const vo2Delta = vals[vals.length - 1] - vals[0];
        const vo2Dir =
          vo2Delta > 0
            ? "improved"
            : vo2Delta < 0
              ? "declined"
              : "remained stable";
        parts.push(`
          <div class="stat-group">
            <div class="stat-group-title">VO2 max (${vo2.length} days)</div>
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap" title="VO2 max ${vo2Dir} by ${fmtNum(Math.abs(vo2Delta))} over ${vo2.length} days">
              ${renderSparkline(vals, 240, 56)}
              <div style="display:grid;gap:2px">
                <span class="stat-item-label">Start</span>
                <span class="stat-item-value">${fmtNum(vals[0])}</span>
                <span class="stat-item-label">Current</span>
                <span class="stat-item-value">${fmtNum(vals[vals.length - 1])}</span>
              </div>
            </div>
          </div>
        `);
      }
      if (bw.length > 1) {
        const vals = bw.map((d) => d.value);
        const bwDelta = vals[vals.length - 1] - vals[0];
        const bwDir =
          bwDelta < 0
            ? "decreased"
            : bwDelta > 0
              ? "increased"
              : "remained stable";
        parts.push(`
          <div class="stat-group">
            <div class="stat-group-title">Body weight (${bw.length} days)</div>
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap" title="Body weight ${bwDir} by ${fmtNum(Math.abs(bwDelta))} kg over ${bw.length} days">
              ${renderSparkline(vals, 240, 56)}
              <div style="display:grid;gap:2px">
                <span class="stat-item-label">Start</span>
                <span class="stat-item-value">${fmtNum(vals[0])} kg</span>
                <span class="stat-item-label">Current</span>
                <span class="stat-item-value">${fmtNum(vals[vals.length - 1])} kg</span>
              </div>
            </div>
          </div>
        `);
      }
      trendEl.innerHTML = parts.join("");
    }
  } catch {
    // history not available
  }
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
    deltaRow(
      "Strength trend",
      readText(previous, ["hevy", "strength_trend"]),
      readText(snapshot, ["hevy", "strength_trend"]),
    ),
    deltaRow(
      "Running bests",
      summarizeBests(previous),
      summarizeBests(snapshot),
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
    summaryTile(
      "Running bests",
      summarizeBests(snapshot),
      "Strength / running",
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
    const index = await loadIndex();
    if (!index?.dates?.length || !dateFrom || !dateTo) return;
    const dates = index.dates;
    dateFrom.innerHTML = dates
      .map((d) => `<option value="${d}">${d}</option>`)
      .join("");
    dateTo.innerHTML = [...dates]
      .reverse()
      .map((d) => `<option value="${d}">${d}</option>`)
      .join("");
    dateFrom.value = dates[0];
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
  try {
    const a = await loadSnapshot(from);
    const b = await loadSnapshot(to);
    renderComparison(from, a, to, b);
  } catch {}
}

function renderComparison(fromDate, snapA, toDate, snapB) {
  const prev = snapA ?? {};
  const current = snapB ?? {};
  sourceLabel.textContent = `${fromDate} → ${toDate}`;
  const rows = [
    deltaRow(
      "VO2 max",
      readNumber(prev, ["garmin", "current_vo2max"]),
      readNumber(current, ["garmin", "current_vo2max"]),
    ),
    deltaRow(
      "Body weight",
      readNumber(prev, ["athlete", "body_weight_kg"]),
      readNumber(current, ["athlete", "body_weight_kg"]),
    ),
    deltaRow(
      "Fueling",
      readText(prev, ["cronometer", "fueling_status"]),
      readText(current, ["cronometer", "fueling_status"]),
    ),
    deltaRow(
      "Sleep",
      readText(prev, ["manual_context", "sleep_quality"]),
      readText(current, ["manual_context", "sleep_quality"]),
    ),
    deltaRow(
      "Remaining kcal",
      readNumber(prev, ["cronometer", "today", "remaining_kcal"]),
      readNumber(current, ["cronometer", "today", "remaining_kcal"]),
    ),
    deltaRow(
      "Strength trend",
      readText(prev, ["hevy", "strength_trend"]),
      readText(current, ["hevy", "strength_trend"]),
    ),
  ].filter(Boolean);
  renderSummaryStrip([
    summaryTile(
      "Range",
      `${fromDate} → ${toDate}`,
      "Selected comparison window",
    ),
    summaryTile(
      "Baseline",
      prev.snapshot_date ?? fromDate,
      prev.snapshot_date ? "Earlier snapshot" : "Selected start date",
    ),
    summaryTile(
      "Changes",
      rows.length ? `${rows.length} changed` : "No changes",
      rows.length ? "Differences detected" : "Matched exactly",
    ),
    summaryTile("Running bests", summarizeBests(current), "Current snapshot"),
  ]);
  statusBanner.textContent = rows.length
    ? `${rows.length} changes`
    : "No changes";
  grid.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
      <article class="item">
        <span>${escapeHtml(row.label)}</span>
        <strong class="${row.deltaClass}">${escapeHtml(row.value)}</strong>
      </article>
    `,
        )
        .join("")
    : `<div class="item"><span>Progress</span><strong>No change between these dates</strong></div>`;
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
