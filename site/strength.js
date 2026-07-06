const strengthUrl = new URL("./strength.json", import.meta.url);
const carousel = document.getElementById("strength-carousel");
const statusBanner = document.getElementById("status-banner");
const sourceLabel = document.getElementById("source-label");
const slideStatus = document.getElementById("slide-status");

let cards = [];
let activeIndex = -1;
let rafId = null;
let settleTimer = null;
let baseCount = 0;
let cycleWidth = 0;
let resetBand = 0;

loadStrength();

async function loadStrength() {
  try {
    const response = await fetch(`${strengthUrl.pathname}?v=${Date.now()}`);
    const payload = await response.json();
    sourceLabel.textContent = `${payload.source ?? "Hevy"} · ${payload.snapshot_date ?? "unknown date"}`;
    statusBanner.textContent = `${payload.entries.length} lifts`;
    baseCount = payload.entries.length;
    carousel.innerHTML = [
      ...payload.entries,
      ...payload.entries,
      ...payload.entries,
    ].map(renderEntry).join("");
    cards = Array.from(carousel.querySelectorAll(".strength-card"));
    requestAnimationFrame(() => {
      initializeLooping();
      updateActiveCard();
    });
    carousel.addEventListener("scroll", scheduleActiveUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveUpdate, { passive: true });
  } catch {
    sourceLabel.textContent = "Unavailable";
    statusBanner.textContent = "Could not load strength data";
    carousel.innerHTML = `<div class="muted strength-empty">Failed to load <code>strength.json</code>.</div>`;
  }
}

function scheduleActiveUpdate() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateActiveCard();
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      normalizeScrollPosition();
      updateActiveCard();
    }, 90);
  });
}

function initializeLooping() {
  if (!cards.length) return;
  const first = cards[0];
  const styles = window.getComputedStyle(carousel);
  const cardWidth = first.getBoundingClientRect().width;
  const gap = parseFloat(styles.columnGap || styles.gap) || 0;
  cycleWidth = baseCount * (cardWidth + gap);
  resetBand = Math.max(cardWidth, carousel.clientWidth * 0.25);
  carousel.scrollLeft = cycleWidth + Math.max(0, cardWidth / 2 - carousel.clientWidth / 2);
}

function normalizeScrollPosition() {
  if (!cycleWidth) return;
  const min = cycleWidth - resetBand;
  const max = cycleWidth * 2 + resetBand;
  if (carousel.scrollLeft < min) {
    carousel.scrollLeft += cycleWidth;
  } else if (carousel.scrollLeft > max) {
    carousel.scrollLeft -= cycleWidth;
  }
}

function updateActiveCard() {
  if (!cards.length) return;
  const center = carousel.scrollLeft + carousel.clientWidth / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  cards.forEach((card, index) => {
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    const distance = Math.abs(center - cardCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  if (bestIndex !== activeIndex) {
    activeIndex = bestIndex;
    const logicalIndex = baseCount ? ((activeIndex % baseCount) + baseCount) % baseCount : activeIndex;
    cards.forEach((card, index) => {
      const cardLogicalIndex = baseCount ? index % baseCount : index;
      card.classList.toggle("is-active", cardLogicalIndex === logicalIndex && index >= baseCount && index < baseCount * 2);
      card.classList.toggle(
        "is-near",
        cardLogicalIndex === ((logicalIndex - 1 + baseCount) % baseCount) ||
          cardLogicalIndex === ((logicalIndex + 1) % baseCount),
      );
    });
    slideStatus.textContent = `${logicalIndex + 1} / ${baseCount}`;
  }
}

function renderEntry(entry, index) {
  const best = entry.best_set;
  const bestLine = best.weight_kg != null ? `${formatNumber(best.weight_kg)} kg x ${best.reps}` : `${best.reps} reps`;
  const oneRmLine = entry.estimated_one_rm_kg != null ? `${formatNumber(entry.estimated_one_rm_kg)} kg` : "n/a";
  return `
    <article class="strength-card" data-index="${index}" tabindex="0">
      <div class="strength-head">
        <h3>${escapeHtml(entry.name)}</h3>
        <p class="muted">${escapeHtml(entry.category)}</p>
      </div>
      <div class="strength-metrics">
        <div class="metric">
          <span class="label">Best set</span>
          <strong>${escapeHtml(bestLine)}</strong>
        </div>
        <div class="metric">
          <span class="label">Estimated 1RM</span>
          <strong>${escapeHtml(oneRmLine)}</strong>
        </div>
        <div class="metric">
          <span class="label">PB date</span>
          <strong>${escapeHtml(entry.best_set.workout_start_date ?? "unknown")}</strong>
        </div>
      </div>
    </article>
  `;
}

function formatNumber(value) {
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
