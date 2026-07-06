const deployedSnapshotPath = new URL("./data/snapshot.json", import.meta.url);
const sections = document.getElementById("sections");
const statusBanner = document.getElementById("status-banner");
const state = {
  currentPayload: null,
  previousSnapshot: readStoredSnapshot(),
};

const VIEW_LINKS = [
  ["Snapshot viewer", "./index.html"],
  ["Strength", "./strength.html"],
  ["Speed", "./speed.html"],
  ["Progress", "./progress.html"],
];

document.getElementById("file-input").addEventListener("change", (event) => handleFile(event, "snapshot"));
document.getElementById("live-input").addEventListener("change", (event) => handleFile(event, "live payload"));
document.getElementById("load-sample").addEventListener("click", () => loadFromUrl(deployedSnapshotPath, "deployed snapshot"));
document.getElementById("load-example").addEventListener("click", () => loadFromUrl(deployedSnapshotPath, "deployed snapshot"));
document.getElementById("open-raw").addEventListener("click", openRawView);
loadFromUrl(deployedSnapshotPath, "deployed snapshot").catch(renderEmptyState);

async function handleFile(event, kind) {
  const file = event.target.files?.[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  renderPayload(payload, `${kind}: ${file.name}`);
  event.target.value = "";
}

async function loadFromUrl(url, sourceLabel) {
  const response = await fetch(url);
  renderPayload(await response.json(), sourceLabel);
}

function renderPayload(payload, sourceLabel) {
  state.currentPayload = payload;
  const snapshot = payload.snapshot ?? payload;
  const recommendation = payload.recommendation ?? snapshot.recommendation ?? snapshot;
  renderSnapshot(snapshot, recommendation, sourceLabel);
}

function renderEmptyState() {
  setText("priority", "Import a snapshot");
  setText("reason", "Drop in a JSON snapshot file or live payload export.");
  setText("confidence", "-");
  setText("check-in", "-");
  setText("data-quality", "-");
  setText("calories", "-");
  setText("protein", "-");
  setText("carbs", "-");
  setText("fat", "-");
  setText("vo2max", "-");
  setText("fueling", "-");
  setText("remaining-kcal", "-");
  setText("sleep", "-");
  setText("motivation", "-");
  sections.innerHTML = "";
  statusBanner.textContent = "No file loaded";
  state.currentPayload = null;
  clearStoredSnapshot();
}

function renderSnapshot(snapshot, recommendation, sourceLabel) {
  const garmin = snapshot.garmin ?? {};
  const hevy = snapshot.hevy ?? {};
  const cronometer = snapshot.cronometer ?? {};
  const manual = snapshot.manual_context ?? {};
  const derived = snapshot.derived ?? {};
  const priority = recommendation.Priority ?? recommendation.priority ?? "No recommendation";
  const reason = recommendation.Reason ?? recommendation.reason ?? "No explanation available.";

  const macros = recommendation.Macros ?? {};
  setText("priority", priority);
  setText("reason", reason);
  setText("confidence", recommendation.confidence ?? recommendation.Confidence ?? "-");
  setText("check-in", derived.check_in_required ?? derived.check_in ?? "-");
  setText("data-quality", derived.data_quality ?? "-");
  setText("calories", macros.calories ? `${macros.calories} kcal` : "-");
  setText("protein", macros.protein_g ? `${macros.protein_g}g` : "-");
  setText("carbs", macros.carbs_g ? `${macros.carbs_g}g` : "-");
  setText("fat", macros.fat_g ? `${macros.fat_g}g` : "-");
  setText("vo2max", formatValue(garmin.current_vo2max));
  setText("fueling", formatValue(cronometer.fueling_status));
  setText("remaining-kcal", formatValue(cronometer.today?.remaining_kcal));
  setText("sleep", formatValue(manual.sleep_quality));
  setText("motivation", formatValue(manual.motivation));

  statusBanner.textContent = `${sourceLabel} loaded`;
  sections.innerHTML = [
    renderFocusCard("Trend", [
      ["Current VO2 max", formatValue(garmin.current_vo2max)],
      ["Fueling", formatValue(cronometer.fueling_status)],
      ["Remaining kcal", formatValue(cronometer.today?.remaining_kcal)],
      ["Strength trend", formatValue(hevy.strength_trend)],
      ["Recovery", formatValue(manual.sleep_quality)],
    ]),
    renderDeltaCard(state.previousSnapshot, snapshot),
    renderCompactSection("Athlete", snapshot.athlete),
    renderCompactSection("Garmin", garmin),
    renderCompactSection("Hevy", hevy),
    renderCompactSection("Cronometer", cronometer),
    renderCompactSection("Manual context", manual),
    renderCompactSection("Derived", derived),
  ]
    .filter(Boolean)
    .join("");
  state.previousSnapshot = snapshot;
  persistSnapshot(snapshot);
}

function renderFocusCard(title, rows) {
  const items = rows
    .filter(([, value]) => shouldRenderValue(value))
    .map(
      ([label, value]) => `
        <div class="item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join("");

  if (!items) return "";
  return `
    <article class="focus-card card">
      <div class="summary-header">
        <div>
          <p class="label">${escapeHtml(title)}</p>
          <h2>What matters now</h2>
        </div>
      </div>
      <div class="grid focus-grid">${items}</div>
    </article>
  `;
}

function renderDeltaCard(previousSnapshot, currentSnapshot) {
  const rows = buildDeltaRows(previousSnapshot ?? {}, currentSnapshot ?? {});
  if (!rows.length) return "";
  return `
    <details class="card section-panel">
      <summary class="section-summary">
        <div>
          <p class="label">Progress</p>
          <h2>Change since last snapshot</h2>
        </div>
        <span class="status-banner">Show changes</span>
      </summary>
      <div class="section-list">
        ${rows
          .map(
            (row) => `
              <div class="item">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(row.value)}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderCompactSection(title, value) {
  const entries = flattenEntries(value).filter((entry) => shouldRenderValue(entry.value));
  if (!entries.length) return "";
  return `
    <details class="card section-panel">
      <summary class="section-summary">
        <div>
          <p class="label">${escapeHtml(title)}</p>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <span class="status-banner">${entries.length} items</span>
      </summary>
      <div class="section-list">
        ${entries
          .slice(0, 12)
          .map(
            ([path, itemValue]) => `
              <div class="item">
                <span>${escapeHtml(formatLabel(path[path.length - 1], title))}</span>
                <strong>${escapeHtml(formatRenderedValue(itemValue))}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

function buildDeltaRows(previousSnapshot, currentSnapshot) {
  const rows = [];
  addDeltaRow(rows, "VO2 max", readNumber(previousSnapshot, ["garmin", "current_vo2max"]), readNumber(currentSnapshot, ["garmin", "current_vo2max"]));
  addDeltaRow(rows, "Fueling", readText(previousSnapshot, ["cronometer", "fueling_status"]), readText(currentSnapshot, ["cronometer", "fueling_status"]));
  addDeltaRow(rows, "Remaining kcal", readNumber(previousSnapshot, ["cronometer", "today", "remaining_kcal"]), readNumber(currentSnapshot, ["cronometer", "today", "remaining_kcal"]));
  addDeltaRow(rows, "Strength trend", readText(previousSnapshot, ["hevy", "strength_trend"]), readText(currentSnapshot, ["hevy", "strength_trend"]));
  addDeltaRow(rows, "Running bests", summarizeBestCount(previousSnapshot), summarizeBestCount(currentSnapshot));
  return rows;
}

function summarizeBestCount(snapshot) {
  const hevyBests = snapshot?.hevy?.recent_bests?.length ?? 0;
  const garminBests = snapshot?.garmin?.recent_bests?.length ?? 0;
  return `${hevyBests} strength / ${garminBests} running`;
}

function addDeltaRow(rows, label, previous, current) {
  if (!shouldRenderValue(previous) && !shouldRenderValue(current)) return;
  if (previous === current) return;
  rows.push({ label, value: `${formatDeltaValue(previous)} → ${formatDeltaValue(current)}` });
}

function formatDeltaValue(value) {
  if (!shouldRenderValue(value)) return "-";
  return String(value);
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

function flattenEntries(value, path = []) {
  if (!shouldDescend(value)) return [[path, value]];
  return Object.entries(value).flatMap(([key, entry]) => flattenEntries(entry, [...path, key]));
}

function shouldDescend(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && typeof value === "object" && Object.keys(value).length > 0;
}

function shouldRenderValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim() !== "" && value !== "null";
  return true;
}

function formatRenderedValue(value) {
  if (Array.isArray(value)) return value.map((item) => formatRenderedValue(item)).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatValue(value) {
  return shouldRenderValue(value) ? String(value) : "-";
}

function formatLabel(key, sectionTitle = "") {
  const normalized = String(key).replaceAll("_", " ").replaceAll("-", " ").trim().toLowerCase();
  const mapping = {
    age: "Age",
    height: "Height (cm)",
    "body weight": "Body Weight (kg)",
    "current vo2max": "Current VO2 Max",
    "vo2max trend": "VO2 Max Trend",
    "training status": "Training Status",
    "training load trend": "Training Load Trend",
    freshness: "Freshness",
    "snapshot date": "Snapshot Date",
    timezone: "Timezone",
    "recent activities": "Recent Activities",
    "recent runs": "Recent Runs",
    "recent workouts": "Recent Workouts",
    "recent days": "Recent Days",
    "recent bests": "Recent Bests",
    "last quality run": "Last Quality Run",
    "last long run": "Last Long Run",
    "last workout": "Last Workout",
    "muscle group fatigue": "Muscle Group Fatigue",
    "sleep quality": "Sleep Quality",
    soreness: "Soreness",
    pain: "Pain",
    motivation: "Motivation",
    "mental fatigue": "Mental Fatigue",
    "table tennis today": "Table Tennis Today",
    "time available minutes": "Time Available (min)",
    "calories consumed": "Calories Consumed",
    "calories target": "Calories Target",
    "protein g": "Protein (g)",
    "carbs g": "Carbs (g)",
    "fat g": "Fat (g)",
    "fiber g": "Fiber (g)",
    "remaining kcal": "Remaining kcal",
    "log completeness": "Log Completeness",
    "fueling status": "Fueling Status",
    "protein status": "Protein Status",
    "carb availability": "Carb Availability",
    "current block": "Current Block",
    "current vo2max waypoint": "VO2 Max Waypoint",
    "data quality": "Data Quality",
    "hard session allowed": "Hard Session Allowed",
    "primary constraints": "Primary Constraints",
    "likely conflicts": "Likely Conflicts",
    "check in required": "Check-in Required",
    "check in questions": "Check-in Questions",
  };

  if (sectionTitle === "Hevy" && normalized === "estimated one rm kg") return "Estimated 1RM (kg)";
  return mapping[normalized] ?? normalized.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openRawView() {
  const payload = state.currentPayload;
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

function clearStoredSnapshot() {
  try {
    localStorage.removeItem("personal-trainer:last-snapshot");
  } catch {}
}
