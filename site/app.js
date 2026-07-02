const deployedSnapshotPath = new URL("./data/snapshot.json", import.meta.url);
const rawJson = document.getElementById("raw-json");
const sections = document.getElementById("sections");

const labels = [
  ["athlete", "Athlete"],
  ["garmin", "Garmin"],
  ["hevy", "Hevy"],
  ["cronometer", "Cronometer"],
  ["manual_context", "Manual context"],
  ["derived", "Derived"],
];

document.getElementById("file-input").addEventListener("change", onFileSelected);
document.getElementById("load-sample").addEventListener("click", () => loadSnapshotFromUrl(deployedSnapshotPath));
document.getElementById("load-example").addEventListener("click", () => loadSnapshotFromUrl(deployedSnapshotPath));
document.getElementById("toggle-raw").addEventListener("click", toggleRaw);

loadSnapshotFromUrl(deployedSnapshotPath).catch(() => {
  renderEmptyState();
});

async function onFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  renderSnapshot(JSON.parse(text));
}

async function loadSnapshotFromUrl(url) {
  const response = await fetch(url);
  const data = await response.json();

  renderSnapshot(data);
}

function renderEmptyState() {
  document.getElementById("priority").textContent = "Import a snapshot";
  document.getElementById("reason").textContent =
    "Drop in a JSON snapshot file or deploy a snapshot artifact to ./data/snapshot.json.";
  document.getElementById("confidence").textContent = "-";
  document.getElementById("check-in").textContent = "-";
  document.getElementById("data-quality").textContent = "-";
  sections.innerHTML = "";
  rawJson.textContent = "{}";
}

function toggleRaw() {
  rawJson.classList.toggle("hidden");
  document.getElementById("toggle-raw").textContent = rawJson.classList.contains("hidden")
    ? "Show raw JSON"
    : "Hide raw JSON";
}

function renderSnapshot(snapshot) {
  const recommendation = snapshot.recommendation ?? snapshot;
  document.getElementById("priority").textContent = recommendation.Priority ?? "No recommendation";
  document.getElementById("reason").textContent = recommendation.Reason ?? "No reason available.";
  document.getElementById("confidence").textContent = recommendation.Confidence ?? "-";
  document.getElementById("check-in").textContent = recommendation["Needs check-in"] ?? "-";
  document.getElementById("data-quality").textContent = snapshot.derived?.data_quality ?? "-";

  sections.innerHTML = labels.map(([key, title]) => renderSection(title, snapshot[key] ?? null)).join("");

  rawJson.textContent = JSON.stringify(snapshot, null, 2);
}

function renderSection(title, value) {
  return `
    <article class="card">
      <p class="label">${title}</p>
      ${renderValue(value)}
    </article>
  `;
}

function renderValue(value) {
  if (value == null) {
    return `<p class="muted">No data</p>`;
  }

  if (Array.isArray(value)) {
    return `<div class="section-list">${value.map((item) => renderItem(item, item)).join("")}</div>`;
  }

  if (typeof value === "object") {
    return `
      <div class="section-list">
        ${Object.entries(value)
          .map(([key, entry]) => renderItem(key, entry))
          .join("")}
      </div>
    `;
  }

  return `<p>${escapeHtml(String(value))}</p>`;
}

function renderItem(key, entry) {
  const left = escapeHtml(String(key));
  const right =
    typeof entry === "object" && entry !== null
      ? `<pre class="muted" style="margin:0; white-space: pre-wrap;">${escapeHtml(JSON.stringify(entry, null, 2))}</pre>`
      : `<strong>${escapeHtml(String(entry))}</strong>`;

  return `<div class="item"><span>${left}</span>${right}</div>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
