#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

import { upsertInstrumentRegistryRows } from "../../src/server/marketDataDatabase.js";

const storageDir = path.resolve(process.env.MARKET_DATA_DIR || "storage/market-data");
const registryFile = path.join(storageDir, "instrument-registry.json");
const options = parseArgs(process.argv.slice(2));
const batchSize = Math.max(1, Number(options["batch-size"] || "500"));
const maxRetries = Math.max(0, Number(options.retries || "3"));
const startOffset = Math.max(0, Number(options.start || "0"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const rows = JSON.parse(await fs.readFile(registryFile, "utf8"));
let changedTotal = 0;

console.log(JSON.stringify({
  action: "import-instrument-registry",
  registryFile,
  rows: rows.length,
  batchSize,
  start: startOffset
}));

for (let start = startOffset; start < rows.length; start += batchSize) {
  const batch = rows.slice(start, start + batchSize);
  const end = start + batch.length;
  const changed = await importBatchWithRetry(batch, { start, end });
  changedTotal += changed;
  console.log(JSON.stringify({
    imported: end,
    total: rows.length,
    changedTotal,
    percent: Number(((end / rows.length) * 100).toFixed(2))
  }));
}

console.log(JSON.stringify({
  imported: rows.length,
  changed: changedTotal,
  status: "completed"
}, null, 2));

async function importBatchWithRetry(batch, position) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await upsertInstrumentRegistryRows(batch);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(JSON.stringify({
        level: "warn",
        message,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        start: position.start,
        end: position.end
      }));
      if (attempt < maxRetries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(args) {
  return args.reduce((parsed, arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/u);
    if (match) parsed[match[1]] = match[2];
    return parsed;
  }, {});
}
