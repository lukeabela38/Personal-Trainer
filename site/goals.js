const STORAGE_KEY = "personal-trainer:goals";

export function loadGoals() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : defaultGoals();
  } catch {
    return defaultGoals();
  }
}

export function saveGoals(goals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch {}
}

export function defaultGoals() {
  return [
    { id: "squat", type: "strength", name: "Squat", target: 140, unit: "kg", current: null, exerciseId: "D04AC939" },
    { id: "bench", type: "strength", name: "Bench Press", target: 100, unit: "kg", current: null, exerciseId: "79D0BB3A" },
    { id: "deadlift", type: "strength", name: "Deadlift", target: 180, unit: "kg", current: null, exerciseId: "A1B2C3D4" },
    { id: "5k", type: "speed", name: "5K", target: "18:30", unit: "", current: null, recordType: "Fastest 5K" },
    { id: "10k", type: "speed", name: "10K", target: "39:00", unit: "", current: null, recordType: "Fastest 10K" },
  ];
}

export function updateGoalCurrent(goals, snapshot) {
  return goals.map((g) => {
    if (g.type === "strength" && g.exerciseId) {
      const best = snapshot.hevy?.recent_bests?.find((b) => b.exercise_template_id === g.exerciseId);
      if (best) {
        g.current = best.estimated_one_rm_kg ?? best.weight_kg ?? null;
      }
    }
    if (g.type === "speed" && g.recordType) {
      const best = snapshot.garmin?.recent_bests?.find((b) => b.record_type === g.recordType);
      if (best) {
        g.current = best.value ?? null;
      }
    }
    return g;
  });
}

export function goalProgress(g) {
  if (g.current == null) return 0;
  if (g.type === "strength") {
    const ct = parseFloat(g.current);
    const tg = parseFloat(g.target);
    if (!ct || !tg) return 0;
    return Math.min(Math.round((ct / tg) * 100), 100);
  }
  if (g.type === "speed") {
    const ct = timeToSeconds(g.current);
    const tg = timeToSeconds(g.target);
    if (!ct || !tg) return 0;
    return Math.min(Math.round(((tg / ct) * 100)), 110);
  }
  return 0;
}

function timeToSeconds(t) {
  if (t == null) return null;
  const parts = String(t).split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function renderSparkline(values, width = 160, height = 40) {
  if (!values.length) return "";
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return "";
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const points = pts
    .map((v, i) => {
      const x = pad + (i / (pts.length - 1)) * w;
      const y = pad + h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  const color = pts[pts.length - 1] >= pts[0] ? "var(--green)" : "var(--red)";
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="${pad}" y1="${pad + h}" x2="${pad + w}" y2="${pad + h}" stroke="var(--border)" stroke-width="0.5"/>
    </svg>
  `;
}
