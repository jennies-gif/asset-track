import { QUANTITY_SCALE } from "../constants/appConstants.js";
import {
  parseDecimalToScaledInt,
  scaledIntToDecimal
} from "./calculations.js";
import { addDays, normalizeSnapshotDate } from "../utils/date.js";

export function calculatePreviousCalendarDayChange({
  assets = [],
  valuationDate,
  calculatePortfolio
} = {}) {
  const normalizedDate = normalizeDate(valuationDate);
  if (!normalizedDate || typeof calculatePortfolio !== "function") {
    return unavailable("", "缺少可核对的昨日估值日期");
  }

  const previousDate = addDays(normalizedDate, -1);
  const marketAssets = assets.filter((asset) => !isCashAsset(asset));
  if (!marketAssets.length) {
    return available(normalizedDate, 0n, "");
  }

  const valuationAssets = [];
  const missingAssets = [];
  for (const asset of marketAssets) {
    const quantity = quantityAtEndOfDate(asset, previousDate);
    if (!isPositiveUnits(quantity)) continue;

    if (hasUnavailableMarketData(asset)) {
      missingAssets.push(asset);
      continue;
    }

    const currentPrice = dailyPriceOnDate(asset, normalizedDate);
    const previousPrice = dailyPriceOnDate(asset, previousDate);
    if (!currentPrice || !previousPrice) {
      missingAssets.push(asset);
      continue;
    }

    const fxRate = positiveDecimal(asset.fxRate) || "1";
    valuationAssets.push({
      ...asset,
      closed: false,
      quantity,
      currentPrice,
      previousPrice,
      fxRate,
      previousFxRate: fxRate
    });
  }

  if (!valuationAssets.length) {
    return missingAssets.length
      ? unavailable(normalizedDate, `${missingAssets.length} 项持仓行情不可用`)
      : available(normalizedDate, 0n, "");
  }

  const { totals } = calculatePortfolio(valuationAssets);
  const detail = missingAssets.length
    ? `按可用行情计算，另有 ${missingAssets.length} 项未计入；跨币种为估算`
    : "按可用行情计算；跨币种为估算";
  return available(
    normalizedDate,
    totals.marketValueCents - totals.previousValueCents,
    detail
  );
}

export function quantityAtEndOfDate(asset, date) {
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) return "0";

  let units = safeQuantityUnits(asset.closed ? "0" : asset.quantity);
  for (const record of Array.isArray(asset.buyRecords) ? asset.buyRecords : []) {
    if (normalizeDate(record.boughtAt) > normalizedDate) {
      units -= safeQuantityUnits(record.quantity);
    }
  }
  for (const record of Array.isArray(asset.sellRecords) ? asset.sellRecords : []) {
    if (normalizeDate(record.soldAt) > normalizedDate) {
      units += safeQuantityUnits(record.quantity);
    }
  }

  if (
    asset.closed &&
    !(Array.isArray(asset.sellRecords) && asset.sellRecords.length) &&
    normalizeDate(asset.closedAt) > normalizedDate
  ) {
    units = safeQuantityUnits(asset.soldQuantity || asset.quantity);
  }
  if (normalizeDate(asset.purchaseDate) > normalizedDate) return "0";
  return scaledIntToDecimal(units > 0n ? units : 0n, QUANTITY_SCALE);
}

function dailyPriceOnDate(asset, date) {
  const matched = (Array.isArray(asset.dailyPrices) ? asset.dailyPrices : [])
    .find((row) => normalizeDate(row.priceDate || row.date) === date);
  return positiveDecimal(matched?.closePrice || matched?.closeDecimal || matched?.close);
}

function hasUnavailableMarketData(asset) {
  return ["manual", "missing", "error"].includes(
    String(asset.priceStatus || "").trim().toLowerCase()
  );
}

function isCashAsset(asset) {
  return String(asset.market || "").toUpperCase() === "CASH" ||
    String(asset.type || "").trim() === "现金";
}

function normalizeDate(value) {
  const date = normalizeSnapshotDate(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "";
}

function positiveDecimal(value) {
  const normalized = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/u.test(normalized) || Number(normalized) <= 0) return "";
  return normalized;
}

function safeQuantityUnits(value) {
  try {
    return parseDecimalToScaledInt(value || "0", QUANTITY_SCALE);
  } catch {
    return 0n;
  }
}

function isPositiveUnits(value) {
  return safeQuantityUnits(value) > 0n;
}

function unavailable(valuationDate, reason) {
  return {
    amountCents: null,
    valuationDate,
    reason,
    detail: ""
  };
}

function available(valuationDate, amountCents, detail) {
  return {
    amountCents,
    valuationDate,
    reason: "",
    detail
  };
}
