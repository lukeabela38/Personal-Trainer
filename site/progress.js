const snapshotUrl = new URL("./data/snapshot.json", import.meta.url);
const grid = document.getElementById("progress-grid");
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
  const rows = [
    deltaRow("VO2 max", readNumber(previous, ["garmin", "current_vo2max"]), readNumber(snapshot, ["garmin", "current_vo2max"])),
    deltaRow("Fueling", readText(previous, ["cronometer", "fueling_status"]), readText(snapshot, ["cronometer", "fueling_status"])),
    deltaRow("Remaining kcal", readNumber(previous, ["cronometer", "today", "remaining_kcal"]), readNumber(snapshot, ["cronometer", "today", "remaining_kcal"])),
    deltaRow("Strength trend", readText(previous, ["hevy", "strength_trend"]), readText(snapshot, ["hevy", "strength_trend"])),
    deltaRow("Running bests", summarizeBests(previous), summarizeBests(snapshot)),
  ].filter(Boolean);

  sourceLabel.textContent = `${snapshot.source ?? "Snapshot"} · ${snapshot.snapshot_date ?? "unknown date"}`;
  statusBanner.textContent = rows.length ? `${rows.length} changes tracked` : "No changes detected";
  grid.innerHTML = rows.length
    ? rows.map((row) => `
      <article class="item">
        <span>${escapeHtml(row.label)}</span>
        <strong>${escapeHtml(row.value)}</strong>
      </article>
    `).join("")
    : `<div class="item"><span>Progress</span><strong>No change since the previous snapshot</strong></div>`;

  persistSnapshot(snapshot);
  state.previous = snapshot;
}

function deltaRow(label, previous, current) {
  if (!shouldRenderValue(previous) && !shouldRenderValue(current)) return null;
  if (previous === current) return null;
  return { label, value: `${formatValue(previous)} → ${formatValue(current)}` };
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
  } catch {
    // ignore
  }
}

function readStoredSnapshot() {
  try {
    const raw = localStorage.getItem("personal-trainer:last-snapshot");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
