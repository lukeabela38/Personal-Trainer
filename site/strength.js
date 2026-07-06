const strengthUrl = new URL("./strength.json", import.meta.url);
const grid = document.getElementById("strength-grid");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");
const controls = document.getElementById("strength-controls");
const filterPills = document.getElementById("filter-pills");
const sortButtons = document.querySelectorAll(".sort-btn");

let entries = [];
let activeCategory = "All";
let activeSort = "date";

loadStrength();

async function loadStrength() {
  try {
    const response = await fetch(`${strengthUrl.pathname}?v=${Date.now()}`);
    const payload = await response.json();
    sourceLabel.textContent = `${payload.source ?? "Hevy"} · ${payload.snapshot_date ?? "unknown date"}`;
    statusBanner.textContent = `${payload.entries.length} lifts`;
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
}

function renderGrid() {
  let visible = activeCategory === "All" ? entries : entries.filter((e) => e.category === activeCategory);

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
    grid.innerHTML = `<div class="item"><span>Strength</span><strong>No exercises in this category</strong></div>`;
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
    <article class="exercise-card">
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
      ${date ? `<span class="exercise-date">${escapeHtml(date)}</span>` : ""}
    </article>
  `;
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
