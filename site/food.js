import { scanBarcode } from "./barcode-scanner.js";
import {
  escapeHtml,
  formatDisplayValue,
  hasLiveSnapshotData,
} from "./data-helpers.js";

const liveSnapshotUrl = new URL("./data/snapshot.json", import.meta.url);
const foodLiveTitle = document.getElementById("food-live-title");
const foodLiveHelp = document.getElementById("food-live-help");
const foodLiveMeta = document.getElementById("food-live-meta");
const foodLiveStatus = document.getElementById("food-live-status");
const foodLiveTargets = document.getElementById("food-live-targets");

const foodGuidanceShell = document.getElementById("food-guidance-shell");
const foodGuidanceDayType = document.getElementById("food-guidance-day-type");
const foodGuidanceConfidence = document.getElementById("food-guidance-confidence");
const foodGuidanceHints = document.getElementById("food-guidance-hints");
const foodGuidanceWarnings = document.getElementById("food-guidance-warnings");

const foodSummary = document.getElementById("food-summary");
const foodHelp = document.getElementById("food-help");
const foodStatus = document.getElementById("food-status");
const foodDayCount = document.getElementById("food-day-count");
const foodList = document.getElementById("food-list");
const foodItem = document.getElementById("food-item");
const foodTime = document.getElementById("food-time");
const foodBarcode = document.getElementById("food-barcode");

const state = {
  liveSnapshot: null,
  liveStatus: "Loading live snapshot",
  foodEntries: readFoodEntries(),
  foodTiming: readFoodTiming(),
};

document
  .getElementById("add-food-entry")
  ?.addEventListener("click", addFoodEntry);
document
  .getElementById("reset-food-form")
  ?.addEventListener("click", resetFoodForm);
document
  .getElementById("scan-barcode")
  ?.addEventListener("click", handleScanBarcode);

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-food-timing]");
  if (!button) return;
  state.foodTiming = button.dataset.foodTiming ?? "flexible";
  persistFoodTiming(state.foodTiming);
  renderFoodShell();
});

renderFoodShell();
loadLiveSnapshot().catch(() =>
  renderLiveSnapshotEmpty("Live data unavailable"),
);

async function loadLiveSnapshot() {
  try {
    const response = await fetch(`${liveSnapshotUrl.pathname}?v=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    state.liveSnapshot = payload.snapshot ?? payload;
    state.liveStatus = describeLiveSnapshot(state.liveSnapshot);
  } catch {
    state.liveSnapshot = null;
    state.liveStatus = "Live data unavailable";
  }
  renderLiveSnapshotShell();
}

function renderFoodShell() {
  const entries = state.foodEntries ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = entries.filter((entry) => entry.date === today);
  const latest = todayEntries[todayEntries.length - 1];
  const summary = latest
    ? `${todayEntries.length} logged today`
    : "0 entries today";
  const help = latest
    ? `Latest: ${latest.item} · ${formatFoodTimingLabel(
        latest.timing,
      )} · ${formatFoodTimeLabel(latest.time)}`
    : "Log meals and snacks as you go. Add a time and timing tag so the app can later reason about fuel before, during, or after training.";

  if (foodSummary)
    foodSummary.textContent = latest ? latest.item : "No food logged yet";
  if (foodHelp) foodHelp.textContent = help;
  if (foodStatus) foodStatus.textContent = summary;
  if (foodDayCount)
    foodDayCount.textContent = `${todayEntries.length} entr${
      todayEntries.length === 1 ? "y" : "ies"
    }`;
  if (foodList) foodList.innerHTML = renderFoodList(todayEntries);

  if (foodTime && !foodTime.value) {
    foodTime.value = defaultFoodEntryTime();
  }

  document.querySelectorAll("[data-food-timing]").forEach((button) => {
    const active =
      button.dataset.foodTiming === (state.foodTiming ?? "flexible");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderLiveSnapshotShell() {
  const snapshot = state.liveSnapshot;
  if (!snapshot) {
    renderLiveSnapshotEmpty(state.liveStatus);
    return;
  }

  const pageState = snapshot.derived?.page_states?.food ?? {
    kind: "fresh",
    label: "Ready",
    detail: "",
  };
  if (pageState.kind === "missing") {
    renderLiveSnapshotEmpty(pageState.detail || state.liveStatus);
    return;
  }

  const recommendation = snapshot.recommendation ?? {};
  const macros = recommendation.Macros ?? {};
  const today = snapshot.cronometer?.today ?? {};

  if (foodLiveTitle) {
    foodLiveTitle.textContent = snapshot.snapshot_date
      ? `Today's macros for ${snapshot.snapshot_date}`
      : "Today's macros";
  }
  if (foodLiveHelp) {
    foodLiveHelp.textContent =
      describeLiveSnapshotDetail(snapshot) ??
      "Live intake totals are shown first, with recommendation targets underneath.";
  }
  if (foodLiveMeta) {
    foodLiveMeta.textContent = describeLiveSnapshotMeta(snapshot);
  }
  if (foodLiveStatus) {
    foodLiveStatus.textContent =
      pageState.kind === "fresh"
        ? formatDisplayValue(state.liveStatus)
        : pageState.label;
  }
  if (foodLiveTargets) {
    foodLiveTargets.innerHTML = [
      liveStat(
        "Calories",
        formatMacroCurrent(today.calories_consumed, "kcal"),
        formatMacroTarget(macros.calories, "kcal"),
      ),
      liveStat(
        "Protein",
        formatMacroCurrent(today.protein_g, "g"),
        formatMacroTarget(macros.protein_g, "g"),
      ),
      liveStat(
        "Carbs",
        formatMacroCurrent(today.carbs_g, "g"),
        formatMacroTarget(macros.carbs_g, "g"),
      ),
      liveStat(
        "Fat",
        formatMacroCurrent(today.fat_g, "g"),
        formatMacroTarget(macros.fat_g, "g"),
      ),
      liveStat(
        "Remaining kcal",
        formatMacroCurrent(today.remaining_kcal, "kcal"),
        formatMacroTarget(macros.calories, "kcal"),
      ),
    ].join("");
  }

  renderNutritionGuidance(snapshot);
}

function renderLiveSnapshotEmpty(message) {
  if (foodLiveTitle) foodLiveTitle.textContent = "Live data unavailable";
  if (foodLiveHelp) {
    foodLiveHelp.textContent =
      message ||
      "Load a live snapshot to see today's nutrition context above the entry form.";
  }
  if (foodLiveMeta) {
    foodLiveMeta.textContent = "No imported Cronometer day is available.";
  }
  if (foodLiveStatus) foodLiveStatus.textContent = "Unavailable";
  if (foodLiveTargets) {
    foodLiveTargets.innerHTML = `
      <div class="food-live-empty">
        <p class="muted">No live intake snapshot is available.</p>
        <p class="muted">The manual food log still works locally, but imported nutrition data will only show once the live pipeline succeeds.</p>
      </div>
    `;
  }
  hideNutritionGuidance();
}

function renderNutritionGuidance(snapshot) {
  const guidance = snapshot.nutrition_guidance;
  if (!guidance) {
    hideNutritionGuidance();
    return;
  }

  if (foodGuidanceShell) foodGuidanceShell.classList.remove("hidden");

  const dayTypeLabels = {
    normal: "Normal day",
    fuel_heavy: "Fuel heavy",
    fuel_light: "Fuel light",
    repair: "Repair day",
    beginner_estimate: "Beginner estimate",
  };
  if (foodGuidanceDayType) {
    foodGuidanceDayType.textContent = dayTypeLabels[guidance.day_type] ?? guidance.day_type;
  }

  if (foodGuidanceConfidence) {
    foodGuidanceConfidence.className = `guidance-confidence-badge guidance-confidence-${guidance.confidence}`;
    foodGuidanceConfidence.textContent = guidance.confidence;
  }

  if (foodGuidanceHints) {
    const hints = [];
    if (guidance.pre_training) {
      hints.push(`<p class="guidance-hint"><strong>Before training:</strong> ${escapeHtml(guidance.pre_training)}</p>`);
    }
    if (guidance.post_training) {
      hints.push(`<p class="guidance-hint"><strong>After training:</strong> ${escapeHtml(guidance.post_training)}</p>`);
    }
    foodGuidanceHints.innerHTML = hints.join("");
  }

  if (foodGuidanceWarnings && Array.isArray(guidance.warnings)) {
    const warningLabels = {
      under_fueled: "Under-fueled",
      recovery_poor: "Recovery poor",
      hard_session_today: "Hard session today",
      starter_estimate: "Starter estimate",
    };
    foodGuidanceWarnings.innerHTML = guidance.warnings
      .map((w) => {
        const label = warningLabels[w] ?? w;
        return `<span class="guidance-warning-chip">${escapeHtml(label)}</span>`;
      })
      .join("");
  }
}

function hideNutritionGuidance() {
  if (foodGuidanceShell) foodGuidanceShell.classList.add("hidden");
  if (foodGuidanceDayType) foodGuidanceDayType.textContent = "";
  if (foodGuidanceConfidence) { foodGuidanceConfidence.textContent = ""; foodGuidanceConfidence.className = "guidance-confidence-badge"; }
  if (foodGuidanceHints) foodGuidanceHints.innerHTML = "";
  if (foodGuidanceWarnings) foodGuidanceWarnings.innerHTML = "";
}

function addFoodEntry() {
  const item = foodItem?.value.trim() ?? "";
  if (!item) return;
  const entry = normalizeFoodEntry({
    item,
    time: foodTime?.value || defaultFoodEntryTime(),
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
  if (foodTime) foodTime.value = defaultFoodEntryTime();
  if (clearTiming) {
    state.foodTiming = "flexible";
    persistFoodTiming(state.foodTiming);
  }
  const preview = document.getElementById("food-scan-preview");
  if (preview) preview.classList.add("hidden");
  renderFoodShell();
  foodItem?.focus();
}

async function handleScanBarcode() {
  if (foodBarcode) foodBarcode.value = "Scanning…";
  const result = await scanBarcode();
  if (result) {
    if (foodBarcode) foodBarcode.value = result.barcode;
    if (result.name && foodItem) {
      foodItem.value = result.name;
    }
    if (result.detail && foodHelp) {
      foodHelp.textContent = `Found: ${result.name} · ${result.detail}`;
    } else if (!result.name && foodHelp) {
      foodHelp.textContent = `Barcode ${result.barcode} not found in database. Type the product name manually.`;
    }
    renderScanPreview(result);
    foodItem?.focus();
  } else {
    if (foodBarcode) foodBarcode.value = "";
    foodBarcode?.focus();
  }
}

function renderScanPreview(product) {
  const el = document.getElementById("food-scan-preview");
  if (!el) return;
  if (!product?.name) {
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  const rows = [
    product.kcal_per_100g != null && `${product.kcal_per_100g} kcal`,
    product.protein_per_100g != null && `${product.protein_per_100g}g protein`,
    product.carbs_per_100g != null && `${product.carbs_per_100g}g carbs`,
    product.fat_per_100g != null && `${product.fat_per_100g}g fat`,
    product.fiber_per_100g != null && `${product.fiber_per_100g}g fiber`,
    product.sugars_per_100g != null && `${product.sugars_per_100g}g sugars`,
    product.sat_fat_per_100g != null && `${product.sat_fat_per_100g}g sat. fat`,
    product.sodium_per_100g != null && `${product.sodium_per_100g}g sodium`,
  ].filter(Boolean);
  const subtitle = [product.brand, product.servingSize]
    .filter(Boolean)
    .join(" · ");
  const hasNutrition = rows.length > 0;
  el.innerHTML = `
    <div class="food-scan-header">
      <strong>${escapeHtml(product.name)}</strong>
      ${
        subtitle
          ? `<span class="food-scan-sub">${escapeHtml(subtitle)}</span>`
          : ""
      }
    </div>
    ${
      hasNutrition
        ? `<div class="food-scan-grid">${rows
            .map(
              (r) =>
                `<span class="food-scan-stat">${escapeHtml(
                  r,
                )}<span class="food-scan-unit">/100g</span></span>`,
            )
            .join("")}</div>`
        : '<p class="food-scan-missing muted">Nutrition data not available for this product in the database.</p>'
    }
  `;
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
            ${
              entry.barcode
                ? `<span>Barcode: ${escapeHtml(entry.barcode)}</span>`
                : ""
            }
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
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(
    local.getDate(),
  )}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

function defaultFoodEntryTime(date = new Date()) {
  return formatDateTimeLocal(date);
}

function persistFoodEntries(entries) {
  try {
    localStorage.setItem(
      "personal-trainer:food-entries",
      JSON.stringify(entries.slice(-50)),
    );
  } catch {}
}

function readFoodEntries() {
  try {
    const raw = localStorage.getItem("personal-trainer:food-entries");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(normalizeFoodEntry).filter(Boolean)
      : [];
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
    return ["flexible", "before", "during", "after"].includes(raw)
      ? raw
      : "flexible";
  } catch {
    return "flexible";
  }
}

function normalizeFoodEntry(raw) {
  const item = typeof raw?.item === "string" ? raw.item.trim() : "";
  if (!item) return null;
  const timing = ["flexible", "before", "during", "after"].includes(raw?.timing)
    ? raw.timing
    : "flexible";
  const time = typeof raw?.time === "string" ? raw.time : "";
  const barcode = typeof raw?.barcode === "string" ? raw.barcode.trim() : "";
  const date =
    typeof raw?.date === "string"
      ? raw.date
      : time.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return { item, timing, time, barcode, date };
}

function formatMacroTarget(value, unit) {
  if (value == null || value === "") return "-";
  return `${Math.round(Number(value))} ${unit}`;
}

function formatMacroCurrent(value, unit) {
  if (value == null || value === "") return "No intake yet";
  return `${Math.round(Number(value))} ${unit} logged`;
}

function describeLiveSnapshot(snapshot) {
  if (snapshot?.source === "live" && hasLiveSnapshotData(snapshot)) {
    return "Live nutrition data loaded";
  }
  if (snapshot?.source === "live") {
    return "Live snapshot loaded, but nutrition data is incomplete";
  }
  if (hasLiveSnapshotData(snapshot)) {
    return "Imported snapshot available";
  }
  return "Live data unavailable";
}

function describeLiveSnapshotDetail(snapshot) {
  if (snapshot?.source === "live" && hasLiveSnapshotData(snapshot)) {
    return "Targets and intake come from the live daily snapshot.";
  }
  if (snapshot?.source === "live") {
    return "The live snapshot loaded, but the nutrition block is incomplete.";
  }
  if (hasLiveSnapshotData(snapshot)) {
    return "Some live data exists, but this snapshot is not marked as live.";
  }
  return null;
}

function describeLiveSnapshotMeta(snapshot) {
  const recentDays = Array.isArray(snapshot?.cronometer?.recent_days)
    ? snapshot.cronometer.recent_days
    : [];
  const sourceDate = recentDays.length
    ? recentDays[recentDays.length - 1].date
    : null;
  const snapshotDate = snapshot?.snapshot_date ?? null;
  if (sourceDate && snapshotDate && sourceDate !== snapshotDate) {
    return `Cronometer day ${sourceDate} · snapshot ${snapshotDate}`;
  }
  if (sourceDate) {
    return `Cronometer day ${sourceDate}`;
  }
  if (snapshotDate) {
    return `Snapshot date ${snapshotDate}`;
  }
  return "Imported Cronometer day unavailable.";
}

function liveStat(label, primary, secondary) {
  return `
    <div class="food-live-stat">
      <span class="food-live-stat-label">${escapeHtml(label)}</span>
      <strong class="food-live-stat-target">${escapeHtml(primary)}</strong>
      <span class="food-live-stat-current">${escapeHtml(secondary)}</span>
    </div>
  `;
}
