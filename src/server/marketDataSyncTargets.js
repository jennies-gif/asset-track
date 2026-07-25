import fs from "node:fs/promises";
import path from "node:path";

import {
  isMarketDataDatabaseEnabled,
  readMarketDataSyncTargets,
  upsertMarketDataSyncTargets,
  updateMarketDataSyncTargetResults
} from "./marketDataDatabase.js";

export async function registerMarketDataSyncTargets(marketStorageDir, targets) {
  const normalized = dedupeSyncTargets(targets);
  if (!normalized.length) return;
  if (isMarketDataDatabaseEnabled()) {
    await upsertMarketDataSyncTargets(normalized);
    return;
  }
  const file = syncTargetsFile(marketStorageDir);
  const existing = await readJsonArray(file);
  const byKey = new Map(existing.map((target) => [syncTargetKey(target), target]));
  for (const target of normalized) {
    const key = syncTargetKey(target);
    const current = byKey.get(key);
    byKey.set(key, {
      ...current,
      ...target,
      firstRequestedAt: current?.firstRequestedAt || target.requestedAt,
      lastRequestedAt: target.requestedAt,
      status: "active",
      lastError: ""
    });
  }
  await writeJson(file, [...byKey.values()].sort(compareSyncTarget));
}

export async function loadMarketDataSyncTargets(marketStorageDir) {
  return isMarketDataDatabaseEnabled()
    ? readMarketDataSyncTargets()
    : readJsonArray(syncTargetsFile(marketStorageDir));
}

export async function recordMarketDataSyncTargetResults(marketStorageDir, results, syncedAt) {
  const targetResults = (results || [])
    .filter((result) => result?.symbol && result?.market)
    .map((result) => ({
      symbol: canonicalSymbol(result.symbol),
      market: canonicalMarket(result.market),
      status: result.status,
      message: result.message || ""
    }));
  if (!targetResults.length) return;
  if (isMarketDataDatabaseEnabled()) {
    await updateMarketDataSyncTargetResults(targetResults, syncedAt);
    return;
  }
  const file = syncTargetsFile(marketStorageDir);
  const existing = await readJsonArray(file);
  const resultByKey = new Map(targetResults.map((result) => [syncTargetKey(result), result]));
  const next = existing.map((target) => {
    const result = resultByKey.get(syncTargetKey(target));
    if (!result) return target;
    return {
      ...target,
      status: result.status === "synced" ? "active" : "error",
      lastSyncedAt: syncedAt,
      lastError: result.status === "synced" ? "" : result.message || "行情同步失败"
    };
  });
  await writeJson(file, next.sort(compareSyncTarget));
}

function dedupeSyncTargets(targets) {
  const byKey = new Map();
  for (const target of targets || []) {
    const symbol = canonicalSymbol(target?.symbol);
    const market = canonicalMarket(target?.market);
    if (!symbol) continue;
    const key = `${market}:${symbol}`;
    const current = byKey.get(key);
    byKey.set(key, {
      symbol,
      market,
      sourceType: current?.sourceType === "benchmark" || target.sourceType === "benchmark" ? "benchmark" : "user_requested",
      requestedAt: target.requestedAt || new Date().toISOString()
    });
  }
  return [...byKey.values()];
}

function syncTargetsFile(marketStorageDir) {
  return path.join(marketStorageDir, "sync-targets.json");
}

function syncTargetKey(target) {
  return `${canonicalMarket(target?.market)}:${canonicalSymbol(target?.symbol)}`;
}

function canonicalSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase();
}

function canonicalMarket(market) {
  return String(market || "UNKNOWN").trim().toUpperCase();
}

function compareSyncTarget(left, right) {
  return syncTargetKey(left).localeCompare(syncTargetKey(right));
}

async function readJsonArray(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
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
