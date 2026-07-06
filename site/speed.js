import { loadGoals, updateGoalCurrent, goalProgress } from "./goals.js";

const speedUrl = new URL("./speed.json", import.meta.url);
const table = document.getElementById("speed-table");
const goalsContainer = document.getElementById("speed-goals");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");

loadSpeed();

async function loadSpeed() {
  try {
    const response = await fetch(`${speedUrl.pathname}?v=${Date.now()}`);
    const payload = await response.json();
    sourceLabel.textContent = `${payload.source ?? "Garmin"} · ${payload.snapshot_date ?? "unknown date"}`;
    sourceLabel.classList.remove("skeleton");
    statusBanner.textContent = `${payload.entries.length} bests`;
    statusBanner.classList.remove("skeleton");
    renderTable(payload.entries);
    renderSpeedGoals(payload);
  } catch {
    sourceLabel.textContent = "Unavailable";
    statusBanner.textContent = "Could not load speed data";
    table.innerHTML = `<div class="speed-empty">Failed to load speed data.</div>`;
  }
}

function renderTable(entries) {
  if (!entries.length) {
    table.innerHTML = `<div class="speed-empty">No personal records yet.</div>`;
    return;
  }

  table.innerHTML = "";
  const sorted = [...entries].sort((a, b) => {
    const order = ["Fastest 1K", "Fastest Mile", "Fastest 5K", "Fastest 10K", "Fastest Half Marathon", "Longest Run"];
    return order.indexOf(a.name) - order.indexOf(b.name);
  });

  table.innerHTML = sorted
    .map(
      (e) => `
        <div class="speed-row">
          <span class="speed-row-name">${escapeHtml(e.name)}</span>
          <span class="speed-row-value" title="All-time personal best — set on ${escapeHtml(e.date ?? "unknown date")}">
            ${escapeHtml(e.value)}
            <span class="pb-badge">PB</span>
          </span>
          <span class="speed-row-date">${escapeHtml(e.date ?? "")}</span>
        </div>
      `,
    )
    .join("");
}

function renderSpeedGoals(payload) {
  if (!goalsContainer) return;
  const snapshot = { garmin: { recent_bests: payload.entries.map((e) => ({
    record_type: e.name ?? "",
    value: e.value ?? null,
  }))}};
  const goals = updateGoalCurrent(loadGoals(), snapshot);
  const speedGoals = goals.filter((g) => g.type === "speed");
  if (!speedGoals.length) return;
  goalsContainer.innerHTML = speedGoals
    .map((g) => {
      const pct = goalProgress(g);
      const cls = pct >= 100 ? "high" : pct >= 75 ? "medium" : "low";
      return `
        <div class="goal-item">
          <div class="goal-header">
            <span class="goal-name">${escapeHtml(g.name)}</span>
            <span class="goal-numbers">${g.current ?? "-"} / ${g.target}</span>
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
