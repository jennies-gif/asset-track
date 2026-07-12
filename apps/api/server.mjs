import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  calculateAttribution,
  calculatePortfolio,
  normalizeAsset,
  validateAsset
} from "../../src/domain/calculations.js";
import {
  benchmarkInstruments,
  buildDataTasks,
  defaultBenchmarkSyncSymbols,
  buildHistorySeries,
  inferUniverse,
  marketUniverses,
  securityWhitelist
} from "../../src/domain/marketData.js";
import { normalizeCnListedFundInstrument } from "../../src/domain/cnInstrumentClassification.js";
import {
  appendMarketDataRun,
  isMarketDataDatabaseEnabled,
  readInstrumentRegistryRows,
  readMarketDataRows,
  readUserAssetRows,
  readUserAssetDailyPriceRows,
  upsertInstrumentRegistryRows,
  upsertMarketDataBackfillTask,
  upsertUserAssetRow,
  upsertUserAssetDailyPriceRows
} from "../../src/server/marketDataDatabase.js";
import { buildUserAssetDailyPriceSnapshots } from "../../src/domain/userAssetDailyPrices.js";
import { missingMarketHistoryRanges } from "../../src/domain/marketHistoryCoverage.js";

const port = Number(process.env.API_PORT || process.env.PORT || 4180);
const host = process.env.API_HOST || process.env.HOST || "127.0.0.1";
const allowedOrigins = parseAllowedOrigins(process.env.API_ALLOWED_ORIGINS);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const marketStorageDir = path.resolve(repoRoot, process.env.MARKET_DATA_DIR || "storage/market-data");
const dailySyncHour = Number(process.env.MARKET_DAILY_SYNC_HOUR || "22");
const dailySyncMinute = Number(process.env.MARKET_DAILY_SYNC_MINUTE || "0");
const dailySyncEnabled = process.env.MARKET_DAILY_SYNC_ENABLED !== "false";
const privateAssetCloudSyncEnabled = process.env.PRIVATE_ASSET_CLOUD_SYNC_ENABLED === "true";
const privateAssetApiPaths = new Set([
  "/api/accounts",
  "/api/assets",
  "/api/positions",
  "/api/asset-prices/daily",
  "/api/market-data/tasks",
  "/api/market-data/tasks/backfill",
  "/api/attribution/runs",
  "/api/imports/preview",
  "/api/exports/backup.json"
]);
const syncDailyAllowedFields = new Set(["symbols", "trigger", "includeHistory", "includeBenchmarks", "autoFetch", "days"]);
const syncDailyAllowedTriggers = new Set(["manual", "auto", "asset_created"]);
const execFileAsync = promisify(execFile);
const demoUser = {
  id: "demo-user",
  email: "demo@asset-trail.local",
  displayName: "本地用户"
};

const state = {
  accounts: [
    { id: "account-long", userId: demoUser.id, name: "长期账户", baseCurrency: "CNY", accountType: "investment" },
    { id: "account-hk", userId: demoUser.id, name: "港股账户", baseCurrency: "HKD", accountType: "investment" },
    { id: "account-us", userId: demoUser.id, name: "美股账户", baseCurrency: "USD", accountType: "investment" }
  ],
  assets: [
    normalizeAsset({
      id: "asset-510300",
      name: "沪深300ETF",
      symbol: "510300",
      type: "ETF",
      account: "长期账户",
      currency: "CNY",
      quantity: "52000",
      costPrice: "3.70",
      previousPrice: "3.82",
      currentPrice: "3.95",
      previousFxRate: "0.1460",
      fxRate: "0.1460",
      fees: "18",
      taxes: "0",
      pricedAt: "2026-04-29",
      priceSource: "Tushare fund_daily 待接入"
    }),
    normalizeAsset({
      id: "asset-00700",
      name: "腾讯控股",
      symbol: "00700",
      type: "股票",
      account: "港股账户",
      currency: "HKD",
      quantity: "700",
      costPrice: "310.00",
      previousPrice: "322.00",
      currentPrice: "335.00",
      previousFxRate: "0.1275",
      fxRate: "0.1280",
      fees: "40",
      taxes: "12",
      pricedAt: "2026-04-29",
      priceSource: "Tushare hk_daily 待接入"
    }),
    normalizeAsset({
      id: "asset-qqq",
      name: "Invesco QQQ Trust",
      symbol: "QQQ",
      type: "ETF",
      account: "美股账户",
      currency: "USD",
      quantity: "90",
      costPrice: "420.00",
      previousPrice: "438.00",
      currentPrice: "452.00",
      previousFxRate: "1",
      fxRate: "1",
      dividends: "85",
      fees: "6",
      taxes: "12",
      pricedAt: "2026-04-29",
      priceSource: "EODHD 待接入"
    })
  ],
  auditLogs: []
};

const server = http.createServer(async (request, response) => {
  response.req = request;
  const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

  try {
    if (request.method === "OPTIONS") return sendNoContent(response);
    if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, { ok: true });
    if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, response);
    if (request.method === "POST" && url.pathname === "/api/auth/logout") return logout(response);
    if (privateAssetApiPaths.has(url.pathname) && !privateAssetCloudSyncEnabled) {
      return sendError(response, 403, "private_asset_api_disabled", "当前种子版仅在浏览器本地保存私人资产数据，私人资产 API 未启用");
    }
    if (request.method === "GET" && url.pathname === "/api/accounts") return listAccounts(response);
    if (request.method === "POST" && url.pathname === "/api/accounts") return createAccount(request, response);
    if (request.method === "GET" && url.pathname === "/api/assets") return listAssets(response);
    if (request.method === "POST" && url.pathname === "/api/assets") return createAsset(request, response);
    if (request.method === "GET" && url.pathname === "/api/instruments/search") return searchInstruments(url, response);
    if (request.method === "GET" && url.pathname === "/api/instruments/lookup") return lookupInstrumentWithLatestPrice(url, response);
    if (request.method === "GET" && url.pathname === "/api/positions") return listPositions(url, response);
    if (request.method === "GET" && url.pathname === "/api/market-data/history") return getMarketHistory(url, response);
    if (request.method === "GET" && url.pathname === "/api/asset-prices/daily") return getAssetDailyPrices(url, response);
    if (request.method === "GET" && url.pathname === "/api/market-data/fx-rates") return getFxRates(url, response);
    if (request.method === "POST" && url.pathname === "/api/market-data/fetch-recent") return fetchRecentMarketData(request, response);
    if (request.method === "POST" && url.pathname === "/api/market-data/sync-daily") return syncDailyMarketData(request, response);
    if (request.method === "GET" && url.pathname === "/api/market-data/tasks") return listMarketTasks(response);
    if (request.method === "POST" && url.pathname === "/api/market-data/tasks/backfill") return createBackfillTask(request, response);
    if (request.method === "POST" && url.pathname === "/api/attribution/runs") return createAttributionRun(request, response);
    if (request.method === "POST" && url.pathname === "/api/imports/preview") return previewImport(request, response);
    if (request.method === "GET" && url.pathname === "/api/exports/backup.json") return exportBackup(response);
    return sendError(response, 404, "not_found", "接口不存在");
  } catch (error) {
    return sendError(response, 500, "internal_error", error instanceof Error ? error.message : "服务器错误");
  }
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Asset Trail API running at http://${displayHost}:${port}`);
  scheduleDailyMarketSync();
});

async function login(request, response) {
  const body = await readJson(request);
  const email = String(body.email || "").trim();
  if (!email) return sendError(response, 400, "validation_error", "邮箱不能为空", { email: "邮箱不能为空" });
  state.auditLogs.push(audit("login", "user", demoUser.id, { email }));
  return sendJson(response, { user: { ...demoUser, email } });
}

function logout(response) {
  state.auditLogs.push(audit("logout", "user", demoUser.id));
  return sendJson(response, { ok: true });
}

function listAccounts(response) {
  const portfolio = calculatePortfolio(state.assets.filter((asset) => !asset.closed));
  return sendJson(response, { accounts: state.accounts, totals: stringifyBigInts(portfolio.totals) });
}

async function createAccount(request, response) {
  const body = await readJson(request);
  const name = String(body.name || "").trim();
  const baseCurrency = String(body.baseCurrency || "CNY").trim().toUpperCase();
  if (!name) return sendError(response, 400, "validation_error", "账户名称不能为空", { name: "账户名称不能为空" });
  if (state.accounts.some((account) => account.name === name)) {
    return sendError(response, 409, "duplicate_account", "账户名称已存在", { name: "账户名称已存在" });
  }
  const account = {
    id: `account-${Date.now()}`,
    userId: demoUser.id,
    name,
    baseCurrency,
    accountType: body.accountType || "investment"
  };
  state.accounts.push(account);
  state.auditLogs.push(audit("create", "account", account.id, account));
  return sendJson(response, { account }, 201);
}

async function listAssets(response) {
  if (!privateAssetCloudSyncEnabled) {
    return sendError(response, 403, "private_asset_cloud_sync_disabled", "当前种子版默认本地保存私人资产数据，未启用资产云同步");
  }
  const assets = isMarketDataDatabaseEnabled()
    ? await readUserAssetRows({ userId: demoUser.id })
    : state.assets;
  return sendJson(response, { assets });
}

async function createAsset(request, response) {
  if (!privateAssetCloudSyncEnabled) {
    return sendError(response, 403, "private_asset_cloud_sync_disabled", "当前种子版默认本地保存私人资产数据，未启用资产云同步");
  }
  const body = await readJson(request);
  const asset = normalizeAsset(body.asset || body);
  const error = validateAsset(asset);
  if (error) return sendError(response, 400, "validation_error", "资产信息不完整", { asset: error });

  const duplicateIndex = state.assets.findIndex((item) => item.id === asset.id);
  if (duplicateIndex >= 0) {
    state.assets[duplicateIndex] = { ...state.assets[duplicateIndex], ...asset, updatedAt: new Date().toISOString() };
  } else {
    state.assets.unshift(asset);
  }

  if (isMarketDataDatabaseEnabled()) await upsertUserAssetRow({ ...asset, userId: demoUser.id });
  const backfillTask = await enqueueAssetBackfillTask(asset, "asset_created");
  state.auditLogs.push(audit("create", "asset", asset.id, { asset, backfillTask }));
  return sendJson(response, { asset, backfillTask }, 201);
}

async function searchInstruments(url, response) {
  const query = normalizeQuery(url.searchParams.get("query"));
  if (!query) return sendJson(response, { instruments: [], universes: marketUniverses });
  const matches = await searchInstrumentRepository(query);
  return sendJson(response, { instruments: matches.slice(0, 20), universes: marketUniverses });
}

async function lookupInstrumentWithLatestPrice(url, response) {
  const unexpectedFields = [...url.searchParams.keys()].filter((field) => field !== "query");
  if (unexpectedFields.length) {
    return sendError(response, 400, "request_field_not_allowed", "资产查询只接受公共代码或名称", {
      fields: `不允许字段：${unexpectedFields.join(", ")}`
    });
  }
  const rawQuery = String(url.searchParams.get("query") || "").trim();
  const query = normalizeQuery(rawQuery);
  if (!query) return sendError(response, 400, "validation_error", "资产代码或名称不能为空", { query: "资产代码或名称不能为空" });

  let instrument = (await searchInstrumentRepository(query))[0] || null;
  let addedToRegistry = false;
  if (!instrument) {
    const inferred = inferInstrumentFromSymbol(rawQuery);
    if (!inferred) return sendJson(response, { instrument: null, price: null, addedToRegistry: false, status: "not_found" });
    instrument = await upsertStoredInstrumentRegistry({
      ...inferred,
      source: "录入时按代码搜索发现",
      status: "active",
      marketDataSupported: true
    });
    addedToRegistry = true;
  }

  const syncAsset = normalizeAsset({
    id: `draft-${instrument.market || "UNKNOWN"}-${instrument.symbol}`,
    name: instrument.name || instrument.symbol,
    symbol: instrument.symbol,
    type: instrument.type || "股票",
    market: instrument.market,
    account: "录入草稿",
    currency: instrument.currency || "USD",
    quantity: "1",
    costPrice: "0",
    currentPrice: "0",
    fxRate: instrument.currency === "HKD" ? "0.1280" : instrument.currency === "CNY" ? "0.1460" : "1"
  });
  const requestedPurchaseDate = normalizeDateParam(url.searchParams.get("purchaseDate")) || todayIsoDate();
  const cachedHistory = await readStoredMarketHistory(syncAsset);
  const cachedPurchasePrice = cachedPurchasePriceForDate(cachedHistory, requestedPurchaseDate);
  if (cachedPurchasePrice) {
    return sendJson(response, {
      instrument,
      price: marketPriceFromHistory(cachedHistory),
      purchasePrice: cachedPurchasePrice,
      priceLookup: { source: "cache", requestedDate: requestedPurchaseDate },
      addedToRegistry,
      status: "synced",
      message: "已读取本地行情缓存"
    });
  }
  let syncResult = null;
  try {
    syncResult = await runDailyMarketDataSync({
      symbols: [instrument.symbol],
      assets: [syncAsset],
      dateFrom: requestedPurchaseDate,
      dateTo: todayIsoDate(),
      includeBenchmarks: false
    }, "draft_lookup");
  } catch (error) {
    const message = errorMessage(error, "抓取失败");
    return sendJson(response, { instrument, price: null, addedToRegistry, status: "fetch_failed", message }, 202);
  }

  const result = (syncResult.results || []).find((item) => String(item.symbol || "").toUpperCase() === String(instrument.symbol || "").toUpperCase());
  const price = result?.status === "synced" ? result.after : null;
  const refreshedHistory = await readStoredMarketHistory(syncAsset);
  const purchasePrice = purchasePriceAtOrBefore(refreshedHistory, requestedPurchaseDate);
  return sendJson(response, {
    instrument,
    price,
    purchasePrice,
    priceLookup: { source: purchasePrice ? "fetched" : "missing", requestedDate: requestedPurchaseDate },
    addedToRegistry,
    status: purchasePrice ? "synced" : price ? "partial" : "missing",
    message: result?.message || "",
    fetch: syncResult.fetch?.run ? {
      id: syncResult.fetch.run.id,
      status: syncResult.fetch.run.status,
      failureCount: syncResult.fetch.run.failureCount
    } : null
  }, 202);
}

function cachedPurchasePriceForDate(history, requestedDate) {
  const exact = history.find((point) => point.date === requestedDate);
  if (exact) return purchasePriceFromPoint(exact, requestedDate);
  const weekday = new Date(`${requestedDate}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6 ? purchasePriceAtOrBefore(history, requestedDate) : null;
}

function purchasePriceAtOrBefore(history, requestedDate) {
  const matched = history.filter((point) => point.date <= requestedDate).at(-1);
  if (!matched) return null;
  return purchasePriceFromPoint(matched, requestedDate);
}

function purchasePriceFromPoint(matched, requestedDate) {
  return {
    requestedDate,
    priceDate: matched.date,
    price: decimalString(matched.close),
    priceSource: matched.source || "",
    sourceFetchedAt: matched.sourceFetchedAt || "",
    qualityStatus: matched.qualityStatus || "ok"
  };
}

function marketPriceFromHistory(history) {
  const latest = latestUsableHistoryPoint(history);
  if (!latest) return null;
  const previous = previousUsableHistoryPoint(history, latest.date);
  return {
    currentPrice: decimalString(latest.close),
    previousPrice: previous ? decimalString(previous.close) : decimalString(latest.close),
    pricedAt: latest.date,
    priceSource: latest.source || "",
    priceStatus: "synced",
    sourceFetchedAt: latest.sourceFetchedAt || ""
  };
}

function listPositions(url, response) {
  const account = String(url.searchParams.get("account") || "");
  const assets = state.assets.filter((asset) => !asset.closed && (!account || asset.account === account));
  const portfolio = calculatePortfolio(assets);
  return sendJson(response, {
    positions: portfolio.positions.map((position) => stringifyBigInts(position)),
    totals: stringifyBigInts(portfolio.totals)
  });
}

async function getMarketHistory(url, response) {
  const symbol = String(url.searchParams.get("symbol") || "");
  const asset = state.assets.find((item) => item.symbol === symbol) || await assetFromSymbol(symbol);
  if (!asset) return sendError(response, 404, "instrument_not_found", "未找到资产代码");
  const stored = await readStoredMarketHistory(asset);
  if (stored.length) {
    return sendJson(response, {
      instrument: {
        symbol: asset.symbol,
        name: asset.name,
        universe: inferUniverse(asset)
      },
      points: stored,
      source: isMarketDataDatabaseEnabled() ? "postgres-market-data" : "storage/market-data"
    });
  }
  if (isBenchmarkSymbol(symbol)) {
    return sendJson(response, {
      instrument: {
        symbol: asset.symbol,
        name: asset.name,
        universe: inferUniverse(asset)
      },
      points: [],
      source: isMarketDataDatabaseEnabled() ? "postgres-market-data" : "storage/market-data",
      warning: "benchmark_history_not_cached"
    });
  }
  return sendJson(response, {
    instrument: {
      symbol: asset.symbol,
      name: asset.name,
      universe: inferUniverse(asset)
    },
    points: buildHistorySeries(asset)
  });
}

function isBenchmarkSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  return benchmarkInstruments.some((benchmark) => benchmark.symbol.toUpperCase() === normalized);
}

async function getFxRates(url, response) {
  const baseCurrency = String(url.searchParams.get("base") || "").trim().toUpperCase();
  const quoteCurrency = String(url.searchParams.get("quote") || "").trim().toUpperCase();
  const rows = await readJsonArray(path.join(marketStorageDir, "fx-rates.json"));
  const rates = rows
    .filter((row) => !baseCurrency || row.baseCurrency === baseCurrency)
    .filter((row) => !quoteCurrency || row.quoteCurrency === quoteCurrency)
    .sort((left, right) => String(left.rateDate).localeCompare(String(right.rateDate)));
  return sendJson(response, {
    rates,
    source: "storage/market-data"
  });
}

function listMarketTasks(response) {
  return sendJson(response, { tasks: buildDataTasks(state.assets) });
}

async function fetchRecentMarketData(request, response) {
  const body = await readJson(request);
  try {
    const fetchResult = await fetchRecentMarketDataRun(body);
    state.auditLogs.push(audit("fetch_recent_market_data", "market_data", fetchResult.run.id, fetchResult));
    return sendJson(response, fetchResult, 202);
  } catch (error) {
    const message = errorMessage(error, "抓取失败");
    console.error(`[market-data] fetch_recent failed: ${message}`);
    return sendError(response, 502, "market_data_fetch_failed", message);
  }
}

async function syncDailyMarketData(request, response) {
  const validation = validateSyncDailyRequest(await readJson(request));
  if (!validation.ok) return sendError(response, 400, validation.code, validation.message, validation.fieldErrors);
  try {
    const result = await runDailyMarketDataSync(validation.body, validation.body.trigger || "manual", { publicOnly: true });
    return sendJson(response, result, 202);
  } catch (error) {
    const message = errorMessage(error, "同步失败");
    console.error(`[market-data] sync_daily failed: ${message}`);
    return sendError(response, 502, "market_data_sync_failed", message);
  }
}

async function runDailyMarketDataSync(body = {}, trigger = "manual", options = {}) {
  const requestedSymbols = parseSymbols(body.symbols || body.symbol).map(canonicalMarketSymbol);
  const clientAssets = !options.publicOnly && Array.isArray(body.assets) ? body.assets.map(normalizeAsset).filter((asset) => asset.symbol) : [];
  const assetSource = options.publicOnly ? [] : clientAssets.length ? clientAssets : state.assets;
  const benchmarkSymbols = body.includeBenchmarks
    ? defaultBenchmarkSyncSymbols.map((symbol) => symbol.toUpperCase())
    : [];
  const symbolsToSync = requestedSymbols.length
    ? [...new Set([...requestedSymbols, ...benchmarkSymbols])]
    : [];
  const externalSymbolsToSync = [...new Set([...symbolsToSync, ...benchmarkSymbols])];
  const stateCandidates = assetSource.filter((asset) => {
    if (!asset.symbol) return false;
    if (symbolsToSync.length && !symbolsToSync.includes(canonicalMarketSymbol(asset.symbol))) return false;
    return true;
  });
  const stateSymbols = new Set(stateCandidates.map((asset) => canonicalMarketSymbol(asset.symbol)));
  const requestedExternalCandidates = externalSymbolsToSync.length
    ? await Promise.all(
        externalSymbolsToSync
          .filter((symbol) => !stateSymbols.has(symbol))
          .map(async (symbol) => {
            const asset = await assetFromSymbol(symbol);
            return asset ? { ...asset, externalOnly: true } : null;
          })
      )
    : [];
  const candidates = dedupeInstruments([...stateCandidates, ...requestedExternalCandidates.filter(Boolean)]);
  const syncedAt = new Date().toISOString();
  const results = [];
  let fetchResult = null;
  let dailyPriceRowsUpserted = 0;
  let dailyPriceGapCount = 0;
  const historyDateTo = normalizeDateParam(body.dateTo) || (body.autoFetch === false ? "" : todayIsoDate());
  const fallbackHistoryDays = Math.max(1, Number(body.days || 7));
  const historyDateFrom = normalizeDateParam(body.dateFrom) ||
    (body.autoFetch === false
      ? earliestAssetHistoryDate(stateCandidates) || addDays(historyDateTo || todayIsoDate(), -fallbackHistoryDays + 1)
      : addDays(historyDateTo || todayIsoDate(), -fallbackHistoryDays + 1));

  if (body.autoFetch !== false) {
    try {
      const requestedTo = historyDateTo || todayIsoDate();
      const groupedMissingRanges = new Map();
      for (const asset of candidates) {
        const history = await readStoredMarketHistory(asset);
        const requestedFrom = normalizeDateParam(body.dateFrom) || assetHistoryStartDate(asset, "") || historyDateFrom;
        for (const range of missingMarketHistoryRanges(history, requestedFrom, requestedTo)) {
          const key = `${range.dateFrom}:${range.dateTo}`;
          const group = groupedMissingRanges.get(key) || { ...range, symbols: [] };
          group.symbols.push(asset.symbol);
          groupedMissingRanges.set(key, group);
        }
      }
      const fetchRuns = [];
      for (const range of groupedMissingRanges.values()) {
        fetchRuns.push(await fetchRecentMarketDataRun({
          ...body,
          symbols: [...new Set(range.symbols)],
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          days: body.days || 1
        }, { persistRun: false }));
      }
      fetchResult = summarizeCoverageFetchRuns(fetchRuns, candidates);
      state.auditLogs.push(audit("auto_fetch_before_sync_daily_market_data", "market_data", fetchResult.run.id, fetchResult));
    } catch (error) {
      const message = errorMessage(error, "抓取失败");
      fetchResult = {
        status: "failed",
        message,
        run: {
          id: `run-fetch-failed-${Date.now()}`,
          status: "failed",
          failureCount: candidates.length || requestedSymbols.length || 1,
          messages: [{ level: "error", message }]
        }
      };
      console.error(`[market-data] auto_fetch failed, falling back to cache: ${message}`);
      state.auditLogs.push(audit("auto_fetch_before_sync_daily_market_data_failed", "market_data", fetchResult.run.id, fetchResult));
    }
  }

  for (const asset of candidates) {
    const history = await readStoredMarketHistory(asset);
    const latest = latestUsableHistoryPoint(history);
    if (!latest) {
      asset.priceStatus = "pending";
      results.push({
        symbol: asset.symbol,
        name: asset.name,
        status: "missing",
        message: "未找到可用价格缓存"
      });
      continue;
    }

    const previous = previousUsableHistoryPoint(history, latest.date);
    const before = {
      currentPrice: asset.currentPrice,
      previousPrice: asset.previousPrice,
      pricedAt: asset.pricedAt,
      priceSource: asset.priceSource
    };
    if (!asset.externalOnly) {
      asset.previousPrice = previous ? decimalString(previous.close) : asset.currentPrice || asset.previousPrice || asset.costPrice;
      asset.currentPrice = decimalString(latest.close);
      asset.pricedAt = latest.date;
      asset.priceSource = latest.source;
      asset.priceStatus = "synced";
      asset.updatedAt = syncedAt;
      const dailyPrices = buildUserAssetDailyPriceSnapshots({
        userId: demoUser.id,
        asset,
        history,
        dateFrom: userAssetDailySyncStartDate(asset, body.dateFrom, historyDateTo, body.autoFetch),
        dateTo: historyDateTo
      });
      dailyPriceGapCount += dailyPrices.missingDates.length;
      dailyPriceRowsUpserted += await persistUserAssetDailyPrices(dailyPrices.rows);
      asset.dailyPrices = dailyPrices.rows;
      asset.dailyPriceStatus = dailyPrices.status;
      asset.dailyPriceMissingDates = dailyPrices.missingDates;
    }
    results.push({
      symbol: asset.symbol,
      name: asset.name,
      status: "synced",
      before,
      after: {
        currentPrice: decimalString(latest.close),
        previousPrice: previous ? decimalString(previous.close) : asset.currentPrice || asset.previousPrice || asset.costPrice,
        pricedAt: latest.date,
        priceSource: latest.source,
        priceStatus: "synced",
        sourceFetchedAt: latest.sourceFetchedAt
      },
      dailyPrices: asset.externalOnly ? [] : asset.dailyPrices || [],
      history: body.includeHistory
        ? history
            .filter((point) => !normalizeDateParam(body.dateFrom) || point.date >= normalizeDateParam(body.dateFrom))
            .filter((point) => !historyDateTo || point.date <= historyDateTo)
        : undefined,
      dailyPriceStatus: asset.externalOnly ? "" : asset.dailyPriceStatus || "",
      dailyPriceMissingDates: asset.externalOnly ? [] : asset.dailyPriceMissingDates || []
    });
  }

  const summary = {
    requestedCount: candidates.length,
    syncedCount: results.filter((item) => item.status === "synced").length,
    missingCount: results.filter((item) => item.status === "missing").length,
    skippedCount: Math.max(0, externalSymbolsToSync.length - candidates.length),
    dailyPriceRowsUpserted,
    dailyPriceGapCount
  };
  const payload = { trigger, syncedAt, summary, results, fetch: fetchResult };
  state.auditLogs.push(audit("sync_daily_market_data", "market_data", `sync-${Date.now()}`, payload));
  await appendSyncDailyRun(payload);
  return payload;
}

function summarizeCoverageFetchRuns(fetchRuns, candidates) {
  if (!fetchRuns.length) {
    return {
      status: "covered",
      message: "公共历史行情已覆盖请求区间，无需重复抓取",
      runs: [],
      run: {
        id: `run-fetch-covered-${Date.now()}`,
        status: "covered",
        successCount: 0,
        skippedCount: candidates.length,
        failureCount: 0,
        messages: []
      }
    };
  }
  const runs = fetchRuns.map((item) => item.run).filter(Boolean);
  const failureCount = runs.reduce((total, run) => total + Number(run.failureCount || 0), 0);
  return {
    status: failureCount ? "completed_with_errors" : "completed",
    message: `已按 ${runs.length} 个缺失区间增量抓取公共历史行情`,
    runs,
    run: {
      id: `run-fetch-coverage-${Date.now()}`,
      status: failureCount ? "completed_with_errors" : "completed",
      successCount: runs.reduce((total, run) => total + Number(run.successCount || 0), 0),
      skippedCount: runs.reduce((total, run) => total + Number(run.skippedCount || 0), 0),
      failureCount,
      messages: runs.flatMap((run) => run.messages || [])
    }
  };
}

async function appendSyncDailyRun(payload) {
  if (!isMarketDataDatabaseEnabled()) return;
  try {
    await appendMarketDataRun({
      id: `run-sync-daily-${Date.now()}`,
      command: `sync-daily:${payload.trigger}`,
      status: payload.summary.missingCount ? "completed_with_warnings" : "completed",
      startedAt: payload.syncedAt,
      finishedAt: new Date().toISOString(),
      requestedSymbols: [],
      successCount: payload.summary.syncedCount,
      skippedCount: payload.summary.skippedCount,
      failureCount: payload.summary.missingCount,
      summary: payload.summary
    });
  } catch (error) {
    const message = errorMessage(error, "记录同步运行失败");
    console.error(`[market-data] append sync_daily run failed: ${message}`);
  }
}

async function getAssetDailyPrices(url, response) {
  const assetId = String(url.searchParams.get("assetId") || "").trim();
  const symbol = String(url.searchParams.get("symbol") || "").trim().toUpperCase();
  const dateFrom = normalizeDateParam(url.searchParams.get("dateFrom"));
  const dateTo = normalizeDateParam(url.searchParams.get("dateTo"));
  const asset = state.assets.find((item) => (
    (assetId && item.id === assetId) ||
    (symbol && String(item.symbol || "").toUpperCase() === symbol)
  ));
  if (!asset) return sendError(response, 404, "asset_not_found", "未找到用户资产");

  const stored = await readPersistedUserAssetDailyPrices({ userId: demoUser.id, assetId: asset.id, dateFrom, dateTo });
  const history = await readStoredMarketHistory(asset);
  const dailyPrices = buildUserAssetDailyPriceSnapshots({ userId: demoUser.id, asset, history, dateFrom, dateTo });
  if (dailyPrices.rows.length) {
    const changedCount = await persistUserAssetDailyPrices(dailyPrices.rows);
    return sendJson(response, {
      userId: demoUser.id,
      assetId: asset.id,
      symbol: asset.symbol,
      points: dailyPrices.rows,
      status: dailyPrices.status,
      changedCount,
      missingDates: dailyPrices.missingDates,
      source: isMarketDataDatabaseEnabled() ? "postgres-user-asset-daily-prices" : "storage/user-asset-prices"
    });
  }

  if (stored.length) {
    return sendJson(response, {
      userId: demoUser.id,
      assetId: asset.id,
      symbol: asset.symbol,
      points: stored,
      source: isMarketDataDatabaseEnabled() ? "postgres-user-asset-daily-prices" : "storage/user-asset-prices"
    });
  }

  const changedCount = await persistUserAssetDailyPrices(dailyPrices.rows);
  return sendJson(response, {
    userId: demoUser.id,
    assetId: asset.id,
    symbol: asset.symbol,
    points: dailyPrices.rows,
    status: dailyPrices.status,
    changedCount,
    missingDates: dailyPrices.missingDates,
    source: isMarketDataDatabaseEnabled() ? "postgres-user-asset-daily-prices" : "storage/user-asset-prices"
  });
}

function scheduleDailyMarketSync() {
  if (!dailySyncEnabled) {
    console.log("Daily market data sync disabled by MARKET_DAILY_SYNC_ENABLED=false");
    return;
  }
  const nextRunAt = nextDailySyncAt(new Date(), dailySyncHour, dailySyncMinute);
  const delayMs = nextRunAt.getTime() - Date.now();
  console.log(`Next daily market data sync scheduled at ${nextRunAt.toLocaleString()} local time`);
  setTimeout(async () => {
    try {
      const result = await runDailyMarketDataSync(
        { includeBenchmarks: true },
        "scheduled",
        { publicOnly: !privateAssetCloudSyncEnabled }
      );
      console.log(
        `Daily market data sync finished: ${result.summary.syncedCount} synced, ${result.summary.missingCount} missing`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.auditLogs.push(audit("scheduled_market_data_sync_failed", "market_data", `sync-${Date.now()}`, { message }));
      console.error(`Daily market data sync failed: ${message}`);
    } finally {
      scheduleDailyMarketSync();
    }
  }, delayMs);
}

function nextDailySyncAt(now, hour, minute) {
  const safeHour = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 22;
  const safeMinute = Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : 0;
  const next = new Date(now);
  next.setHours(safeHour, safeMinute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

async function fetchRecentMarketDataRun(body, options = {}) {
  const requestedSymbols = parseSymbols(body.symbols || body.symbol);
  const stateSymbols = state.assets
    .filter((asset) => !asset.closed && asset.symbol)
    .map((asset) => asset.symbol.toUpperCase());
  const symbols = [...new Set((requestedSymbols.length ? requestedSymbols : stateSymbols).filter(Boolean))];
  if (!symbols.length) {
    throw new Error("没有可抓取的资产代码");
  }

  const dateTo = normalizeDateParam(body.dateTo) || todayIsoDate();
  const days = Math.max(1, Number(body.days || 7));
  const dateFrom = normalizeDateParam(body.dateFrom) || addDays(dateTo, -days + 1);
  const args = [
    "scripts/market-data/fetch-market-data.mjs",
    "backfill",
    `--from=${dateFrom}`,
    `--to=${dateTo}`,
    `--symbols=${symbols.join(",")}`,
    "--fx=false",
    `--persist-run=${options.persistRun === false ? "false" : "true"}`
  ];
  const { stdout } = await execFileAsync(process.execPath, args, {
    cwd: repoRoot,
    env: { ...process.env, MARKET_DATA_DIR: marketStorageDir },
    maxBuffer: 20 * 1024 * 1024
  });
  const run = JSON.parse(stdout);
  return {
    dateFrom,
    dateTo,
    symbols,
    run
  };
}

function earliestAssetHistoryDate(assets) {
  return assets
    .map((asset) => normalizeDateParam(asset.purchaseDate || asset.buyDate || asset.acquiredAt))
    .filter(Boolean)
    .sort()[0] || "";
}

function assetHistoryStartDate(asset, explicitDateFrom) {
  return normalizeDateParam(explicitDateFrom) || normalizeDateParam(asset.purchaseDate || asset.buyDate || asset.acquiredAt) || "";
}

function userAssetDailySyncStartDate(asset, explicitDateFrom, latestDate, autoFetch) {
  const requestedDateFrom = normalizeDateParam(explicitDateFrom);
  if (requestedDateFrom) return requestedDateFrom;
  if (autoFetch === false) return assetHistoryStartDate(asset, "");
  return normalizeDateParam(latestDate) || todayIsoDate();
}

async function createBackfillTask(request, response) {
  const body = await readJson(request);
  let task;
  try {
    task = await enqueueBackfillTask({
      assetId: body.assetId || body.instrumentId,
      symbol: body.symbol,
      assetName: body.assetName || body.name,
      account: body.account,
      dateFrom: body.dateFrom || body.startDate,
      dateTo: body.dateTo || body.endDate,
      trigger: body.trigger || body.reason || "asset_created"
    });
  } catch (error) {
    const details = parseBackfillTaskError(error);
    return sendError(response, details.status, details.code, details.message, details.fieldErrors);
  }
  return sendJson(response, { task }, 202);
}

async function enqueueAssetBackfillTask(asset, trigger) {
  if (!asset.symbol || !normalizeDateParam(asset.purchaseDate)) return null;
  try {
    return await enqueueBackfillTask({
      assetId: asset.id,
      symbol: asset.symbol,
      assetName: asset.name,
      account: asset.account,
      dateFrom: asset.purchaseDate,
      dateTo: todayIsoDate(),
      trigger
    });
  } catch (error) {
    const message = errorMessage(error, "创建历史回补任务失败");
    state.auditLogs.push(audit("create_backfill_task_failed", "asset", asset.id, { message, symbol: asset.symbol }));
    return {
      status: "failed",
      message
    };
  }
}

async function enqueueBackfillTask(input) {
  const symbol = String(input.symbol || "").trim().toUpperCase();
  const assetId = String(input.assetId || `instrument-${symbol}`).trim();
  const dateFrom = normalizeDateParam(input.dateFrom);
  const dateTo = normalizeDateParam(input.dateTo) || todayIsoDate();
  if (!symbol) throw backfillTaskError(400, "validation_error", "资产代码不能为空", { symbol: "资产代码不能为空" });
  if (!dateFrom) throw backfillTaskError(400, "validation_error", "历史回补开始日期不能为空", { dateFrom: "请传入 YYYY-MM-DD 格式的 dateFrom" });
  if (dateTo < dateFrom) throw backfillTaskError(400, "validation_error", "历史回补结束日期不能早于开始日期", { dateTo: "dateTo 必须大于或等于 dateFrom" });
  const security = await findInstrument(symbol);
  if (!security) throw backfillTaskError(404, "instrument_not_found", "资源库中未找到该资产");
  const market = security.market || inferMarket(security);
  const task = {
    id: stableBackfillTaskId({
      userId: demoUser.id,
      assetId,
      symbol: security.symbol,
      market,
      dateFrom,
      dateTo
    }),
    userId: demoUser.id,
    assetId,
    account: String(input.account || "").trim(),
    symbol: security.symbol,
    market,
    currency: security.currency || "USD",
    assetName: String(input.assetName || security.name || security.symbol).trim(),
    universeKey: security.universe,
    taskType: "backfill",
    status: "pending",
    trigger: String(input.trigger || "asset_created").trim(),
    source: security.source || inferUniverse({ symbol })?.source || "授权数据源待配置",
    dateFrom,
    dateTo,
    startDate: dateFrom,
    endDate: dateTo,
    requestedAt: new Date().toISOString(),
    retryCount: 0
  };
  if (isMarketDataDatabaseEnabled()) await upsertMarketDataBackfillTask(task);
  state.auditLogs.push(audit("create_backfill_task", "market_data_task", task.id, task));
  return task;
}

function backfillTaskError(status, code, message, fieldErrors = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.fieldErrors = fieldErrors;
  return error;
}

function parseBackfillTaskError(error) {
  return {
    status: error?.status || 500,
    code: error?.code || "internal_error",
    message: errorMessage(error, "创建历史回补任务失败"),
    fieldErrors: error?.fieldErrors || {}
  };
}

async function createAttributionRun(request, response) {
  const body = await readJson(request);
  const account = String(body.account || "");
  const assets = state.assets.filter((asset) => !asset.closed && (!account || asset.account === account));
  const attribution = calculateAttribution(assets);
  return sendJson(response, {
    run: {
      id: `attr-${Date.now()}`,
      account: account || "all",
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      ...stringifyBigInts(attribution)
    }
  }, 201);
}

async function previewImport(request, response) {
  const body = await readJson(request);
  const rows = Array.isArray(body.assets) ? body.assets : [];
  const seen = new Set();
  const previewRows = rows.map((row, index) => {
    const asset = normalizeAsset(row);
    const error = validateAsset(asset);
    const duplicateKey = `${asset.account}:${asset.symbol || asset.name}:${asset.purchaseDate || ""}`;
    const duplicate = seen.has(duplicateKey);
    seen.add(duplicateKey);
    return {
      rowNumber: index + 1,
      status: error ? "error" : duplicate ? "duplicate" : "valid",
      errorMessage: error || (duplicate ? "疑似重复资产" : ""),
      normalizedPayload: asset
    };
  });
  return sendJson(response, {
    batchId: `import-${Date.now()}`,
    rowCount: previewRows.length,
    validCount: previewRows.filter((row) => row.status === "valid").length,
    duplicateCount: previewRows.filter((row) => row.status === "duplicate").length,
    errorCount: previewRows.filter((row) => row.status === "error").length,
    rows: previewRows
  });
}

function exportBackup(response) {
  return sendJson(response, {
    exportedAt: new Date().toISOString(),
    user: demoUser,
    accounts: state.accounts,
    assets: state.assets,
    auditLogs: state.auditLogs
  });
}

async function readStoredMarketHistory(asset) {
  asset = normalizeCnListedFundInstrument(asset);
  const sourceRows = isFundNavAsset(asset)
    ? await readStoredRowsForSymbol(asset, "nav")
    : await readStoredRowsForSymbol(asset, "price");
  return sourceRows
    .map((row) => ({
      date: row.tradeDate || row.navDate,
      close: Number(row.closePrice || row.unitNav),
      closeDecimal: String(row.closePrice || row.unitNav || ""),
      source: row.source,
      sourceFetchedAt: row.sourceFetchedAt,
      type: row.navDate ? "单位净值" : "日收盘价",
      qualityStatus: row.qualityStatus
    }))
    .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function isFundNavAsset(asset) {
  asset = normalizeCnListedFundInstrument(asset);
  const symbol = String(asset.symbol || "").trim().toUpperCase();
  const type = String(asset.type || "").trim();
  return symbol.endsWith(".OF") || type === "公募基金" || type === "开放式基金";
}

async function persistUserAssetDailyPrices(rows) {
  if (!rows.length) return 0;
  if (isMarketDataDatabaseEnabled()) return upsertUserAssetDailyPriceRows(rows);

  let changedCount = 0;
  const byAsset = new Map();
  for (const row of rows) {
    const key = `${row.userId}:${row.assetId}`;
    const current = byAsset.get(key) || [];
    current.push(row);
    byAsset.set(key, current);
  }

  for (const assetRows of byAsset.values()) {
    const first = assetRows[0];
    const file = userAssetDailyPricePath(first.userId, first.assetId);
    const target = await readJsonArray(file);
    const byDate = new Map(target.map((row) => [row.priceDate, row]));
    for (const row of assetRows) {
      const before = byDate.get(row.priceDate);
      if (JSON.stringify(before) !== JSON.stringify(row)) {
        byDate.set(row.priceDate, row);
        changedCount += 1;
      }
    }
    await writeJson(file, [...byDate.values()].sort((left, right) => left.priceDate.localeCompare(right.priceDate)));
  }
  return changedCount;
}

async function readPersistedUserAssetDailyPrices({ userId, assetId, dateFrom, dateTo }) {
  const rows = isMarketDataDatabaseEnabled()
    ? await readUserAssetDailyPriceRows({ userId, assetId, dateFrom, dateTo })
    : await readJsonArray(userAssetDailyPricePath(userId, assetId));
  return rows
    .filter((row) => !dateFrom || row.priceDate >= dateFrom)
    .filter((row) => !dateTo || row.priceDate <= dateTo)
    .sort((left, right) => left.priceDate.localeCompare(right.priceDate));
}

function userAssetDailyPricePath(userId, assetId) {
  return path.join(
    marketStorageDir,
    "user-asset-prices",
    sanitizePathSegment(userId),
    `${sanitizePathSegment(assetId)}.json`
  );
}

function latestUsableHistoryPoint(points) {
  return [...points]
    .filter((point) => point.qualityStatus !== "invalid" && Number.isFinite(point.close) && point.close > 0)
    .sort(compareHistoryPointFreshness)[0] || null;
}

function previousUsableHistoryPoint(points, latestDate) {
  return [...points]
    .filter((point) => point.date < latestDate && point.qualityStatus !== "invalid" && Number.isFinite(point.close) && point.close > 0)
    .sort(compareHistoryPointFreshness)[0] || null;
}

function compareHistoryPointFreshness(left, right) {
  const dateOrder = right.date.localeCompare(left.date);
  if (dateOrder !== 0) return dateOrder;
  const sourceOrder = sourceFreshnessRank(right.source) - sourceFreshnessRank(left.source);
  if (sourceOrder !== 0) return sourceOrder;
  return String(right.sourceFetchedAt || "").localeCompare(String(left.sourceFetchedAt || ""));
}

function sourceFreshnessRank(source) {
  const value = String(source || "").toLowerCase();
  if (value.includes("ticker") || value.includes("quote") || value.includes("real-time") || value.includes("realtime")) return 3;
  if (value.includes("kline") || value.includes("historical")) return 2;
  return 1;
}

async function readStoredRowsForSymbol(asset, kind) {
  if (isMarketDataDatabaseEnabled()) {
    const dbRows = await readMarketDataRows({
      symbol: asset.symbol,
      market: asset.market || inferMarket(asset),
      kind
    });
    if (dbRows.length) return dbRows;
  }

  const shardRows = await readJsonArray(snapshotShardPath(asset, kind));
  if (shardRows.length) return shardRows;

  const legacyFile = kind === "nav" ? "fund-nav-snapshots.json" : "price-snapshots.json";
  const legacyRows = await readJsonArray(path.join(marketStorageDir, legacyFile));
  return legacyRows.filter((row) => row.instrumentSymbol === asset.symbol);
}

function snapshotShardPath(asset, kind) {
  const root = kind === "nav" ? "fund-nav" : "prices";
  const market = sanitizePathSegment(asset.market || inferMarket(asset));
  const symbol = sanitizePathSegment(asset.symbol || "UNKNOWN");
  return path.join(marketStorageDir, root, market, `${symbol}.json`);
}

function inferMarket(asset) {
  if (String(asset.type || "") === "贵金属") return "METAL";
  if (String(asset.type || "") === "数字资产") return "WEB3";
  if (asset.currency === "CNY") return "CN";
  if (asset.currency === "HKD") return "HK";
  if (asset.currency === "USD") return "US";
  return "UNKNOWN";
}

function sanitizePathSegment(value) {
  return String(value || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/gu, "_");
}

function stableBackfillTaskId({ userId, assetId, symbol, market, dateFrom, dateTo }) {
  return [
    "task-backfill",
    sanitizePathSegment(userId),
    sanitizePathSegment(assetId),
    sanitizePathSegment(market),
    sanitizePathSegment(symbol),
    sanitizePathSegment(dateFrom),
    sanitizePathSegment(dateTo)
  ].join("-");
}

async function assetFromSymbol(symbol) {
  const security = await findInstrument(symbol);
  const inferred = normalizeCnListedFundInstrument(security || inferInstrumentFromSymbol(symbol));
  if (!inferred) return null;
  return normalizeAsset({
    id: `instrument-${inferred.symbol}`,
    name: inferred.name,
    symbol: inferred.symbol,
    type: inferred.type,
    account: "未入账资产",
    currency: inferred.currency,
    quantity: "1",
    costPrice: "100",
    previousPrice: "101",
    currentPrice: "102",
    market: inferred.market,
    fxRate: inferred.currency === "HKD" ? "0.1280" : inferred.currency === "CNY" ? "0.1460" : "1",
    previousFxRate: inferred.currency === "HKD" ? "0.1280" : inferred.currency === "CNY" ? "0.1460" : "1",
    priceSource: inferred.source || inferUniverse({ symbol: inferred.symbol, type: inferred.type, market: inferred.market })?.source || "授权数据源待配置",
    pricedAt: "2026-04-29"
  });
}

function inferInstrumentFromSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const benchmark = benchmarkInstruments.find((item) => item.symbol.toUpperCase() === normalized);
  if (benchmark) return benchmark;
  if (/^\d{5}$/.test(normalized)) {
    return { symbol: normalized, name: normalized, type: "股票", universe: "manual-hk", market: "HK", currency: "HKD" };
  }
  if (/^\d{6}$/.test(normalized)) {
    return {
      symbol: normalized,
      name: normalized,
      type: normalized.startsWith("5") ? "ETF" : normalized.startsWith("1") ? "基金" : "股票",
      universe: normalized.startsWith("1") ? "fund" : "manual-cn",
      market: "CN",
      currency: "CNY"
    };
  }
  if (/^[A-Z]{1,5}$/.test(normalized)) {
    return { symbol: normalized, name: normalized, type: "股票", universe: "manual-us", market: "US", currency: "USD" };
  }
  return null;
}

async function findInstrument(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const dbMatch = (await searchInstrumentRepository(normalizeQuery(normalized), { allowFallback: false }))
    .find((item) => (
      item.symbol.toUpperCase() === normalized ||
      item.symbol.toUpperCase().replace(/\.OF$/u, "") === normalized ||
      (item.aliases || []).some((alias) => String(alias || "").trim().toUpperCase() === normalized)
    ));
  if (dbMatch) return normalizeCnListedFundInstrument(dbMatch);

  const instruments = await loadSearchInstruments();
  return instruments.find((item) => (
    item.symbol.toUpperCase() === normalized ||
    item.symbol.toUpperCase().replace(/\.OF$/u, "") === normalized ||
    (item.aliases || []).some((alias) => String(alias || "").trim().toUpperCase() === normalized)
  )) || bestInstrumentMatch(instruments, normalizeQuery(normalized)) || null;
}

async function searchInstrumentRepository(query, options = {}) {
  const allowFallback = options.allowFallback !== false;
  if (isMarketDataDatabaseEnabled()) {
    const dbRows = await readInstrumentRegistryRows({ query, limit: 300 });
    const dbMatches = rankInstrumentMatches(dbRows.map(normalizeSearchInstrument).filter(Boolean), query);
    if (dbMatches.length || !allowFallback) return dbMatches;
  }
  if (!allowFallback) return [];
  const instruments = await loadSearchInstruments();
  return rankInstrumentMatches(instruments, query);
}

async function loadSearchInstruments() {
  const registryRows = await readJsonArray(path.join(marketStorageDir, "instrument-registry.json"));
  const rows = await readJsonArray(path.join(marketStorageDir, "index-constituents.json"));
  const activeRows = rows.filter((row) => !row.effectiveTo);
  return dedupeInstruments([
    ...activeRows.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      type: row.assetType || "stock",
      universe: row.indexKey,
      market: row.market,
      exchange: row.exchange,
      currency: row.currency,
      source: row.source
    })),
    ...registryRows.map(normalizeSearchInstrument).filter(Boolean),
    ...securityWhitelist
  ]);
}

function rankInstrumentMatches(instruments, query) {
  return instruments
    .map((item) => ({ item, score: scoreInstrumentSearchMatch(item, query) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => (
      right.score - left.score ||
      marketSearchPriority(left.item) - marketSearchPriority(right.item) ||
      `${left.item.market}:${left.item.symbol}:${left.item.name}`.localeCompare(`${right.item.market}:${right.item.symbol}:${right.item.name}`, "zh-CN")
    ))
    .map((match) => match.item);
}

function normalizeSearchInstrument(row) {
  row = normalizeCnListedFundInstrument(row);
  const symbol = String(row?.symbol || "").trim().toUpperCase();
  if (!symbol) return null;
  return {
    id: row.id || [row.market, row.type, symbol].filter(Boolean).join(":"),
    symbol,
    name: String(row.name || symbol).trim(),
    type: String(row.type || "股票").trim(),
    universe: row.universe || "",
    market: String(row.market || inferMarket(row)).trim().toUpperCase(),
    exchange: row.exchange || "",
    currency: String(row.currency || "USD").trim().toUpperCase(),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    source: row.source || row.dataSource || "",
    dataSource: row.dataSource || row.source || "",
    marketDataSupported: row.marketDataSupported !== false
  };
}

function bestInstrumentMatch(instruments, normalizedQuery) {
  return instruments
    .map((item) => ({ item, score: scoreInstrumentSearchMatch(item, normalizedQuery) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => (
      right.score - left.score ||
      marketSearchPriority(left.item) - marketSearchPriority(right.item) ||
      `${left.item.market}:${left.item.symbol}:${left.item.name}`.localeCompare(`${right.item.market}:${right.item.symbol}:${right.item.name}`, "zh-CN")
    ))
    .map((match) => match.item)[0] || null;
}

function scoreInstrumentSearchMatch(item, normalizedQuery) {
  const symbol = normalizeQuery(item.symbol);
  const rawSymbol = symbol.replace(/\.OF$/u, "");
  const name = normalizeQuery(item.name);
  const aliases = Array.isArray(item.aliases) ? item.aliases.map(normalizeQuery) : [];
  if (symbol === normalizedQuery) return 1000;
  if (rawSymbol && rawSymbol === normalizedQuery) return 980;
  if (name === normalizedQuery) return 900;
  if (aliases.some((alias) => alias === normalizedQuery)) return 850;
  if (symbol.startsWith(normalizedQuery)) return 700 - Math.abs(symbol.length - normalizedQuery.length);
  if (rawSymbol.startsWith(normalizedQuery)) return 680 - Math.abs(rawSymbol.length - normalizedQuery.length);
  if (normalizedQuery.length < 2) return 0;
  if (name.includes(normalizedQuery)) return 600 - Math.abs(name.length - normalizedQuery.length);
  if (aliases.some((alias) => alias.includes(normalizedQuery))) return 500;
  return 0;
}

function marketSearchPriority(item) {
  return {
    CN: 1,
    HK: 2,
    WEB3: 3,
    METAL: 4,
    US: 5,
    CASH: 6,
    OTHER: 7
  }[String(item?.market || "").toUpperCase()] || 9;
}

async function upsertStoredInstrumentRegistry(instrument) {
  const file = path.join(marketStorageDir, "instrument-registry.json");
  const rows = await readJsonArray(file);
  const normalized = {
    id: instrument.id || [instrument.market, instrument.type, instrument.symbol].filter(Boolean).join(":"),
    symbol: String(instrument.symbol || "").trim().toUpperCase(),
    name: String(instrument.name || instrument.symbol || "").trim(),
    market: String(instrument.market || inferMarket(instrument)).trim().toUpperCase(),
    exchange: instrument.exchange || "",
    type: String(instrument.type || "股票").trim(),
    currency: String(instrument.currency || "USD").trim().toUpperCase(),
    aliases: [...new Set([instrument.symbol, instrument.name, ...(instrument.aliases || [])].filter(Boolean).map(String))],
    status: instrument.status || "active",
    universe: instrument.universe || "",
    marketDataSupported: instrument.marketDataSupported !== false,
    dataSource: instrument.dataSource || instrument.source || "录入时按代码搜索发现",
    sourceUpdatedAt: todayIsoDate(),
    updatedAt: new Date().toISOString()
  };
  const key = `${normalized.market}:${normalized.symbol}`;
  const nextRows = rows.filter((row) => `${String(row.market || "").toUpperCase()}:${String(row.symbol || "").toUpperCase()}` !== key);
  nextRows.push(normalized);
  nextRows.sort((left, right) => `${left.market}:${left.symbol}`.localeCompare(`${right.market}:${right.symbol}`));
  await writeJson(file, nextRows);
  if (isMarketDataDatabaseEnabled()) await upsertInstrumentRegistryRows([normalized]);
  state.auditLogs.push(audit("upsert_instrument_registry", "instrument", key, normalized));
  return normalizeSearchInstrument(normalized);
}

function dedupeInstruments(instruments) {
  const seen = new Set();
  return instruments.map(normalizeCnListedFundInstrument).filter((instrument) => {
    const key = `${instrument.market}:${instrument.symbol}`.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalMarketSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function validateSyncDailyRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "validation_error", message: "请求体必须是 JSON 对象", fieldErrors: { body: "必须是 JSON 对象" } };
  }
  const unexpectedFields = Object.keys(body).filter((field) => !syncDailyAllowedFields.has(field));
  if (unexpectedFields.length) {
    return {
      ok: false,
      code: "request_field_not_allowed",
      message: "同步价格只接受公共行情字段",
      fieldErrors: { fields: `不允许字段：${unexpectedFields.join(", ")}` }
    };
  }
  const benchmarkOnly = body.includeBenchmarks === true && body.symbols === undefined;
  if ((!benchmarkOnly && (!Array.isArray(body.symbols) || body.symbols.length < 1)) || (Array.isArray(body.symbols) && body.symbols.length > 50)) {
    return {
      ok: false,
      code: "validation_error",
      message: "symbols 必须包含 1 到 50 个公共资产代码",
      fieldErrors: { symbols: "必须是长度为 1 到 50 的数组" }
    };
  }
  const rawSymbols = benchmarkOnly ? [] : body.symbols;
  const symbols = [...new Set(rawSymbols.map(canonicalMarketSymbol).filter((symbol) => /^[A-Z0-9._-]{1,24}$/u.test(symbol)))];
  if ((!benchmarkOnly && !symbols.length) || symbols.length !== new Set(rawSymbols.map(canonicalMarketSymbol).filter(Boolean)).size) {
    return {
      ok: false,
      code: "validation_error",
      message: "symbols 包含无效公共资产代码",
      fieldErrors: { symbols: "仅接受 1 到 24 位字母、数字、点、下划线或连字符" }
    };
  }
  const trigger = body.trigger === undefined ? "manual" : String(body.trigger);
  if (!syncDailyAllowedTriggers.has(trigger)) {
    return { ok: false, code: "validation_error", message: "trigger 无效", fieldErrors: { trigger: "只允许 manual、auto 或 asset_created" } };
  }
  for (const field of ["includeHistory", "includeBenchmarks", "autoFetch"]) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") {
      return { ok: false, code: "validation_error", message: `${field} 必须是布尔值`, fieldErrors: { [field]: "必须是布尔值" } };
    }
  }
  const days = body.days === undefined ? 7 : Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, code: "validation_error", message: "days 必须在 1 到 365 之间", fieldErrors: { days: "必须是 1 到 365 的整数" } };
  }
  return {
    ok: true,
    body: {
      symbols,
      trigger,
      days,
      ...(body.includeHistory === undefined ? {} : { includeHistory: body.includeHistory }),
      ...(body.includeBenchmarks === undefined ? {} : { includeBenchmarks: body.includeBenchmarks }),
      ...(body.autoFetch === undefined ? {} : { autoFetch: body.autoFetch })
    }
  };
}

function sendJson(response, data, status = 200) {
  const payload = JSON.stringify(data, (_, value) => (typeof value === "bigint" ? value.toString() : value));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(response.req)
  });
  response.end(payload);
}

function sendNoContent(response) {
  response.writeHead(204, {
    ...corsHeaders(response.req)
  });
  response.end();
}

function sendError(response, status, code, message, fieldErrors = {}) {
  return sendJson(response, { code, message, fieldErrors, requestId: `req-${Date.now()}` }, status);
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("请求体过大"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求体不是有效 JSON"));
      }
    });
    request.on("error", reject);
  });
}

function parseAllowedOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/u, ""))
    .filter(Boolean);
}

function corsHeaders(request) {
  const origin = String(request?.headers?.origin || "").replace(/\/+$/u, "");
  const localOrigins = new Set([
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:4174",
    "http://127.0.0.1:4174",
    "http://localhost:4175",
    "http://127.0.0.1:4175",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);
  const explicitOrigins = new Set(allowedOrigins);
  const allowOrigin = explicitOrigins.has("*")
    ? "*"
    : explicitOrigins.has(origin) || localOrigins.has(origin)
      ? origin
      : allowedOrigins.length
        ? allowedOrigins[0]
        : "http://127.0.0.1:4173";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-User-Id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  };
}

async function readJsonArray(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function stringifyBigInts(value) {
  if (Array.isArray(value)) return value.map(stringifyBigInts);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringifyBigInts(item)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function parseSymbols(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return raw
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean);
}

function normalizeDateParam(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date, delta) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

function decimalString(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(value);
}

function audit(action, entityType, entityId, afterPayload = null) {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    userId: demoUser.id,
    actorId: demoUser.id,
    action,
    entityType,
    entityId,
    afterPayload,
    createdAt: new Date().toISOString()
  };
}
