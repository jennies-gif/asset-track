const dayMs = 24 * 60 * 60 * 1000;

export function buildUserAssetDailyPriceSnapshots({ userId, asset, history = [], dateFrom, dateTo } = {}) {
  const normalizedUserId = String(userId || "").trim();
  const assetId = String(asset?.id || "").trim();
  const symbol = String(asset?.symbol || "").trim().toUpperCase();
  if (!normalizedUserId || !assetId || !symbol) {
    return { rows: [], missingDates: [], status: "missing_identity" };
  }

  const usableHistory = normalizeHistory(history);
  if (!usableHistory.length) return { rows: [], missingDates: [], status: "missing_history" };

  const firstHistoryDate = usableHistory[0].date;
  const lastHistoryDate = usableHistory.at(-1).date;
  const startDate = normalizeDate(dateFrom) || normalizeDate(asset.purchaseDate) || firstHistoryDate;
  const endDate = normalizeDate(dateTo) || lastHistoryDate;
  if (!startDate || !endDate || startDate > endDate) {
    return { rows: [], missingDates: [], status: "invalid_range" };
  }

  const byDate = new Map(usableHistory.map((point) => [point.date, point]));
  const rows = [];
  const missingDates = [];
  let lastKnown = null;

  for (const date of calendarDates(startDate, endDate)) {
    const exact = byDate.get(date);
    if (exact) {
      lastKnown = exact;
      rows.push(snapshotFromPoint({ userId: normalizedUserId, asset, point: exact, priceDate: date, basis: "actual" }));
      continue;
    }

    if (lastKnown) {
      rows.push(snapshotFromPoint({
        userId: normalizedUserId,
        asset,
        point: lastKnown,
        priceDate: date,
        basis: "carry_forward",
        carriedFromDate: lastKnown.date
      }));
    } else {
      missingDates.push(date);
    }
  }

  return {
    rows,
    missingDates,
    status: rows.length ? (missingDates.length ? "partial" : "complete") : "missing_history"
  };
}

function normalizeHistory(history) {
  const byDate = new Map();
  for (const point of Array.isArray(history) ? history : []) {
    const date = normalizeDate(point.date || point.tradeDate || point.navDate);
    const closeDecimal = decimalString(point.closeDecimal ?? point.close ?? point.closePrice ?? point.unitNav);
    if (!date || !closeDecimal || point.qualityStatus === "invalid") continue;
    const normalized = {
      date,
      closeDecimal,
      source: String(point.source || "unknown").trim() || "unknown",
      sourceFetchedAt: String(point.sourceFetchedAt || "").trim(),
      type: point.type || (point.navDate ? "单位净值" : "日收盘价"),
      qualityStatus: point.qualityStatus || "ok"
    };
    const current = byDate.get(date);
    if (!current || sourceFreshnessRank(normalized.source) > sourceFreshnessRank(current.source)) {
      byDate.set(date, normalized);
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function snapshotFromPoint({ userId, asset, point, priceDate, basis, carriedFromDate = "" }) {
  const isFund = isFundNavAsset(asset) || point.type === "单位净值";
  return {
    userId,
    assetId: asset.id,
    account: asset.account || "",
    symbol: String(asset.symbol || "").trim().toUpperCase(),
    market: asset.market || inferMarket(asset),
    currency: asset.currency || "",
    priceDate,
    closePrice: point.closeDecimal,
    priceType: isFund ? "unit_nav" : "close",
    priceBasis: basis,
    carriedFromDate,
    source: point.source,
    sourceFetchedAt: point.sourceFetchedAt,
    qualityStatus: basis === "carry_forward" ? "carried_forward" : point.qualityStatus || "ok"
  };
}

function isFundNavAsset(asset) {
  const symbol = String(asset.symbol || "").trim().toUpperCase();
  const type = String(asset.type || "").trim();
  return symbol.endsWith(".OF") || type === "公募基金" || type === "开放式基金";
}

function calendarDates(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setTime(cursor.getTime() + dayMs);
  }
  return dates;
}

function normalizeDate(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function decimalString(value) {
  const raw = String(value ?? "").trim().replace(/,/gu, "");
  if (!/^\d+(\.\d+)?$/.test(raw)) return "";
  if (Number(raw) <= 0) return "";
  return raw.replace(/^0+(?=\d)/u, "").replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "") || "0";
}

function inferMarket(asset) {
  if (String(asset.type || "") === "贵金属") return "METAL";
  if (String(asset.type || "") === "数字资产") return "WEB3";
  if (asset.currency === "CNY") return "CN";
  if (asset.currency === "HKD") return "HK";
  if (asset.currency === "USD") return "US";
  return "UNKNOWN";
}

function sourceFreshnessRank(source) {
  const value = String(source || "").toLowerCase();
  if (value.includes("ticker") || value.includes("quote") || value.includes("real-time") || value.includes("realtime")) return 3;
  if (value.includes("kline") || value.includes("historical")) return 2;
  return 1;
}
