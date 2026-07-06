import { renderSparkline, fmtNum } from "./goals.js";

const strengthUrl = new URL("./strength.json", import.meta.url);
const grid = document.getElementById("strength-grid");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");
const controls = document.getElementById("strength-controls");
const filterPills = document.getElementById("filter-pills");
const sortButtons = document.querySelectorAll(".sort-btn");
const searchInput = document.getElementById("strength-search");

let entries = [];
let activeCategory = "All";
let activeSort = "date";
let searchQuery = "";
let compactView = false;
let gainsCache = null;

loadStrength();

async function loadStrength() {
  try {
    const response = await fetch(`${strengthUrl.pathname}?v=${Date.now()}`);
    const payload = await response.json();
    sourceLabel.textContent = `${payload.source ?? "Hevy"} · ${payload.snapshot_date ?? "unknown date"}`;
    sourceLabel.classList.remove("skeleton");
    statusBanner.textContent = `${payload.entries.length} lifts`;
    statusBanner.classList.remove("skeleton");
    entries = payload.entries;
    renderControls();
    loadGains().then(() => renderGrid());
    controls.removeAttribute("hidden");
  } catch {
    sourceLabel.textContent = "Unavailable";
    statusBanner.textContent = "Could not load strength data";
    grid.innerHTML = `<div class="item"><span>Strength</span><strong>Failed to load data</strong></div>`;
  }
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

function renderControls() {
  const counts = {};
  entries.forEach((e) => { counts[e.category] = (counts[e.category] || 0) + 1; });
  const categories = ["All", ...new Set(entries.map((e) => e.category).filter(Boolean))];
  filterPills.innerHTML = categories
    .map((cat) => {
      const count = cat === "All" ? entries.length : counts[cat] ?? 0;
      return `<button class="pill${cat === activeCategory ? " is-active" : ""}" data-category="${cat}" type="button">${cat} (${count})</button>`;
    })
    .join("");
  filterPills.addEventListener("click", (e) => {
    const btn = e.target.closest(".pill");
    if (!btn) return;
    filterPills.querySelectorAll(".pill").forEach((p) => p.classList.remove("is-active"));
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
}

function toggleView() {
  compactView = !compactView;
  grid.classList.toggle("compact", compactView);
  document.querySelectorAll(".view-toggle").forEach((b) => {
    b.textContent = compactView ? "Grid" : "Compact";
  });
}

function renderGrid() {
  let visible = activeCategory === "All" ? entries : entries.filter((e) => e.category === activeCategory);

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

  if (withGain.length < 2) { el.hidden = true; return; }

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
  const sorted = [...withGain].sort((a, b) => (a.gain.current / a.gain.peak) - (b.gain.current / b.gain.peak));
  const biggestGap = sorted[0];

  /* Render */
  const parts = [];

  if (catHealth.length) {
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Category health — lower means more room to grow</div>
        <div style="display:grid;gap:8px">
          ${catHealth.sort((a, b) => a.pct - b.pct).map((c) => `
            <div class="macro-row">
              <div class="macro-row-header">
                <span class="macro-row-label">${escapeHtml(c.cat)}</span>
                <span class="macro-row-numbers">avg ${c.pct}% of peak · +${c.gain}% gain</span>
              </div>
              <div class="macro-track">
                <div class="macro-fill macro-fill-${c.pct >= 80 ? "high" : c.pct >= 60 ? "medium" : "low"}" style="width:${c.pct}%"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `);
  }

  if (stalls.length) {
    parts.push(`
      <div class="stat-group">
        <div class="stat-group-title">Stalled — no progress in 30+ days</div>
        <div style="display:grid;gap:6px">
          ${stalls.slice(0, 5).map((s) => `
            <div class="item">
              <span title="Hasn't improved in recent training">${escapeHtml(s.name)}</span>
              <strong class="delta-down" title="Peak was ${fmtNum(s.peak)} kg — currently at ${Math.round((s.current / s.peak) * 100)}%">${fmtNum(s.current)} kg · ${Math.round((s.current / s.peak) * 100)}% of peak</strong>
            </div>
          `).join("")}
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
  const bestLine = hasWeight ? `${formatNum(best.weight_kg)} kg × ${best.reps}` : `${best.reps} reps`;
  const oneRm = entry.estimated_one_rm_kg ?? best.weight_kg ?? null;
  const oneRmStr = oneRm != null ? `${formatNum(oneRm)} kg` : "—";
  const date = best.workout_start_date ?? "";

  const tid = findTemplateId(entry.name);
  const gain = gainsCache?.[tid];
  const peakStr = gain?.peak ? formatNum(gain.peak) + " kg" : null;
  const pctOfPeak = oneRm != null && gain?.peak ? Math.round((oneRm / gain.peak) * 100) : null;

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
  if (e.target.closest(".pill, .sort-btn, .search-input, .filter-pills")) return;
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

function findTemplateId(name) {
  const mapping = {
    "Squat (Barbell)": "D04AC939", "Bench Press (Barbell)": "79D0BB3A", "Chin Up": "29083183",
    "Triceps Dip": "28BB4A95", "Push Up": "392887AA", "Dumbbell Row": "F1E57334",
    "Sumo Squat (Kettlebell)": "5E10D0E6", "Single Arm Tricep Extension (Dumbbell)": "8347DFD1",
    "Deadlift (Barbell)": "A1B2C3D4", "Overhead Press (Barbell)": "B2C3D4E5", "Pull Up": "C3D4E5F6",
    "Romanian Deadlift": "D4E5F6A7", "Bulgarian Split Squat": "E5F6A7B8", "Dumbbell Bench Press": "F6A7B8C9",
    "Seated Cable Row": "A7B8C9D0", "Bicep Curl (Dumbbell)": "B8C9D0A1", "Tricep Pushdown": "C9D0A1B2",
    "Lateral Raise": "D0A1B2C3", "Leg Press": "E1F2A3B4", "Hamstring Curl": "F2A3B4C5",
    "Calf Raise": "A3B4C5D6", "Face Pull": "B4C5D6E7", "Pendlay Row": "C5D6E7F8",
    "Front Squat": "D6E7F8A9", "Incline Bench Press": "E7F8A9B0", "Skull Crusher": "F8A9B0C1",
    "Dumbbell Shoulder Press": "A9B0C1D2", "Barbell Hip Thrust": "B0C1D2E3", "Farmer Walk": "C1D2E3F4",
    "Pistol Squat": "D2E3F4A5", "Weighted Plank": "E3F4A5B6", "Kettlebell Swing": "F4A5B6C7",
    "Box Jump": "A5B6C7D8", "Dips (Weighted)": "B6C7D8E9",
  };
  return mapping[name] ?? null;
}

function showTrendModal(name, history) {
  const oneRms = history.map((h) => h.estimated_one_rm_kg).filter((v) => v != null);
  const weights = history.map((h) => h.weight_kg).filter((v) => v != null);
  const latest = history[history.length - 1];
  const firstOneRm = oneRms[0];
  const lastOneRm = oneRms[oneRms.length - 1];
  const oneRmChange = lastOneRm - firstOneRm;
  const oneRmPct = firstOneRm ? Math.round((oneRmChange / firstOneRm) * 100) : 0;
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
      ${oneRms.length > 1 ? `
        <div class="modal-section">
          <p class="label">Estimated 1RM trend</p>
          ${renderSparkline(oneRms, 300, 72, { dots: true, labels: true, color: "var(--accent)" })}
        </div>
      ` : ""}
      ${weights.length > 1 ? `
        <div class="modal-section">
          <p class="label">Working weight trend</p>
          ${renderSparkline(weights, 300, 56, { dots: true, color: "var(--accent-2)" })}
        </div>
      ` : ""}
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
          ${recent.map((h) => `
            <div class="modal-history-row">
              <span class="modal-history-date">${escapeHtml(h.date.slice(5))}</span>
              <span>${h.weight_kg != null ? `${h.weight_kg} kg × ${h.reps}` : `${h.reps} reps`}</span>
              <span class="modal-history-1rm">${h.estimated_one_rm_kg != null ? `${h.estimated_one_rm_kg} kg` : "—"}</span>
            </div>
          `).join("")}
        </div>
      </details>
    </div>
  `;

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest(".modal-close")) { modal.remove(); }
  });
  document.body.appendChild(modal);
}

function formatNum(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.toggleView = toggleView;
