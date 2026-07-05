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
import {
  isMarketDataDatabaseEnabled,
  readMarketDataRows,
  readUserAssetDailyPriceRows,
  upsertUserAssetDailyPriceRows
} from "../../src/server/marketDataDatabase.js";
import { buildUserAssetDailyPriceSnapshots } from "../../src/domain/userAssetDailyPrices.js";

const port = Number(process.env.API_PORT || process.env.PORT || 4180);
const host = process.env.API_HOST || process.env.HOST || "127.0.0.1";
const allowedOrigins = parseAllowedOrigins(process.env.API_ALLOWED_ORIGINS);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const marketStorageDir = path.resolve(repoRoot, process.env.MARKET_DATA_DIR || "storage/market-data");
const dailySyncHour = Number(process.env.MARKET_DAILY_SYNC_HOUR || "22");
const dailySyncMinute = Number(process.env.MARKET_DAILY_SYNC_MINUTE || "0");
const dailySyncEnabled = process.env.MARKET_DAILY_SYNC_ENABLED !== "false";
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
    if (request.method === "GET" && url.pathname === "/api/accounts") return listAccounts(response);
    if (request.method === "POST" && url.pathname === "/api/accounts") return createAccount(request, response);
    if (request.method === "GET" && url.pathname === "/api/instruments/search") return searchInstruments(url, response);
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

async function searchInstruments(url, response) {
  const query = normalizeQuery(url.searchParams.get("query"));
  const instruments = await loadSearchInstruments();
  const matches = instruments.filter((item) => {
    return (
      normalizeQuery(item.symbol).includes(query) ||
      normalizeQuery(item.name).includes(query) ||
      normalizeQuery(item.market).includes(query)
    );
  });
  return sendJson(response, { instruments: matches.slice(0, 20), universes: marketUniverses });
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
  const body = await readJson(request);
  try {
    const result = await runDailyMarketDataSync(body, "manual");
    return sendJson(response, result, 202);
  } catch (error) {
    const message = errorMessage(error, "同步失败");
    console.error(`[market-data] sync_daily failed: ${message}`);
    return sendError(response, 502, "market_data_sync_failed", message);
  }
}

async function runDailyMarketDataSync(body = {}, trigger = "manual") {
  const requestedSymbols = parseSymbols(body.symbols || body.symbol);
  const benchmarkSymbols = body.includeBenchmarks
    ? defaultBenchmarkSyncSymbols.map((symbol) => symbol.toUpperCase())
    : [];
  const symbolsToSync = requestedSymbols.length
    ? [...new Set([...requestedSymbols, ...benchmarkSymbols])]
    : [];
  const externalSymbolsToSync = [...new Set([...symbolsToSync, ...benchmarkSymbols])];
  const account = String(body.account || "").trim();
  const stateCandidates = state.assets.filter((asset) => {
    if (asset.closed || !asset.symbol) return false;
    if (account && asset.account !== account) return false;
    if (symbolsToSync.length && !symbolsToSync.includes(asset.symbol.toUpperCase())) return false;
    return true;
  });
  const stateSymbols = new Set(stateCandidates.map((asset) => asset.symbol.toUpperCase()));
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
  const candidates = [...stateCandidates, ...requestedExternalCandidates.filter(Boolean)];
  const syncedAt = new Date().toISOString();
  const results = [];
  let fetchResult = null;
  let dailyPriceRowsUpserted = 0;
  let dailyPriceGapCount = 0;

  if (body.autoFetch !== false) {
    try {
      fetchResult = await fetchRecentMarketDataRun({
        ...body,
        symbols: candidates.map((asset) => asset.symbol).filter(Boolean),
        days: body.days || 7
      });
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
        dateFrom: body.dateFrom,
        dateTo: body.dateTo
      });
      dailyPriceGapCount += dailyPrices.missingDates.length;
      dailyPriceRowsUpserted += await persistUserAssetDailyPrices(dailyPrices.rows);
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
      }
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
  return payload;
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
  if (stored.length) {
    return sendJson(response, {
      userId: demoUser.id,
      assetId: asset.id,
      symbol: asset.symbol,
      points: stored,
      source: isMarketDataDatabaseEnabled() ? "postgres-user-asset-daily-prices" : "storage/user-asset-prices"
    });
  }

  const history = await readStoredMarketHistory(asset);
  const dailyPrices = buildUserAssetDailyPriceSnapshots({ userId: demoUser.id, asset, history, dateFrom, dateTo });
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
      const result = await runDailyMarketDataSync({ days: 7, includeBenchmarks: true }, "scheduled");
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

async function fetchRecentMarketDataRun(body) {
  const requestedSymbols = parseSymbols(body.symbols || body.symbol);
  const stateSymbols = state.assets
    .filter((asset) => !asset.closed && asset.symbol)
    .map((asset) => asset.symbol.toUpperCase());
  const symbols = [...new Set((requestedSymbols.length ? requestedSymbols : stateSymbols).filter(Boolean))];
  if (!symbols.length) {
    throw new Error("没有可抓取的资产代码");
  }

  const days = Math.min(30, Math.max(1, Number(body.days || 7)));
  const dateTo = normalizeDateParam(body.dateTo) || todayIsoDate();
  const dateFrom = normalizeDateParam(body.dateFrom) || addDays(dateTo, -days + 1);
  const args = [
    "scripts/market-data/fetch-market-data.mjs",
    "backfill",
    `--from=${dateFrom}`,
    `--to=${dateTo}`,
    `--symbols=${symbols.join(",")}`,
    "--fx=false"
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

async function createBackfillTask(request, response) {
  const body = await readJson(request);
  const symbol = String(body.symbol || "").trim().toUpperCase();
  const security = await findInstrument(symbol);
  if (!security) return sendError(response, 404, "instrument_not_found", "首版白名单中未找到该资产");
  const task = {
    id: `task-backfill-${symbol}-${Date.now()}`,
    universeKey: security.universe,
    taskType: "backfill",
    status: "queued",
    source: security.source || inferUniverse({ symbol })?.source || "授权数据源待配置",
    startDate: body.dateFrom || null,
    endDate: body.dateTo || null,
    retryCount: 0
  };
  state.auditLogs.push(audit("create_backfill_task", "market_data_task", task.id, task));
  return sendJson(response, { task }, 202);
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
  const isFund = String(asset.type || "").includes("基金");
  const sourceRows = isFund
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

async function assetFromSymbol(symbol) {
  const security = await findInstrument(symbol);
  const inferred = security || inferInstrumentFromSymbol(symbol);
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
      type: normalized.startsWith("5") || normalized.startsWith("1") ? "ETF" : "股票",
      universe: "manual-cn",
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
  const instruments = await loadSearchInstruments();
  return instruments.find((item) => item.symbol.toUpperCase() === normalized) || null;
}

async function loadSearchInstruments() {
  const rows = await readJsonArray(path.join(marketStorageDir, "index-constituents.json"));
  const activeRows = rows.filter((row) => !row.effectiveTo);
  return dedupeInstruments([
    ...securityWhitelist,
    ...activeRows.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      type: row.assetType || "stock",
      universe: row.indexKey,
      market: row.market,
      exchange: row.exchange,
      currency: row.currency,
      source: row.source
    }))
  ]);
}

function dedupeInstruments(instruments) {
  const seen = new Set();
  return instruments.filter((instrument) => {
    const key = `${instrument.market}:${instrument.symbol}`.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
