#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  readPendingMarketDataBackfillTasks,
  updateMarketDataBackfillTaskStatus
} from "../../src/server/marketDataDatabase.js";

const execFileAsync = promisify(execFile);
const options = parseArgs(process.argv.slice(2));
const limit = Math.max(1, Number(options.limit || "5"));
const dryRun = options["dry-run"] === "true";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const tasks = await readPendingMarketDataBackfillTasks({ limit });
const run = {
  id: `run-process-backfill-tasks-${Date.now()}`,
  command: "process-backfill-tasks",
  startedAt: new Date().toISOString(),
  dryRun,
  requestedCount: tasks.length,
  successCount: 0,
  failureCount: 0,
  skippedCount: 0,
  tasks: []
};

for (const task of tasks) {
  const result = dryRun
    ? await previewTask(task)
    : await processTask(task);
  run.tasks.push(result);
  if (result.status === "completed") run.successCount += 1;
  else if (result.status === "failed") run.failureCount += 1;
  else run.skippedCount += 1;
}

run.finishedAt = new Date().toISOString();
run.status = run.failureCount ? "completed_with_errors" : "completed";
console.log(JSON.stringify(run, null, 2));

async function previewTask(task) {
  return {
    id: task.id,
    symbol: task.symbol,
    market: task.market,
    dateFrom: task.dateFrom,
    dateTo: task.dateTo,
    status: "preview"
  };
}

async function processTask(task) {
  const startedAt = new Date().toISOString();
  await updateMarketDataBackfillTaskStatus({
    id: task.id,
    status: "running",
    startedAt,
    failureReason: null
  });

  try {
    const fetchRun = await fetchBackfill(task);
    const status = fetchRun.failureCount ? "partial" : "completed";
    const finishedAt = new Date().toISOString();
    await updateMarketDataBackfillTaskStatus({
      id: task.id,
      status,
      finishedAt,
      successCount: fetchRun.successCount || 0,
      missingCount: fetchRun.failureCount || 0,
      failureReason: fetchRun.failureCount ? "部分日期或数据源抓取失败" : null,
      rawPayload: { ...task, status, startedAt, finishedAt, fetchRun }
    });
    return {
      id: task.id,
      symbol: task.symbol,
      market: task.market,
      status,
      successCount: fetchRun.successCount || 0,
      failureCount: fetchRun.failureCount || 0,
      fetchRunId: fetchRun.id
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await updateMarketDataBackfillTaskStatus({
      id: task.id,
      status: "failed",
      finishedAt,
      failureReason: message,
      rawPayload: { ...task, status: "failed", startedAt, finishedAt, failureReason: message }
    });
    return {
      id: task.id,
      symbol: task.symbol,
      market: task.market,
      status: "failed",
      message
    };
  }
}

async function fetchBackfill(task) {
  const args = [
    "scripts/market-data/fetch-market-data.mjs",
    "backfill",
    `--from=${task.dateFrom}`,
    `--to=${task.dateTo}`,
    `--symbols=${task.symbol}`,
    "--fx=false"
  ];
  const { stdout } = await execFileAsync(process.execPath, args, {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

function parseArgs(args) {
  return args.reduce((parsed, arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/u);
    if (match) parsed[match[1]] = match[2];
    return parsed;
  }, {});
}
