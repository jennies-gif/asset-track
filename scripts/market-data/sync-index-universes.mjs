#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const storageDir = path.resolve("storage/market-data");
const universesFile = path.join(storageDir, "index-universes.json");
const constituentsFile = path.join(storageDir, "index-constituents.json");
const runFile = path.join(storageDir, "market-data-runs.json");

const today = isoDate(new Date());
const options = parseArgs(process.argv.slice(2));
const requestedUniverses = parseList(options.universes || "csi300,hstech,nasdaq100");
const effectiveFrom = options["effective-from"] || today;

const universeDefinitions = {
  csi300: {
    indexKey: "csi300",
    name: "沪深 300",
    market: "CN",
    currency: "CNY",
    minCount: 250,
    maxCount: 350,
    source: "Eastmoney RPT_INDEX_TS_COMPONENT"
  },
  hstech: {
    indexKey: "hstech",
    name: "恒生科技",
    market: "HK",
    currency: "HKD",
    minCount: 20,
    maxCount: 40,
    source: "Goldman Sachs Warrants HSTECH constituents"
  },
  nasdaq100: {
    indexKey: "nasdaq100",
    name: "Nasdaq 100",
    market: "US",
    currency: "USD",
    minCount: 90,
    maxCount: 120,
    source: "Nasdaq list-type nasdaq100 public API"
  }
};

for (const key of requestedUniverses) {
  if (!universeDefinitions[key]) {
    console.error(`Unsupported universe: ${key}`);
    process.exit(1);
  }
}

await fs.mkdir(storageDir, { recursive: true });

const run = {
  id: `run-sync-universes-${Date.now()}`,
  command: "sync-universes",
  startedAt: new Date().toISOString(),
  requestedUniverses,
  effectiveFrom,
  status: "running",
  successCount: 0,
  skippedCount: 0,
  failureCount: 0,
  messages: []
};

const existingUniverses = await readJsonArray(universesFile);
const existingConstituents = await readJsonArray(constituentsFile);
const nextUniverses = [...existingUniverses];
let nextConstituents = [...existingConstituents];

for (const indexKey of requestedUniverses) {
  const definition = universeDefinitions[indexKey];
  try {
    const rows = await fetchUniverse(definition);
    validateUniverseRows(definition, rows);

    upsertUniverse(nextUniverses, definition);
    const result = mergeConstituents(nextConstituents, rows, definition);
    nextConstituents = result.rows;
    run.successCount += rows.length;
    run.messages.push({
      indexKey,
      level: "info",
      message: `${rows.length} constituents fetched, ${result.added} added, ${result.updated} updated, ${result.closed} closed`
    });
  } catch (error) {
    run.failureCount += 1;
    run.messages.push({
      indexKey,
      level: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

run.status = run.failureCount > 0 ? "completed_with_errors" : "completed";
run.finishedAt = new Date().toISOString();

await writeJson(universesFile, nextUniverses.sort((left, right) => left.indexKey.localeCompare(right.indexKey)));
await writeJson(constituentsFile, nextConstituents.sort(compareConstituent));
await appendRun(runFile, run);

console.log(JSON.stringify(run, null, 2));

async function fetchUniverse(definition) {
  if (definition.indexKey === "csi300") return fetchCsi300(definition);
  if (definition.indexKey === "hstech") return fetchHstech(definition);
  if (definition.indexKey === "nasdaq100") return fetchNasdaq100(definition);
  throw new Error(`Unsupported universe: ${definition.indexKey}`);
}

async function fetchCsi300(definition) {
  const url = new URL("https://datacenter-web.eastmoney.com/api/data/v1/get");
  url.searchParams.set("reportName", "RPT_INDEX_TS_COMPONENT");
  url.searchParams.set("columns", "SECUCODE,SECURITY_CODE,TYPE,SECURITY_NAME_ABBR,WEIGHT");
  url.searchParams.set("source", "WEB");
  url.searchParams.set("client", "WEB");
  url.searchParams.set("pageNumber", "1");
  url.searchParams.set("pageSize", "500");
  url.searchParams.set("sortColumns", "SECURITY_CODE");
  url.searchParams.set("sortTypes", "1");
  url.searchParams.set("filter", '(TYPE="1")');

  const payload = await fetchJson(url, {
    referer: "https://data.eastmoney.com/other/index/hs300.html"
  });
  const rows = payload.result?.data;
  if (!Array.isArray(rows)) throw new Error("东方财富沪深300成分股接口缺少 result.data");

  const fetchedAt = new Date().toISOString();
  return rows.map((row) => {
    const exchange = String(row.SECUCODE || "").endsWith(".SH") ? "SSE" : "SZSE";
    return {
      indexKey: definition.indexKey,
      symbol: String(row.SECURITY_CODE || "").padStart(6, "0"),
      name: String(row.SECURITY_NAME_ABBR || "").trim(),
      market: "CN",
      exchange,
      currency: "CNY",
      assetType: "stock",
      weightBps: percentToBps(row.WEIGHT),
      effectiveFrom,
      effectiveTo: null,
      source: definition.source,
      sourceFetchedAt: fetchedAt
    };
  });
}

async function fetchHstech(definition) {
  const url = new URL("https://www.gswarrants.com.hk/sc/ajax/constituents-result");
  url.searchParams.set("type", "HSTECH");
  url.searchParams.set("order", "3");
  url.searchParams.set("desc", "0");

  const payload = await fetchJson(url, {
    referer: "https://www.gswarrants.com.hk/sc/tools/hstech-constituents"
  });
  if (typeof payload.data !== "string") throw new Error("高盛恒生科技成分股接口缺少 data HTML");

  const fetchedAt = new Date().toISOString();
  const rows = [];
  const rowPattern = /<tr[^>]+data-underlying='([^']+)'[\s\S]*?<a[^>]+class='underlying'>([\s\S]*?)<br/gu;
  for (const match of payload.data.matchAll(rowPattern)) {
    const rawSymbol = match[1];
    if (!/^\d{5}$/u.test(rawSymbol)) continue;
    rows.push({
      indexKey: definition.indexKey,
      symbol: rawSymbol,
      name: decodeHtml(stripTags(match[2])).trim(),
      market: "HK",
      exchange: "HKEX",
      currency: "HKD",
      assetType: "stock",
      weightBps: null,
      effectiveFrom,
      effectiveTo: null,
      source: definition.source,
      sourceFetchedAt: fetchedAt
    });
  }
  return dedupeRows(rows);
}

async function fetchNasdaq100(definition) {
  const url = new URL("https://api.nasdaq.com/api/quote/list-type/nasdaq100");
  const payload = await fetchJson(url, {
    referer: "https://www.nasdaq.com/solutions/global-indexes/nasdaq-100/companies",
    origin: "https://www.nasdaq.com"
  });
  const rows = payload.data?.data?.rows;
  if (!Array.isArray(rows)) throw new Error("Nasdaq 100 接口缺少 data.data.rows");

  const fetchedAt = new Date().toISOString();
  return rows.map((row) => ({
    indexKey: definition.indexKey,
    symbol: String(row.symbol || "").trim().toUpperCase(),
    name: normalizeNasdaqName(row.companyName),
    market: "US",
    exchange: "NASDAQ",
    currency: "USD",
    assetType: "stock",
    weightBps: null,
    effectiveFrom,
    effectiveTo: null,
    source: definition.source,
    sourceFetchedAt: fetchedAt
  }));
}

function validateUniverseRows(definition, rows) {
  const count = rows.length;
  if (count < definition.minCount || count > definition.maxCount) {
    throw new Error(`${definition.name} 成分股数量异常: ${count}`);
  }
  const invalid = rows.find((row) => !row.symbol || !row.name || !row.market || !row.currency);
  if (invalid) throw new Error(`${definition.name} 成分股字段缺失: ${JSON.stringify(invalid)}`);
}

function upsertUniverse(universes, definition) {
  const now = new Date().toISOString();
  const index = universes.findIndex((item) => item.indexKey === definition.indexKey);
  const row = {
    indexKey: definition.indexKey,
    name: definition.name,
    market: definition.market,
    currency: definition.currency,
    source: definition.source,
    sourceFetchedAt: now,
    createdAt: index >= 0 ? universes[index].createdAt : now,
    updatedAt: now
  };
  if (index >= 0) universes[index] = { ...universes[index], ...row };
  else universes.push(row);
}

function mergeConstituents(existingRows, fetchedRows, definition) {
  const now = new Date().toISOString();
  const fetchedSymbols = new Set(fetchedRows.map((row) => row.symbol));
  let added = 0;
  let updated = 0;
  let closed = 0;
  const nextRows = existingRows.map((row) => ({ ...row }));

  for (const fetched of fetchedRows) {
    const activeIndex = nextRows.findIndex(
      (row) => row.indexKey === definition.indexKey && row.symbol === fetched.symbol && !row.effectiveTo
    );
    if (activeIndex >= 0) {
      nextRows[activeIndex] = {
        ...nextRows[activeIndex],
        ...fetched,
        effectiveFrom: nextRows[activeIndex].effectiveFrom,
        effectiveTo: null,
        createdAt: nextRows[activeIndex].createdAt,
        updatedAt: now
      };
      updated += 1;
    } else {
      nextRows.push({
        ...fetched,
        createdAt: now,
        updatedAt: now
      });
      added += 1;
    }
  }

  const closedTo = addDays(effectiveFrom, -1);
  for (const row of nextRows) {
    if (row.indexKey !== definition.indexKey || row.effectiveTo || fetchedSymbols.has(row.symbol)) continue;
    row.effectiveTo = closedTo;
    row.updatedAt = now;
    closed += 1;
  }

  return { rows: nextRows, added, updated, closed };
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
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
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

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

async function fetchText(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { headers: publicHeaders(options) });
    if (!response.ok) throw new Error(`${url.hostname} HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    return curlText(url, options, error);
  }
}

async function curlText(url, options = {}, originalError) {
  const headers = publicHeaders(options);
  const args = [
    "-L",
    "-s",
    "--fail",
    "--max-time",
    "30",
    "-H",
    `User-Agent: ${headers["User-Agent"]}`,
    "-H",
    `Accept: ${headers.Accept}`,
    "-H",
    `Referer: ${headers.Referer}`,
    String(url)
  ];
  if (headers.Origin) args.splice(args.length - 1, 0, "-H", `Origin: ${headers.Origin}`);
  try {
    const { stdout } = await execFileAsync("curl", args, { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    throw new Error(`${url.hostname} fetch failed: ${originalError?.message || ""}; curl fallback failed: ${error.message}`);
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

function compareConstituent(left, right) {
  return `${left.indexKey}:${left.symbol}:${left.effectiveFrom}`.localeCompare(
    `${right.indexKey}:${right.symbol}:${right.effectiveFrom}`
  );
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.indexKey}:${row.symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeNasdaqName(value) {
  return String(value || "")
    .replace(/\s+Common Stock.*$/iu, "")
    .replace(/\s+Class [A-Z].*$/iu, "")
    .replace(/\s+Ordinary Shares.*$/iu, "")
    .replace(/\s+American Depositary Shares.*$/iu, "")
    .trim();
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/gu, "");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#039;/gu, "'")
    .replace(/&nbsp;/gu, " ");
}

function percentToBps(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, delta) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return isoDate(next);
}
