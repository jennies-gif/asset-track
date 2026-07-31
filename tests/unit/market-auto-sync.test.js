import assert from "node:assert/strict";
import test from "node:test";

import {
  configureMarketService,
  syncDailyMarketPricesIfDue,
  syncLatestMarketPrices
} from "../../src/features/market/marketService.js";
import { configureMarketRender } from "../../src/features/market/marketRender.js";
import { todayIsoDate } from "../../src/utils/date.js";

test("hydrates cached history before a lightweight covered-price check", async () => {
  const harness = createMarketSyncHarness();
  const requests = [];
  await harness.withGlobals(async () => {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return jsonResponse(requests.length === 1
        ? marketPayload({ fetchResult: null, history: cachedHistory(), currentPrice: "2" })
        : marketPayload({ fetchResult: coveredFetch(), currentPrice: "2" }));
    };

    await syncDailyMarketPricesIfDue();
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map(({ autoFetch, includeHistory }) => ({ autoFetch, includeHistory })),
    [
      { autoFetch: false, includeHistory: true },
      { autoFetch: true, includeHistory: false }
    ]
  );
  assert.equal(
    harness.state.assets[0].dailyPrices.find((row) => row.priceDate === "2026-07-21")?.closePrice,
    "2"
  );
  assert.equal(harness.state.assets[0].priceStatus, "synced");
  assert.equal(harness.state.assets[0].marketSyncRegistrationStatus, "registered");
  assert.equal(harness.autoSyncState().attemptStatus, "completed");
});

test("reloads cached history only when the latest-price check fetched changes", async () => {
  const harness = createMarketSyncHarness();
  const requests = [];
  await harness.withGlobals(async () => {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (requests.length === 1) {
        return jsonResponse(marketPayload({ fetchResult: null, history: cachedHistory(), currentPrice: "2" }));
      }
      if (requests.length === 2) {
        return jsonResponse(marketPayload({
          fetchResult: {
            status: "completed",
            run: { successCount: 1, skippedCount: 0, failureCount: 0, messages: [] }
          },
          currentPrice: "3",
          pricedAt: "2026-07-22"
        }));
      }
      return jsonResponse(marketPayload({
        fetchResult: null,
        history: [...cachedHistory(), historyPoint("2026-07-22", 3)],
        currentPrice: "3",
        pricedAt: "2026-07-22"
      }));
    };

    await syncDailyMarketPricesIfDue();
  });

  assert.equal(requests.length, 3);
  assert.deepEqual(
    requests.map(({ autoFetch, includeHistory, includeBenchmarks }) => ({ autoFetch, includeHistory, includeBenchmarks })),
    [
      { autoFetch: false, includeHistory: true, includeBenchmarks: true },
      { autoFetch: true, includeHistory: false, includeBenchmarks: true },
      { autoFetch: false, includeHistory: true, includeBenchmarks: false }
    ]
  );
  assert.equal(harness.state.assets[0].currentPrice, "3");
  assert.equal(
    harness.state.assets[0].dailyPrices.find((row) => row.priceDate === "2026-07-22")?.closePrice,
    "3"
  );
});

test("keeps hydrated cache after a refresh failure and applies the retry cooldown", async () => {
  const harness = createMarketSyncHarness();
  let requestCount = 0;
  await harness.withGlobals(async () => {
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        return jsonResponse(marketPayload({ fetchResult: null, history: cachedHistory(), currentPrice: "2" }));
      }
      return errorResponse(503, "外部行情暂不可用");
    };

    await syncDailyMarketPricesIfDue();
    await syncDailyMarketPricesIfDue();
  });

  assert.equal(requestCount, 2);
  assert.equal(harness.state.assets[0].currentPrice, "2");
  assert.equal(harness.state.assets[0].priceStatus, "synced");
  assert.equal(harness.marketSyncState.status, "warning");
  assert.match(harness.marketSyncState.message, /已应用行情缓存/);
  assert.equal(harness.autoSyncState().attemptStatus, "error");
});

test("coalesces a manual request into an automatic sync already in progress", async () => {
  const harness = createMarketSyncHarness();
  let requestCount = 0;
  let releaseFirstRequest;
  let notifyFirstRequest;
  const firstRequestStarted = new Promise((resolve) => {
    notifyFirstRequest = resolve;
  });
  const firstRequestGate = new Promise((resolve) => {
    releaseFirstRequest = resolve;
  });

  await harness.withGlobals(async () => {
    globalThis.fetch = async () => {
      requestCount += 1;
      if (requestCount === 1) {
        notifyFirstRequest();
        await firstRequestGate;
        return jsonResponse(marketPayload({ fetchResult: null, history: cachedHistory(), currentPrice: "2" }));
      }
      return jsonResponse(marketPayload({ fetchResult: coveredFetch(), currentPrice: "2" }));
    };

    const automatic = syncDailyMarketPricesIfDue();
    await firstRequestStarted;
    const manual = syncLatestMarketPrices();
    releaseFirstRequest();
    await Promise.all([automatic, manual]);
  });

  assert.equal(requestCount, 2);
});

test("retries a pending target even after today's normal sync completed", async () => {
  const harness = createMarketSyncHarness({
    asset: {
      marketSyncRegistrationStatus: "pending",
      marketSyncRegistrationAttemptedAt: "2026-07-24T00:00:00.000Z"
    },
    autoSync: {
      lastCompletedDate: todayIsoDate(),
      lastCompletedAt: new Date().toISOString(),
      attemptStatus: "completed"
    }
  });
  let requestCount = 0;
  await harness.withGlobals(async () => {
    globalThis.fetch = async () => {
      requestCount += 1;
      return jsonResponse(requestCount === 1
        ? marketPayload({ fetchResult: null, history: cachedHistory(), currentPrice: "2" })
        : marketPayload({ fetchResult: coveredFetch(), currentPrice: "2" }));
    };

    await syncDailyMarketPricesIfDue();
  });

  assert.equal(requestCount, 2);
  assert.equal(harness.state.assets[0].marketSyncRegistrationStatus, "registered");
  assert.equal(harness.state.assets[0].marketSyncRegistrationError, "");
});

function createMarketSyncHarness({ asset = {}, autoSync = null } = {}) {
  let state = {
    assets: [{
      id: "asset-aapl",
      name: "Apple",
      symbol: "AAPL",
      market: "US",
      type: "股票",
      currency: "USD",
      purchaseDate: "2026-07-20",
      currentPrice: "1",
      dailyPrices: [],
      ...asset
    }]
  };
  let marketSyncState = { status: "idle", message: "", results: [], syncedAt: "" };
  const storage = memoryStorage();
  if (autoSync) storage.setItem("asset-trail-market-auto-sync-v1", JSON.stringify(autoSync));
  configureMarketService({
    marketApiBaseUrl: "https://market.example.test",
    getState: () => state,
    setState: (nextState) => {
      state = nextState;
    },
    getMarketSyncState: () => marketSyncState,
    setMarketSyncState: (nextState) => {
      marketSyncState = nextState;
    },
    persistAndRender: () => {},
    selectedBenchmarkInstruments: () => [],
    loadBenchmarkPerformance: () => {}
  });
  configureMarketRender({
    elements: {},
    getMarketSyncState: () => marketSyncState
  });

  return {
    get state() {
      return state;
    },
    get marketSyncState() {
      return marketSyncState;
    },
    autoSyncState() {
      return JSON.parse(storage.getItem("asset-trail-market-auto-sync-v1") || "{}");
    },
    async withGlobals(work) {
      const originalFetch = globalThis.fetch;
      const originalLocalStorage = globalThis.localStorage;
      globalThis.localStorage = storage;
      try {
        await work();
      } finally {
        globalThis.fetch = originalFetch;
        if (originalLocalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originalLocalStorage;
      }
    }
  };
}

function marketPayload({
  fetchResult,
  history,
  currentPrice,
  pricedAt = "2026-07-21"
}) {
  return {
    syncedAt: "2026-07-25T02:00:00.000Z",
    fetch: fetchResult,
    results: [{
      symbol: "AAPL",
      market: "US",
      name: "Apple",
      status: "synced",
      after: {
        currentPrice,
        previousPrice: "1",
        pricedAt,
        priceSource: "test market source",
        sourceFetchedAt: "2026-07-25T01:59:00.000Z",
        priceKind: "daily_close"
      },
      ...(history ? { history } : {})
    }]
  };
}

function coveredFetch() {
  return {
    status: "covered",
    run: { successCount: 0, skippedCount: 1, failureCount: 0, messages: [] }
  };
}

function cachedHistory() {
  return [
    historyPoint("2026-07-20", 1),
    historyPoint("2026-07-21", 2)
  ];
}

function historyPoint(date, close) {
  return {
    date,
    close,
    source: "test market source",
    sourceFetchedAt: "2026-07-25T01:59:00.000Z",
    priceKind: "daily_close",
    qualityStatus: "ok"
  };
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload
  };
}

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    clone: () => ({ json: async () => ({ message }) })
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}
