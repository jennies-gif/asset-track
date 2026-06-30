#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const storageDir = path.resolve("storage/market-data");
const priceFile = path.join(storageDir, "price-snapshots.json");
const navFile = path.join(storageDir, "fund-nav-snapshots.json");
const priceShardDir = path.join(storageDir, "prices");
const navShardDir = path.join(storageDir, "fund-nav");
const options = parseArgs(process.argv.slice(2));
const archiveLegacy = options["archive-legacy"] !== "false";

await fs.mkdir(storageDir, { recursive: true });

const priceRows = await readJsonArray(priceFile);
const navRows = await readJsonArray(navFile);

const priceResult = await writeShards(priceRows, "price");
const navResult = await writeShards(navRows, "nav");

const archived = [];
if (archiveLegacy) {
  if (priceRows.length) archived.push(await archiveFile(priceFile));
  if (navRows.length) archived.push(await archiveFile(navFile));
}

console.log(
  JSON.stringify(
    {
      status: "completed",
      priceRows: priceRows.length,
      priceFiles: priceResult.fileCount,
      navRows: navRows.length,
      navFiles: navResult.fileCount,
      archived: archived.filter(Boolean)
    },
    null,
    2
  )
);

async function writeShards(rows, kind) {
  const grouped = new Map();
  for (const row of rows) {
    const market = sanitizePathSegment(row.market || "UNKNOWN");
    const symbol = sanitizePathSegment(row.instrumentSymbol || "UNKNOWN");
    const key = `${market}:${symbol}`;
    const bucket = grouped.get(key) || { market, symbol, rows: [] };
    bucket.rows.push(row);
    grouped.set(key, bucket);
  }

  for (const bucket of grouped.values()) {
    const root = kind === "nav" ? navShardDir : priceShardDir;
    const file = path.join(root, bucket.market, `${bucket.symbol}.json`);
    const existing = await readJsonArray(file);
    const merged = mergeRows(existing, bucket.rows, kind);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeJson(file, merged.sort(compareSnapshot));
  }

  return { fileCount: grouped.size };
}

function mergeRows(existingRows, incomingRows, kind) {
  const merged = [...existingRows];
  for (const row of incomingRows) {
    const date = kind === "nav" ? row.navDate : row.tradeDate;
    const index = merged.findIndex(
      (item) => item.instrumentSymbol === row.instrumentSymbol && (item.tradeDate || item.navDate) === date && item.source === row.source
    );
    if (index >= 0) merged[index] = row;
    else merged.push(row);
  }
  return merged;
}

async function archiveFile(file) {
  try {
    await fs.access(file);
  } catch {
    return null;
  }
  const archivePath = `${file}.legacy`;
  await fs.rename(file, archivePath);
  return path.relative(process.cwd(), archivePath);
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

function sanitizePathSegment(value) {
  return String(value || "UNKNOWN")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/gu, "_");
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
