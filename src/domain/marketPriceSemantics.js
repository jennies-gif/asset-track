const latestSourcePattern = /ticker|quote|real-time|realtime|simple price|latest|metals price/iu;
const closeSourcePattern = /kline|historical|daily close/iu;

export function inferMarketPriceKind(row = {}) {
  const explicit = String(row.priceKind || row.priceType || "").trim().toLowerCase();
  if (["close", "unit_nav", "latest", "reference", "snapshot"].includes(explicit)) return explicit;
  if (row.navDate) return "unit_nav";
  const source = String(row.source || "");
  if (/fund net worth|unit nav/iu.test(source)) return "unit_nav";
  if (/gold api|metals\.dev/iu.test(source)) return "reference";
  if (latestSourcePattern.test(source)) return "latest";
  if (closeSourcePattern.test(source)) return "close";
  return "close";
}

export function isDailyHistoryPoint(point = {}) {
  const kind = inferMarketPriceKind(point);
  if (!["close", "unit_nav", "snapshot"].includes(kind)) return false;
  return kind !== "close" || isCompletedDailyClose(point);
}

export function selectCurrentValuationPoint(asset = {}, points = []) {
  const usable = points.filter(isUsablePoint);
  if (!usable.length) return null;
  const kind = assetKind(asset);
  let preferred;
  if (kind === "crypto") {
    preferred = usable.filter((point) => inferMarketPriceKind(point) === "latest");
    if (!preferred.length) preferred = usable.filter((point) => inferMarketPriceKind(point) === "close");
  } else if (kind === "metal") {
    preferred = usable.filter((point) => ["reference", "latest", "snapshot"].includes(inferMarketPriceKind(point)));
  } else if (kind === "fund") {
    preferred = usable.filter((point) => inferMarketPriceKind(point) === "unit_nav");
  } else {
    preferred = usable.filter((point) => inferMarketPriceKind(point) === "close");
  }
  return [...preferred].sort(compareValuationFreshness)[0] || null;
}

export function selectPreviousDailyPoint(points = [], latestDate = "") {
  return points
    .filter((point) => isUsablePoint(point) && isDailyHistoryPoint(point) && point.date < latestDate)
    .sort(compareValuationFreshness)[0] || null;
}

export function marketPriceDisplayKind(asset = {}) {
  const kind = String(asset.priceKind || "").toLowerCase();
  if (kind === "unit_nav") return "净值";
  if (kind === "latest") return "最新价";
  if (kind === "reference") return "参考价";
  if (kind === "snapshot") return "快照";
  return "收盘";
}

export function isMarketCloseAvailable(market, tradeDate, now = new Date()) {
  const config = {
    CN: { timeZone: "Asia/Shanghai", closeMinutes: 15 * 60 },
    HK: { timeZone: "Asia/Hong_Kong", closeMinutes: 16 * 60 },
    US: { timeZone: "America/New_York", closeMinutes: 16 * 60 }
  }[String(market || "").toUpperCase()];
  if (!config || !/^\d{4}-\d{2}-\d{2}$/u.test(String(tradeDate || ""))) return true;
  const local = localDateTimeParts(now, config.timeZone);
  if (!local) return false;
  if (tradeDate < local.date) return true;
  if (tradeDate > local.date) return false;
  return local.hour * 60 + local.minute >= config.closeMinutes;
}

function assetKind(asset) {
  const type = String(asset.type || "").trim();
  const market = String(asset.market || "").trim().toUpperCase();
  const symbol = String(asset.symbol || "").trim().toUpperCase();
  if (type === "数字资产" || market === "WEB3") return "crypto";
  if (type === "贵金属" || market === "METAL") return "metal";
  if (symbol.endsWith(".OF") || ["公募基金", "开放式基金"].includes(type)) return "fund";
  return "listed";
}

function isUsablePoint(point) {
  return point?.qualityStatus !== "invalid" &&
    Number.isFinite(Number(point?.close)) &&
    Number(point.close) > 0 &&
    (inferMarketPriceKind(point) !== "close" || isCompletedDailyClose(point));
}

function compareValuationFreshness(left, right) {
  const leftTime = Date.parse(left.priceAt || left.sourceTimestamp || left.sourceFetchedAt || "");
  const rightTime = Date.parse(right.priceAt || right.sourceTimestamp || right.sourceFetchedAt || "");
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
  const dateOrder = String(right.date || "").localeCompare(String(left.date || ""));
  if (dateOrder !== 0) return dateOrder;
  return String(right.sourceFetchedAt || "").localeCompare(String(left.sourceFetchedAt || ""));
}

function localDateTimeParts(now, timeZone) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function isCompletedDailyClose(point) {
  if (!/binance daily kline/iu.test(String(point.source || ""))) return true;
  const date = String(point.date || point.tradeDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return false;
  const expectedClose = Date.parse(`${date}T00:00:00.000Z`) + 24 * 60 * 60 * 1000 - 1;
  const observedAt = Date.parse(point.priceAt || point.sourceTimestamp || point.sourceFetchedAt || "");
  return Number.isFinite(observedAt) && observedAt >= expectedClose;
}
