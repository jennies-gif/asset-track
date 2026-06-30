export function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
