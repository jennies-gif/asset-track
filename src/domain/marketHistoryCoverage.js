const dayMs = 24 * 60 * 60 * 1000;

export function missingMarketHistoryRanges(history = [], dateFrom, dateTo) {
  const requestedFrom = normalizeDate(dateFrom);
  const requestedTo = normalizeDate(dateTo);
  if (!requestedFrom || !requestedTo || requestedFrom > requestedTo) return [];

  const dates = [...new Set(
    (Array.isArray(history) ? history : [])
      .map((point) => normalizeDate(point?.date || point?.tradeDate || point?.navDate))
      .filter((date) => date && date >= requestedFrom && date <= requestedTo)
  )].sort();

  if (!dates.length) return [{ dateFrom: requestedFrom, dateTo: requestedTo }];

  const ranges = [];
  const firstCoveredDate = dates[0];
  const lastCoveredDate = dates.at(-1);
  if (firstCoveredDate > requestedFrom) {
    ranges.push({ dateFrom: requestedFrom, dateTo: addDays(firstCoveredDate, -1) });
  }
  if (lastCoveredDate < requestedTo) {
    const tailFrom = addDays(lastCoveredDate, 1);
    if (tailFrom <= requestedTo) ranges.push({ dateFrom: tailFrom, dateTo: requestedTo });
  }
  return ranges;
}

function normalizeDate(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(raw) ? raw : "";
}

function addDays(value, delta) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setTime(date.getTime() + delta * dayMs);
  return date.toISOString().slice(0, 10);
}
