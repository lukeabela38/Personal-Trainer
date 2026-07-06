import { loadGoals, updateGoalCurrent, goalProgress, renderSparkline } from "./goals.js";

const strengthUrl = new URL("./strength.json", import.meta.url);
const grid = document.getElementById("strength-grid");
const goalsContainer = document.getElementById("strength-goals");
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
    renderGoals(payload);
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

  const modal = document.createElement("div");
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-content card">
      <div class="modal-header">
        <h2>${escapeHtml(name)}</h2>
        <button class="modal-close" type="button">&times;</button>
      </div>
      ${oneRms.length > 1 ? `
        <div class="modal-section">
          <p class="label">Estimated 1RM trend (${history.length} days)</p>
          ${renderSparkline(oneRms, 280, 64)}
        </div>
      ` : ""}
      ${weights.length > 1 ? `
        <div class="modal-section">
          <p class="label">Working weight trend</p>
          ${renderSparkline(weights, 280, 64)}
        </div>
      ` : ""}
      <div class="modal-stats">
        <div class="stat-item">
          <span class="stat-item-label">Current 1RM</span>
          <span class="stat-item-value">${latest?.estimated_one_rm_kg ?? "—"} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Peak 1RM</span>
          <span class="stat-item-value">${Math.max(...oneRms)} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Start 1RM</span>
          <span class="stat-item-value">${oneRms[0]} kg</span>
        </div>
        <div class="stat-item">
          <span class="stat-item-label">Latest set</span>
          <span class="stat-item-value">${latest?.weight_kg ?? "—"} kg × ${latest?.reps ?? "—"}</span>
        </div>
      </div>
    </div>
  `;

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest(".modal-close")) {
      modal.remove();
    }
  });

  document.body.appendChild(modal);
}

function renderGoals(payload) {
  if (!goalsContainer) return;
  const snapshot = { hevy: { recent_bests: payload.entries.map((e) => ({
    exercise_template_id: e.exerciseIdFromBest ?? "",
    estimated_one_rm_kg: e.estimated_one_rm_kg,
    weight_kg: e.best_set?.weight_kg ?? null,
  }))}};
  const goals = updateGoalCurrent(loadGoals(), snapshot);
  const strengthGoals = goals.filter((g) => g.type === "strength");
  if (!strengthGoals.length) return;
  goalsContainer.innerHTML = strengthGoals
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
        </div>
      `;
    })
    .join("");
  goalsContainer.removeAttribute("hidden");
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
