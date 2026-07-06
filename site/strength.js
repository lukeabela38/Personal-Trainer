import { renderSparkline } from "./goals.js";

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
    renderGrid();
    controls.removeAttribute("hidden");
  } catch {
    sourceLabel.textContent = "Unavailable";
    statusBanner.textContent = "Could not load strength data";
    grid.innerHTML = `<div class="item"><span>Strength</span><strong>Failed to load data</strong></div>`;
  }
}

function renderControls() {
  const categories = ["All", ...new Set(entries.map((e) => e.category).filter(Boolean))];
  filterPills.innerHTML = categories
    .map(
      (cat) =>
        `<button class="pill${cat === activeCategory ? " is-active" : ""}" data-category="${cat}" type="button">${cat}</button>`,
    )
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
    const da = a.best_set?.workout_start_date ?? "";
    const db = b.best_set?.workout_start_date ?? "";
    return db.localeCompare(da);
  });

  if (!visible.length) {
    grid.innerHTML = `<div class="item"><span>Strength</span><strong>No exercises match your search</strong></div>`;
    return;
  }

  grid.innerHTML = visible.map(renderCard).join("");
}

function renderCard(entry) {
  const best = entry.best_set ?? {};
  const cat = entry.category ?? "Strength";
  const hasWeight = best.weight_kg != null;
  const bestLine = hasWeight ? `${formatNum(best.weight_kg)} kg × ${best.reps}` : `${best.reps} reps`;
  const oneRm = entry.estimated_one_rm_kg != null ? `${formatNum(entry.estimated_one_rm_kg)} kg` : "—";
  const date = best.workout_start_date ?? "";
  return `
    <article class="exercise-card" data-exercise-name="${escapeHtml(entry.name)}">
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
          <span class="exercise-metric-label">Est. 1RM</span>
          <span class="exercise-metric-value">${escapeHtml(oneRm)}</span>
        </div>
      </div>
      <div class="exercise-footer">
        ${date ? `<span class="exercise-date">${escapeHtml(date)}</span>` : ""}
        <button class="trend-btn" type="button">Trend</button>
      </div>
    </article>
  `;
}

/* ── Trend modal ── */

grid.addEventListener("click", async (e) => {
  const btn = e.target.closest(".trend-btn");
  if (!btn) return;
  const card = btn.closest(".exercise-card");
  if (!card) return;
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
    "Squat (Barbell)": "D04AC939",
    "Bench Press (Barbell)": "79D0BB3A",
    "Chin Up": "29083183",
    "Triceps Dip": "28BB4A95",
    "Push Up": "392887AA",
    "Dumbbell Row": "F1E57334",
    "Sumo Squat (Kettlebell)": "5E10D0E6",
    "Single Arm Tricep Extension (Dumbbell)": "8347DFD1",
    "Deadlift (Barbell)": "A1B2C3D4",
    "Overhead Press (Barbell)": "B2C3D4E5",
    "Pull Up": "C3D4E5F6",
    "Romanian Deadlift": "D4E5F6A7",
    "Bulgarian Split Squat": "E5F6A7B8",
    "Dumbbell Bench Press": "F6A7B8C9",
    "Seated Cable Row": "A7B8C9D0",
    "Bicep Curl (Dumbbell)": "B8C9D0A1",
    "Tricep Pushdown": "C9D0A1B2",
    "Lateral Raise": "D0A1B2C3",
    "Leg Press": "E1F2A3B4",
    "Hamstring Curl": "F2A3B4C5",
    "Calf Raise": "A3B4C5D6",
    "Face Pull": "B4C5D6E7",
    "Pendlay Row": "C5D6E7F8",
    "Front Squat": "D6E7F8A9",
    "Incline Bench Press": "E7F8A9B0",
    "Skull Crusher": "F8A9B0C1",
    "Dumbbell Shoulder Press": "A9B0C1D2",
    "Barbell Hip Thrust": "B0C1D2E3",
    "Farmer Walk": "C1D2E3F4",
    "Pistol Squat": "D2E3F4A5",
    "Weighted Plank": "E3F4A5B6",
    "Kettlebell Swing": "F4A5B6C7",
    "Box Jump": "A5B6C7D8",
    "Dips (Weighted)": "B6C7D8E9",
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
          <span class="stat-item-label">Peak 1RM</span>
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
    if (e.target === modal || e.target.closest(".modal-close")) {
      modal.remove();
    }
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
