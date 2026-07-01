import { benchmarkInstruments } from "../../domain/marketData.js";
import { todayIsoDate } from "../../utils/date.js";
import { findAssetQuickMatch, normalizeQuickMatchText } from "../assets/assetQuickMatch.js";
import { inferAssetMarket } from "../assets/marketOptions.js";
import { renderMarketSyncResult } from "./marketRender.js";

let ctx = {};
const marketAutoSyncKey = "asset-trail-market-auto-sync-v1";

export function configureMarketService(context) {
  ctx = context;
}

export function hideMarketSyncResult() {
  const { elements } = ctx;
  if (!elements.marketSyncResult) return;
  if (ctx.getMarketSyncState().status === "loading") return;
  ctx.setMarketSyncState({ status: "idle", message: "", results: [], syncedAt: "" });
  renderMarketSyncResult();
}

export async function syncLatestMarketPrices() {
  await runMarketPriceSync({
    trigger: "manual",
    loadingMessage: (count) => `正在抓取并同步 ${count} 个代码近 7 天价格...`
  });
}

export async function syncDailyMarketPricesIfDue() {
  const today = todayIsoDate();
  const autoSync = readAutoSyncState();
  if (autoSync.lastCompletedDate === today || autoSync.lastAttemptedDate === today) return;

  const symbols = symbolsForOpenAssets();
  if (!symbols.length) return;

  writeAutoSyncState({ ...autoSync, lastAttemptedDate: today, lastAttemptedAt: new Date().toISOString() });
  await runMarketPriceSync({
    trigger: "auto",
    loadingMessage: (count) => `正在自动同步今日价格，覆盖 ${count} 个代码...`,
    onSettled: (state) => {
      const latest = readAutoSyncState();
      if (state.status === "success" || state.status === "warning") {
        writeAutoSyncState({
          ...latest,
          lastCompletedDate: today,
          lastCompletedAt: state.syncedAt || new Date().toISOString(),
          lastStatus: state.status
        });
      } else if (state.status === "error") {
        writeAutoSyncState({
          ...latest,
          lastStatus: "error",
          lastErrorAt: new Date().toISOString(),
          lastError: state.message
        });
      }
    }
  });
}

async function runMarketPriceSync({ trigger, loadingMessage, onSettled } = {}) {
  const symbols = symbolsForOpenAssets();
  if (!symbols.length) {
    ctx.setMarketSyncState({ status: "empty", message: "当前记录没有可同步代码。请先为股票、基金、ETF、贵金属或数字资产填写代码。", results: [], syncedAt: "" });
    renderMarketSyncResult();
    return;
  }
  ctx.setMarketSyncState({ status: "loading", message: loadingMessage?.(symbols.length) || `正在同步 ${symbols.length} 个代码价格...`, results: [], syncedAt: "" });
  renderMarketSyncResult();
  try {
    const response = await fetch(`${ctx.marketApiBaseUrl}/api/market-data/sync-daily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, days: 7, trigger })
    });
    if (!response.ok) throw new Error(marketApiErrorMessage(response.status));
    const payload = await response.json();
    const syncedAt = payload.syncedAt || new Date().toISOString();
    const applied = applyMarketSyncResults(payload.results || [], syncedAt);
    const fetchRun = payload.fetch?.run;
    const fetchStatus = fetchRun?.failureCount
      ? `抓取完成但 ${fetchRun.failureCount} 个源失败`
      : "抓取完成";
    const nextState = {
      status: applied.appliedCount ? "success" : "warning",
      message: `${fetchStatus}，更新 ${applied.appliedCount} 个资产，${applied.missingCount} 个缺少缓存。`,
      results: payload.results || [],
      syncedAt
    };
    ctx.setMarketSyncState(nextState);
    ctx.persistAndRender();
    onSettled?.(nextState);
  } catch (error) {
    const nextState = {
      status: "error",
      message: `同步失败：${error instanceof Error ? error.message : "无法连接行情 API"}`,
      results: [],
      syncedAt: ""
    };
    ctx.setMarketSyncState(nextState);
    onSettled?.(nextState);
  } finally {
    renderMarketSyncResult();
  }
}

export async function syncBenchmarkMarketPrices() {
  const symbols = benchmarkInstruments.map((benchmark) => benchmark.symbol);
  ctx.setMarketSyncState({ status: "loading", message: "正在同步沪深300、标普500和纳斯达克100基准数据...", results: [], syncedAt: "" });
  renderMarketSyncResult();
  try {
    const response = await fetch(`${ctx.marketApiBaseUrl}/api/market-data/sync-daily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, days: 30 })
    });
    if (!response.ok) throw new Error(marketApiErrorMessage(response.status));
    const payload = await response.json();
    ctx.setMarketSyncState({
      status: payload.summary?.missingCount ? "warning" : "success",
      message: `已同步 ${payload.summary?.syncedCount || 0} 个基准，${payload.summary?.missingCount || 0} 个缺少缓存。`,
      results: payload.results || [],
      syncedAt: payload.syncedAt || new Date().toISOString()
    });
    ctx.setBenchmarkPerformanceState({ status: "idle", histories: {}, error: "" });
    await ctx.loadBenchmarkPerformance({ force: true });
    renderMarketSyncResult();
  } catch (error) {
    ctx.setMarketSyncState({
      status: "error",
      message: `基准同步失败：${error instanceof Error ? error.message : "无法连接行情 API"}`,
      results: [],
      syncedAt: ""
    });
    renderMarketSyncResult();
  }
}

function marketApiErrorMessage(status) {
  if (status === 404) {
    return "行情 API 路由不存在。请确认本地已运行 npm run api:start，或线上已部署并配置 MARKET_API_BASE_URL。";
  }
  return `行情 API 返回 ${status}`;
}

function applyMarketSyncResults(results, syncedAt) {
  const state = ctx.getState();
  let appliedCount = 0;
  let missingCount = 0;
  const bySymbol = new Map(
    results
      .filter((result) => result.status === "synced" && result.after?.currentPrice)
      .map((result) => [String(result.symbol || "").toUpperCase(), result])
  );
  for (const result of results) {
    if (result.status !== "synced") missingCount += 1;
  }
  state.assets = state.assets.map((asset) => {
    const symbol = syncSymbolForAsset(asset);
    const result = bySymbol.get(symbol);
    if (!result) return asset;
    appliedCount += 1;
    const matched = findAssetQuickMatch(symbol);
    return {
      ...asset,
      symbol: asset.symbol || symbol,
      market: asset.market || matched?.market || asset.market,
      type: asset.type || matched?.type || asset.type,
      currency: asset.currency || matched?.currency || asset.currency,
      previousPrice: result.after.previousPrice || asset.currentPrice || asset.previousPrice || asset.costPrice,
      currentPrice: result.after.currentPrice,
      pricedAt: result.after.pricedAt || asset.pricedAt,
      priceSource: result.after.priceSource || asset.priceSource,
      priceStatus: "synced",
      updatedAt: syncedAt || new Date().toISOString()
    };
  });
  return { appliedCount, missingCount };
}

function symbolsForOpenAssets() {
  const state = ctx.getState();
  const assets = state.assets.filter((asset) => !asset.closed && syncSymbolForAsset(asset) && inferAssetMarket(asset) !== "CASH");
  return [...new Set(assets.map(syncSymbolForAsset).filter(Boolean))];
}

function readAutoSyncState() {
  try {
    return JSON.parse(localStorage.getItem(marketAutoSyncKey) || "{}") || {};
  } catch {
    return {};
  }
}

function writeAutoSyncState(state) {
  try {
    localStorage.setItem(marketAutoSyncKey, JSON.stringify(state));
  } catch {
    // Ignore storage failures; manual sync remains available.
  }
}

function syncSymbolForAsset(asset) {
  if (inferAssetMarket(asset) === "CASH") return "";
  const explicit = String(asset.symbol || "").trim().toUpperCase();
  if (explicit) return explicit;
  const quickMatch = findAssetQuickMatch([asset.name, asset.type, asset.currency].filter(Boolean).join(" "));
  if (quickMatch?.symbol) return quickMatch.symbol.toUpperCase();
  const normalizedName = normalizeQuickMatchText(asset.name);
  if (normalizedName.includes("标普") || normalizedName.includes("SP500") || normalizedName.includes("S&P500")) return "SPY";
  if (normalizedName.includes("英伟达") || normalizedName.includes("NVIDIA")) return "NVDA";
  if (normalizedName.includes("中概") || normalizedName.includes("中国互联网") || normalizedName.includes("KWEB")) return "513050";
  if (normalizedName.includes("比特币") || normalizedName.includes("BITCOIN")) return "BTC";
  if (normalizedName.includes("腾讯控股")) return "00700";
  if (normalizedName.includes("现货黄金") || normalizedName === "黄金") return "XAU";
  return "";
}
