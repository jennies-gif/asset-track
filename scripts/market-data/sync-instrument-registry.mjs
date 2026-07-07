#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { securityWhitelist } from "../../src/domain/marketData.js";
import { aliasesForInstrument } from "../../src/domain/instrumentAliases.js";
import { cryptoInstruments, preciousMetalInstruments } from "../../src/domain/marketDataSources.js";

const execFileAsync = promisify(execFile);
const storageDir = path.resolve(process.env.MARKET_DATA_DIR || "storage/market-data");
const registryFile = path.join(storageDir, "instrument-registry.json");
const summaryFile = path.join(storageDir, "instrument-registry-summary.json");
const runFile = path.join(storageDir, "market-data-runs.json");
const generatedModuleFile = path.resolve("src/domain/instrumentRegistry.generated.js");

const options = parseArgs(process.argv.slice(2));
const requestedSources = new Set(parseList(options.sources || "cn,us,hk,core"));
const minCount = Number(options["min-count"] || "5000");
const coverageMinimums = {
  CN: Number(options["min-cn"] || "5000"),
  HK: Number(options["min-hk"] || "2000"),
  US: Number(options["min-us"] || "4000")
};
const now = new Date().toISOString();

const sourceAdapters = {
  core: { market: "MIXED", label: "Asset Trail core instruments", fetch: seedCoreInstruments },
  cn: { market: "CN", label: "A 股官方股票列表", fetch: fetchOfficialCn },
  hk: { market: "HK", label: "港股普通证券", fetch: fetchEastmoneyHk },
  us: { market: "US", label: "美股普通股票", fetch: fetchNasdaqTraderUs }
};

await fs.mkdir(storageDir, { recursive: true });

const run = {
  id: `run-sync-instrument-registry-${Date.now()}`,
  command: "sync-instrument-registry",
  startedAt: now,
  requestedSources: [...requestedSources],
  status: "running",
  successCount: 0,
  skippedCount: 0,
  failureCount: 0,
  messages: []
};

const existingRows = await readJsonArray(registryFile);
let rows = [];

for (const source of requestedSources) {
  try {
    const fetched = await fetchSource(source);
    rows.push(...fetched);
    run.successCount += fetched.length;
    run.messages.push({ source, level: "info", message: `${fetched.length} instruments fetched` });
  } catch (error) {
    run.failureCount += 1;
    run.messages.push({ source, level: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

rows.push(...seedCoreInstruments());
rows = normalizeRegistryRows(rows);
rows = mergeExistingRowsForThinMarkets(rows, existingRows);

if (rows.length < minCount && existingRows.length >= minCount) {
  rows = normalizeRegistryRows([...rows, ...existingRows]);
  run.messages.push({
    source: "existing-cache",
    level: "warn",
    message: `fetched registry below minimum ${minCount}; merged ${existingRows.length} cached rows`
  });
}

if (rows.length < minCount) {
  run.failureCount += 1;
  run.messages.push({
    source: "coverage-check",
    level: "error",
    message: `instrument registry coverage too small: ${rows.length}/${minCount}`
  });
}

const summary = buildSummary(rows);
const coverageErrors = validateCoverage(summary);
if (coverageErrors.length) {
  run.failureCount += coverageErrors.length;
  run.messages.push(...coverageErrors.map((message) => ({ source: "coverage-gate", level: "error", message })));
}
await writeJson(registryFile, rows);
await writeJson(summaryFile, summary);
await writeGeneratedModule(generatedModuleFile, rows, summary);

run.status = run.failureCount > 0 ? "completed_with_errors" : "completed";
run.finishedAt = new Date().toISOString();
run.registryCount = rows.length;
run.summary = summary;
await appendRun(runFile, run);

console.log(JSON.stringify(run, null, 2));

async function fetchSource(source) {
  const adapter = sourceAdapters[source];
  if (!adapter) throw new Error(`Unsupported instrument registry source: ${source}`);
  return adapter.fetch();
}

async function fetchOfficialCn() {
  const settled = await Promise.allSettled([fetchSseCnStocks(), fetchSzseCnStocks()]);
  const rows = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  settled
    .filter((result) => result.status === "rejected")
    .forEach((result) => {
      run.messages.push({
        source: "cn-official",
        level: "warn",
        message: result.reason instanceof Error ? result.reason.message : String(result.reason)
      });
    });

  if (rows.length >= 4000) return rows;

  try {
    const fallbackRows = await fetchEastmoneyCn();
    run.messages.push({
      source: "cn-eastmoney-fallback",
      level: rows.length ? "warn" : "info",
      message: `official CN coverage ${rows.length}; merged ${fallbackRows.length} Eastmoney fallback rows`
    });
    return [...rows, ...fallbackRows];
  } catch (error) {
    if (rows.length) {
      run.messages.push({
        source: "cn-eastmoney-fallback",
        level: "warn",
        message: `official CN coverage ${rows.length}; Eastmoney fallback failed: ${error.message}`
      });
      return rows;
    }
    throw error;
  }
}

async function fetchSseCnStocks() {
  const cachePrefix = "sse-stock-list-v2";
  const pageSize = 100;
  const firstPayload = await fetchAndCacheSseStockListPage({ cachePrefix, page: 1, pageSize });
  const firstRows = firstPayload.pageHelp?.data;
  if (!Array.isArray(firstRows)) throw new Error("SSE stock list missing pageHelp.data");
  const total = Number(firstPayload.pageHelp?.total || firstPayload.pageHelp?.recordCount || firstRows.length);
  const pageCount = Number(firstPayload.pageHelp?.pageCount || Math.max(1, Math.ceil(total / pageSize)));
  const rows = [...firstRows];
  for (let page = 2; page <= pageCount; page += 1) {
    const payload = await fetchAndCacheSseStockListPage({ cachePrefix, page, pageSize });
    const pageRows = payload.pageHelp?.data;
    if (!Array.isArray(pageRows)) throw new Error(`SSE stock list page ${page} missing pageHelp.data`);
    rows.push(...pageRows);
  }
  return rows
    .map((row) =>
      registryRow({
        symbol: row.SECURITY_CODE_A,
        name: row.SECURITY_ABBR_A || row.COMPANY_ABBR,
        nameEn: row.ENGLISH_ABBR,
        type: "股票",
        market: "CN",
        exchange: "SSE",
        currency: "CNY",
        universe: inferCnUniverse(row.SECURITY_CODE_A),
        dataSource: "SSE official stock list",
        sourceUpdatedAt: now
      })
    )
    .filter(Boolean);
}

async function fetchAndCacheSseStockListPage({ cachePrefix, page, pageSize }) {
  const cached = await readCachedEastmoneyPage(cachePrefix, page);
  if (cached) return cached;
  const query = [
    "isPagination=true",
    "stockCode=",
    "csrcCode=",
    "areaName=",
    "stockType=1",
    "pageHelp.cacheSize=1",
    `pageHelp.beginPage=${page}`,
    `pageHelp.pageSize=${pageSize}`,
    `pageHelp.pageNo=${page}`,
    `pageHelp.endPage=${page}`
  ].join("&");
  const payload = await fetchJson(`https://query.sse.com.cn/security/stock/getStockListData2.do?${query}`, {
    referer: "https://www.sse.com.cn/assortment/stock/list/share/"
  });
  await writeJson(path.join(storageDir, `${cachePrefix}-${page}.json`), payload);
  return payload;
}

async function fetchSzseCnStocks() {
  const cachePrefix = "szse-stock-list";
  const firstPayload = await fetchAndCacheSzseStockListPage({ cachePrefix, page: 1 });
  const firstReport = firstPayload[0];
  const firstRows = firstReport?.data;
  if (!Array.isArray(firstRows)) throw new Error("SZSE stock list missing report data");
  const pageCount = Number(firstReport.metadata?.pagecount || 1);
  const rows = [...firstRows];
  for (let page = 2; page <= pageCount; page += 1) {
    try {
      const payload = await fetchAndCacheSzseStockListPage({ cachePrefix, page });
      const pageRows = payload[0]?.data;
      if (!Array.isArray(pageRows)) throw new Error(`SZSE stock list page ${page} missing report data`);
      rows.push(...pageRows);
    } catch (error) {
      run.messages.push({
        source: "szse-official",
        level: "warn",
        message: `SZSE stock list page ${page}/${pageCount} failed; kept ${rows.length} rows: ${error.message}`
      });
      break;
    }
  }
  return rows
    .map((row) =>
      registryRow({
        symbol: row.agdm,
        name: stripHtml(row.agjc),
        type: "股票",
        market: "CN",
        exchange: "SZSE",
        currency: "CNY",
        universe: inferCnUniverse(row.agdm),
        dataSource: "SZSE official A-share list",
        sourceUpdatedAt: now
      })
    )
    .filter(Boolean);
}

async function fetchAndCacheSzseStockListPage({ cachePrefix, page }) {
  const cached = await readCachedEastmoneyPage(cachePrefix, page);
  if (cached) return cached;
  const query = [
    "SHOWTYPE=JSON",
    "CATALOGID=1110",
    "TABKEY=tab1",
    `PAGENO=${page}`,
    `random=${Date.now()}`
  ].join("&");
  const payload = await fetchJson(`https://www.szse.cn/api/report/ShowReport/data?${query}`, {
    referer: "https://www.szse.cn/market/product/stock/list/index.html"
  });
  await writeJson(path.join(storageDir, `${cachePrefix}-${page}.json`), payload);
  return payload;
}

async function fetchEastmoneyCn() {
  const rows = await fetchEastmoneyClistPages({
    cachePrefix: "cn-clist",
    fs: "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048",
    fields: "f12,f13,f14,f100",
    referer: "https://quote.eastmoney.com/center/gridlist.html",
    pageSize: 100,
    maxPages: 80
  });
  return rows
    .map((row) => {
      const symbol = String(row.f12 || "").padStart(6, "0");
      const exchange = eastmoneyCnExchange(row.f13, symbol);
      return registryRow({
        symbol,
        name: row.f14,
        type: "股票",
        market: "CN",
        exchange,
        currency: "CNY",
        universe: "cn-main",
        dataSource: "Eastmoney quote clist A-share",
        sourceUpdatedAt: now
      });
    })
    .filter(Boolean);
}

async function fetchEastmoneyHk() {
  const hkexRows = await readHkexListOfSecurities();
  const rows = hkexRows.length
    ? hkexRows
    : await fetchEastmoneyClistPages({
        cachePrefix: "hk-clist",
        fs: "m:128+t:3,m:128+t:4,m:128+t:1,m:128+t:2",
        fields: "f12,f14",
        referer: "https://quote.eastmoney.com/center/gridlist.html#hk_stocks",
        pageSize: 100,
        maxPages: 40
      });
  return rows
    .map((row) =>
      registryRow({
        symbol: String(row.symbol || row.f12 || "").padStart(5, "0"),
        name: row.name || row.f14,
        type: row.type || "股票",
        market: "HK",
        exchange: "HKEX",
        currency: "HKD",
        universe: "hk-main",
        dataSource: row.dataSource || "Eastmoney quote clist HK",
        sourceUpdatedAt: now
      })
    )
    .filter(Boolean);
}

async function fetchEastmoneyClistPages({ cachePrefix, fs: fsValue, fields, referer, pageSize, maxPages }) {
  const singleCache = await readOptionalText(path.join(storageDir, `${cachePrefix}.json`));
  const firstPayload =
    await readCachedEastmoneyPage(cachePrefix, 1) ||
    (singleCache ? JSON.parse(singleCache) : null) ||
    await fetchAndCacheEastmoneyClistPage({ cachePrefix, page: 1, pageSize, fsValue, fields, referer });
  const firstRows = firstPayload.data?.diff;
  if (!Array.isArray(firstRows)) throw new Error(`${cachePrefix} 缺少 data.diff`);

  const total = Number(firstPayload.data?.total || firstRows.length);
  const pageCount = Math.min(maxPages, Math.max(1, Math.ceil(total / pageSize)));
  const rows = [...firstRows];
  for (let page = 2; page <= pageCount; page += 1) {
    try {
      const payload =
        await readCachedEastmoneyPage(cachePrefix, page) ||
        await fetchAndCacheEastmoneyClistPage({ cachePrefix, page, pageSize, fsValue, fields, referer });
      const pageRows = payload.data?.diff;
      if (!Array.isArray(pageRows)) throw new Error(`${cachePrefix} 第 ${page} 页缺少 data.diff`);
      rows.push(...pageRows);
    } catch (error) {
      if (rows.length >= pageSize) return rows;
      throw new Error(`${cachePrefix} 第 ${page}/${pageCount} 页同步失败，已获取 ${rows.length}/${total} 条: ${error.message}`);
    }
  }
  return rows;
}

async function fetchEastmoneyClistPage({ page, pageSize, fsValue, fields, referer }) {
  const query = [
    `pn=${page}`,
    `pz=${pageSize}`,
    "po=1",
    "np=1",
    "ut=bd1d9ddb04089700cf9c27f6f7426281",
    "fltt=2",
    "invt=2",
    "fid=f12",
    `fs=${fsValue}`,
    `fields=${fields}`
  ].join("&");
  const url = `https://push2.eastmoney.com/api/qt/clist/get?${query}`;
  return fetchJson(url, { referer });
}

async function readCachedEastmoneyPage(cachePrefix, page) {
  const cached = await readOptionalText(path.join(storageDir, `${cachePrefix}-${page}.json`));
  return cached ? JSON.parse(cached) : null;
}

async function fetchAndCacheEastmoneyClistPage(options) {
  const payload = await fetchEastmoneyClistPage(options);
  await writeJson(path.join(storageDir, `${options.cachePrefix}-${options.page}.json`), payload);
  return payload;
}

async function readHkexListOfSecurities() {
  const cached = await firstExistingText([
    path.join(storageDir, "hkex-list-of-securities.csv"),
    path.join(storageDir, "hkex-list-of-securities.txt")
  ]);
  if (cached) return parseHkexDelimitedList(cached);
  return [];
}

async function fetchNasdaqTraderUs() {
  const [nasdaqListed, otherListed] = await Promise.all([
    readOptionalText(path.join(storageDir, "nasdaqlisted.txt")).then((cached) => cached || fetchText(new URL("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"), {
      referer: "https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs"
    })),
    readOptionalText(path.join(storageDir, "otherlisted.txt")).then((cached) => cached || fetchText(new URL("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"), {
      referer: "https://www.nasdaqtrader.com/trader.aspx?id=symboldirdefs"
    }))
  ]);
  return [...parseNasdaqListed(nasdaqListed), ...parseOtherListed(otherListed)];
}

function parseNasdaqListed(text) {
  return parsePipeRows(text)
    .filter((row) => row.Symbol && row["Test Issue"] !== "Y" && row["Financial Status"] !== "D")
    .filter((row) => !shouldSkipUsDirectoryRow(row.Symbol, row["Security Name"], row.ETF))
    .map((row) =>
      registryRow({
        symbol: row.Symbol,
        name: cleanUsSecurityName(row["Security Name"]),
        type: row.ETF === "Y" ? "ETF" : "股票",
        market: "US",
        exchange: "NASDAQ",
        currency: "USD",
        universe: row.ETF === "Y" ? "us-etf" : "us-listed",
        dataSource: "Nasdaq Trader symbol directory",
        sourceUpdatedAt: now
      })
    )
    .filter(Boolean);
}

function parseOtherListed(text) {
  const exchangeMap = { A: "NYSE American", N: "NYSE", P: "NYSE Arca", Z: "BATS", V: "IEXG" };
  return parsePipeRows(text)
    .filter((row) => row["ACT Symbol"] && row["Test Issue"] !== "Y")
    .filter((row) => !shouldSkipUsDirectoryRow(row["ACT Symbol"], row["Security Name"], row.ETF))
    .map((row) =>
      registryRow({
        symbol: row["ACT Symbol"],
        name: cleanUsSecurityName(row["Security Name"]),
        type: row.ETF === "Y" ? "ETF" : "股票",
        market: "US",
        exchange: exchangeMap[row.Exchange] || row.Exchange || "US",
        currency: "USD",
        universe: row.ETF === "Y" ? "us-etf" : "us-listed",
        dataSource: "Nasdaq Trader symbol directory",
        sourceUpdatedAt: now
      })
    )
    .filter(Boolean);
}

function seedCoreInstruments() {
  return [...securityWhitelist, ...cryptoInstruments, ...preciousMetalInstruments]
    .map((item) =>
      registryRow({
        ...item,
        type: item.type || "其他",
        exchange: item.exchange || inferExchange(item),
        dataSource: item.source || "Asset Trail core whitelist",
        sourceUpdatedAt: now
      })
    )
    .filter(Boolean);
}

function registryRow(input) {
  const symbol = normalizeSymbol(input.symbol, input.market);
  const name = String(input.name || "").trim();
  const market = String(input.market || "").trim().toUpperCase();
  const type = normalizeType(input.type || input.assetType);
  if (!name || !market || (!symbol && !["CASH", "OTHER"].includes(market))) return null;
  const exchange = String(input.exchange || inferExchange(input) || "").trim();
  const currency = String(input.currency || defaultCurrencyForMarket(market)).trim().toUpperCase();
  const aliases = normalizeAliases([input.aliases, input.nameEn, input.shortName, input.symbol, input.name, aliasesForInstrument({ market, symbol })].flat());
  return {
    id: [market, typeKey(type), exchange, symbol || slugName(name)].filter(Boolean).join(":"),
    name,
    symbol,
    market,
    exchange,
    type,
    currency,
    aliases,
    status: input.status || "active",
    universe: input.universe || universeFor({ market, type }),
    marketDataSupported: input.marketDataSupported ?? marketDataSupported({ market, type, symbol }),
    dataSource: String(input.dataSource || input.source || "unknown").trim(),
    sourceUpdatedAt: input.sourceUpdatedAt || now,
    updatedAt: now
  };
}

function normalizeRegistryRows(rawRows) {
  const byKey = new Map();
  for (const row of rawRows) {
    const normalized = registryRow(row);
    if (!normalized) continue;
    const key = `${normalized.market}:${normalized.symbol || normalized.name}:${normalized.type}`;
    const current = byKey.get(key);
    if (!current || scoreRegistryRow(normalized) > scoreRegistryRow(current)) {
      byKey.set(key, current ? mergeRegistryRows(current, normalized) : normalized);
    } else {
      byKey.set(key, mergeRegistryRows(normalized, current));
    }
  }
  return [...byKey.values()].sort(compareRegistryRows);
}

function mergeRegistryRows(base, preferred) {
  return {
    ...base,
    ...preferred,
    aliases: normalizeAliases([base.aliases, preferred.aliases].flat()),
    dataSource: preferred.dataSource || base.dataSource,
    sourceUpdatedAt: preferred.sourceUpdatedAt || base.sourceUpdatedAt
  };
}

function scoreRegistryRow(row) {
  return [
    row.name && !/^\w+$/u.test(row.name) ? 10 : 0,
    row.exchange ? 4 : 0,
    row.aliases?.length ? 2 : 0,
    row.dataSource !== "unknown" ? 1 : 0
  ].reduce((sum, item) => sum + item, 0);
}

function buildSummary(rows) {
  const byMarket = countBy(rows, (row) => row.market);
  const byType = countBy(rows, (row) => row.type);
  const bySource = countBy(rows, (row) => row.dataSource);
  return {
    count: rows.length,
    generatedAt: now,
    byMarket,
    byType,
    bySource,
    minimumTarget: minCount
  };
}

async function writeGeneratedModule(file, rows, summary) {
  const body = [
    "// Generated by scripts/market-data/sync-instrument-registry.mjs. Do not edit by hand.",
    `export const instrumentRegistryGeneratedAt = ${JSON.stringify(summary.generatedAt)};`,
    `export const instrumentRegistrySummary = ${JSON.stringify(summary, null, 2)};`,
    `export const instrumentRegistry = ${JSON.stringify(rows, null, 2)};`,
    ""
  ].join("\n");
  await fs.writeFile(file, body);
}

function parsePipeRows(text) {
  const lines = String(text || "").split(/\r?\n/u).filter((line) => line && !line.startsWith("File Creation Time"));
  const headers = lines.shift()?.split("|") || [];
  return lines
    .map((line) => {
      const values = line.split("|");
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    })
    .filter((row) => Object.values(row).some(Boolean));
}

function parseHkexDelimitedList(text) {
  const lines = String(text || "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => /stock\s*code|stock\s*short\s*name|股份代號|股份簡稱/iu.test(line));
  if (headerIndex < 0) return [];
  const delimiter = lines[headerIndex].includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(lines[headerIndex], delimiter).map(normalizeHkexHeader);
  return lines.slice(headerIndex + 1)
    .map((line) => Object.fromEntries(splitDelimitedLine(line, delimiter).map((value, index) => [headers[index], value.trim()])))
    .filter((row) => row.symbol && row.name)
    .filter((row) => !shouldSkipHkSecurity(row))
    .map((row) => ({
      symbol: row.symbol,
      name: row.name,
      type: /reit|房地產投資信託|房地产投资信托/iu.test(row.category || row.name) ? "REIT" : /etf|交易所買賣基金|交易所买卖基金/iu.test(row.category || row.name) ? "ETF" : "股票",
      dataSource: "HKEX list of securities cache"
    }));
}

function splitDelimitedLine(line, delimiter) {
  if (delimiter === "\t") return line.split("\t");
  const values = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  values.push(current);
  return values;
}

function normalizeHkexHeader(header) {
  const value = String(header || "").trim().toLowerCase();
  if (/stock\s*code|股份代號|股份代码/u.test(value)) return "symbol";
  if (/stock\s*short\s*name|name of securities|股份簡稱|股份简称|證券名稱|证券名称/u.test(value)) return "name";
  if (/category|type|類別|类别/u.test(value)) return "category";
  return value.replace(/\W+/gu, "_");
}

function shouldSkipHkSecurity(row) {
  const text = `${row.name || ""} ${row.category || ""}`;
  return /warrant|牛熊|callable bull|bear contract|cbbc|inline warrant|right|rights|債|债|bond|note|structured|衍生|槓桿|杠杆|inverse|反向/iu.test(text);
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

async function readOptionalText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function firstExistingText(files) {
  for (const file of files) {
    const text = await readOptionalText(file);
    if (text) return text;
  }
  return "";
}

async function writeJson(file, data) {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url, options));
}

async function fetchText(url, options = {}) {
  const target = typeof url === "string" ? new URL(url) : url;
  const urlText = typeof url === "string" ? url : String(url);
  let response;
  try {
    response = await fetch(urlText, { headers: publicHeaders(options) });
    if (!response.ok) throw new Error(`${target.hostname} HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    return curlText(urlText, options, error);
  }
}

async function curlText(url, options = {}, originalError) {
  const target = typeof url === "string" ? new URL(url) : url;
  const urlText = typeof url === "string" ? url : String(url);
  const headers = publicHeaders(options);
  const args = [
    "-L",
    "-s",
    "--fail",
    "--max-time",
    "45",
    "-H",
    `User-Agent: ${headers["User-Agent"]}`,
    "-H",
    `Accept: ${headers.Accept}`,
    "-H",
    `Referer: ${headers.Referer}`,
    urlText
  ];
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 80 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    throw new Error(`${target.hostname} fetch failed: ${originalError?.message || ""}; curl fallback failed: ${error.message}`);
  }
}

function publicHeaders(options = {}) {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    Referer: options.referer || "https://www.eastmoney.com/"
  };
}

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, value = "true"] = arg.slice(2).split("=");
    parsed[key] = value;
  }
  return parsed;
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSymbol(symbol, market) {
  const raw = String(symbol || "").trim().toUpperCase();
  if (!raw) return "";
  if (String(market).toUpperCase() === "HK" && /^\d{1,5}$/u.test(raw)) return raw.padStart(5, "0");
  if (String(market).toUpperCase() === "CN" && /^\d{1,6}$/u.test(raw)) return raw.padStart(6, "0");
  return raw.replace(/\.(HK|US|SZ|SH)$/u, "");
}

function normalizeType(type) {
  const value = String(type || "").trim();
  if (/reit|房地產|房地产/iu.test(value)) return "REIT";
  if (/etf/iu.test(value)) return "ETF";
  if (/fund|基金/iu.test(value)) return "基金";
  if (/crypto|数字/iu.test(value)) return "数字资产";
  if (/metal|贵金属/iu.test(value)) return "贵金属";
  if (/index|指数/iu.test(value)) return "指数";
  if (/cash|现金/iu.test(value)) return "现金";
  if (/stock|股票/iu.test(value)) return "股票";
  return value || "其他";
}

function normalizeAliases(values) {
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, 12);
}

function cleanUsSecurityName(name) {
  return String(name || "")
    .replace(/\s+-\s+Common Stock.*$/iu, "")
    .replace(/\s+Common Stock.*$/iu, "")
    .replace(/\s+Class [A-Z].*$/iu, "")
    .replace(/\s+Ordinary Shares.*$/iu, "")
    .replace(/\s+American Depositary Shares.*$/iu, "")
    .replace(/\s+ETF$/iu, " ETF")
    .trim();
}

function shouldSkipUsDirectoryRow(symbol, name, etfFlag) {
  const normalizedSymbol = String(symbol || "");
  const normalizedName = String(name || "");
  if (/[.$/]/u.test(normalizedSymbol)) return true;
  return /warrant|right|unit|preferred|depositary|note|bond|debenture|subordinated|senior notes|baby bond|etn|trust certificate/iu.test(normalizedName);
}

function eastmoneyCnExchange(code, symbol) {
  if (String(code) === "1" || symbol.startsWith("6")) return "SSE";
  if (String(code) === "0" || symbol.startsWith("0") || symbol.startsWith("3")) return "SZSE";
  if (symbol.startsWith("8") || symbol.startsWith("9")) return "BSE";
  return "CN";
}

function inferExchange(input) {
  const market = String(input.market || "").toUpperCase();
  const symbol = String(input.symbol || "");
  if (market === "HK") return "HKEX";
  if (market === "WEB3") return "WEB3";
  if (market === "METAL") return "METAL";
  if (market === "CN") return eastmoneyCnExchange("", symbol);
  return "";
}

function defaultCurrencyForMarket(market) {
  if (market === "CN") return "CNY";
  if (market === "HK") return "HKD";
  if (market === "US" || market === "WEB3" || market === "METAL") return "USD";
  return "USD";
}

function universeFor({ market, type }) {
  if (market === "WEB3") return "crypto";
  if (market === "METAL") return "precious-metals";
  if (type === "ETF") return "etf";
  if (type === "REIT") return "reit";
  if (market === "CN") return "cn-main";
  if (market === "HK") return "hk-main";
  if (market === "US") return "us-listed";
  return "manual";
}

function inferCnUniverse(symbol) {
  const value = String(symbol || "");
  if (value.startsWith("688")) return "cn-star";
  if (value.startsWith("300")) return "cn-chinext";
  if (value.startsWith("8") || value.startsWith("9")) return "cn-bse";
  return "cn-main";
}

function marketDataSupported({ market, type, symbol }) {
  if (!symbol) return false;
  if (["现金", "实物资产", "其他"].includes(type)) return false;
  return ["CN", "HK", "US", "WEB3", "METAL"].includes(market);
}

function typeKey(type) {
  return {
    股票: "STOCK",
    ETF: "ETF",
    REIT: "REIT",
    基金: "FUND",
    指数: "INDEX",
    数字资产: "CRYPTO",
    贵金属: "METAL",
    现金: "CASH"
  }[type] || "OTHER";
}

function slugName(name) {
  return String(name || "").trim().toUpperCase().replace(/\s+/gu, "-").slice(0, 32);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/gu, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .trim();
}

function compareRegistryRows(left, right) {
  return `${left.market}:${left.type}:${left.symbol || left.name}`.localeCompare(
    `${right.market}:${right.type}:${right.symbol || right.name}`,
    "zh-CN"
  );
}

function countBy(rows, pickKey) {
  return rows.reduce((counts, row) => {
    const key = pickKey(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function validateCoverage(summary) {
  const errors = [];
  for (const [market, minimum] of Object.entries(coverageMinimums)) {
    if (!requestedSources.has(market.toLowerCase()) && !(market === "CN" && requestedSources.has("cn")) && !(market === "HK" && requestedSources.has("hk")) && !(market === "US" && requestedSources.has("us"))) {
      continue;
    }
    const count = summary.byMarket[market] || 0;
    if (count < minimum) errors.push(`${market} instrument coverage too small: ${count}/${minimum}`);
  }
  return errors;
}

function mergeExistingRowsForThinMarkets(rows, existingRows) {
  if (!existingRows.length) return rows;
  const marketsToProtect = Object.entries(coverageMinimums)
    .filter(([market, minimum]) => isMarketSourceRequested(market) && minimum > 0)
    .map(([market, minimum]) => ({ market, minimum }));
  if (!marketsToProtect.length) return rows;

  const summary = buildSummary(rows);
  let merged = rows;
  for (const { market, minimum } of marketsToProtect) {
    const count = summary.byMarket[market] || 0;
    if (count >= minimum) continue;
    const existingMarketRows = existingRows.filter((row) => row.market === market);
    if (!existingMarketRows.length || existingMarketRows.length <= count) continue;
    merged = [...merged, ...existingMarketRows];
    run.messages.push({
      source: "existing-cache",
      level: "warn",
      message: `${market} coverage below minimum ${count}/${minimum}; merged ${existingMarketRows.length} cached ${market} instruments`
    });
  }
  return merged === rows ? rows : normalizeRegistryRows(merged);
}

function isMarketSourceRequested(market) {
  return (
    requestedSources.has(market.toLowerCase()) ||
    (market === "CN" && requestedSources.has("cn")) ||
    (market === "HK" && requestedSources.has("hk")) ||
    (market === "US" && requestedSources.has("us"))
  );
}
