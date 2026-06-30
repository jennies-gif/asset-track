export function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

export function normalizeSnapshotDate(date) {
  const raw = String(date || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{2}-\d{2}$/.test(raw)) return `${new Date().getUTCFullYear()}-${raw}`;
  return raw;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function addMonths(date, delta) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + delta);
  return next.toISOString().slice(0, 10);
}

export function addDays(date, delta) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

export function formatShortDate(date) {
  return String(date).slice(5);
}
