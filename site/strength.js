import { renderSparkline, fmtNum } from "./goals.js";
import {
  formatHevyRefreshLabel,
  formatHevyWorkoutWindowLabel,
  readStoredHevyApiKey,
  readStoredHevyLiveStrength,
  readStoredHevyWorkoutWindow,
  mergeHevyStrengthView,
  refreshHevyStrength,
  saveStoredHevyApiKey,
  saveStoredHevyWorkoutWindow,
} from "./hevy-live.js";

const strengthUrl = new URL("./strength.json", import.meta.url);
const grid = document.getElementById("strength-grid");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");
const summaryEl = document.getElementById("strength-summary");
const controls = document.getElementById("strength-controls");
const hevyRefreshButton = document.getElementById("refresh-hevy");
const hevySetKeyButton = document.getElementById("set-hevy-key");
const hevyWindowInput = document.getElementById("hevy-workout-window");
const hevyRefreshStatus = document.getElementById("hevy-refresh-status");
const hevyWindowStatus = document.getElementById("hevy-window-status");
const filterPills = document.getElementById("filter-pills");
const sortButtons = document.querySelectorAll(".sort-btn");
const searchInput = document.getElementById("strength-search");
const exerciseCatalogUrl = new URL(
  "./history/exercises/index.json",
  import.meta.url,
);

let entries = [];
let activeCategory = "All";
let activeSort = "date";
let searchQuery = "";
let compactView = false;
let gainsCache = null;
let exerciseIdByName = new Map();
let exerciseCatalogLoaded = false;
let controlsBound = false;

await loadExerciseCatalog();
loadStrength();

hevyRefreshButton?.addEventListener("click", handleHevyRefresh);
hevySetKeyButton?.addEventListener("click", handleHevySetKey);
hevyWindowInput?.addEventListener("change", handleHevyWindowChange);

async function loadStrength() {
  try {
    const [response] = await Promise.all([
      fetch(`${strengthUrl.pathname}?v=${Date.now()}`),
      loadExerciseCatalog(),
    ]);
    const basePayload = await response.json();
    const payload = mergeHevyStrengthView(
      basePayload,
      readStoredHevyLiveStrength(),
    );
    const pageState = payload.page_state ?? {
      kind: "fresh",
      label: "Ready",
      detail: "",
    };
    if (pageState.kind === "missing") {
      renderUnavailableStrength(
        pageState.detail ?? "No strength data available",
      );
      return;
    }
    sourceLabel.textContent = `${payload.source ?? "Hevy"} · ${payload.snapshot_date ?? "unknown date"}`;
    sourceLabel.classList.remove("skeleton");
    statusBanner.textContent = `${payload.entries.length} lifts · ${formatHevyRefreshLabel(payload)}`;
    statusBanner.classList.remove("skeleton");
    syncHevyWindowUI(
      payload.refresh_window ?? readStoredHevyWorkoutWindow(),
      payload,
    );
    entries = payload.entries;
    renderControls();
    renderSummary();
    loadGains().then(() => {
      renderSummary();
      renderGrid();
    });
    controls.removeAttribute("hidden");
  } catch {
    renderUnavailableStrength("Could not load strength data");
  }
}

function renderUnavailableStrength(message) {
  entries = [];
  sourceLabel.textContent = "Unavailable";
  statusBanner.textContent = message;
  controls?.removeAttribute("hidden");
  if (filterPills) filterPills.innerHTML = "";
  syncHevyWindowUI(readStoredHevyWorkoutWindow());
  if (hevyRefreshStatus) hevyRefreshStatus.textContent = message;
  if (summaryEl) summaryEl.innerHTML = "";
  grid.innerHTML = `<div class="item"><span>Strength</span><strong>Failed to load data</strong></div>`;
}

async function loadGains() {
  if (gainsCache) return gainsCache;
  try {
    const resp = await fetch(`./history/exercises/_gains.json?v=${Date.now()}`);
    gainsCache = await resp.json();
    return gainsCache;
  } catch {
    return {};
  }
}

async function loadExerciseCatalog() {
  if (exerciseCatalogLoaded) return exerciseIdByName;
  try {
    const resp = await fetch(`${exerciseCatalogUrl.pathname}?v=${Date.now()}`);
    const payload = await resp.json();
    const exercises = Array.isArray(payload?.exercises)
      ? payload.exercises
      : [];
    exerciseIdByName = new Map(
      exercises
        .filter((exercise) => exercise?.exercise_template_id && exercise?.name)
        .map((exercise) => [
          String(exercise.name),
          String(exercise.exercise_template_id),
        ]),
    );
  } catch {
    exerciseIdByName = new Map();
  } finally {
    exerciseCatalogLoaded = true;
  }
  return exerciseIdByName;
}

function renderControls() {
  const counts = {};
  entries.forEach((e) => {
    counts[e.category] = (counts[e.category] || 0) + 1;
  });
  const categories = [
    "All",
    ...new Set(entries.map((e) => e.category).filter(Boolean)),
  ];
  filterPills.innerHTML = categories
    .map((cat) => {
      const count = cat === "All" ? entries.length : (counts[cat] ?? 0);
      return `<button class="pill${cat === activeCategory ? " is-active" : ""}" data-category="${cat}" type="button">${cat} (${count})</button>`;
    })
    .join("");
  if (!controlsBound) {
    filterPills.addEventListener("click", (e) => {
      const btn = e.target.closest(".pill");
      if (!btn) return;
      filterPills
        .querySelectorAll(".pill")
        .forEach((p) => p.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeCategory = btn.dataset.category;
      renderGrid();
    });

    sortButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        sortButtons.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        activeSort = btn.dataset.sort;
        renderGrid();
      });
    });

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value.toLowerCase().trim();
        renderGrid();
      });
    }
    controlsBound = true;
  }
}

function renderSummary() {
  if (!summaryEl) return;
  if (!entries.length) {
    summaryEl.innerHTML = "";
    return;
  }

  const categories = new Set(entries.map((e) => e.category).filter(Boolean));
  const topEntry = [...entries].reduce((best, entry) => {
    const current = entry.estimated_one_rm_kg ?? entry.best_set?.weight_kg ?? 0;
    const bestValue =
      best?.estimated_one_rm_kg ?? best?.best_set?.weight_kg ?? 0;
    return current > bestValue ? entry : best;
  }, entries[0]);
  const latestDate = [...entries]
    .map((entry) => entry.best_set?.workout_start_date ?? "")
    .filter(Boolean)
    .sort()
    .at(-1);

  summaryEl.innerHTML = [
    {
      label: "Exercises",
      value: `${entries.length}`,
      subvalue: "Loaded from Hevy history",
    },
    {
      label: "Categories",
      value: `${categories.size}`,
      subvalue: "Push, pull, lower, accessory",
    },
    {
      label: "Top 1RM",
      value: `${fmtNum(topEntry?.estimated_one_rm_kg ?? topEntry?.best_set?.weight_kg ?? 0)} kg`,
      subvalue: topEntry?.name ?? "Highest current estimate",
    },
    {
      label: "Latest record",
      value: latestDate ?? "Unknown date",
      subvalue: "Most recent best set",
    },
  ]
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

function toggleView() {
  compactView = !compactView;
  grid.classList.toggle("compact", compactView);
  document.querySelectorAll(".view-toggle").forEach((b) => {
    b.textContent = compactView ? "Grid" : "Compact";
  });
}

async function handleHevyRefresh() {
  if (hevyRefreshButton) hevyRefreshButton.disabled = true;
  const workoutWindow = readStoredHevyWorkoutWindow();
  if (hevyRefreshStatus)
    hevyRefreshStatus.textContent = `Refreshing Hevy... · ${formatHevyWorkoutWindowLabel(workoutWindow)}`;
  try {
    const livePayload = await refreshHevyStrength(undefined, {
      workoutWindow,
    });
    if (livePayload.page_state?.kind === "missing") {
      entries = [];
      renderUnavailableStrength(
        livePayload.page_state.detail ?? "No strength data available",
      );
      renderSummary();
      return;
    }
    entries = livePayload.entries ?? [];
    sourceLabel.textContent = `${livePayload.source ?? "Hevy"} · ${livePayload.snapshot_date ?? "unknown date"}`;
    statusBanner.textContent = `${entries.length} lifts · ${formatHevyRefreshLabel(livePayload)}`;
    syncHevyWindowUI(livePayload.refresh_window ?? workoutWindow, livePayload);
    controls?.removeAttribute("hidden");
    renderControls();
    renderSummary();
    await loadGains();
    renderGrid();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (hevyRefreshStatus) hevyRefreshStatus.textContent = message;
  } finally {
    if (hevyRefreshButton) hevyRefreshButton.disabled = false;
  }
}

function handleHevySetKey() {
  const current = readStoredHevyApiKey();
  const next = window.prompt("Paste your Hevy API key", current);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed) {
    if (hevyRefreshStatus) hevyRefreshStatus.textContent = "Hevy key not saved";
    return;
  }
  saveStoredHevyApiKey(trimmed);
  if (hevyRefreshStatus)
    hevyRefreshStatus.textContent = "Hevy key saved locally";
}

function handleHevyWindowChange() {
  const value = hevyWindowInput?.value ?? "";
  saveStoredHevyWorkoutWindow(value);
  syncHevyWindowUI(value);
}

function syncHevyWindowUI(windowValue, payload) {
  const normalizedWindow = formatHevyWorkoutWindowLabel(windowValue);
  if (hevyWindowInput) hevyWindowInput.value = String(windowValue);
  if (hevyWindowStatus) {
    const refreshLabel = payload ? formatHevyRefreshLabel(payload) : "";
    hevyWindowStatus.textContent = payload
      ? `Window ${normalizedWindow} · ${refreshLabel}`
      : `Window ${normalizedWindow}`;
  }
  if (hevyRefreshStatus && payload) {
    hevyRefreshStatus.textContent = `${formatHevyRefreshLabel(payload)} · ${normalizedWindow}`;
  } else if (hevyRefreshStatus && !payload) {
    hevyRefreshStatus.textContent = `Window ${normalizedWindow}`;
  }
}

function renderGrid() {
  let visible =
    activeCategory === "All"
      ? entries
      : entries.filter((e) => e.category === activeCategory);

  if (searchQuery) {
    visible = visible.filter((e) => e.name.toLowerCase().includes(searchQuery));
  }

  visible = [...visible].sort((a, b) => {
    if (activeSort === "weight") {
      const wa = a.estimated_one_rm_kg ?? a.best_set?.weight_kg ?? 0;
      const wb = b.estimated_one_rm_kg ?? b.best_set?.weight_kg ?? 0;
      return wb - wa;
    }
    if (activeSort === "gain") {
      if (!gainsCache) loadGains().then(() => renderGrid());
      const ga = gainsCache?.[findTemplateId(a.name)]?.gain_pct ?? 0;
      const gb = gainsCache?.[findTemplateId(b.name)]?.gain_pct ?? 0;
      return gb - ga;
    }
    const da = a.best_set?.workout_start_date ?? "";
    const db = b.best_set?.workout_start_date ?? "";
    return db.localeCompare(da);
  });

  if (!visible.length) {
    grid.innerHTML = `<div class="item"><span>Strength</span><strong>No exercises match your search</strong></div>`;
    return;
  }

  grid.innerHTML = visible.map(renderCard).join("");
  renderInsights();
}

function renderInsights() {
  const el = document.getElementById("insights");
  if (!el || !gainsCache) return;

  const withGain = entries
    .map((e) => ({ entry: e, gain: gainsCache[findTemplateId(e.name)] }))
    .filter((x) => x.gain?.current != null && x.gain?.peak != null);

  if (withGain.length < 2) {
    el.hidden = true;
    return;
  }

  /* Category health */
  const catStats = {};
  withGain.forEach(({ entry, gain }) => {
    const cat = entry.category ?? "Other";
    if (!catStats[cat]) catStats[cat] = { count: 0, totalPct: 0, totalGain: 0 };
    catStats[cat].count += 1;
    catStats[cat].totalPct += (gain.current / gain.peak) * 100;
    catStats[cat].totalGain += gain.gain_pct;
  });
  const catHealth = Object.entries(catStats).map(([cat, s]) => ({
    cat,
    pct: Math.round(s.totalPct / s.count),
    gain: fmtNum(s.totalGain / s.count),
  }));

  /* Stall detection */
  const stalls = [];
  withGain.forEach(({ entry, gain }) => {
    if (gain.stalled && gain.current < gain.peak * 0.9) {
      stalls.push({ name: entry.name, current: gain.current, peak: gain.peak });
    }
  });

  /* Biggest gap */
  const sorted = [...withGain].sort(
    (a, b) => a.gain.current / a.gain.peak - b.gain.current / b.gain.peak,
  );
  const biggestGap = sorted[0];

  /* Render */
  const parts = [];

  if (catHealth.length) {
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Category health — lower means more room to grow</div>
        <div style="display:grid;gap:8px">
          ${catHealth
            .sort((a, b) => a.pct - b.pct)
            .map(
              (c) => `
            <div class="macro-row">
              <div class="macro-row-header">
                <span class="macro-row-label">${escapeHtml(c.cat)}</span>
                <span class="macro-row-numbers">avg ${c.pct}% of peak · +${c.gain}% gain</span>
              </div>
              <div class="macro-track">
                <div class="macro-fill macro-fill-${c.pct >= 80 ? "high" : c.pct >= 60 ? "medium" : "low"}" style="width:${c.pct}%"></div>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `);
  }

  if (stalls.length) {
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Stalled — no progress in 30+ days</div>
        <div style="display:grid;gap:6px">
          ${stalls
            .slice(0, 5)
            .map(
              (s) => `
            <div class="item">
              <span title="Hasn't improved in recent training">${escapeHtml(s.name)}</span>
              <strong class="delta-down" title="Peak was ${fmtNum(s.peak)} kg — currently at ${Math.round((s.current / s.peak) * 100)}%">${fmtNum(s.current)} kg · ${Math.round((s.current / s.peak) * 100)}% of peak</strong>
            </div>
          `,
            )
            .join("")}
        </div>
      </div>
    `);
  }

  if (biggestGap) {
    const bg = biggestGap.gain;
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Biggest opportunity — far from your peak</div>
        <div class="stat-group-grid">
          <div class="stat-item">
            <span class="stat-item-label">Exercise</span>
            <span class="stat-item-value" title="Most room for improvement — only ${Math.round((bg.current / bg.peak) * 100)}% of peak">${escapeHtml(biggestGap.entry.name)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Current 1RM</span>
            <span class="stat-item-value">${fmtNum(bg.current)} kg</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Peak 1RM</span>
            <span class="stat-item-value">${fmtNum(bg.peak)} kg</span>
          </div>
          <div class="stat-item">
            <span class="stat-item-label">Gap</span>
            <span class="stat-item-value delta-down">-${fmtNum(bg.peak - bg.current)} kg</span>
          </div>
        </div>
      </div>
    `);
  }

  el.innerHTML = parts.join("");
  el.removeAttribute("hidden");
}

function renderCard(entry) {
  const best = entry.best_set ?? {};
  const cat = entry.category ?? "Strength";
  const hasWeight = best.weight_kg != null;
  const bestLine = hasWeight
    ? `${formatNum(best.weight_kg)} kg × ${best.reps}`
    : `${best.reps} reps`;
  const oneRm = entry.estimated_one_rm_kg ?? best.weight_kg ?? null;
  const oneRmStr = oneRm != null ? `${formatNum(oneRm)} kg` : "—";
  const date = best.workout_start_date ?? "";

  const tid = findTemplateId(entry.name);
  const gain = gainsCache?.[tid];
  const pctOfPeak =
    oneRm != null && gain?.peak ? Math.round((oneRm / gain.peak) * 100) : null;

  return `
    <article class="exercise-card${compactView ? "" : ""}" data-exercise-name="${escapeHtml(entry.name)}">
      <div class="exercise-head">
        <div class="exercise-name">${escapeHtml(entry.name)}</div>
        <span class="exercise-category cat-${cat.replace(/\s+/g, "")}">${escapeHtml(cat)}</span>
      </div>
      <div class="exercise-metrics">
        <div class="exercise-metric">
          <span class="exercise-metric-label">Best set</span>
          <span class="exercise-metric-value">${escapeHtml(bestLine)}</span>
        </div>
        <div class="exercise-metric">
          <span class="exercise-metric-label" title="Estimated one-rep max based on your best set">Est. 1RM</span>
          <span class="exercise-metric-value">${escapeHtml(oneRmStr)} ${pctOfPeak != null ? `<span class="peak-indicator" title="Highest estimated 1RM ever recorded for this exercise">${pctOfPeak}% of peak</span>` : ""}</span>
        </div>
      </div>
      ${date ? `<span class="exercise-date">${escapeHtml(date)}</span>` : ""}
    </article>
  `;
}

/* ── Trend modal ── */

grid.addEventListener("click", async (e) => {
  const card = e.target.closest(".exercise-card");
  if (!card) return;
  if (e.target.closest(".pill, .sort-btn, .search-input, .filter-pills"))
    return;
  const name = card.dataset.exerciseName;
  const tid = findTemplateId(name);
  if (!tid) return;

  try {
    const resp = await fetch(`./history/exercises/${tid}.json?v=${Date.now()}`);
    const history = await resp.json();
    showTrendModal(name, history);
  } catch {
    // no history available
  }
});

export function findTemplateId(name) {
  return exerciseIdByName.get(name) ?? null;
}

function showTrendModal(name, history) {
  const oneRms = history
    .map((h) => h.estimated_one_rm_kg)
    .filter((v) => v != null);
  const weights = history.map((h) => h.weight_kg).filter((v) => v != null);
  const latest = history[history.length - 1];
  const firstOneRm = oneRms[0];
  const lastOneRm = oneRms[oneRms.length - 1];
  const oneRmChange = lastOneRm - firstOneRm;
  const oneRmPct = firstOneRm
    ? Math.round((oneRmChange / firstOneRm) * 100)
    : 0;
  const peak = Math.max(...oneRms);
  const trendUp = oneRmChange >= 0;
  const recent = history.slice(-10).reverse();

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content card">
      <div class="modal-header">
        <h2>${escapeHtml(name)}</h2>
        <button class="modal-close" type="button">&times;</button>
      </div>
      <div class="modal-progression">
        <span class="modal-progression-value ${trendUp ? "delta-up" : "delta-down"}">
          ${firstOneRm} kg → ${lastOneRm} kg
        </span>
        <span class="modal-progression-pct ${trendUp ? "delta-up" : "delta-down"}">
          ${trendUp ? "+" : ""}${oneRmPct}% over ${history.length} days
        </span>
      </div>
      ${
        oneRms.length > 1
          ? `
        <div class="modal-section">
          <p class="label">Estimated 1RM trend</p>
          ${renderSparkline(oneRms, 300, 72, { dots: true, labels: true, color: "var(--accent)" })}
        </div>
      `
          : ""
      }
      ${
        weights.length > 1
          ? `
        <div class="modal-section">
          <p class="label">Working weight trend</p>
          ${renderSparkline(weights, 300, 56, { dots: true, color: "var(--accent-2)" })}
        </div>
      `
          : ""
      }
      <div class="modal-stats">
        <div class="stat-item">
          <span class="stat-item-label">Current 1RM</span>
          <span class="stat-item-value">${lastOneRm} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label" title="Highest estimated 1RM ever recorded for this exercise">Peak 1RM</span>
          <span class="stat-item-value">${peak} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Start 1RM</span>
          <span class="stat-item-value">${firstOneRm} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Latest set</span>
          <span class="stat-item-value">${latest?.weight_kg ?? "—"} kg × ${latest?.reps ?? "—"}</span>
        </div>
      </div>
      <details class="modal-history">
        <summary><span class="label">Recent history (last ${recent.length})</span></summary>
        <div class="modal-history-list">
          ${recent
            .map(
              (h) => `
            <div class="modal-history-row">
              <span class="modal-history-date">${escapeHtml(h.date.slice(5))}</span>
              <span>${h.weight_kg != null ? `${h.weight_kg} kg × ${h.reps}` : `${h.reps} reps`}</span>
              <span class="modal-history-1rm">${h.estimated_one_rm_kg != null ? `${h.estimated_one_rm_kg} kg` : "—"}</span>
            </div>
          `,
            )
            .join("")}
        </div>
      </details>
    </div>
  `;

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest(".modal-close")) {
      modal.remove();
      document.body.focus();
    }
  });

  document.body.appendChild(modal);

  /* Focus trap */
  const focusable = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length) {
    const first = focusable[0];
    setTimeout(() => first.focus(), 50);
  }

  document.addEventListener("keydown", function trap(e) {
    if (!document.querySelector(".modal-overlay")) {
      document.removeEventListener("keydown", trap);
      return;
    }
    if (e.key === "Escape") {
      const m = document.querySelector(".modal-overlay");
      if (m) {
        m.remove();
        document.body.focus();
      }
      return;
    }
    if (e.key === "Tab" && focusable.length) {
      const foc = document.querySelectorAll(
        '.modal-content button, .modal-content [href], .modal-content input, .modal-content select, .modal-content textarea, .modal-content [tabindex]:not([tabindex="-1"])',
      );
      if (!foc.length) return;
      const f = foc[0];
      const l = foc[foc.length - 1];
      if (e.shiftKey && document.activeElement === f) {
        e.preventDefault();
        l.focus();
      } else if (!e.shiftKey && document.activeElement === l) {
        e.preventDefault();
        f.focus();
      }
    }
  });
}

export function formatNum(value) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.toggleView = toggleView;
