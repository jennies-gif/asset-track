import { roundDivide } from "../../domain/calculations.js";
import { addDays, normalizeSnapshotDate, todayIsoDate } from "../../utils/date.js";
import { buildAssetValuationNotices } from "../assets/dataQuality.js";
import {
  assetTrendStartDate,
  latestTrendDate
} from "../trends/trendModel.js";

let ctx = {};

export function configureHomeModel(context = {}) {
  ctx = { ...ctx, ...context };
}

export function buildHomeRenderContext() {
  return {
    state: ctx.getState,
    buildAssetChangeRecords: ctx.buildAssetChangeRecords,
    calculateCumulativeReturnBps,
    calculateDisplayPortfolio: ctx.calculateDisplayPortfolio,
    dailyPnlMetricLabel,
    latestDailyPnlSnapshot,
    currentOverviewTotalCents: ctx.currentOverviewTotalCents,
    findNoteForChange: ctx.findNoteForChange,
    latestOverviewUpdateLabel,
    noteAssetLabel: ctx.noteAssetLabel,
    noteTagsFor: ctx.noteTagsFor,
    overviewAssets: ctx.overviewAssets,
    valuationAttentionItems
  };
}

export function calculateCumulativeReturnBps() {
  return ctx.calculateDisplayPortfolio(ctx.overviewAssets()).totals.returnBps;
}

export function latestDailyPnlSnapshot() {
  const assets = ctx.overviewAssets().filter((asset) => isPositiveDecimal(asset.quantity));
  if (!assets.length) return { amountCents: null, valuationDate: "", reason: "暂无资产" };

  const pricedAssets = assets.filter((asset) => !isCashAsset(asset));
  if (!pricedAssets.length) {
    return {
      amountCents: null,
      valuationDate: "",
      reason: "纯现金组合没有可核对的交易日价格变化"
    };
  }

  const hasUnverifiedPrice = pricedAssets.some((asset) =>
    String(asset.priceStatus || "").trim() !== "synced"
  );
  if (hasUnverifiedPrice) {
    return {
      amountCents: null,
      valuationDate: "",
      reason: "含手动、缺失或同步失败价格，无法计算统一交易日收益"
    };
  }

  const hasUnusablePrice = pricedAssets.some((asset) =>
    !isPositiveDecimal(asset.currentPrice) ||
      !isPositiveDecimal(asset.previousPrice) ||
      !isPositiveDecimal(asset.fxRate) ||
      !isPositiveDecimal(asset.previousFxRate) ||
      !normalizePriceDate(asset.pricedAt)
  );
  if (hasUnusablePrice) {
    return {
      amountCents: null,
      valuationDate: "",
      reason: "缺少可核对的当前价、上一交易日价格或对应汇率"
    };
  }

  const priceDates = [...new Set(pricedAssets.map((asset) => normalizePriceDate(asset.pricedAt)))];
  if (priceDates.length !== 1) {
    return { amountCents: null, valuationDate: "", reason: "组合内资产的最新行情日期不一致" };
  }

  const { totals } = ctx.calculateDisplayPortfolio(assets);
  return {
    amountCents: totals.marketValueCents - totals.previousValueCents,
    valuationDate: priceDates[0],
    reason: ""
  };
}

export function dailyPnlMetricLabel(snapshot) {
  const valuationDate = normalizePriceDate(snapshot?.valuationDate);
  if (!valuationDate) return "最近交易日收益";
  const dateLabel = valuationDate.slice(5);
  return valuationDate === addDays(todayIsoDate(), -1)
    ? `昨日收益（${dateLabel}）`
    : `最近交易日收益（${dateLabel}）`;
}

function isCashAsset(asset) {
  return String(asset.market || "").toUpperCase() === "CASH" || String(asset.type || "").trim() === "现金";
}

function normalizePriceDate(value) {
  const date = normalizeSnapshotDate(value || "");
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "";
}

function isPositiveDecimal(value) {
  const normalized = String(value ?? "").trim().replaceAll(",", "");
  if (!/^\d+(?:\.\d+)?$/u.test(normalized)) return false;
  return BigInt(normalized.replace(".", "")) > 0n;
}

export function annualizedCumulativeReturnBps(returnBps) {
  const assets = ctx.overviewAssets();
  if (!assets.length) return 0n;
  const start = earliestOverviewAssetDate(assets);
  const end = latestTrendDate(assets);
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((endMs - startMs) / 86400000));
  return roundDivide(BigInt(returnBps) * 365n, BigInt(days));
}

function earliestOverviewAssetDate(assets) {
  const dates = assets
    .map((asset) => assetTrendStartDate(asset))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates[0] || todayIsoDate();
}

export function valuationAttentionItems() {
  return ctx.overviewAssets().flatMap((asset) =>
    buildAssetValuationNotices(asset).map((notice) => ({ asset, notice }))
  );
}

export function latestOverviewUpdateLabel() {
  if (ctx.getMarketSyncState().syncedAt) return ctx.formatDateTimeMinute(ctx.getMarketSyncState().syncedAt);
  const dates = ctx.overviewAssets()
    .flatMap((asset) => [asset.pricedAt, asset.updatedAt, asset.purchaseDate])
    .filter(Boolean)
    .map((date) => normalizeSnapshotDate(date))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  const latest = dates.at(-1);
  return latest ? `${latest} ${ctx.notSynced}` : ctx.notSynced;
}
