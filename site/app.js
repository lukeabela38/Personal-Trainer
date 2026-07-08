import { loadLastDays, weeklySummary, extractBodyWeight } from "./history.js";
import { loadGoals, updateGoalCurrent, goalProgress, renderSparkline, fmtNum } from "./goals.js";

const deployedSnapshotPath = new URL("./data/snapshot.json", import.meta.url);
const sections = document.getElementById("sections");
const historySections = document.getElementById("history-sections");
const statGroups = document.getElementById("stat-groups");
const statusBanner = document.getElementById("status-banner");
const freshnessBar = document.getElementById("freshness-bar");
const foodSummary = document.getElementById("food-summary");
const foodHelp = document.getElementById("food-help");
const foodStatus = document.getElementById("food-status");
const foodList = document.getElementById("food-list");
const foodItem = document.getElementById("food-item");
const foodTime = document.getElementById("food-time");
const foodBarcode = document.getElementById("food-barcode");
const dashboardSummary = document.getElementById("dashboard-summary");
const recActions = document.getElementById("rec-actions");
const state = {
  currentPayload: null,
  previousSnapshot: readStoredSnapshot(),
  completedSessions: readCompletedSessions(),
  foodEntries: readFoodEntries(),
  foodTiming: readFoodTiming(),
  goals: loadGoals(),
};

document.getElementById("file-input").addEventListener("change", handleFile);
document.getElementById("open-raw").addEventListener("click", openRawView);
document.getElementById("load-history").addEventListener("click", loadHistory);
document.getElementById("add-food-entry").addEventListener("click", addFoodEntry);
document.getElementById("reset-food-form").addEventListener("click", resetFoodForm);
document.getElementById("scan-barcode").addEventListener("click", focusBarcodeInput);
renderFoodShell();
loadFromUrl(deployedSnapshotPath, "deployed snapshot").catch(renderEmptyState);

async function loadHistory() {
  if (!historySections) return;
  try {
    const index = await (await fetch(new URL("./history/index.json", import.meta.url).pathname + "?v=" + Date.now())).json();
    if (!index?.dates?.length) {
      historySections.innerHTML = noHistoryHTML();
      return;
    }
    const snaps = [];
    for (const d of index.dates.slice(-30)) {
      try {
        const r = await fetch(`./history/${d}.json?v=${Date.now()}`);
        snaps.push(await r.json());
      } catch {}
    }
    if (!snaps.length) { historySections.innerHTML = noHistoryHTML(); return; }
    renderHistory(snaps);
  } catch {
    historySections.innerHTML = noHistoryHTML();
  }
}

function noHistoryHTML() {
  return `<div class="stat-group">
    <div class="stat-group-title">No history data</div>
    <p class="lede" style="margin:6px 0">Generate 90 days of example data:</p>
    <pre style="background:rgba(255,255,255,0.04);padding:10px 14px;border-radius:10px;font-size:0.8rem;overflow-x:auto;margin:6px 0">PYTHONPATH=personal_trainer/src python3 scripts/generate_history.py</pre>
    <p class="lede" style="margin:4px 0 0">Then reload this page and click <strong>Load 30-day history</strong> again.</p>
  </div>`;
}

function renderHistory(snapshots) {
  if (!historySections) return;
  const goals = updateGoalCurrent(state.goals, snapshots[snapshots.length - 1]);
  saveGoals(goals);

  const summary = weeklySummary(snapshots);
  const bw = extractBodyWeight(snapshots);

  historySections.innerHTML = [
    snapshots.length >= 2 ? renderDailyDiff(snapshots) : "",
    summary ? renderWeekSummary(summary) : "",
    goals.length ? renderGoalsCard(goals) : "",
    bw.length > 1 ? renderSparklineCard(bw) : "",
  ].filter(Boolean).join("");
}

document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const map = { "1": "./index.html", "2": "./strength.html", "3": "./speed.html", "4": "./progress.html" };
  const url = map[e.key];
  if (url) location.href = url;
});

async function handleFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  const kind = payload.recommendation ? "snapshot" : "live payload";
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
  renderFoodShell();
  setText("priority", "Import a snapshot");
  setText("reason", "Drop in a JSON snapshot file or live payload export.");
  freshnessBar.innerHTML = "";
  if (dashboardSummary) dashboardSummary.innerHTML = "";
  statGroups.innerHTML = renderStatGroupsEmpty();
  recActions.innerHTML = "";
  sections.innerHTML = "";
  statusBanner.textContent = "No file loaded";
  state.currentPayload = null;
  clearStoredSnapshot();
}

function renderFoodShell() {
  const entries = state.foodEntries ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((entry) => entry.date === today);
  const latest = todayEntries[todayEntries.length - 1];
  const summary = latest ? `${todayEntries.length} logged today` : "0 entries today";
  const help = latest
    ? `Latest: ${latest.item} · ${formatFoodTimingLabel(latest.timing)} · ${formatFoodTimeLabel(latest.time)}`
    : "Log meals and snacks as you go. Add a time and timing tag so the app can later reason about fuel before, during, or after training.";

  if (foodSummary) foodSummary.textContent = latest ? latest.item : "No food logged yet";
  if (foodHelp) foodHelp.textContent = help;
  if (foodStatus) foodStatus.textContent = summary;
  if (foodList) foodList.innerHTML = renderFoodList(todayEntries);
  if (foodTime && !foodTime.value) foodTime.value = formatDateTimeLocal(new Date());

  document.querySelectorAll("[data-food-timing]").forEach((button) => {
    const active = button.dataset.foodTiming === (state.foodTiming ?? "flexible");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function addFoodEntry() {
  const item = foodItem?.value.trim() ?? "";
  if (!item) return;
  const entry = normalizeFoodEntry({
    item,
    time: foodTime?.value || formatDateTimeLocal(new Date()),
    barcode: foodBarcode?.value.trim() ?? "",
    timing: state.foodTiming ?? "flexible",
  });
  state.foodEntries = [...state.foodEntries, entry].slice(-50);
  persistFoodEntries(state.foodEntries);
  resetFoodForm(false);
  renderFoodShell();
}

function resetFoodForm(clearTiming = true) {
  if (foodItem) foodItem.value = "";
  if (foodBarcode) foodBarcode.value = "";
  if (foodTime) foodTime.value = formatDateTimeLocal(new Date());
  if (clearTiming) {
    state.foodTiming = "flexible";
    persistFoodTiming(state.foodTiming);
  }
  renderFoodShell();
  foodItem?.focus();
}

function focusBarcodeInput() {
  foodBarcode?.focus();
}

function renderSnapshot(snapshot, recommendation, sourceLabel) {
  const garmin = snapshot.garmin ?? {};
  const hevy = snapshot.hevy ?? {};
  const cronometer = snapshot.cronometer ?? {};
  const manual = snapshot.manual_context ?? {};
  const derived = snapshot.derived ?? {};
  const priority = formatPriorityLabel(recommendation.Priority ?? recommendation.priority ?? "No recommendation");
  const reason = recommendation.Reason ?? recommendation.reason ?? "No explanation available.";

  setText("priority", priority);
  setText("reason", reason);
  statusBanner.textContent = `${sourceLabel} loaded`;

  const macros = recommendation.Macros ?? {};
  const today = cronometer.today ?? {};

  freshnessBar.innerHTML = renderFreshnessBar(snapshot);
  renderDashboardSummary(snapshot, recommendation, derived);
  statGroups.innerHTML = [
    renderRecGroup(recommendation, derived),
    renderNutritionGroup(macros, today),
    renderRecoveryGroup(garmin, cronometer, manual, hevy),
  ].join("");
  recActions.innerHTML = renderSessionLog(priority);
  sections.innerHTML = [
    renderFreshnessCard(snapshot),
    renderDeltaCard(state.previousSnapshot, snapshot),
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

function renderDashboardSummary(snapshot, recommendation, derived) {
  if (!dashboardSummary) return;
  const rec = recommendation ?? {};
  const tiles = [
    { label: "Priority", value: formatDisplayValue(rec.Priority ?? rec.priority ?? "Unknown"), subvalue: snapshot.snapshot_date ?? "Latest snapshot" },
    { label: "Check-in", value: formatDisplayValue(rec["Needs check-in"] ?? rec.needs_check_in ?? "-"), subvalue: "Decision data" },
    { label: "Data quality", value: formatDisplayValue(derived.data_quality ?? "-"), subvalue: "Snapshot completeness" },
    { label: "Confidence", value: formatDisplayValue(rec.Confidence ?? rec.confidence ?? "-"), subvalue: "Recommendation strength" },
  ];
  dashboardSummary.innerHTML = tiles
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

function renderFoodList(entries) {
  if (!entries.length) {
    return `
      <div class="food-empty">
        <p class="muted">No entries today.</p>
        <p class="muted">Add your first meal or snack to start building a timing history.</p>
      </div>
    `;
  }
  return entries
    .slice()
    .reverse()
    .map(
      (entry) => `
        <div class="food-entry">
          <div class="food-entry-main">
            <strong>${escapeHtml(entry.item)}</strong>
            <span>${escapeHtml(formatFoodTimingLabel(entry.timing))}</span>
          </div>
          <div class="food-entry-meta">
            <span>${escapeHtml(formatFoodTimeLabel(entry.time))}</span>
            ${entry.barcode ? `<span>Barcode: ${escapeHtml(entry.barcode)}</span>` : ""}
          </div>
        </div>
      `,
    )
    .join("");
}

function formatFoodTimingLabel(timing) {
  const labels = {
    flexible: "Flexible timing",
    before: "Before training",
    during: "During training",
    after: "After training",
  };
  return labels[timing] ?? "Flexible timing";
}

function formatFoodTimeLabel(value) {
  if (!value) return "Time not set";
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Time not set";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

/* ── Freshness bar ── */

function renderFreshnessBar(snapshot) {
  const sources = ["garmin", "hevy", "cronometer", "manual_context"];
  const levels = sources.map((key) => snapshot[key]?.freshness ?? "missing");
  const worst = levels.includes("missing") ? "missing" : levels.includes("stale") ? "stale" : levels.includes("partial") ? "stale" : "fresh";
  const labels = { fresh: "All data sources fresh", stale: "Some data sources stale", missing: "Some data sources missing" };
  return `<div class="freshness-bar ${worst}">${labels[worst]}</div>`;
}

/* ── Stat groups ── */

function renderStatGroupsEmpty() {
  return `
    <div class="stat-group">
      <div class="stat-group-title">Recommendation</div>
      <div class="stat-group-grid">
        ${statItem("Confidence", "-")}
        ${statItem("Check-in", "-")}
        ${statItem("Data quality", "-")}
      </div>
    </div>
    <div class="stat-group">
      <div class="stat-group-title">Nutrition</div>
      <div class="stat-group-grid">
        ${statItem("Calories", "-")}
        ${statItem("Protein", "-")}
        ${statItem("Carbs", "-")}
        ${statItem("Fat", "-")}
      </div>
    </div>
    <div class="stat-group">
      <div class="stat-group-title">Recovery</div>
      <div class="stat-group-grid">
        ${statItem("Sleep", "-")}
        ${statItem("Motivation", "-")}
        ${statItem("VO2 max", "-")}
        ${statItem("Fueling", "-")}
        ${statItem("Remaining kcal", "-")}
      </div>
    </div>
  `;
}

function renderRecGroup(rec, derived) {
  const items = [
    statItem("Confidence", rec.Confidence ?? rec.confidence ?? "-"),
    statItem("Check-in", rec["Needs check-in"] ?? rec.needs_check_in ?? "-"),
    statItem("Data quality", derived.data_quality ?? "-"),
  ].join("");
  return groupCard("Recommendation", items);
}

function renderNutritionGroup(macros, today) {
  const cal = macros.calories ? `${macros.calories} kcal` : "-";
  const pro = macros.protein_g ? `${macros.protein_g} g` : "-";
  const car = macros.carbs_g ? `${macros.carbs_g} g` : "-";
  const fat = macros.fat_g ? `${macros.fat_g} g` : "-";
  const statItems = [statItem("Calories", cal), statItem("Protein", pro), statItem("Carbs", car), statItem("Fat", fat)].join("");
  const bars = renderMacroBars(macros, today);
  return groupCard("Nutrition Targets", statItems + (bars ? `<div class="macro-group">${bars}</div>` : ""));
}

function renderRecoveryGroup(garmin, cronometer, manual, hevy) {
  const items = [
    statItem("Sleep", formatVal(manual.sleep_quality)),
    statItem("Motivation", formatVal(manual.motivation)),
    statItem("VO2 max", formatVal(garmin.current_vo2max)),
    statItem("Fueling", formatVal(cronometer.fueling_status)),
    statItem("Remaining kcal", formatVal(cronometer.today?.remaining_kcal, "kcal")),
  ].join("");
  return groupCard("Recovery & Vital Signs", items);
}

function groupCard(title, content) {
  return `
    <div class="stat-group">
      <div class="stat-group-title">${escapeHtml(title)}</div>
      <div class="stat-group-grid">${content}</div>
    </div>
  `;
}

function statItem(label, value) {
  return `
    <div class="stat-item">
      <span class="stat-item-label">${escapeHtml(label)}</span>
      <span class="stat-item-value">${escapeHtml(formatDisplayValue(value))}</span>
    </div>
  `;
}

/* ── Macro progress bars ── */

function renderMacroBars(macros, today) {
  const rows = [
    macroBar("Calories", today.calories_consumed, macros.calories),
    macroBar("Protein", today.protein_g, macros.protein_g),
    macroBar("Carbs", today.carbs_g, macros.carbs_g),
    macroBar("Fat", today.fat_g, macros.fat_g),
  ].filter(Boolean);
  return rows.join("");
}

function macroBar(label, consumed, target) {
  if (consumed == null || target == null || target <= 0) return "";
  const pct = Math.min(Math.round((consumed / target) * 100), 100);
  const cls = pct >= 90 ? "high" : pct >= 60 ? "medium" : "low";
  return `
    <div class="macro-row">
      <div class="macro-row-header">
        <span class="macro-row-label">${escapeHtml(label)}</span>
        <span class="macro-row-numbers">${consumed} / ${target}</span>
      </div>
      <div class="macro-track">
        <div class="macro-fill macro-fill-${cls}" style="width:${pct}%"></div>
      </div>
    </div>
  `;
}

/* ── Session log ── */

function renderSessionLog(priority) {
  const today = new Date().toISOString().slice(0, 10);
  const alreadyLogged = state.completedSessions.some((s) => s.date === today && s.priority === priority);
  const recent = state.completedSessions.slice(-5).reverse();
  const tags = recent
    .map(
      (s) =>
        `<span class="session-tag">${escapeHtml(formatPriorityLabel(s.priority))} <span class="muted">${escapeHtml(s.date.slice(5))}</span></span>`,
    )
    .join("");
  const btn = alreadyLogged
    ? `<span class="button small secondary" style="pointer-events:none;opacity:0.5">&#10003; Completed</span>`
    : `<button id="log-session" class="button small secondary" type="button">+ Log completed</button>`;
  const history = recent.length ? `<div class="session-history">${tags}</div>` : "";
  return `${btn}${history}`;
}

/* ── First-run welcome (event delegation in HTML, init here) ── */
try {
  if (!localStorage.getItem("personal-trainer:welcome-dismissed")) {
    document.getElementById("welcome-overlay")?.removeAttribute("hidden");
  }
} catch {}

document.addEventListener("click", (e) => {
  const foodTimingButton = e.target.closest("[data-food-timing]");
  if (foodTimingButton) {
    state.foodTiming = foodTimingButton.dataset.foodTiming ?? "flexible";
    persistFoodTiming(state.foodTiming);
    renderFoodShell();
    return;
  }

  if (e.target.closest("#welcome-dismiss") || e.target.id === "welcome-dismiss") {
    document.getElementById("welcome-overlay")?.remove();
    try { localStorage.setItem("personal-trainer:welcome-dismissed", "1"); } catch {}
    return;
  }
  if (e.target.id === "log-session") {
    const priority = document.getElementById("priority")?.textContent;
    if (!priority || priority === "Import a snapshot") return;
    const session = { priority, date: new Date().toISOString().slice(0, 10), time: Date.now() };
    state.completedSessions.push(session);
    persistCompletedSessions(state.completedSessions);
    recActions.innerHTML = renderSessionLog(priority);
  }
  if (e.target.id === "add-food-entry") {
    addFoodEntry();
    return;
  }
  if (e.target.id === "reset-food-form") {
    resetFoodForm();
    return;
  }
  if (e.target.id === "scan-barcode") {
    focusBarcodeInput();
  }
});

/* ── Freshness card ── */

function renderFreshnessCard(snapshot) {
  const sources = ["garmin", "hevy", "cronometer", "manual_context"];
  const rows = sources
    .map((key) => {
      const source = snapshot[key];
      if (!source) return null;
      const freshness = source.freshness ?? "missing";
      const label = key === "manual_context" ? "Manual context" : key.charAt(0).toUpperCase() + key.slice(1);
      return `
        <div class="item">
          <span>${label}</span>
          <strong><span class="freshness-dot ${freshness}"></span>${formatDisplayValue(freshness)}</strong>
        </div>
      `;
    })
    .filter(Boolean)
    .join("");
  if (!rows) return "";
  return `
    <details class="card section-panel" open>
      <summary class="section-summary">
        <div>
          <p class="label">Freshness</p>
          <h2>Data source freshness</h2>
        </div>
        <span class="section-count">${sources.length} sources</span>
      </summary>
      <div class="section-list">${rows}</div>
    </details>
  `;
}

/* ── Delta card ── */

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
        <span class="delta-banner">${rows.length} changes</span>
      </summary>
      <div class="section-list">
        ${rows
          .map(
            (row) => `
              <div class="item">
                <span>${escapeHtml(row.label)}</span>
                <strong class="${row.deltaClass ?? ""}">${escapeHtml(row.value)}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
    </details>
  `;
}

/* ── Compact section (raw data) ── */

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
        <span class="section-count">${entries.length} fields</span>
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

/* ── Delta rows ── */

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
  const pNum = Number(previous);
  const cNum = Number(current);
  let deltaClass = "";
  if (!Number.isNaN(pNum) && !Number.isNaN(cNum) && pNum !== cNum) {
    deltaClass = cNum > pNum ? "delta-up" : "delta-down";
  }
  rows.push({ label, value: `${formatDeltaValue(previous)} → ${formatDeltaValue(current)}`, deltaClass });
}

function formatDeltaValue(value) {
  if (!shouldRenderValue(value)) return "-";
  return formatDisplayValue(value);
}

/* ── Data helpers ── */

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
  return formatDisplayValue(value);
}

function formatVal(value, unit) {
  if (!shouldRenderValue(value)) return "-";
  return unit ? `${formatDisplayValue(value)} ${unit}` : formatDisplayValue(value);
}

/* ── Label formatting ── */

function formatPriorityLabel(value) {
  return formatDisplayValue(value);
}

function formatDisplayValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown";
  if (text === "-") return "-";
  if (/^[A-Za-z0-9 _-]+$/.test(text)) {
    return text
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
  }
  return text;
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

/* ── History features ── */

function renderDailyDiff(snapshots) {
  const prev = snapshots[snapshots.length - 2];
  const curr = snapshots[snapshots.length - 1];
  const pRec = prev.recommendation ?? {};
  const cRec = curr.recommendation ?? {};
  const pPriority = pRec.Priority ?? "none";
  const cPriority = cRec.Priority ?? "none";
  const pVo2 = prev.garmin?.current_vo2max;
  const cVo2 = curr.garmin?.current_vo2max;
  const pBw = prev.athlete?.body_weight_kg;
  const cBw = curr.athlete?.body_weight_kg;
  const pSleep = prev.manual_context?.sleep_quality;
  const cSleep = curr.manual_context?.sleep_quality;

  const diffs = [];
  if (pPriority !== cPriority) diffs.push(`priority: ${formatDisplayValue(pPriority)} → ${formatDisplayValue(cPriority)}`);
  if (pVo2 !== cVo2 && pVo2 != null && cVo2 != null) diffs.push(`VO2: ${fmtNum(pVo2)} → ${fmtNum(cVo2)}`);
  if (pBw !== cBw && pBw != null && cBw != null) diffs.push(`weight: ${fmtNum(pBw)} → ${fmtNum(cBw)} kg`);
  if (pSleep !== cSleep && pSleep != null && cSleep != null) diffs.push(`sleep: ${formatDisplayValue(pSleep)} → ${formatDisplayValue(cSleep)}`);

  if (!diffs.length) return "";
  return `
    <div class="stat-group">
      <div class="stat-group-title">Since yesterday</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px 16px;font-size:0.85rem">
        ${diffs.map((d) => `<span>${d}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderWeekSummary(summary) {
  const bwDelta = summary.bwDelta != null ? (summary.bwDelta > 0 ? `<span class="delta-up">+${summary.bwDelta}</span>` : `<span class="delta-down">${summary.bwDelta}</span>`) : "";
  const vo2Delta = summary.vo2Delta != null ? (summary.vo2Delta > 0 ? `<span class="delta-up">+${summary.vo2Delta}</span>` : `<span class="delta-down">${summary.vo2Delta}</span>`) : "";
  return `
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
        <div class="stat-item">
          <span class="stat-item-label">VO2 max</span>
          <span class="stat-item-value">${summary.vo2 ?? "-"}${vo2Delta}</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Body weight</span>
          <span class="stat-item-value">${summary.bw ?? "-"}${bwDelta}</span>
        </div>
      </div>
    </div>
  `;
}

function renderGoalsCard(goals) {
  const items = goals
    .map((g) => {
      const pct = goalProgress(g);
      const cls = pct >= 100 ? "high" : pct >= 75 ? "medium" : "low";
      return `
        <div class="goal-item">
          <div class="goal-header">
            <span class="goal-name">${escapeHtml(g.name)}</span>
            <span class="goal-numbers">${g.current ?? "-"} / ${g.target}${g.unit}</span>
          </div>
          <div class="macro-track">
            <div class="macro-fill macro-fill-${cls}" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          <span class="goal-pct">${pct}%</span>
        </div>
      `;
    })
    .join("");
  return `
    <div class="stat-group">
      <div class="stat-group-title">Goals</div>
      <div style="display:grid;gap:10px">${items}</div>
    </div>
  `;
}

function renderSparklineCard(bw) {
  const values = bw.map((d) => d.value);
  const latest = values[values.length - 1];
  const first = values[0];
  const trend = latest > first ? "up" : latest < first ? "down" : "same";
  const bwDir = latest > first ? "increased" : latest < first ? "decreased" : "stable";
  return `
    <div class="stat-group">
      <div class="stat-group-title">Body weight trend (${bw.length} days)</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap" title="Body weight ${bwDir}: ${fmtNum(first)} → ${fmtNum(latest)} kg">
        ${renderSparkline(values, 180, 48)}
        <div style="display:grid;gap:4px">
          <span class="stat-item-label">Start</span>
          <span class="stat-item-value">${fmtNum(first)} kg</span>
          <span class="stat-item-label">Current</span>
          <span class="stat-item-value">${fmtNum(latest)} kg</span>
        </div>
      </div>
    </div>
  `;
}

function saveGoals(goals) {
  try { localStorage.setItem("personal-trainer:goals", JSON.stringify(goals)); } catch {}
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

/* ── Persistence ── */

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

function persistFoodEntries(entries) {
  try {
    localStorage.setItem("personal-trainer:food-entries", JSON.stringify(entries.slice(-50)));
  } catch {}
}

function readFoodEntries() {
  try {
    const raw = localStorage.getItem("personal-trainer:food-entries");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeFoodEntry).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistFoodTiming(timing) {
  try {
    localStorage.setItem("personal-trainer:food-timing", timing);
  } catch {}
}

function readFoodTiming() {
  try {
    const raw = localStorage.getItem("personal-trainer:food-timing");
    return ["flexible", "before", "during", "after"].includes(raw) ? raw : "flexible";
  } catch {
    return "flexible";
  }
}

function normalizeFoodEntry(raw) {
  const item = typeof raw?.item === "string" ? raw.item.trim() : "";
  if (!item) return null;
  const timing = ["flexible", "before", "during", "after"].includes(raw?.timing) ? raw.timing : "flexible";
  const time = typeof raw?.time === "string" ? raw.time : "";
  const barcode = typeof raw?.barcode === "string" ? raw.barcode.trim() : "";
  const date = typeof raw?.date === "string" ? raw.date : time.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return { item, timing, time, barcode, date };
}

function persistCompletedSessions(sessions) {
  try {
    const recent = sessions.slice(-50);
    localStorage.setItem("personal-trainer:completed-sessions", JSON.stringify(recent));
    state.completedSessions = recent;
  } catch {}
}

function readCompletedSessions() {
  try {
    const raw = localStorage.getItem("personal-trainer:completed-sessions");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
