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
    return unavailable(normalizedDate, "纯现金组合没有昨日行情收益");
  }

  const transactionAssets = marketAssets.filter((asset) =>
    hasTransactionOnDate(asset, normalizedDate)
  );
  if (transactionAssets.length) {
    return unavailable(
      normalizedDate,
      `昨日有 ${transactionAssets.length} 项买卖记录，暂无法准确剔除交易资金影响`
    );
  }

  const valuationAssets = [];
  const missingAssets = [];
  for (const asset of marketAssets) {
    const quantity = quantityAtEndOfDate(asset, previousDate);
    if (!isPositiveUnits(quantity)) continue;

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

  if (missingAssets.length) {
    return unavailable(
      normalizedDate,
      `${missingAssets.length} 项昨日或前一日行情尚未齐备`
    );
  }
  if (!valuationAssets.length) {
    return unavailable(normalizedDate, "昨日没有可核对的非现金持仓");
  }

  const { totals } = calculatePortfolio(valuationAssets);
  return {
    amountCents: totals.marketValueCents - totals.previousValueCents,
    valuationDate: normalizedDate,
    reason: "",
    detail: "按昨日持仓与已缓存日线计算；跨币种按当前汇率估算"
  };
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

function hasTransactionOnDate(asset, date) {
  if (normalizeDate(asset.purchaseDate) === date) return true;
  return (Array.isArray(asset.buyRecords) ? asset.buyRecords : [])
    .some((record) => normalizeDate(record.boughtAt) === date) ||
    (Array.isArray(asset.sellRecords) ? asset.sellRecords : [])
      .some((record) => normalizeDate(record.soldAt) === date);
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
