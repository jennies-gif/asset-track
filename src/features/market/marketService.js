import { todayIsoDate } from "../../utils/date.js";
import { buildUserAssetDailyPriceSnapshots } from "../../domain/userAssetDailyPrices.js";
import { marketHistoryWindowDays } from "../../domain/marketHistoryCoverage.js";
import { normalizeCnListedFundInstrument } from "../../domain/cnInstrumentClassification.js";
import { findAssetQuickMatch, normalizeQuickMatchText } from "../assets/assetQuickMatch.js";
import { inferAssetMarket } from "../assets/marketOptions.js";
import { renderMarketSyncResult } from "./marketRender.js";

let ctx = {};
const marketAutoSyncKey = "asset-trail-market-auto-sync-v1";
const marketSyncBatchSize = 50;
const marketAutoSyncRetryCooldownMs = 15 * 60 * 1000;
let marketSyncInFlight = null;

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
  await runSingleMarketSync(() => runMarketPriceSync({
    trigger: "manual",
    includeBenchmarks: true,
    loadingMessage: () => "正在同步已录入资产与全部分析基准的价格..."
  }));
}

export async function syncDailyMarketPricesIfDue() {
  const today = todayIsoDate();
  const autoSync = readAutoSyncState();
  const now = Date.now();
  const automaticSyncDue = isAutomaticMarketSyncDue(autoSync, today, now);
  const registrationRetryDue = hasPendingMarketRegistrationRetry(now);
  if (!automaticSyncDue && !registrationRetryDue) return;

  const symbols = symbolsForMarketSync();
  if (!symbols.length) return;

  const attemptedAt = new Date().toISOString();
  writeAutoSyncState({
    ...autoSync,
    lastAttemptedDate: today,
    lastAttemptedAt: attemptedAt,
    attemptStatus: "running"
  });
  const outcome = await runSingleMarketSync(runAutomaticMarketPriceSync);
  const latest = readAutoSyncState();
  const completed = outcome?.attemptStatus === "completed" ||
    (!outcome?.attemptStatus && ["success", "warning"].includes(outcome?.state?.status));
  if (completed) {
    writeAutoSyncState({
      ...latest,
      lastCompletedDate: today,
      lastCompletedAt: outcome.state?.syncedAt || new Date().toISOString(),
      lastStatus: outcome.state?.status || "success",
      attemptStatus: "completed",
      lastError: ""
    });
    return;
  }
  writeAutoSyncState({
    ...latest,
    lastStatus: "error",
    attemptStatus: "error",
    lastErrorAt: new Date().toISOString(),
    lastError: outcome?.state?.message || "自动价格检查失败"
  });
}

export async function ensureAssetMarketHistory(asset) {
  const symbol = syncSymbolForAsset(asset);
  if (!ctx.marketApiBaseUrl || !asset?.id || !symbol || !asset.purchaseDate || inferAssetMarket(asset) === "CASH") return;
  markMarketRegistrationPending([symbol], "", new Date().toISOString());
  ctx.persistAndRender();
  try {
    const response = await fetch(`${ctx.marketApiBaseUrl}/api/market-data/sync-daily`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: [symbol],
        days: marketHistoryWindowDays(asset.purchaseDate, todayIsoDate()),
        includeHistory: true,
        includeBenchmarks: true,
        trigger: "asset_created"
      })
    });
    if (!response.ok) throw new Error(await marketApiErrorMessage(response));
    const payload = await response.json();
    const result = (payload.results || []).find((item) => canonicalSyncSymbol(item.symbol) === canonicalSyncSymbol(symbol));
    if (!result) throw new Error("服务端未确认该代码的行情同步目标登记");
    const daily = buildUserAssetDailyPriceSnapshots({
      userId: "local-user",
      asset,
      history: result?.history || [],
      dateFrom: asset.purchaseDate,
      dateTo: todayIsoDate()
    });
    const state = ctx.getState();
    ctx.setState({
      ...state,
      assets: state.assets.map((item) => item.id === asset.id ? {
        ...item,
        dailyPrices: normalizeDailyPriceRows(daily.rows),
        dailyPriceStatus: daily.status,
        dailyPriceMissingDates: daily.missingDates,
        historyBackfillStatus: daily.rows.length ? daily.status : "missing",
        historyBackfillUpdatedAt: new Date().toISOString(),
        historyBackfillError: "",
        marketSyncRegistrationStatus: "registered",
        marketSyncRegistrationConfirmedAt: new Date().toISOString(),
        marketSyncRegistrationError: ""
      } : item)
    });
    ctx.persistAndRender();
  } catch (error) {
    const state = ctx.getState();
    ctx.setState({
      ...state,
      assets: state.assets.map((item) => item.id === asset.id ? {
        ...item,
        historyBackfillStatus: "error",
        historyBackfillError: error instanceof Error ? error.message : "历史价格回补失败",
        marketSyncRegistrationStatus: "pending",
        marketSyncRegistrationAttemptedAt: new Date().toISOString(),
        marketSyncRegistrationError: error instanceof Error ? error.message : "行情目标登记失败"
      } : item)
    });
    ctx.persistAndRender();
  }
}

async function runAutomaticMarketPriceSync() {
  const cacheRun = await runMarketPriceSync({
    trigger: "auto",
    includeBenchmarks: true,
    autoFetch: false,
    includeHistory: true,
    preserveExistingOnFailure: true,
    loadingMessage: () => "正在读取已缓存的历史价格..."
  });
  if (cacheRun.state.status === "error") {
    return { state: cacheRun.state, attemptStatus: "error" };
  }

  const refreshRun = await runMarketPriceSync({
    trigger: "auto",
    includeBenchmarks: true,
    autoFetch: true,
    includeHistory: false,
    preserveExistingOnFailure: true,
    loadingMessage: () => "缓存已更新，正在后台检查最新价格..."
  });
  if (refreshRun.refreshFailed) {
    const state = preserveCacheAfterRefreshFailure(cacheRun.state, refreshRun.state);
    return { state, attemptStatus: "error" };
  }
  if (!refreshRun.hasFetchedChanges) {
    return { state: refreshRun.state, attemptStatus: "completed" };
  }

  const refreshedCacheRun = await runMarketPriceSync({
    trigger: "auto",
    includeBenchmarks: false,
    autoFetch: false,
    includeHistory: true,
    preserveExistingOnFailure: true,
    loadingMessage: () => "发现新价格，正在更新本地历史..."
  });
  if (refreshedCacheRun.state.status === "error") {
    const state = preserveCacheAfterRefreshFailure(refreshRun.state, refreshedCacheRun.state);
    return { state, attemptStatus: "error" };
  }
  return { state: refreshedCacheRun.state, attemptStatus: "completed" };
}

async function runMarketPriceSync({
  trigger,
  includeBenchmarks = false,
  autoFetch = true,
  includeHistory = true,
  preserveExistingOnFailure = false,
  loadingMessage
} = {}) {
  const symbols = symbolsForMarketSync();
  if (!symbols.length && !includeBenchmarks) {
    const state = { status: "empty", message: "当前没有可同步代码。请先填写资产代码，或在分析页选择收益对比基准。", results: [], syncedAt: "" };
    ctx.setMarketSyncState(state);
    renderMarketSyncResult();
    return emptyMarketSyncRun(state);
  }
  const requestedCount = symbols.length + (includeBenchmarks ? 9 : 0);
  ctx.setMarketSyncState({ status: "loading", message: loadingMessage?.(requestedCount) || `正在同步 ${requestedCount} 个代码价格...`, results: [], syncedAt: "" });
  renderMarketSyncResult();
  const batches = buildMarketSyncBatches(symbols, includeBenchmarks);
  const historyDays = marketHistoryWindowDays(earliestRecordedAssetDate(), todayIsoDate());
  const results = [];
  const failedBatches = [];
  const fetchPresentations = [];
  const fetchResults = [];
  let syncedAt = "";

  for (const [index, batch] of batches.entries()) {
    markMarketRegistrationPending(batch.symbols, "", new Date().toISOString());
    try {
      const response = await fetch(`${ctx.marketApiBaseUrl}/api/market-data/sync-daily`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(batch.symbols.length ? { symbols: batch.symbols } : {}),
          trigger,
          days: historyDays,
          includeBenchmarks: batch.includeBenchmarks,
          includeHistory,
          autoFetch
        })
      });
      if (!response.ok) throw new Error(await marketApiErrorMessage(response));
      const payload = await response.json();
      syncedAt = payload.syncedAt || syncedAt || new Date().toISOString();
      results.push(...decorateMarketSyncResults(payload.results || [], payload.fetch).map((result) => ({
        ...result,
        targetRegistrationAcknowledged: true
      })));
      fetchPresentations.push(marketFetchPresentation(payload.fetch));
      fetchResults.push(payload.fetch);
    } catch (error) {
      const message = error instanceof Error ? error.message : "无法连接行情 API";
      markMarketRegistrationPending(batch.symbols, message, new Date().toISOString());
      failedBatches.push({ index, symbols: batch.symbols, message });
      results.push(...batch.symbols.map((symbol) => ({
        symbol,
        status: "error",
        message,
        targetRegistrationAcknowledged: false
      })));
    }
  }

  if (results.length && failedBatches.length < batches.length) {
    syncedAt ||= new Date().toISOString();
    const applied = applyMarketSyncResults(results, syncedAt, { preserveExistingOnFailure });
    const acknowledgedSymbols = new Set(
      results
        .filter((result) => result.targetRegistrationAcknowledged)
        .map((result) => canonicalSyncSymbol(result.symbol))
        .filter(Boolean)
    );
    const unacknowledgedSymbols = symbols.filter((symbol) => !acknowledgedSymbols.has(canonicalSyncSymbol(symbol)));
    if (unacknowledgedSymbols.length) {
      markMarketRegistrationPending(
        unacknowledgedSymbols,
        "服务端未确认该代码的行情同步目标登记",
        syncedAt
      );
    }
    if (!preserveExistingOnFailure) {
      for (const failed of failedBatches) markOpenAssetsPriceError(failed.symbols, failed.message);
    }
    const sourceWarning = fetchPresentations.some((item) => item.hasWarning);
    const nextState = {
      status: failedBatches.length || sourceWarning || !(applied.appliedCount || applied.benchmarkSyncedCount) ? "warning" : "success",
      message: `${batches.length} 批中 ${batches.length - failedBatches.length} 批完成、${failedBatches.length} 批失败，${applied.updatedCount} 个资产价格发生变化、${applied.unchangedCount} 个资产价格未变化、${applied.benchmarkSyncedCount} 个分析基准已同步，${applied.missingCount} 个缺少缓存或同步失败。`,
      results,
      syncedAt
    };
    ctx.setMarketSyncState(nextState);
    ctx.persistAndRender();
    ctx.loadBenchmarkPerformance?.({ force: true });
    renderMarketSyncResult();
    return {
      state: nextState,
      fetchResults,
      failedBatches,
      hasFetchedChanges: fetchResults.some(marketFetchHasChanges),
      refreshFailed: failedBatches.length > 0 || fetchResults.some((fetchResult) => fetchResult?.status === "failed")
    };
  } else {
    const failureMessage = failedBatches.map((item) => `第 ${item.index + 1} 批：${item.message}`).join("；") || "无法连接行情 API";
    if (!preserveExistingOnFailure) markOpenAssetsPriceError(symbols, failureMessage);
    const nextState = {
      status: "error",
      message: `同步失败：${failureMessage}`,
      results,
      syncedAt: ""
    };
    ctx.setMarketSyncState(nextState);
    ctx.persistAndRender?.();
    renderMarketSyncResult();
    return {
      state: nextState,
      fetchResults,
      failedBatches,
      hasFetchedChanges: false,
      refreshFailed: true
    };
  }
}

export function buildMarketSyncBatches(symbols, includeBenchmarks = false, batchSize = marketSyncBatchSize) {
  const normalizedBatchSize = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : marketSyncBatchSize;
  const uniqueSymbols = [...new Set((Array.isArray(symbols) ? symbols : []).map(canonicalSyncSymbol).filter(Boolean))];
  if (!uniqueSymbols.length) return includeBenchmarks ? [{ symbols: [], includeBenchmarks: true }] : [];
  const batches = [];
  for (let index = 0; index < uniqueSymbols.length; index += normalizedBatchSize) {
    batches.push({
      symbols: uniqueSymbols.slice(index, index + normalizedBatchSize),
      includeBenchmarks: includeBenchmarks && index === 0
    });
  }
  return batches;
}

export function marketFetchPresentation(fetchResult) {
  const fetchRun = fetchResult?.run;
  const failureCount = Number(fetchRun?.failureCount || 0);
  const skippedCount = Number(fetchRun?.skippedCount || 0);
  if (fetchResult?.status === "failed") {
    return {
      hasWarning: true,
      message: `抓取失败，已尝试使用缓存：${fetchResult.message || "请查看 API 日志"}`
    };
  }
  if (fetchResult?.status === "covered") return { hasWarning: false, message: "行情缓存已覆盖当前请求区间" };
  if (failureCount && skippedCount) {
    return { hasWarning: true, message: `抓取完成，${failureCount} 个源失败、${skippedCount} 个代码暂无新日线` };
  }
  if (failureCount) return { hasWarning: true, message: `抓取完成但 ${failureCount} 个源失败` };
  if (skippedCount) return { hasWarning: true, message: `抓取完成，${skippedCount} 个代码暂无新日线` };
  if (!fetchResult) return { hasWarning: false, message: "已读取行情缓存" };
  return { hasWarning: false, message: "抓取完成" };
}

export function decorateMarketSyncResults(results, fetchResult) {
  const useCacheForAll = !fetchResult || ["covered", "failed"].includes(fetchResult.status);
  const cacheSymbols = new Set(
    (fetchResult?.run?.messages || [])
      .filter((item) => ["warn", "error"].includes(item?.level))
      .map((item) => canonicalSyncSymbol(item?.symbol))
      .filter(Boolean)
  );
  return results.map((result) => ({
    ...result,
    syncDisplayStatus: result.status === "synced" && (useCacheForAll || cacheSymbols.has(canonicalSyncSymbol(result.symbol)))
      ? "cached"
      : result.status
  }));
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

function applyMarketSyncResults(results, syncedAt, { preserveExistingOnFailure = false } = {}) {
  const state = ctx.getState();
  let appliedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let missingCount = 0;
  let benchmarkSyncedCount = 0;
  const benchmarkSymbols = new Set(benchmarkSymbolsForAnalysis().map(canonicalSyncSymbol));
  const bySymbol = new Map(
    results
      .filter((result) => result.status === "synced" && result.after?.currentPrice)
      .map((result) => [canonicalSyncSymbol(result.symbol), result])
  );
  for (const result of results) {
    if (result.status !== "synced") missingCount += 1;
  }
  state.assets = state.assets.map((asset) => {
    const symbol = canonicalSyncSymbol(syncSymbolForAsset(asset));
    const result = bySymbol.get(symbol);
    const acknowledged = results.some((item) =>
      item.targetRegistrationAcknowledged &&
      canonicalSyncSymbol(item.symbol) === symbol
    );
    const registrationFields = acknowledged ? {
      marketSyncRegistrationStatus: "registered",
      marketSyncRegistrationConfirmedAt: syncedAt,
      marketSyncRegistrationError: ""
    } : {};
    if (!result) {
      const missing = results.find((item) => canonicalSyncSymbol(item.symbol) === symbol && item.status !== "synced");
      if (!missing || preserveExistingOnFailure) return { ...asset, ...registrationFields };
      return {
        ...asset,
        ...registrationFields,
        priceStatus: "missing",
        priceError: missing.message || "未找到可用价格缓存",
        updatedAt: syncedAt || new Date().toISOString()
      };
    }
    appliedCount += 1;
    const refreshedDailyPrices = Array.isArray(result.history) && result.history.length && asset.purchaseDate
      ? buildUserAssetDailyPriceSnapshots({
          userId: "local-user",
          asset,
          history: result.history,
          dateFrom: asset.purchaseDate,
          dateTo: todayIsoDate()
        })
      : null;
    const changed = String(asset.currentPrice || "") !== String(result.after.currentPrice || "") ||
      String(asset.pricedAt || "") !== String(result.after.pricedAt || "") ||
      String(asset.priceAt || "") !== String(result.after.priceAt || "");
    if (changed) updatedCount += 1;
    else unchangedCount += 1;
    const matched = findAssetQuickMatch(symbol);
    return {
      ...asset,
      ...registrationFields,
      symbol: asset.symbol || symbol,
      market: asset.market || matched?.market || asset.market,
      type: asset.type || matched?.type || asset.type,
      currency: asset.currency || matched?.currency || asset.currency,
      previousPrice: result.after.previousPrice || asset.currentPrice || asset.previousPrice || asset.costPrice,
      currentPrice: result.after.currentPrice,
      pricedAt: result.after.pricedAt || asset.pricedAt,
      priceSource: result.after.priceSource || asset.priceSource,
      priceKind: result.after.priceKind || asset.priceKind || "",
      priceAt: result.after.priceAt || "",
      marketTimezone: result.after.marketTimezone || asset.marketTimezone || "",
      sourceFetchedAt: result.after.sourceFetchedAt || asset.sourceFetchedAt || "",
      priceStatus: "synced",
      priceError: "",
      dailyPrices: normalizeDailyPriceRows(refreshedDailyPrices?.rows || result.dailyPrices || asset.dailyPrices),
      dailyPriceStatus: refreshedDailyPrices?.status || result.dailyPriceStatus || asset.dailyPriceStatus || "",
      dailyPriceMissingDates: refreshedDailyPrices?.missingDates || (Array.isArray(result.dailyPriceMissingDates) ? result.dailyPriceMissingDates : asset.dailyPriceMissingDates || []),
      updatedAt: syncedAt || new Date().toISOString()
    };
  });
  for (const result of results) {
    if (result.status === "synced" && benchmarkSymbols.has(canonicalSyncSymbol(result.symbol))) {
      benchmarkSyncedCount += 1;
    }
  }
  return { appliedCount, updatedCount, unchangedCount, missingCount, benchmarkSyncedCount };
}

function runSingleMarketSync(work) {
  if (marketSyncInFlight) return marketSyncInFlight;
  const current = Promise.resolve().then(work);
  let wrapped;
  wrapped = current.finally(() => {
    if (marketSyncInFlight === wrapped) marketSyncInFlight = null;
  });
  marketSyncInFlight = wrapped;
  return wrapped;
}

function isAutomaticMarketSyncDue(autoSync, today, now = Date.now()) {
  if (autoSync.lastCompletedDate === today) return false;
  if (autoSync.lastAttemptedDate !== today) return true;
  const referenceAt = autoSync.attemptStatus === "error"
    ? autoSync.lastErrorAt || autoSync.lastAttemptedAt
    : autoSync.lastAttemptedAt;
  const referenceTime = Date.parse(referenceAt || "");
  if (!Number.isFinite(referenceTime)) return false;
  return now - referenceTime >= marketAutoSyncRetryCooldownMs;
}

function hasPendingMarketRegistrationRetry(now = Date.now()) {
  return ctx.getState().assets.some((asset) => {
    if (!syncSymbolForAsset(asset) || inferAssetMarket(asset) === "CASH") return false;
    if (String(asset.marketSyncRegistrationStatus || "").trim() === "registered") return false;
    const attemptedAt = Date.parse(asset.marketSyncRegistrationAttemptedAt || "");
    return !Number.isFinite(attemptedAt) || now - attemptedAt >= marketAutoSyncRetryCooldownMs;
  });
}

function markMarketRegistrationPending(symbols, message = "", attemptedAt = new Date().toISOString()) {
  const state = ctx.getState();
  const requested = new Set((symbols || []).map(canonicalSyncSymbol).filter(Boolean));
  state.assets = state.assets.map((asset) => {
    const symbol = canonicalSyncSymbol(syncSymbolForAsset(asset));
    if (!symbol || !requested.has(symbol) || asset.closed) return asset;
    if (String(asset.marketSyncRegistrationStatus || "").trim() === "registered") return asset;
    return {
      ...asset,
      marketSyncRegistrationStatus: "pending",
      marketSyncRegistrationAttemptedAt: attemptedAt,
      marketSyncRegistrationError: message
    };
  });
}

function marketFetchHasChanges(fetchResult) {
  if (!fetchResult || ["covered", "failed"].includes(fetchResult.status)) return false;
  return Number(fetchResult.run?.successCount || 0) > 0 ||
    (fetchResult.runs || []).some((run) => Number(run?.successCount || 0) > 0);
}

function preserveCacheAfterRefreshFailure(cacheState, refreshState) {
  const state = {
    ...cacheState,
    status: "warning",
    message: `已应用行情缓存；最新价格检查失败，可稍后自动重试或手动检查。${refreshState?.message ? ` ${refreshState.message}` : ""}`
  };
  ctx.setMarketSyncState(state);
  ctx.persistAndRender?.();
  renderMarketSyncResult();
  return state;
}

function emptyMarketSyncRun(state) {
  return {
    state,
    fetchResults: [],
    failedBatches: [],
    hasFetchedChanges: false,
    refreshFailed: false
  };
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

function earliestRecordedAssetDate() {
  return ctx.getState().assets
    .map((asset) => String(asset.purchaseDate || asset.buyDate || asset.acquiredAt || "").slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date))
    .sort()[0] || todayIsoDate();
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
  if (explicit) return normalizeCnListedFundInstrument({ ...asset, market: asset.market || inferAssetMarket(asset), symbol: explicit })?.symbol || explicit;
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

function canonicalSyncSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}
