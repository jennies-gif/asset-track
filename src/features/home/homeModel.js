import { roundDivide } from "../../domain/calculations.js";
import { resolvePriceStatus } from "../../domain/priceStatus.js";
import { normalizeSnapshotDate, todayIsoDate } from "../../utils/date.js";
import { buildAssetDataIssues } from "../assets/dataQuality.js";
import { inferAssetMarket } from "../assets/marketOptions.js";
import { allocationWeightBps } from "../portfolio/portfolioRender.js";
import {
  assetTrendStartDate,
  buildTrendPoints,
  calculateMaxDrawdownBps,
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
    calculateTrendValueChangeForRange: ctx.calculateTrendValueChangeForRange,
    currentOverviewTotalCents: ctx.currentOverviewTotalCents,
    findNoteForChange: ctx.findNoteForChange,
    fxRateSummary,
    latestOverviewUpdateLabel,
    noteAssetLabel: ctx.noteAssetLabel,
    noteTagsFor: ctx.noteTagsFor,
    overviewAssets: ctx.overviewAssets,
    priceCompletenessClass,
    priceCompletenessLabel,
    priceStatusClass: ctx.priceStatusClass,
    priceStatusLabel: ctx.priceStatusLabel
  };
}

export function calculateCumulativeReturnBps() {
  return ctx.calculateDisplayPortfolio(ctx.overviewAssets()).totals.returnBps;
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

export function portfolioHealthSnapshot() {
  const assets = ctx.overviewAssets();
  const { positions, totals } = ctx.calculateDisplayPortfolio(assets);
  const dataIssues = assets.reduce((count, asset) => count + buildAssetDataIssues(asset).length, 0);
  const cryptoWeightBps = allocationWeightBps(positions, totals.marketValueCents, (position) => position.type === "数字资产" || inferAssetMarket(position) === "WEB3");
  const cashWeightBps = allocationWeightBps(positions, totals.marketValueCents, (position) => position.type === "现金" || inferAssetMarket(position) === "CASH");
  const drawdownBps = calculateMaxDrawdownBps(buildTrendPoints()) || 0n;
  const isHigh = cryptoWeightBps >= 3000n || drawdownBps <= -2000n || dataIssues > 0;
  const isMedium = cryptoWeightBps >= 1500n || drawdownBps <= -1000n || cashWeightBps < 500n;
  return {
    label: isHigh ? "风险偏高" : isMedium ? "需要关注" : "相对稳健",
    className: isHigh ? "negative" : isMedium ? "warning" : "positive",
    cryptoWeightBps,
    cashWeightBps,
    dataIssues
  };
}

export function priceCompletenessLabel() {
  const assets = ctx.overviewAssets();
  if (!assets.length) return "暂无价格数据";
  const pending = assets.filter((asset) => resolvePriceStatus(asset).needsReview).length;
  if (pending) return `${pending} 项价格待核对`;
  const synced = assets.filter((asset) => asset.priceStatus === "synced").length;
  if (synced) return `含 ${synced} 项同步价格`;
  return "手动价格";
}

export function priceCompletenessClass() {
  const assets = ctx.overviewAssets();
  if (!assets.length) return "";
  return assets.some((asset) => resolvePriceStatus(asset).needsReview) ? "warning" : "positive";
}

export function fxRateSummary() {
  const state = ctx.getState();
  const currency = ctx.displayCurrency();
  if (currency === "CNY") return `USD/CNY ${state.settings?.usdCnyRate || "6.85"}`;
  if (currency === "HKD") return `USD/HKD ${state.settings?.usdHkdRate || "7.82"}`;
  return "原币种折算 USD";
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
