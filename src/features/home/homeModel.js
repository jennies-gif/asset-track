import { roundDivide } from "../../domain/calculations.js";
import { calculatePreviousCalendarDayChange } from "../../domain/portfolioDailyChange.js";
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
    latestOverviewSyncSummary,
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

export function latestDailyPnlSnapshot(asOfDate = todayIsoDate()) {
  return calculatePreviousCalendarDayChange({
    assets: ctx.allAssets?.() || ctx.overviewAssets(),
    valuationDate: addDays(asOfDate, -1),
    calculatePortfolio: ctx.calculateDisplayPortfolio
  });
}

export function dailyPnlMetricLabel(snapshot) {
  const valuationDate = normalizePriceDate(snapshot?.valuationDate);
  return valuationDate ? `昨日收益（${valuationDate.slice(5)}）` : "昨日收益";
}

function normalizePriceDate(value) {
  const date = normalizeSnapshotDate(value || "");
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : "";
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
  const summary = latestOverviewSyncSummary();
  return [summary.value, summary.detail].filter(Boolean).join(" · ");
}

export function latestOverviewSyncSummary() {
  const marketSyncState = ctx.getMarketSyncState?.() || {};
  const assets = (ctx.allAssets?.() || ctx.overviewAssets())
    .filter((asset) => !asset.closed && !isCashAsset(asset));
  if (!assets.length) {
    return { value: "暂无需同步", detail: "当前没有非现金持仓", tone: "positive" };
  }

  if (marketSyncState.status === "loading") {
    return { value: "同步中", detail: "正在检查最新行情", tone: "warning" };
  }
  if (marketSyncState.status === "error") {
    return { value: "同步失败", detail: "请重新检查价格", tone: "negative" };
  }

  const syncedAssets = assets.filter((asset) => asset.priceStatus === "synced");
  const failedAssets = assets.filter((asset) => asset.priceStatus === "error");
  const fetchedAt = latestTimestamp(syncedAssets.map((asset) => asset.sourceFetchedAt));
  const pricedAt = latestDate(syncedAssets.map((asset) => asset.pricedAt));
  const checkedAt = marketSyncState.syncedAt || fetchedAt;
  const detail = checkedAt
    ? `上次检查 ${ctx.formatDateTimeMinute(checkedAt)}`
    : pricedAt ? `最新行情 ${pricedAt}` : "";

  if (marketSyncState.status === "warning" || (syncedAssets.length && syncedAssets.length < assets.length)) {
    return { value: "部分同步", detail: detail || "部分持仓仍需处理", tone: "warning" };
  }
  if (syncedAssets.length === assets.length) {
    return { value: "已同步", detail, tone: "positive" };
  }
  if (failedAssets.length) {
    const failedAt = latestTimestamp(failedAssets.map((asset) => asset.updatedAt));
    return {
      value: "同步异常",
      detail: failedAt
        ? `${failedAssets.length} 项失败 · 上次尝试 ${ctx.formatDateTimeMinute(failedAt)}`
        : `${failedAssets.length} 项需要重新检查`,
      tone: "negative"
    };
  }
  return { value: "尚未同步", detail: "请检查价格更新", tone: "warning" };
}

function latestTimestamp(values) {
  return values
    .filter((value) => Number.isFinite(Date.parse(value || "")))
    .sort()
    .at(-1) || "";
}

function latestDate(values) {
  return values
    .map(normalizePriceDate)
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

function isCashAsset(asset) {
  return String(asset.market || "").toUpperCase() === "CASH" ||
    String(asset.type || "").trim() === "现金";
}
