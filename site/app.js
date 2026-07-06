const deployedSnapshotPath = new URL("./data/snapshot.json", import.meta.url);

const sections = document.getElementById("sections");
const statusBanner = document.getElementById("status-banner");
const rawJsonUrl = new URL("./raw.json", import.meta.url);

const labels = [
  ["athlete", "Athlete"],
  ["garmin", "Garmin"],
  ["hevy", "Hevy"],
  ["cronometer", "Cronometer"],
  ["manual_context", "Manual context"],
  ["derived", "Derived"],
];

const state = { currentPayload: null };

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
  const recommendation = snapshot.recommendation ?? payload.recommendation ?? snapshot;
  renderSnapshot(snapshot, recommendation, sourceLabel);
}

function renderEmptyState() {
  setText("priority", "Import a snapshot");
  setText("reason", "Drop in a JSON snapshot file or live payload export.");
  setText("confidence", "-");
  setText("check-in", "-");
  setText("data-quality", "-");
  setText("vo2max", "-");
  setText("fueling", "-");
  setText("remaining-kcal", "-");
  setText("sleep", "-");
  setText("motivation", "-");
  sections.innerHTML = "";
  statusBanner.textContent = "No file loaded";
  state.currentPayload = null;
}

function renderSnapshot(snapshot, recommendation, sourceLabel) {
  const garmin = snapshot.garmin ?? {};
  const cronometer = snapshot.cronometer ?? {};
  const manual = snapshot.manual_context ?? {};
  const derived = snapshot.derived ?? {};

  setText("priority", recommendation.Priority ?? "No recommendation");
  setText("reason", recommendation.Reason ?? "No reason available.");
  setText("confidence", recommendation.Confidence ?? "-");
  setText("check-in", recommendation["Needs check-in"] ?? "-");
  setText("data-quality", derived.data_quality ?? "-");
  setText("vo2max", formatValue(garmin.current_vo2max));
  setText("fueling", formatValue(cronometer.fueling_status));
  setText("remaining-kcal", formatValue(cronometer.today?.remaining_kcal));
  setText("sleep", formatValue(manual.sleep_quality));
  setText("motivation", formatValue(manual.motivation));
  statusBanner.textContent = `Loaded ${sourceLabel}`;

  sections.innerHTML = labels.map(([key, title]) => renderSection(title, snapshot[key] ?? null)).join("");
}

function renderSection(title, value) {
  const items = flattenEntries(value);
  if (items.length === 0) {
    return `
      <article class="card section">
        <p class="label">${escapeHtml(title)}</p>
        <p class="muted">No data available.</p>
      </article>
    `;
  }

  return `
    <article class="card section">
      <p class="label">${escapeHtml(title)}</p>
      <div class="section-list">
        ${items.map(([path, entry]) => renderKeyValueItem(path, entry, title)).join("")}
      </div>
    </article>
  `;
}

function renderKeyValueItem(key, value, sectionTitle) {
  return `
    <div class="item">
      <span>${escapeHtml(formatLabel(key, sectionTitle))}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}

function flattenEntries(value, path = []) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenEntries(entry, [...path, `[${index}]`]));
  }

  if (typeof value !== "object") {
    return [[path.join(" · ") || "Value", value]];
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    if (entry == null) return [];
    if (Array.isArray(entry) && entry.length === 0) return [];
    if (typeof entry === "object" && !Array.isArray(entry) && Object.keys(entry).length === 0) return [];
    return flattenEntries(entry, [...path, key]);
  });
}

function formatLabel(key, sectionTitle = "") {
  const normalized = String(key).replaceAll("_", " ").replaceAll("-", " ").trim();
  const lower = normalized.toLowerCase();
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
    priority: "Priority",
    session: "Session",
    nutrition: "Nutrition",
    reason: "Reason",
    guardrail: "Guardrail",
    confidence: "Confidence",
    "needs check in": "Needs Check-in",
    legs: "Legs",
    "posterior chain": "Posterior Chain",
    push: "Push",
    pull: "Pull",
    "shoulders arms": "Shoulders & Arms",
    core: "Core",
  };

  return mapping[lower] ?? titleCase(normalized);
}

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatValue(value) {
  return value == null || value === "" ? "-" : String(value);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

async function openRawView() {
  const payload = state.currentPayload;
  if (!payload) return;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
