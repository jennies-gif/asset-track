import { inferMarketPriceKind, isDailyHistoryPoint } from "./marketPriceSemantics.js";

export function selectPurchasePriceAtOrBefore(history = [], requestedDate = "") {
  const normalizedDate = normalizeDate(requestedDate);
  if (!normalizedDate) return null;
  const matched = (Array.isArray(history) ? history : [])
    .filter((point) => isDailyHistoryPoint(point))
    .map(normalizeHistoryPoint)
    .filter((point) => point && point.priceDate <= normalizedDate)
    .sort((left, right) => right.priceDate.localeCompare(left.priceDate))[0];
  if (!matched) return null;
  return {
    requestedDate: normalizedDate,
    priceDate: matched.priceDate,
    price: matched.price,
    priceSource: matched.priceSource,
    sourceFetchedAt: matched.sourceFetchedAt,
    priceKind: matched.priceKind,
    qualityStatus: matched.qualityStatus,
    usedPreviousTradingDate: matched.priceDate !== normalizedDate
  };
}

function normalizeHistoryPoint(point) {
  const priceDate = normalizeDate(point?.date || point?.tradeDate || point?.navDate);
  const price = decimalString(point?.close ?? point?.closePrice ?? point?.closeDecimal ?? point?.unitNav);
  if (!priceDate || !price || Number(price) <= 0) return null;
  return {
    priceDate,
    price,
    priceSource: String(point?.source || "").trim(),
    sourceFetchedAt: String(point?.sourceFetchedAt || "").trim(),
    priceKind: inferMarketPriceKind(point),
    qualityStatus: String(point?.qualityStatus || "ok").trim()
  };
}

function normalizeDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "";
}

function decimalString(value) {
  const normalized = String(value ?? "").trim();
  return /^-?\d+(?:\.\d+)?$/u.test(normalized) ? normalized : "";
}
