export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function readPath(object, path) {
  return path.reduce(
    (acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined),
    object,
  );
}

export function readNumber(snapshot, path) {
  const value = readPath(snapshot, path);
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function readText(snapshot, path) {
  const value = readPath(snapshot, path);
  return value == null ? null : String(value);
}

export function shouldRenderValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "string") return value.trim() !== "" && value !== "null";
  return true;
}

export function formatDisplayValue(value) {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown";
  if (text === "-") return "-";
  if (/^[A-Za-z0-9 _-]+$/.test(text)) {
    return text
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
  }
  return text;
}

export function summarizeBests(snapshot) {
  const hevy = snapshot?.hevy?.recent_bests?.length ?? 0;
  const garmin = snapshot?.garmin?.recent_bests?.length ?? 0;
  return `${hevy} strength / ${garmin} running`;
}
