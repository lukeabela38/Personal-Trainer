import { loadLastDays, extractVo2, extractBodyWeight, weeklySummary, loadIndex, loadSnapshot } from "./history.js";
import { renderSparkline, fmtNum } from "./goals.js";

const snapshotUrl = new URL("./data/snapshot.json", import.meta.url);
const grid = document.getElementById("progress-grid");
const trendEl = document.getElementById("progress-trend");
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
        const vo2Dir = vo2Delta > 0 ? "improved" : vo2Delta < 0 ? "declined" : "remained stable";
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
        const bwDir = bwDelta < 0 ? "decreased" : bwDelta > 0 ? "increased" : "remained stable";
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
    deltaRow("VO2 max", readNumber(previous, ["garmin", "current_vo2max"]), readNumber(snapshot, ["garmin", "current_vo2max"])),
    deltaRow("Fueling", readText(previous, ["cronometer", "fueling_status"]), readText(snapshot, ["cronometer", "fueling_status"])),
    deltaRow("Remaining kcal", readNumber(previous, ["cronometer", "today", "remaining_kcal"]), readNumber(snapshot, ["cronometer", "today", "remaining_kcal"])),
    deltaRow("Strength trend", readText(previous, ["hevy", "strength_trend"]), readText(snapshot, ["hevy", "strength_trend"])),
    deltaRow("Running bests", summarizeBests(previous), summarizeBests(snapshot)),
  ].filter(Boolean);

  statusBanner.textContent = rows.length ? `${rows.length} changes` : "No changes detected";
  grid.innerHTML = rows.length
    ? rows.map((row) => `
      <article class="item">
        <span>${escapeHtml(row.label)}</span>
        <strong class="${row.deltaClass}" title="${row.tooltip ?? ""}">${escapeHtml(row.value)}</strong>
      </article>
    `).join("")
    : `<div class="item"><span>Progress</span><strong>No change since the previous snapshot</strong></div>`;

  persistSnapshot(snapshot);
  state.previous = snapshot;
}

function deltaRow(label, previous, current) {
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
  return { label, value: `${formatValue(previous)} → ${formatValue(current)}`, deltaClass, tooltip };
}

function summarizeBests(snapshot) {
  const hevy = snapshot?.hevy?.recent_bests?.length ?? 0;
  const garmin = snapshot?.garmin?.recent_bests?.length ?? 0;
  return `${hevy} strength / ${garmin} running`;
}

function readNumber(snapshot, path) {
  const value = readPath(snapshot, path);
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function readText(snapshot, path) {
  const value = readPath(snapshot, path);
  return value == null ? null : String(value);
}

function readPath(object, path) {
  return path.reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), object);
}

function shouldRenderValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim() !== "" && value !== "null";
  return true;
}

function formatValue(value) {
  if (!shouldRenderValue(value)) return "-";
  return String(value);
}

async function setupDatePickers() {
  try {
    const index = await loadIndex();
    if (!index?.dates?.length || !dateFrom || !dateTo) return;
    const dates = index.dates;
    dateFrom.innerHTML = dates.map((d) => `<option value="${d}">${d}</option>`).join("");
    dateTo.innerHTML = [...dates].reverse().map((d) => `<option value="${d}">${d}</option>`).join("");
    dateFrom.value = dates[0];
    dateTo.value = dates[dates.length - 1];
    document.getElementById("compare-btn")?.addEventListener("click", compareDates);
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
    deltaRow("VO2 max", readNumber(prev, ["garmin", "current_vo2max"]), readNumber(current, ["garmin", "current_vo2max"])),
    deltaRow("Body weight", readNumber(prev, ["athlete", "body_weight_kg"]), readNumber(current, ["athlete", "body_weight_kg"])),
    deltaRow("Fueling", readText(prev, ["cronometer", "fueling_status"]), readText(current, ["cronometer", "fueling_status"])),
    deltaRow("Sleep", readText(prev, ["manual_context", "sleep_quality"]), readText(current, ["manual_context", "sleep_quality"])),
    deltaRow("Remaining kcal", readNumber(prev, ["cronometer", "today", "remaining_kcal"]), readNumber(current, ["cronometer", "today", "remaining_kcal"])),
    deltaRow("Strength trend", readText(prev, ["hevy", "strength_trend"]), readText(current, ["hevy", "strength_trend"])),
  ].filter(Boolean);
  statusBanner.textContent = rows.length ? `${rows.length} changes` : "No changes";
  grid.innerHTML = rows.length
    ? rows.map((row) => `
      <article class="item">
        <span>${escapeHtml(row.label)}</span>
        <strong class="${row.deltaClass}">${escapeHtml(row.value)}</strong>
      </article>
    `).join("")
    : `<div class="item"><span>Progress</span><strong>No change between these dates</strong></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function persistSnapshot(snapshot) {
  try {
    localStorage.setItem("personal-trainer:last-snapshot", JSON.stringify(snapshot));
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
