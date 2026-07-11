#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { benchmarkInstruments, securityWhitelist } from "../../src/domain/marketData.js";
import {
  cryptoInstruments,
  defaultFxPairs,
  groupFxPairsByBase,
  normalizeBinanceKlines,
  normalizeBinanceTickerPrice,
  normalizeCoinGeckoSimplePrice,
  normalizeFrankfurterLatest,
  normalizeGoldApiPrice,
  normalizeMetalsDevLatest,
  preciousMetalInstruments
} from "../../src/domain/marketDataSources.js";
import {
  appendMarketDataRun,
  isMarketDataDatabaseEnabled,
  upsertFxRateRows,
  upsertMarketDataRows
} from "../../src/server/marketDataDatabase.js";

const execFileAsync = promisify(execFile);
const storageDir = path.resolve(process.env.MARKET_DATA_DIR || "storage/market-data");
const priceFile = path.join(storageDir, "price-snapshots.json");
const navFile = path.join(storageDir, "fund-nav-snapshots.json");
const priceShardDir = path.join(storageDir, "prices");
const navShardDir = path.join(storageDir, "fund-nav");
const fxFile = path.join(storageDir, "fx-rates.json");
const runFile = path.join(storageDir, "market-data-runs.json");
const registryFile = path.join(storageDir, "instrument-registry.json");
const constituentsFile = path.join(storageDir, "index-constituents.json");

const command = process.argv[2] || "daily";
const options = parseArgs(process.argv.slice(3));
const today = isoDate(new Date());

if (!["backfill", "daily"].includes(command)) {
  console.error("Usage: npm run data:backfill OR npm run data:daily -- --date=YYYY-MM-DD");
  process.exit(1);
}

if (!isMarketDataDatabaseEnabled()) await fs.mkdir(storageDir, { recursive: true });

const range = buildRange(command, options);
const instruments = await selectInstruments(options, range.dateTo);
const requestDelayMs = Number(options["delay-ms"] || (options.universes ? "350" : "0"));
const run = {
  id: `run-${command}-${Date.now()}`,
  command,
  startedAt: new Date().toISOString(),
  dateFrom: range.dateFrom,
  dateTo: range.dateTo,
  requestedUniverses: parseList(options.universes || ""),
  requestedSymbols: instruments.map((item) => item.symbol),
  requestedFxPairs: parseFxPairs(options["fx-pairs"] || "USD/CNY,HKD/CNY,USD/HKD,EUR/CNY"),
  status: "running",
  successCount: 0,
  skippedCount: 0,
  failureCount: 0,
  messages: []
};

let processedCount = 0;
for (const instrument of instruments) {
  if (requestDelayMs > 0 && processedCount > 0) {
    await delay(requestDelayMs);
  }
  try {
    const result = await fetchInstrument(instrument, range);
    if (result.status === "skipped") {
      run.skippedCount += 1;
      run.messages.push({ symbol: instrument.symbol, level: "warn", message: result.reason });
      continue;
    }

    const changedCount = isMarketDataDatabaseEnabled()
      ? await upsertMarketDataRows({ instrument, rows: result.rows, kind: result.kind })
      : upsertSnapshots(await readSnapshotShard(instrument, result.kind), result.rows, result.kind);
    if (!isMarketDataDatabaseEnabled()) {
      const target = await readSnapshotShard(instrument, result.kind);
      upsertSnapshots(target, result.rows, result.kind);
      await writeSnapshotShard(instrument, result.kind, target.sort(compareSnapshot));
    }
    run.successCount += changedCount;
    run.messages.push({
      symbol: instrument.symbol,
      level: "info",
      message: `${result.rows.length} rows fetched, ${changedCount} inserted or updated`
    });
  } catch (error) {
    run.failureCount += 1;
    run.messages.push({
      symbol: instrument.symbol,
      level: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    processedCount += 1;
  }
}

if (options.fx !== "false") {
  try {
    const result = await fetchFrankfurterFx(run.requestedFxPairs, range);
    const changedCount = isMarketDataDatabaseEnabled()
      ? await upsertFxRateRows(result.rows)
      : upsertFxRates(await readJsonArray(fxFile), result.rows);
    if (!isMarketDataDatabaseEnabled()) {
      const target = await readJsonArray(fxFile);
      upsertFxRates(target, result.rows);
      await writeJson(fxFile, target.sort(compareFxRate));
    }
    run.successCount += changedCount;
    run.messages.push({
      symbol: "FX",
      level: "info",
      message: `${result.rows.length} rows fetched, ${changedCount} inserted or updated`
    });
  } catch (error) {
    run.failureCount += 1;
    run.messages.push({
      symbol: "FX",
      level: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

run.status = run.failureCount > 0 ? "completed_with_errors" : "completed";
run.finishedAt = new Date().toISOString();

if (isMarketDataDatabaseEnabled()) await appendMarketDataRun(run);
else await appendRun(runFile, run);

console.log(JSON.stringify(run, null, 2));

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, value = "true"] = arg.slice(2).split("=");
    parsed[key] = value;
  }
  return parsed;
}

function buildRange(mode, args) {
  if (mode === "daily") {
    const date = args.date || today;
    return { dateFrom: date, dateTo: date };
  }

  const months = Number(args.months || "3");
  const end = args.to || today;
  const startDate = new Date(`${end}T00:00:00.000Z`);
  startDate.setUTCMonth(startDate.getUTCMonth() - (Number.isFinite(months) && months > 0 ? months : 3));
  return { dateFrom: args.from || isoDate(startDate), dateTo: end };
}

async function selectInstruments(args, asOfDate) {
  const symbols = parseList(args.symbols || "").map((item) => item.toUpperCase());
  const universes = parseList(args.universes || "");
  const registryRows = await readJsonArray(registryFile);
  const source = universes.length ? await loadUniverseInstruments(universes, asOfDate) : dedupeInstruments([...registryRows, ...securityWhitelist]);
  if (!symbols.length) {
    return universes.length ? source : dedupeInstruments([...source, ...benchmarkInstruments]);
  }
  const matched = source.filter((item) => symbols.some((symbol) => instrumentSymbolMatches(item, symbol)));
  const matchedSymbols = new Set(matched.map((item) => item.symbol.toUpperCase()));
  const inferred = symbols
    .filter((symbol) => !matchedSymbols.has(symbol))
    .map(inferInstrumentFromSymbol)
    .filter(Boolean);
  return dedupeInstruments([...matched, ...inferred]);
}

function inferInstrumentFromSymbol(symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const benchmark = benchmarkInstruments.find((item) => item.symbol.toUpperCase() === normalized);
  if (benchmark) return benchmark;
  const crypto = cryptoInstruments.find((item) => item.symbol === normalized);
  if (crypto) return crypto;
  const metal = preciousMetalInstruments.find((item) => item.symbol === normalized);
  if (metal) return metal;
  if (normalized.endsWith(".OF")) {
    return {
      symbol: normalized,
      name: normalized,
      type: "基金",
      universe: "fund",
      market: "CN",
      currency: "CNY"
    };
  }
  if (/^\d{5}$/.test(normalized)) {
    return {
      symbol: normalized,
      name: normalized,
      type: "股票",
      universe: "hstech",
      market: "HK",
      currency: "HKD"
    };
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
    return {
      symbol: normalized,
      name: normalized,
      type: "股票",
      universe: "manual-us",
      market: "US",
      currency: "USD"
    };
  }
  return null;
}

function instrumentSymbolMatches(item, symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  const itemSymbol = String(item?.symbol || "").trim().toUpperCase();
  return (
    itemSymbol === normalized ||
    itemSymbol.replace(/\.OF$/u, "") === normalized ||
    (item?.aliases || []).some((alias) => String(alias || "").trim().toUpperCase() === normalized)
  );
}

async function loadUniverseInstruments(universes, asOfDate) {
  const rows = await readJsonArray(constituentsFile);
  if (!rows.length) {
    throw new Error("缺少 index-constituents.json，请先运行 npm run data:sync-universes");
  }
  const requested = new Set(universes.map((item) => item.toLowerCase()));
  const activeRows = rows.filter(
    (row) =>
      requested.has(String(row.indexKey || "").toLowerCase()) &&
      row.effectiveFrom <= asOfDate &&
      (!row.effectiveTo || row.effectiveTo >= asOfDate)
  );
  const instruments = activeRows.map((row) => ({
    symbol: row.symbol,
    name: row.name,
    type: row.assetType || "stock",
    universe: row.indexKey,
    market: row.market,
    exchange: row.exchange,
    currency: row.currency
  }));
  return dedupeInstruments(instruments);
}

function dedupeInstruments(instruments) {
  const seen = new Set();
  return instruments.filter((instrument) => {
    const key = `${instrument.market}:${instrument.symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchInstrument(instrument, range) {
  if (instrument.universe === "precious-metals" || instrument.market === "METAL") return fetchPreciousMetalLatest(instrument, range);
  if (instrument.universe === "crypto" || instrument.market === "WEB3") return fetchBinanceCrypto(instrument, range);
  if (instrument.universe === "fund") return fetchEastmoneyFundNav(instrument, range);
  if (instrument.market === "CN" || instrument.market === "HK") return fetchTencentKline(instrument, range);
  if (instrument.market === "US") return fetchNasdaqDaily(instrument, range);
  return { status: "skipped", reason: `Unsupported market ${instrument.market}` };
}

async function fetchPreciousMetalLatest(instrument, range) {
  const sourceInstrument = preciousMetalInstruments.find((item) => item.symbol === instrument.symbol) || instrument;
  try {
    return await fetchGoldApiLatest(sourceInstrument, range);
  } catch (error) {
    if (process.env.METALS_DEV_API_KEY) return fetchMetalsDevLatest(sourceInstrument, range);
    throw error;
  }
}

async function fetchGoldApiLatest(instrument, range) {
  const url = new URL(`https://api.gold-api.com/price/${instrument.symbol}`);
  const payload = await fetchJson(url, { referer: "https://gold-api.com/" });
  const rows = normalizeGoldApiPrice(payload, instrument, { tradeDate: range.dateTo });
  if (!rows.length) return { status: "skipped", reason: `Gold API 暂无 ${instrument.symbol} 可用价格` };
  return { status: "ok", kind: "price", rows };
}

async function fetchMetalsDevLatest(instrument, range) {
  if (!process.env.METALS_DEV_API_KEY) {
    return { status: "skipped", reason: "缺少 METALS_DEV_API_KEY，跳过贵金属自动抓价" };
  }
  const sourceInstrument = preciousMetalInstruments.find((item) => item.symbol === instrument.symbol) || instrument;
  const url = new URL("https://api.metals.dev/v1/latest");
  url.searchParams.set("api_key", process.env.METALS_DEV_API_KEY);
  url.searchParams.set("currency", instrument.currency || "USD");
  url.searchParams.set("unit", "toz");
  const payload = await fetchJson(url, { referer: "https://metals.dev/docs" });
  const rows = normalizeMetalsDevLatest(payload, [sourceInstrument], { tradeDate: range.dateTo });
  if (!rows.length) return { status: "skipped", reason: `Metals.Dev 暂无 ${instrument.symbol} 可用价格` };
  return { status: "ok", kind: "price", rows };
}

async function fetchBinanceCrypto(instrument, range) {
  const sourceInstrument = cryptoInstruments.find((item) => item.symbol === instrument.symbol) || instrument;
  if (!sourceInstrument.binanceSymbol) return fetchCoinGeckoLatest(instrument, range);
  const rows = [];
  const klineUrl = new URL("https://data-api.binance.vision/api/v3/klines");
  klineUrl.searchParams.set("symbol", sourceInstrument.binanceSymbol);
  klineUrl.searchParams.set("interval", "1d");
  klineUrl.searchParams.set("startTime", String(Date.parse(`${range.dateFrom}T00:00:00.000Z`)));
  klineUrl.searchParams.set("endTime", String(Date.parse(`${range.dateTo}T23:59:59.999Z`)));
  klineUrl.searchParams.set("limit", String(historyRequestLimit(range, 1000)));
  const klinePayload = await fetchJson(klineUrl, { referer: "https://www.binance.com/" });
  rows.push(...normalizeBinanceKlines(klinePayload, sourceInstrument));

  const tickerUrl = new URL("https://data-api.binance.vision/api/v3/ticker/price");
  tickerUrl.searchParams.set("symbol", sourceInstrument.binanceSymbol);
  const tickerPayload = await fetchJson(tickerUrl, { referer: "https://www.binance.com/" });
  rows.push(...normalizeBinanceTickerPrice(tickerPayload, sourceInstrument, { tradeDate: range.dateTo }));
  const filteredRows = upsertRowsByDateAndSource(rows, []).filter((row) => row.tradeDate >= range.dateFrom && row.tradeDate <= range.dateTo);
  if (!filteredRows.length) return { status: "skipped", reason: `Binance 暂无 ${instrument.symbol} 可用价格` };
  return { status: "ok", kind: "price", rows: filteredRows };
}

async function fetchCoinGeckoLatest(instrument, range) {
  const sourceInstrument = cryptoInstruments.find((item) => item.symbol === instrument.symbol) || instrument;
  if (!sourceInstrument.coinGeckoId) return { status: "skipped", reason: `${instrument.symbol} 缺少 CoinGecko coin id` };
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", sourceInstrument.coinGeckoId);
  url.searchParams.set("vs_currencies", "usd");
  url.searchParams.set("include_last_updated_at", "true");
  const payload = await fetchJson(url, { referer: "https://www.coingecko.com/" });
  const rows = normalizeCoinGeckoSimplePrice(payload, [sourceInstrument], { tradeDate: range.dateTo, vsCurrency: "usd" });
  if (!rows.length) return { status: "skipped", reason: `CoinGecko 暂无 ${instrument.symbol} 可用价格` };
  return { status: "ok", kind: "price", rows };
}

async function fetchFrankfurterFx(pairs, range) {
  const grouped = groupFxPairsByBase(pairs.length ? pairs : defaultFxPairs);
  const rows = [];
  for (const [baseCurrency, basePairs] of grouped.entries()) {
    const url = new URL("https://api.frankfurter.dev/v2/rates");
    url.searchParams.set("base", baseCurrency);
    url.searchParams.set("quotes", basePairs.map((pair) => pair.quoteCurrency).join(","));
    const payload = await fetchJson(url, { referer: "https://frankfurter.dev/" });
    rows.push(...normalizeFrankfurterLatest(payload, basePairs, { tradeDate: range.dateTo }));
  }
  return { status: "ok", kind: "fx", rows };
}

async function fetchTencentKline(instrument, range) {
  const symbol = toTencentSymbol(instrument);
  const limit = command === "backfill" ? String(historyRequestLimit(range, 800)) : "10";
  const url = new URL("https://web.ifzq.gtimg.cn/appstock/app/fqkline/get");
  url.searchParams.set("param", `${symbol},day,,,${limit},qfq`);
  const payload = await fetchJson(url, { referer: "https://gu.qq.com/" });
  const bucket = payload.data?.[symbol];
  const rows = bucket?.qfqday || bucket?.day;
  if (!Array.isArray(rows)) throw new Error(`腾讯证券 K 线返回缺少 day: ${instrument.symbol}`);
  const normalizedRows = rows
    .map((row) => normalizeTencentKlineRow(instrument, row))
    .filter((row) => row.tradeDate >= range.dateFrom && row.tradeDate <= range.dateTo);
  const quoteRow = await fetchTencentRealtimeQuote(instrument, range);
  return {
    status: "ok",
    kind: "price",
    rows: quoteRow ? upsertRowsByDateAndSource(normalizedRows, [quoteRow]) : normalizedRows
  };
}

async function fetchTencentRealtimeQuote(instrument, range) {
  const symbol = toTencentSimpleQuoteSymbol(instrument);
  const text = await fetchText(new URL(`https://qt.gtimg.cn/q=${symbol}`), { referer: "https://gu.qq.com/" });
  const match = text.match(/="([^"]*)"/u);
  const fields = match ? match[1].split("~") : [];
  const closePrice = fields[3];
  if (Number(closePrice) <= 0) return null;
  return {
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    market: instrument.market,
    currency: instrument.currency,
    tradeDate: range.dateTo,
    closePrice: decimalString(closePrice),
    adjustedClosePrice: decimalString(closePrice),
    source: "Tencent finance realtime quote",
    sourceFetchedAt: new Date().toISOString(),
    qualityStatus: "ok"
  };
}

async function fetchEastmoneyKline(instrument, range) {
  const url = new URL("https://push2his.eastmoney.com/api/qt/stock/kline/get");
  url.searchParams.set("secid", toEastmoneySecid(instrument));
  url.searchParams.set("fields1", "f1,f2,f3,f4,f5,f6");
  url.searchParams.set("fields2", "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61");
  url.searchParams.set("klt", "101");
  url.searchParams.set("fqt", "1");
  url.searchParams.set("beg", compactDate(range.dateFrom));
  url.searchParams.set("end", compactDate(range.dateTo));
  url.searchParams.set("lmt", String(historyRequestLimit(range, 5000)));

  const payload = await fetchJson(url, { referer: "https://quote.eastmoney.com/" });
  const klines = payload.data?.klines;
  if (!Array.isArray(klines)) throw new Error(`东方财富 K 线返回缺少 klines: ${instrument.symbol}`);

  return {
    status: "ok",
    kind: "price",
    rows: klines.map((line) => normalizeEastmoneyKlineRow(instrument, line))
  };
}

async function fetchEastmoneyFundNav(instrument, range) {
  const code = instrument.symbol.replace(/\.OF$/u, "");
  const script = await fetchText(new URL(`https://fund.eastmoney.com/pingzhongdata/${code}.js`), {
    referer: `https://fund.eastmoney.com/${code}.html`
  });
  const match = script.match(/Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/u);
  if (!match) throw new Error(`东方财富基金净值缺少 Data_netWorthTrend: ${instrument.symbol}`);
  const points = JSON.parse(match[1]);
  const requestFrom = command === "daily" ? addDays(range.dateTo, -7) : range.dateFrom;
  let rows = points
    .map((point) => ({
      date: isoDate(new Date(Number(point.x))),
      unitNav: point.y,
      accumulatedNav: point.y,
      adjustedUnitNav: point.y,
      unitMoney: point.unitMoney || ""
    }))
    .filter((point) => point.date >= requestFrom && point.date <= range.dateTo)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (command === "daily") rows = rows.slice(-1);

  return {
    status: "ok",
    kind: "nav",
    rows: rows.map((row) => ({
      instrumentSymbol: instrument.symbol,
      instrumentName: instrument.name,
      market: instrument.market,
      currency: instrument.currency,
      navDate: row.date,
      unitNav: decimalString(row.unitNav),
      accumulatedNav: decimalString(row.accumulatedNav),
      adjustedUnitNav: decimalString(row.adjustedUnitNav),
      source: "Eastmoney fund net worth",
      sourceFetchedAt: new Date().toISOString(),
      qualityStatus: "ok"
    }))
  };
}

async function fetchNasdaqDaily(instrument, range) {
  const assetClass = String(instrument.type || "").toUpperCase() === "ETF"
    ? "etf"
    : String(instrument.type || "") === "指数" || String(instrument.universe || "") === "benchmark"
      ? "index"
      : "stocks";
  const requestFrom = command === "daily" ? addDays(range.dateTo, -7) : range.dateFrom;
  const url = new URL(`https://api.nasdaq.com/api/quote/${instrument.symbol}/historical`);
  url.searchParams.set("assetclass", assetClass);
  url.searchParams.set("fromdate", requestFrom);
  url.searchParams.set("todate", range.dateTo);
  url.searchParams.set("limit", String(historyRequestLimit(range, 5000)));
  const payload = await fetchJson(url, {
    referer: `https://www.nasdaq.com/market-activity/${assetClass}/${instrument.symbol.toLowerCase()}`,
    origin: "https://www.nasdaq.com"
  });
  const rows = payload.data?.tradesTable?.rows;
  if (!Array.isArray(rows)) {
    return { status: "skipped", reason: `Nasdaq 暂无 ${instrument.symbol} 在 ${range.dateTo} 前的可用日线` };
  }
  let normalizedRows = rows
    .map((row) => normalizeNasdaqRow(instrument, row))
    .filter((row) => row.tradeDate >= requestFrom && row.tradeDate <= range.dateTo)
    .sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
  if (command === "daily") normalizedRows = normalizedRows.slice(-1);
  const quoteRow = await safeFetchNasdaqLatestQuote(instrument, range, assetClass);
  if (quoteRow && quoteRow.tradeDate >= range.dateFrom && quoteRow.tradeDate <= range.dateTo) {
    normalizedRows = upsertRowsByDateAndSource(normalizedRows, [quoteRow]);
  }
  return {
    status: "ok",
    kind: "price",
    rows: normalizedRows
  };
}

async function safeFetchNasdaqLatestQuote(instrument, range, assetClass) {
  try {
    return await fetchNasdaqLatestQuote(instrument, range, assetClass);
  } catch {
    return null;
  }
}

async function fetchNasdaqLatestQuote(instrument, range, assetClass) {
  const url = new URL(`https://api.nasdaq.com/api/quote/${instrument.symbol}/info`);
  url.searchParams.set("assetclass", assetClass);
  const payload = await fetchJson(url, {
    referer: `https://www.nasdaq.com/market-activity/${assetClass}/${instrument.symbol.toLowerCase()}`,
    origin: "https://www.nasdaq.com"
  });
  const primaryData = payload.data?.primaryData;
  const closePrice = stripMarketNumber(primaryData?.lastSalePrice);
  if (Number(closePrice) <= 0) return null;
  return {
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    market: instrument.market,
    currency: instrument.currency,
    tradeDate: range.dateTo,
    closePrice: decimalString(closePrice),
    adjustedClosePrice: decimalString(closePrice),
    source: primaryData?.isRealTime ? "Nasdaq real-time quote public API" : "Nasdaq quote public API",
    sourceFetchedAt: new Date().toISOString(),
    sourceTimestamp: primaryData?.lastTradeTimestamp || "",
    qualityStatus: "ok"
  };
}

function normalizeEastmoneyKlineRow(instrument, line) {
  const [date, open, close] = String(line).split(",");
  return {
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    market: instrument.market,
    currency: instrument.currency,
    tradeDate: date,
    closePrice: decimalString(close),
    adjustedClosePrice: decimalString(close),
    source: "Eastmoney kline",
    sourceFetchedAt: new Date().toISOString(),
    qualityStatus: Number(close) > 0 ? "ok" : "invalid"
  };
}

function normalizeTencentKlineRow(instrument, row) {
  const [date, open, close] = row;
  return {
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    market: instrument.market,
    currency: instrument.currency,
    tradeDate: date,
    closePrice: decimalString(close),
    adjustedClosePrice: decimalString(close),
    source: "Tencent finance kline",
    sourceFetchedAt: new Date().toISOString(),
    qualityStatus: Number(close) > 0 ? "ok" : "invalid"
  };
}

function normalizeNasdaqRow(instrument, row) {
  return {
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    market: instrument.market,
    currency: instrument.currency,
    tradeDate: parseNasdaqDate(row.date),
    closePrice: decimalString(stripMarketNumber(row.close)),
    adjustedClosePrice: decimalString(stripMarketNumber(row.close)),
    source: "Nasdaq historical public API",
    sourceFetchedAt: new Date().toISOString(),
    qualityStatus: Number(stripMarketNumber(row.close)) > 0 ? "ok" : "invalid"
  };
}

function toTencentSymbol(instrument) {
  const symbol = instrument.symbol.toUpperCase();
  if (String(instrument.type || "") === "指数" && instrument.market === "CN" && ["000016", "000300", "000905"].includes(symbol)) return `sh${symbol}`;
  if (instrument.market === "HK") return `hk${symbol.padStart(5, "0")}`;
  if (symbol.startsWith("6") || symbol.startsWith("5")) return `sh${symbol}`;
  return `sz${symbol}`;
}

function historyRequestLimit(range, maxLimit) {
  const start = Date.parse(`${range.dateFrom}T00:00:00.000Z`);
  const end = Date.parse(`${range.dateTo}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return maxLimit;
  const calendarDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 10;
  return Math.max(10, Math.min(maxLimit, calendarDays));
}

function toTencentSimpleQuoteSymbol(instrument) {
  return `s_${toTencentSymbol(instrument)}`;
}

function toEastmoneySecid(instrument) {
  const symbol = instrument.symbol.toUpperCase();
  if (instrument.market === "HK") return `116.${symbol.padStart(5, "0")}`;
  if (instrument.market === "CN") {
    if (symbol.startsWith("6") || symbol.startsWith("5")) return `1.${symbol}`;
    return `0.${symbol}`;
  }
  return symbol;
}

function upsertSnapshots(target, rows, kind) {
  let changedCount = 0;
  for (const row of rows.filter((item) => item.qualityStatus === "ok")) {
    const date = kind === "nav" ? row.navDate : row.tradeDate;
    const index = target.findIndex((item) => item.instrumentSymbol === row.instrumentSymbol && (item.tradeDate || item.navDate) === date && item.source === row.source);
    if (index >= 0) {
      if (JSON.stringify(target[index]) !== JSON.stringify(row)) changedCount += 1;
      target[index] = row;
    } else {
      target.push(row);
      changedCount += 1;
    }
  }
  return changedCount;
}

function upsertRowsByDateAndSource(target, rows) {
  const merged = [...target];
  for (const row of rows) {
    const index = merged.findIndex((item) => item.tradeDate === row.tradeDate && item.source === row.source);
    if (index >= 0) merged[index] = row;
    else merged.push(row);
  }
  return merged.sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
}

function upsertFxRates(target, rows) {
  let changedCount = 0;
  for (const row of rows.filter((item) => item.qualityStatus === "ok")) {
    const index = target.findIndex(
      (item) =>
        item.baseCurrency === row.baseCurrency &&
        item.quoteCurrency === row.quoteCurrency &&
        item.rateDate === row.rateDate &&
        item.source === row.source
    );
    if (index >= 0) {
      if (JSON.stringify(target[index]) !== JSON.stringify(row)) changedCount += 1;
      target[index] = row;
    } else {
      target.push(row);
      changedCount += 1;
    }
  }
  return changedCount;
}

async function readSnapshotShard(instrument, kind) {
  const shardRows = await readJsonArray(snapshotShardPath(instrument, kind));
  if (shardRows.length) return shardRows;

  const legacyFile = kind === "nav" ? navFile : priceFile;
  const legacyRows = await readJsonArray(legacyFile);
  if (!legacyRows.length) return [];

  return legacyRows.filter((row) => row.instrumentSymbol === instrument.symbol);
}

async function writeSnapshotShard(instrument, kind, rows) {
  const file = snapshotShardPath(instrument, kind);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeJson(file, rows);
}

function snapshotShardPath(instrument, kind) {
  const root = kind === "nav" ? navShardDir : priceShardDir;
  const market = sanitizePathSegment(instrument.market || "UNKNOWN");
  const symbol = sanitizePathSegment(instrument.symbol || "UNKNOWN");
  return path.join(root, market, `${symbol}.json`);
}

function sanitizePathSegment(value) {
  return String(value || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/gu, "_");
}

async function appendRun(file, run) {
  const runs = await readJsonArray(file);
  runs.push(run);
  await writeJson(file, runs.slice(-200));
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
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

function compareSnapshot(left, right) {
  const leftKey = `${left.instrumentSymbol}:${left.tradeDate || left.navDate}:${left.source}`;
  const rightKey = `${right.instrumentSymbol}:${right.tradeDate || right.navDate}:${right.source}`;
  return leftKey.localeCompare(rightKey);
}

function compareFxRate(left, right) {
  const leftKey = `${left.baseCurrency}:${left.quoteCurrency}:${left.rateDate}:${left.source}`;
  const rightKey = `${right.baseCurrency}:${right.quoteCurrency}:${right.rateDate}:${right.source}`;
  return leftKey.localeCompare(rightKey);
}

function compactDate(date) {
  return String(date).replaceAll("-", "");
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

async function fetchText(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: publicHeaders(options)
    });
    if (!response.ok) throw new Error(`${url.hostname} HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    if (url.hostname.includes("eastmoney.com")) {
      return curlText(url, options);
    }
    throw new Error(`${url.hostname} fetch failed: ${error?.cause?.message || error.message}`);
  }
}

async function curlText(url, options = {}) {
  const args = [
    "-L",
    "-s",
    "--fail",
    "--max-time",
    "30",
    "-H",
    `User-Agent: ${publicHeaders(options)["User-Agent"]}`,
    "-H",
    `Accept: ${publicHeaders(options).Accept}`,
    "-H",
    `Referer: ${publicHeaders(options).Referer}`,
    String(url)
  ];
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    throw new Error(`${url.hostname} curl fallback failed: ${error.message}`);
  }
}

function publicHeaders(options = {}) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Referer: options.referer || "https://www.eastmoney.com/"
  };
  if (options.origin) headers.Origin = options.origin;
  return headers;
}

function parseNasdaqDate(value) {
  const [month, day, year] = String(value || "").split("/");
  if (!year || !month || !day) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFxPairs(value) {
  return parseList(value)
    .map((item) => {
      const [baseCurrency, quoteCurrency] = item.split("/");
      return {
        baseCurrency: String(baseCurrency || "").trim().toUpperCase(),
        quoteCurrency: String(quoteCurrency || "").trim().toUpperCase()
      };
    })
    .filter((pair) => pair.baseCurrency && pair.quoteCurrency && pair.baseCurrency !== pair.quoteCurrency);
}

function stripMarketNumber(value) {
  return String(value || "").replaceAll("$", "").replaceAll(",", "").trim();
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, delta) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return isoDate(next);
}

function decimalString(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(value);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
