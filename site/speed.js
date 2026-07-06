const speedUrl = new URL("./speed.json", import.meta.url);
const table = document.getElementById("speed-table");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");

loadSpeed();

async function loadSpeed() {
  try {
    const response = await fetch(`${speedUrl.pathname}?v=${Date.now()}`);
    const payload = await response.json();
    sourceLabel.textContent = `${payload.source ?? "Garmin"} · ${payload.snapshot_date ?? "unknown date"}`;
    statusBanner.textContent = `${payload.entries.length} bests`;
    renderTable(payload.entries);
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

  const sorted = [...entries].sort((a, b) => {
    const order = ["Fastest 1K", "Fastest Mile", "Fastest 5K", "Fastest 10K", "Fastest Half Marathon", "Longest Run"];
    return order.indexOf(a.name) - order.indexOf(b.name);
  });

  table.innerHTML = sorted
    .map(
      (e) => `
        <div class="speed-row">
          <span class="speed-row-name">${escapeHtml(e.name)}</span>
          <span class="speed-row-value">${escapeHtml(e.value)}</span>
          <span class="speed-row-date">${escapeHtml(e.date ?? "")}</span>
        </div>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
