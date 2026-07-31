import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadMarketDataSyncTargets,
  registerMarketDataSyncTargets
} from "../../src/server/marketDataSyncTargets.js";

test("keeps the largest anonymous history window for a public sync target", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "asset-trail-sync-targets-"));
  try {
    await registerMarketDataSyncTargets(directory, [{
      symbol: "00700",
      market: "HK",
      sourceType: "user_requested",
      historyLookbackDays: 30,
      requestedAt: "2026-07-30T00:00:00.000Z"
    }]);
    await registerMarketDataSyncTargets(directory, [{
      symbol: "00700",
      market: "HK",
      sourceType: "user_requested",
      historyLookbackDays: 900,
      requestedAt: "2026-07-31T00:00:00.000Z"
    }]);
    await registerMarketDataSyncTargets(directory, [{
      symbol: "00700",
      market: "HK",
      sourceType: "user_requested",
      historyLookbackDays: 7,
      requestedAt: "2026-08-01T00:00:00.000Z"
    }]);

    const targets = await loadMarketDataSyncTargets(directory);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].historyLookbackDays, 900);
    assert.equal(targets[0].firstRequestedAt, "2026-07-30T00:00:00.000Z");
    assert.equal(targets[0].lastRequestedAt, "2026-08-01T00:00:00.000Z");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("bounds invalid public history windows to the seven-day maintenance default", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "asset-trail-sync-targets-"));
  try {
    await registerMarketDataSyncTargets(directory, [{
      symbol: "SPY",
      market: "US",
      historyLookbackDays: 0
    }]);
    assert.equal((await loadMarketDataSyncTargets(directory))[0].historyLookbackDays, 7);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
