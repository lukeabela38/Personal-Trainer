const HISTORY_BASE = new URL("./history", import.meta.url);

let cache = {
  index: null,
  snapshots: {},
};

export async function loadIndex() {
  if (cache.index) return cache.index;
  const resp = await fetch(`${HISTORY_BASE.pathname}/index.json?v=${Date.now()}`);
  cache.index = await resp.json();
  return cache.index;
}

export async function loadSnapshot(dateStr) {
  if (cache.snapshots[dateStr]) return cache.snapshots[dateStr];
  const resp = await fetch(`${HISTORY_BASE.pathname}/${dateStr}.json?v=${Date.now()}`);
  const snap = await resp.json();
  cache.snapshots[dateStr] = snap;
  return snap;
}

export async function loadRange(startDate, endDate) {
  const index = await loadIndex();
  const dates = index.dates.filter((d) => d >= startDate && d <= endDate);
  return Promise.all(dates.map(loadSnapshot));
}

export async function loadLastDays(n) {
  const index = await loadIndex();
  const dates = index.dates.slice(-n);
  return Promise.all(dates.map(loadSnapshot));
}

export async function loadAll() {
  const index = await loadIndex();
  return Promise.all(index.dates.map(loadSnapshot));
}

export function extractBodyWeight(snapshots) {
  return snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s.athlete?.body_weight_kg ?? null,
  })).filter((d) => d.value != null);
}

export function extractVo2(snapshots) {
  return snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s.garmin?.current_vo2max ?? null,
  })).filter((d) => d.value != null);
}

export function extractPriority(snapshots) {
  return snapshots.map((s) => ({
    date: s.snapshot_date,
    value: s.recommendation?.Priority ?? null,
  })).filter((d) => d.value != null);
}

export function weeklySummary(snapshots) {
  const sorted = [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const weekDays = sorted.slice(-7);
  if (!weekDays.length) return null;

  const priorities = weekDays.map((s) => s.recommendation?.Priority);
  const bw = weekDays[weekDays.length - 1]?.athlete?.body_weight_kg;
  const bwPrev = weekDays[0]?.athlete?.body_weight_kg;
  const vo2 = weekDays[weekDays.length - 1]?.garmin?.current_vo2max;
  const vo2Prev = weekDays[0]?.garmin?.current_vo2max;

  const hardDays = priorities.filter((p) => ["aerobic_quality", "strength_progression", "power_and_athleticism"].includes(p)).length;
  const recoveryDays = priorities.filter((p) => ["recovery", "nutrition_repair"].includes(p)).length;

  const cals = weekDays.map((s) => s.cronometer?.today?.calories_consumed ?? 0);
  const avgCals = cals.length ? Math.round(cals.reduce((a, b) => a + b, 0) / cals.length) : 0;
  const protein = weekDays.map((s) => s.cronometer?.today?.protein_g ?? 0);
  const avgProtein = protein.length ? Math.round(protein.reduce((a, b) => a + b, 0) / protein.length) : 0;

  return {
    days: weekDays.length,
    hardDays,
    recoveryDays,
    vo2: vo2 ?? null,
    vo2Delta: vo2 != null && vo2Prev != null ? (vo2 - vo2Prev).toFixed(1) : null,
    bw: bw ?? null,
    bwDelta: bw != null && bwPrev != null ? (bw - bwPrev).toFixed(1) : null,
    avgCalories: avgCals,
    avgProtein: avgProtein,
  };
}
