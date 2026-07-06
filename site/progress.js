const snapshotUrl = new URL("./data/snapshot.json", import.meta.url);
const grid = document.getElementById("progress-grid");
const trendEl = document.getElementById("progress-trend");
const sourceLabel = document.getElementById("source-label");
const statusBanner = document.getElementById("status-banner");

const state = {
  previous: readStoredSnapshot(),
};

loadProgress();

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
        <strong class="${row.deltaClass}">${escapeHtml(row.value)}</strong>
      </article>
    `).join("")
    : `<div class="item"><span>Progress</span><strong>No change since the previous snapshot</strong></div>`;

  trendEl.innerHTML = renderTrend(previous, snapshot);
  persistSnapshot(snapshot);
  state.previous = snapshot;
}

function renderTrend(previous, current) {
  const pVo2 = readNumber(previous, ["garmin", "current_vo2max"]);
  const cVo2 = readNumber(current, ["garmin", "current_vo2max"]);
  const pFuel = readText(previous, ["cronometer", "fueling_status"]);
  const cFuel = readText(current, ["cronometer", "fueling_status"]);
  const hasVo2 = shouldRenderValue(pVo2) || shouldRenderValue(cVo2);
  const hasFuel = shouldRenderValue(pFuel) && shouldRenderValue(cFuel);

  const vo2Arrow = hasVo2 && pVo2 !== cVo2 ? (cVo2 > pVo2 ? " &#9650;" : " &#9660;") : "";
  const fuelChanged = hasFuel && pFuel !== cFuel;

  const items = [];
  if (hasVo2) {
    items.push(`
      <div class="stat-item">
        <span class="stat-item-label">VO2 max</span>
        <span class="stat-item-value">${formatVal(cVo2)}${vo2Arrow}</span>
      </div>
    `);
  }
  if (hasFuel) {
    items.push(`
      <div class="stat-item">
        <span class="stat-item-label">Fueling</span>
        <span class="stat-item-value">${fuelChanged ? `${pFuel} → ${cFuel}` : formatVal(cFuel)}</span>
      </div>
    `);
  }
  if (!items.length) return "";
  return `
    <div class="stat-group">
      <div class="stat-group-title">Trend</div>
      <div class="stat-group-grid">${items.join("")}</div>
    </div>
  `;
}

function deltaRow(label, previous, current) {
  if (!shouldRenderValue(previous) && !shouldRenderValue(current)) return null;
  if (previous === current) return null;
  const pNum = Number(previous);
  const cNum = Number(current);
  let deltaClass = "";
  if (!Number.isNaN(pNum) && !Number.isNaN(cNum) && pNum !== cNum) {
    deltaClass = cNum > pNum ? "delta-up" : "delta-down";
  }
  return { label, value: `${formatValue(previous)} → ${formatValue(current)}`, deltaClass };
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

function formatVal(value, unit) {
  if (!shouldRenderValue(value)) return "-";
  return unit ? `${value} ${unit}` : String(value);
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
