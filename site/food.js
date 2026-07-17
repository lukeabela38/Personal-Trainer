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
const foodGuidanceConfidence = document.getElementById(
  "food-guidance-confidence",
);
const foodGuidanceHints = document.getElementById("food-guidance-hints");
const foodGuidanceWarnings = document.getElementById("food-guidance-warnings");

const foodSummary = document.getElementById("food-summary");
const foodHelp = document.getElementById("food-help");
const foodStatus = document.getElementById("food-status");
const foodDayCount = document.getElementById("food-day-count");
const foodList = document.getElementById("food-list");
const foodManualShell = document.getElementById("food-manual-shell");
const foodManualMacros = document.getElementById("food-manual-macros");
const foodItem = document.getElementById("food-item");
const foodPortion = document.getElementById("food-portion");
const foodTime = document.getElementById("food-time");
const foodBarcode = document.getElementById("food-barcode");

const foodDayLabel = document.getElementById("food-day-label");
const foodDayDisplay = document.getElementById("food-day-display");
const foodDayPicker = document.getElementById("food-day-picker");
const foodDayPrev = document.getElementById("food-day-prev");
const foodDayNext = document.getElementById("food-day-next");

const state = {
  liveSnapshot: null,
  liveStatus: "Loading live snapshot",
  foodEntries: readFoodEntries(),
  foodTiming: readFoodTiming(),
  selectedDate: readSelectedDate(),
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
foodList?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='delete-entry']");
  if (btn) {
    const id = btn.dataset.entryId;
    if (id) deleteFoodEntry(id);
  }
});
let lastScannedProduct = null;
foodPortion?.addEventListener("input", () => {
  if (lastScannedProduct) renderScanPreview(lastScannedProduct);
});
foodDayPrev?.addEventListener("click", () => shiftDate(-1));
foodDayNext?.addEventListener("click", () => shiftDate(1));
foodDayPicker?.addEventListener("change", () => {
  if (foodDayPicker.value) goToDate(foodDayPicker.value);
});
foodDayDisplay?.addEventListener("click", () => foodDayPicker?.showPicker());

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

function dateToLocalStr(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayISO() {
  return dateToLocalStr(new Date());
}

function formatDateNavLabel(dateStr) {
  if (dateStr === todayISO()) return "Today";
  const d = new Date(dateStr + "T00:00:00");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === dateToLocalStr(yesterday)) return "Yesterday";
  const opts = { weekday: "short", month: "short", day: "numeric" };
  return d.toLocaleDateString(undefined, opts);
}

function shiftDate(delta) {
  const d = new Date(state.selectedDate + "T00:00:00");
  d.setDate(d.getDate() + delta);
  goToDate(dateToLocalStr(d));
}

function goToDate(dateStr) {
  state.selectedDate = dateStr;
  persistSelectedDate(dateStr);
  renderFoodShell();
  renderLiveSnapshotShell();
}

function readSelectedDate() {
  try {
    const raw = localStorage.getItem("personal-trainer:selected-date");
    if (raw) return raw;
  } catch {}
  return todayISO();
}

function persistSelectedDate(date) {
  try {
    localStorage.setItem("personal-trainer:selected-date", date);
  } catch {}
}

function renderFoodShell() {
  const entries = state.foodEntries ?? [];
  const date = state.selectedDate;
  const dayEntries = entries.filter((entry) => entry.date === date);
  const latest = dayEntries[dayEntries.length - 1];
  const isToday = date === todayISO();
  const summary = latest
    ? `${dayEntries.length} logged${isToday ? " today" : ""}`
    : "0 entries";
  const help = latest
    ? `Latest: ${latest.item} · ${formatFoodTimingLabel(
        latest.timing,
      )} · ${formatFoodTimeLabel(latest.time)}`
    : "Log meals and snacks as you go. Add a time and timing tag so the app can later reason about fuel before, during, or after training.";

  if (foodDayLabel) foodDayLabel.textContent = formatDateNavLabel(date);
  if (foodDayDisplay) foodDayDisplay.textContent = date;
  if (foodDayPicker) foodDayPicker.value = date;
  if (foodSummary)
    foodSummary.textContent = latest ? latest.item : "No food logged yet";
  if (foodHelp) foodHelp.textContent = help;
  if (foodStatus) foodStatus.textContent = summary;
  if (foodDayCount)
    foodDayCount.textContent = `${dayEntries.length} entr${
      dayEntries.length === 1 ? "y" : "ies"
    }`;
  if (foodList) foodList.innerHTML = renderFoodList(dayEntries);
  renderManualMacros(dayEntries);

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
  const dayData = cronometerDayForDate(snapshot, state.selectedDate) ?? {};
  const isSnapshotDate = state.selectedDate === snapshot.snapshot_date;

  if (foodLiveTitle) {
    foodLiveTitle.textContent = isSnapshotDate && snapshot.snapshot_date
      ? `Macros for ${snapshot.snapshot_date}`
      : `Macros for ${state.selectedDate}`;
  }
  if (foodLiveHelp) {
    const hasData = dayData.calories_consumed != null;
    foodLiveHelp.textContent = hasData
      ? `Intake totals from Cronometer for ${state.selectedDate}.`
      : `No Cronometer data available for ${state.selectedDate}.`;
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
    const hasData = dayData.calories_consumed != null;
    if (!hasData) {
      foodLiveTargets.innerHTML = `<div class="food-live-empty"><p class="muted">No Cronometer intake data for ${state.selectedDate}.</p></div>`;
    } else {
      foodLiveTargets.innerHTML = [
        liveStat(
          "Calories",
          formatMacroCurrent(dayData.calories_consumed, "kcal"),
          formatMacroTarget(macros.calories, "kcal"),
        ),
        liveStat(
          "Protein",
          formatMacroCurrent(dayData.protein_g, "g"),
          formatMacroTarget(macros.protein_g, "g"),
        ),
        liveStat(
          "Carbs",
          formatMacroCurrent(dayData.carbs_g, "g"),
          formatMacroTarget(macros.carbs_g, "g"),
        ),
        liveStat(
          "Fat",
          formatMacroCurrent(dayData.fat_g, "g"),
          formatMacroTarget(macros.fat_g, "g"),
        ),
        liveStat(
          "Remaining kcal",
          formatMacroCurrent(dayData.remaining_kcal, "kcal"),
          formatMacroTarget(macros.calories, "kcal"),
        ),
      ].join("");
    }
  }

  renderNutritionGuidance(snapshot);
}

function cronometerDayForDate(snapshot, dateStr) {
  if (!snapshot?.cronometer) return null;
  if (dateStr === snapshot.snapshot_date) return snapshot.cronometer.today ?? null;
  if (Array.isArray(snapshot.cronometer.recent_days)) {
    return snapshot.cronometer.recent_days.find((d) => d.date === dateStr) ?? null;
  }
  return null;
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
    foodGuidanceDayType.textContent =
      dayTypeLabels[guidance.day_type] ?? guidance.day_type;
  }

  if (foodGuidanceConfidence) {
    foodGuidanceConfidence.className = `guidance-confidence-dot guidance-${guidance.confidence}`;
    foodGuidanceConfidence.innerHTML = `<span class="confidence-label">${guidance.confidence} confidence</span>`;
  }

  if (foodGuidanceHints) {
    const hints = [];
    if (guidance.pre_training) {
      hints.push(
        `<p class="guidance-hint"><strong>Before training:</strong> ${escapeHtml(guidance.pre_training)}</p>`,
      );
    }
    if (guidance.post_training) {
      hints.push(
        `<p class="guidance-hint"><strong>After training:</strong> ${escapeHtml(guidance.post_training)}</p>`,
      );
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
  if (foodGuidanceConfidence) {
    foodGuidanceConfidence.textContent = "";
    foodGuidanceConfidence.className = "guidance-confidence-dot";
  }
  if (foodGuidanceHints) foodGuidanceHints.innerHTML = "";
  if (foodGuidanceWarnings) foodGuidanceWarnings.innerHTML = "";
}

function renderManualMacros(todayEntries) {
  const hasMacro = todayEntries.some(
    (e) => e.kcal > 0 || e.protein_g > 0 || e.carbs_g > 0 || e.fat_g > 0,
  );
  if (!hasMacro) {
    if (foodManualShell) foodManualShell.classList.add("hidden");
    return;
  }
  if (foodManualShell) foodManualShell.classList.remove("hidden");
  const totals = todayEntries.reduce(
    (acc, e) => ({
      kcal: acc.kcal + (e.kcal || 0),
      protein_g: acc.protein_g + (e.protein_g || 0),
      carbs_g: acc.carbs_g + (e.carbs_g || 0),
      fat_g: acc.fat_g + (e.fat_g || 0),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
  if (foodManualMacros) {
    foodManualMacros.innerHTML = [
      manualStat("Calories", totals.kcal, "kcal"),
      manualStat("Protein", totals.protein_g, "g"),
      manualStat("Carbs", totals.carbs_g, "g"),
      manualStat("Fat", totals.fat_g, "g"),
    ].join("");
  }
}

function manualStat(label, value, unit) {
  const display = value > 0 ? `${Math.round(value)} ${unit}` : "-";
  return `
    <div class="food-live-stat">
      <span class="food-live-stat-label">${escapeHtml(label)}</span>
      <strong class="food-live-stat-target">${escapeHtml(display)}</strong>
      <span class="food-live-stat-current">logged</span>
    </div>
  `;
}

function scanProductPer100g() {
  const el = document.getElementById("food-scan-preview");
  if (!el || el.classList.contains("hidden")) return null;
  const k = parseFloat(el.dataset.kcalPer100g);
  const p = parseFloat(el.dataset.proteinPer100g);
  const c = parseFloat(el.dataset.carbsPer100g);
  const f = parseFloat(el.dataset.fatPer100g);
  if (isNaN(k) && isNaN(p) && isNaN(c) && isNaN(f)) return null;
  return {
    kcal_per_100g: isNaN(k) ? null : k,
    protein_per_100g: isNaN(p) ? null : p,
    carbs_per_100g: isNaN(c) ? null : c,
    fat_per_100g: isNaN(f) ? null : f,
  };
}

function addFoodEntry() {
  const item = foodItem?.value.trim() ?? "";
  if (!item) return;
  const rawPortion = foodPortion ? parseFloat(foodPortion.value) : NaN;
  const portion =
    Number.isFinite(rawPortion) && rawPortion > 0 ? rawPortion : 0;
  const product = scanProductPer100g();
  const scale = portion > 0 && product ? portion / 100 : 0;
  const entry = normalizeFoodEntry({
    item,
    time: foodTime?.value || defaultFoodEntryTime(),
    barcode: foodBarcode?.value.trim() ?? "",
    timing: state.foodTiming ?? "flexible",
    serving_g: portion,
    kcal:
      scale > 0 && product.kcal_per_100g != null
        ? Math.round(product.kcal_per_100g * scale)
        : 0,
    protein_g:
      scale > 0 && product.protein_per_100g != null
        ? Math.round(product.protein_per_100g * scale * 10) / 10
        : 0,
    carbs_g:
      scale > 0 && product.carbs_per_100g != null
        ? Math.round(product.carbs_per_100g * scale * 10) / 10
        : 0,
    fat_g:
      scale > 0 && product.fat_per_100g != null
        ? Math.round(product.fat_per_100g * scale * 10) / 10
        : 0,
  });
  state.foodEntries = [...state.foodEntries, entry].slice(-50);
  persistFoodEntries(state.foodEntries);
  resetFoodForm(false);
  renderFoodShell();
}

function deleteFoodEntry(id) {
  state.foodEntries = state.foodEntries.filter((e) => e.id !== id);
  persistFoodEntries(state.foodEntries);
  renderFoodShell();
  renderLiveSnapshotShell();
}

function resetFoodForm(clearTiming = true) {
  if (foodItem) foodItem.value = "";
  if (foodPortion) foodPortion.value = "";
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
    lastScannedProduct = result;
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
  el.dataset.kcalPer100g = product.kcal_per_100g ?? "";
  el.dataset.proteinPer100g = product.protein_per_100g ?? "";
  el.dataset.carbsPer100g = product.carbs_per_100g ?? "";
  el.dataset.fatPer100g = product.fat_per_100g ?? "";
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

  const rawPortion = foodPortion ? parseFloat(foodPortion.value) : NaN;
  const portion =
    Number.isFinite(rawPortion) && rawPortion > 0 ? rawPortion : 0;
  const scale = portion > 0 ? portion / 100 : 0;
  const estRows =
    portion > 0
      ? [
          product.kcal_per_100g != null &&
            `${Math.round(product.kcal_per_100g * scale)} kcal`,
          product.protein_per_100g != null &&
            `${(product.protein_per_100g * scale).toFixed(1)}g protein`,
          product.carbs_per_100g != null &&
            `${(product.carbs_per_100g * scale).toFixed(1)}g carbs`,
          product.fat_per_100g != null &&
            `${(product.fat_per_100g * scale).toFixed(1)}g fat`,
        ].filter(Boolean)
      : [];

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
      portion > 0 && estRows.length > 0
        ? `<div class="food-scan-est">
            <span class="food-scan-est-label">Per ${portion}g serving</span>
            <div class="food-scan-grid">${estRows
              .map(
                (r) =>
                  `<span class="food-scan-stat food-scan-stat-est">${escapeHtml(r)}</span>`,
              )
              .join("")}</div>
          </div>`
        : ""
    }
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
        <p class="muted">No entries for ${state.selectedDate}.</p>
        <p class="muted">Add a meal or snack above to log it for this day.</p>
      </div>
    `;
  }

  return entries
    .slice()
    .reverse()
    .map(
      (entry) => `
        <div class="food-entry" data-entry-id="${escapeHtml(entry.id)}">
          <div class="food-entry-main">
            <strong>${escapeHtml(entry.item)}</strong>
            <span>${escapeHtml(formatFoodTimingLabel(entry.timing))}</span>
          </div>
          <div class="food-entry-meta">
            <span>${escapeHtml(formatFoodTimeLabel(entry.time))}</span>
            ${entry.serving_g ? `<span>${entry.serving_g}g</span>` : ""}
            ${
              entry.barcode
                ? `<span>Barcode: ${escapeHtml(entry.barcode)}</span>`
                : ""
            }
          </div>
          <button
            class="button secondary food-entry-delete"
            data-action="delete-entry"
            data-entry-id="${escapeHtml(entry.id)}"
            title="Delete entry"
          >
            &times;
          </button>
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
      : time.slice(0, 10) || dateToLocalStr(new Date());
  const serving_g =
    typeof raw?.serving_g === "number" && raw.serving_g > 0 ? raw.serving_g : 0;
  const kcal = typeof raw?.kcal === "number" && raw.kcal > 0 ? raw.kcal : 0;
  const protein_g =
    typeof raw?.protein_g === "number" && raw.protein_g > 0 ? raw.protein_g : 0;
  const carbs_g =
    typeof raw?.carbs_g === "number" && raw.carbs_g > 0 ? raw.carbs_g : 0;
  const fat_g = typeof raw?.fat_g === "number" && raw.fat_g > 0 ? raw.fat_g : 0;
  return {
    id: raw.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    item,
    timing,
    time,
    barcode,
    date,
    serving_g,
    kcal,
    protein_g,
    carbs_g,
    fat_g,
  };
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
