import { addMonths, normalizeSnapshotDate, todayIsoDate } from "../utils/date.js";

export function earliestRecordedDate({ assets = [], snapshots = [] } = {}) {
  const assetDates = assets
    .flatMap(assetRecordDates)
    .filter(Boolean)
    .sort();
  if (assetDates.length) return assetDates[0];

  return snapshots
    .map((snapshot) => normalizeDate(snapshot?.date))
    .filter(Boolean)
    .sort()[0] || "";
}

export function reportingPresetBounds(
  range,
  {
    end = todayIsoDate(),
    assets = [],
    snapshots = [],
    fallbackMonths = 12
  } = {}
) {
  const normalizedEnd = normalizeDate(end) || todayIsoDate();
  if (range === "all") {
    return {
      startDate: earliestRecordedDate({ assets, snapshots }) ||
        addMonths(normalizedEnd, -fallbackMonths),
      endDate: normalizedEnd
    };
  }
  if (range === "ytd") {
    return {
      startDate: `${normalizedEnd.slice(0, 4)}-01-01`,
      endDate: normalizedEnd
    };
  }
  return {
    startDate: addMonths(normalizedEnd, -Number(range || 1)),
    endDate: normalizedEnd
  };
}

function assetRecordDates(asset = {}) {
  const explicitDates = [
    asset.purchaseDate,
    asset.buyDate,
    asset.acquiredAt,
    ...(Array.isArray(asset.buyRecords)
      ? asset.buyRecords.map((record) => record?.boughtAt)
      : [])
  ]
    .map(normalizeDate)
    .filter(Boolean);
  if (explicitDates.length) return explicitDates;

  const recordedAt = normalizeDate(asset.updatedAt);
  return recordedAt ? [recordedAt] : [];
}

function normalizeDate(value) {
  const date = normalizeSnapshotDate(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "";
}
