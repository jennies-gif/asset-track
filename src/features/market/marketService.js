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
    loadingMessage: (count) => `正在同步 ${count} 个已录入资产的最新价格...`
  });
}

export async function syncDailyMarketPricesIfDue() {
  const today = todayIsoDate();
  const autoSync = readAutoSyncState();
  if (autoSync.lastCompletedDate === today || autoSync.lastAttemptedDate === today) return;

  const symbols = symbolsForMarketSync();
  if (!symbols.length) return;

  writeAutoSyncState({ ...autoSync, lastAttemptedDate: today, lastAttemptedAt: new Date().toISOString() });
  await runMarketPriceSync({
    trigger: "auto",
    loadingMessage: (count) => `正在自动同步 ${count} 个已录入资产的最新价格...`,
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
  const symbols = symbolsForMarketSync();
  if (!symbols.length) {
    ctx.setMarketSyncState({ status: "empty", message: "当前没有可同步代码。请先填写资产代码，或在分析页选择收益对比基准。", results: [], syncedAt: "" });
    renderMarketSyncResult();
    return;
  }
  ctx.setMarketSyncState({ status: "loading", message: loadingMessage?.(symbols.length) || `正在同步 ${symbols.length} 个代码价格...`, results: [], syncedAt: "" });
  renderMarketSyncResult();
  try {
    const response = await fetch(`${ctx.marketApiBaseUrl}/api/market-data/sync-daily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols, trigger })
    });
    if (!response.ok) throw new Error(await marketApiErrorMessage(response));
    const payload = await response.json();
    const syncedAt = payload.syncedAt || new Date().toISOString();
    const applied = applyMarketSyncResults(payload.results || [], syncedAt);
    const fetchRun = payload.fetch?.run;
    const fetchStatus = payload.fetch?.status === "failed"
      ? `抓取失败，已尝试使用缓存：${payload.fetch.message || "请查看 API 日志"}`
      : fetchRun?.failureCount
      ? `抓取完成但 ${fetchRun.failureCount} 个源失败`
      : "抓取完成";
    const nextState = {
      status: applied.appliedCount || applied.benchmarkSyncedCount ? "success" : "warning",
      message: `${fetchStatus}，更新 ${applied.appliedCount} 个资产、${applied.benchmarkSyncedCount} 个分析基准，${applied.missingCount} 个缺少缓存。`,
      results: payload.results || [],
      syncedAt
    };
    ctx.setMarketSyncState(nextState);
    ctx.persistAndRender();
    ctx.loadBenchmarkPerformance?.({ force: true });
    onSettled?.(nextState);
  } catch (error) {
    markOpenAssetsPriceError(symbols, error instanceof Error ? error.message : "无法连接行情 API");
    const nextState = {
      status: "error",
      message: `同步失败：${error instanceof Error ? error.message : "无法连接行情 API"}`,
      results: [],
      syncedAt: ""
    };
    ctx.setMarketSyncState(nextState);
    ctx.persistAndRender?.();
    onSettled?.(nextState);
  } finally {
    renderMarketSyncResult();
  }
}

async function marketApiErrorMessage(response) {
  const detail = await readErrorPayload(response);
  if (detail) return detail;
  if (response.status === 404) {
    return "行情 API 路由不存在。请确认本地已运行 npm run api:start，或线上已部署并配置 MARKET_API_BASE_URL。";
  }
  return `行情 API 返回 ${response.status}`;
}

async function readErrorPayload(response) {
  try {
    const payload = await response.clone().json();
    return payload?.message || payload?.code || "";
  } catch {
    return "";
  }
}

function applyMarketSyncResults(results, syncedAt) {
  const state = ctx.getState();
  let appliedCount = 0;
  let missingCount = 0;
  let benchmarkSyncedCount = 0;
  const benchmarkSymbols = new Set(benchmarkSymbolsForAnalysis());
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
    if (!result) {
      const missing = results.find((item) => String(item.symbol || "").toUpperCase() === symbol && item.status !== "synced");
      if (!missing) return asset;
      return {
        ...asset,
        priceStatus: "missing",
        priceError: missing.message || "未找到可用价格缓存",
        updatedAt: syncedAt || new Date().toISOString()
      };
    }
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
      priceError: "",
      dailyPrices: normalizeDailyPriceRows(result.dailyPrices || asset.dailyPrices),
      dailyPriceStatus: result.dailyPriceStatus || asset.dailyPriceStatus || "",
      dailyPriceMissingDates: Array.isArray(result.dailyPriceMissingDates) ? result.dailyPriceMissingDates : asset.dailyPriceMissingDates || [],
      updatedAt: syncedAt || new Date().toISOString()
    };
  });
  for (const result of results) {
    if (result.status === "synced" && benchmarkSymbols.has(String(result.symbol || "").toUpperCase())) {
      benchmarkSyncedCount += 1;
    }
  }
  return { appliedCount, missingCount, benchmarkSyncedCount };
}

function normalizeDailyPriceRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      priceDate: String(row.priceDate || row.date || "").slice(0, 10),
      closePrice: String(row.closePrice || row.closeDecimal || row.close || "").trim(),
      priceBasis: row.priceBasis || "",
      carriedFromDate: row.carriedFromDate || "",
      source: row.source || "",
      sourceFetchedAt: row.sourceFetchedAt || "",
      qualityStatus: row.qualityStatus || ""
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/u.test(row.priceDate) && Number(row.closePrice) > 0)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

function markOpenAssetsPriceError(symbols, message) {
  const state = ctx.getState();
  const requested = new Set(symbols.map((symbol) => String(symbol || "").toUpperCase()).filter(Boolean));
  state.assets = state.assets.map((asset) => {
    const symbol = syncSymbolForAsset(asset);
    if (!symbol || !requested.has(symbol) || asset.closed) return asset;
    return {
      ...asset,
      priceStatus: "error",
      priceError: message,
      updatedAt: new Date().toISOString()
    };
  });
}

function symbolsForRecordedAssets() {
  const state = ctx.getState();
  const assets = state.assets.filter((asset) => syncSymbolForAsset(asset) && inferAssetMarket(asset) !== "CASH");
  return [...new Set(assets.map(syncSymbolForAsset).filter(Boolean))];
}

function symbolsForMarketSync() {
  return symbolsForRecordedAssets();
}

function benchmarkSymbolsForAnalysis() {
  return (ctx.selectedBenchmarkInstruments?.() || [])
    .map((benchmark) => String(benchmark.symbol || "").trim().toUpperCase())
    .filter(Boolean);
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
