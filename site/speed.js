import { loadGoals, updateGoalCurrent, goalProgress } from "./goals.js";

const speedUrl = new URL("./speed.json", import.meta.url);
const table = document.getElementById("speed-table");
const goalsContainer = document.getElementById("speed-goals");
const summaryEl = document.getElementById("speed-summary");
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
    renderSummary(payload.entries);
    renderTable(payload.entries);
    renderSpeedGoals(payload);
  } catch {
    sourceLabel.textContent = "Unavailable";
    statusBanner.textContent = "Could not load speed data";
    if (summaryEl) summaryEl.innerHTML = "";
    table.innerHTML = `<div class="speed-empty">Failed to load speed data.</div>`;
  }
}

function renderTable(entries) {
  if (!entries.length) {
    table.innerHTML = `<div class="speed-empty">No personal records yet.</div>`;
    return;
  }

  table.innerHTML = "";
  const sorted = sortEntries(entries);

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

function renderSummary(entries) {
  if (!summaryEl) return;
  if (!entries.length) {
    summaryEl.innerHTML = "";
    return;
  }

  const sorted = sortEntries(entries);
  const fastest = sorted[0];
  const longest = sorted.at(-1);
  const latest = [...entries]
    .filter((entry) => entry.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .at(-1);

  summaryEl.innerHTML = [
    {
      label: "Records",
      value: `${entries.length}`,
      subvalue: "Loaded from Garmin history",
    },
    {
      label: "Fastest",
      value: fastest?.name ?? "Unknown",
      subvalue: fastest?.value ?? "Top current race effort",
    },
    {
      label: "Longest",
      value: longest?.name ?? "Unknown",
      subvalue: longest?.value ?? "Best endurance marker",
    },
    {
      label: "Latest PB",
      value: latest?.date ?? "Unknown date",
      subvalue: latest?.name ?? "Most recent best",
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

function sortEntries(entries) {
  const order = ["Fastest 1K", "Fastest Mile", "Fastest 5K", "Fastest 10K", "Fastest Half Marathon", "Longest Run"];
  return [...entries].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
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
