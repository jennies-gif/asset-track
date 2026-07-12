import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;

test("api skeleton serves health, positions and attribution", async () => {
  const marketDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "asset-trail-market-data-"));
  await fs.writeFile(
    path.join(marketDataDir, "index-constituents.json"),
    JSON.stringify(
      [
        {
          indexKey: "hstech",
          symbol: "00020",
          name: "商汤-W",
          market: "HK",
          exchange: "HKEX",
          currency: "HKD",
          assetType: "stock",
          effectiveFrom: "2026-04-29",
          effectiveTo: null,
          source: "test fixture",
          sourceFetchedAt: "2026-04-29T00:00:00.000Z"
        }
      ],
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(marketDataDir, "instrument-registry.json"),
    JSON.stringify(
      [
        {
          id: "CN:FUND:OTC:110020.OF",
          symbol: "110020.OF",
          name: "易方达沪深300ETF联接A",
          market: "CN",
          exchange: "OTC",
          type: "基金",
          currency: "CNY",
          aliases: ["110020", "YFDHS300ETFLJA", "指数型-股票"],
          universe: "fund",
          marketDataSupported: true,
          dataSource: "test fixture"
        },
        {
          id: "CN:FUND:OTC:513050.OF",
          symbol: "513050.OF",
          name: "中概互联网ETF易方达",
          market: "CN",
          exchange: "OTC",
          type: "基金",
          currency: "CNY",
          aliases: ["513050"],
          universe: "fund",
          marketDataSupported: true,
          dataSource: "legacy test fixture"
        }
      ],
      null,
      2
    )
  );
  await fs.mkdir(path.join(marketDataDir, "prices", "WEB3"), { recursive: true });
  await fs.writeFile(
    path.join(marketDataDir, "prices", "WEB3", "BTC.json"),
    JSON.stringify(
      [
        {
          instrumentSymbol: "BTC",
          instrumentName: "Bitcoin",
          market: "WEB3",
          currency: "USD",
          tradeDate: "2026-06-02",
          closePrice: "68000.55",
          adjustedClosePrice: "68000.55",
          source: "CoinGecko simple price",
          sourceFetchedAt: "2026-06-02T10:00:00.000Z",
          qualityStatus: "ok"
        }
      ],
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(marketDataDir, "fx-rates.json"),
    JSON.stringify(
      [
        {
          baseCurrency: "USD",
          quoteCurrency: "CNY",
          rateDate: "2026-06-02",
          rate: "7.12",
          source: "Frankfurter reference rate",
          sourceFetchedAt: "2026-06-02T10:00:00.000Z",
          qualityStatus: "ok"
        }
      ],
      null,
      2
    )
  );
  await fs.mkdir(path.join(marketDataDir, "prices", "HK"), { recursive: true });
  await fs.mkdir(path.join(marketDataDir, "prices", "CN"), { recursive: true });
  await fs.mkdir(path.join(marketDataDir, "prices", "US"), { recursive: true });
  await fs.writeFile(
    path.join(marketDataDir, "prices", "CN", "513050.json"),
    JSON.stringify([
      {
        instrumentSymbol: "513050",
        instrumentName: "中概互联网ETF易方达",
        market: "CN",
        currency: "CNY",
        tradeDate: "2026-06-02",
        closePrice: "1.038",
        adjustedClosePrice: "1.038",
        source: "Tencent finance realtime quote",
        sourceFetchedAt: "2026-06-02T10:00:00.000Z",
        qualityStatus: "ok"
      }
    ], null, 2)
  );
  await fs.writeFile(
    path.join(marketDataDir, "prices", "CN", "000300.json"),
    JSON.stringify(
      [
        {
          instrumentSymbol: "000300",
          instrumentName: "沪深300指数",
          market: "CN",
          currency: "CNY",
          tradeDate: "2026-06-01",
          closePrice: "3900.00",
          adjustedClosePrice: "3900.00",
          source: "Tencent finance index kline",
          sourceFetchedAt: "2026-06-01T10:00:00.000Z",
          qualityStatus: "ok"
        },
        {
          instrumentSymbol: "000300",
          instrumentName: "沪深300指数",
          market: "CN",
          currency: "CNY",
          tradeDate: "2026-06-02",
          closePrice: "3939.00",
          adjustedClosePrice: "3939.00",
          source: "Tencent finance index kline",
          sourceFetchedAt: "2026-06-02T10:00:00.000Z",
          qualityStatus: "ok"
        }
      ],
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(marketDataDir, "prices", "US", "NDX.json"),
    JSON.stringify(
      [
        {
          instrumentSymbol: "NDX",
          instrumentName: "Nasdaq-100 Index",
          market: "US",
          currency: "USD",
          tradeDate: "2026-06-01",
          closePrice: "21000.00",
          adjustedClosePrice: "21000.00",
          source: "Nasdaq historical public API",
          sourceFetchedAt: "2026-06-01T10:00:00.000Z",
          qualityStatus: "ok"
        },
        {
          instrumentSymbol: "NDX",
          instrumentName: "Nasdaq-100 Index",
          market: "US",
          currency: "USD",
          tradeDate: "2026-06-02",
          closePrice: "21210.00",
          adjustedClosePrice: "21210.00",
          source: "Nasdaq historical public API",
          sourceFetchedAt: "2026-06-02T10:00:00.000Z",
          qualityStatus: "ok"
        }
      ],
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(marketDataDir, "prices", "US", "SPY.json"),
    JSON.stringify(
      [
        {
          instrumentSymbol: "SPY",
          instrumentName: "SPDR S&P 500 ETF Trust",
          market: "US",
          currency: "USD",
          tradeDate: "2026-06-01",
          closePrice: "520.00",
          adjustedClosePrice: "520.00",
          source: "Nasdaq historical public API",
          sourceFetchedAt: "2026-06-01T10:00:00.000Z",
          qualityStatus: "ok"
        },
        {
          instrumentSymbol: "SPY",
          instrumentName: "SPDR S&P 500 ETF Trust",
          market: "US",
          currency: "USD",
          tradeDate: "2026-06-02",
          closePrice: "522.50",
          adjustedClosePrice: "522.50",
          source: "Nasdaq historical public API",
          sourceFetchedAt: "2026-06-02T10:00:00.000Z",
          qualityStatus: "ok"
        }
      ],
      null,
      2
    )
  );
  await fs.writeFile(
    path.join(marketDataDir, "prices", "HK", "00700.json"),
    JSON.stringify(
      [
        {
          instrumentSymbol: "00700",
          instrumentName: "腾讯控股",
          market: "HK",
          currency: "HKD",
          tradeDate: "2026-06-01",
          closePrice: "338.00",
          adjustedClosePrice: "338.00",
          source: "test price source",
          sourceFetchedAt: "2026-06-01T10:00:00.000Z",
          qualityStatus: "ok"
        },
        {
          instrumentSymbol: "00700",
          instrumentName: "腾讯控股",
          market: "HK",
          currency: "HKD",
          tradeDate: "2026-06-02",
          closePrice: "341.50",
          adjustedClosePrice: "341.50",
          source: "test price source",
          sourceFetchedAt: "2026-06-02T10:00:00.000Z",
          qualityStatus: "ok"
        }
      ],
      null,
      2
    )
  );

  const server = spawn(process.execPath, ["apps/api/server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: String(port), MARKET_DATA_DIR: marketDataDir, MARKET_DAILY_SYNC_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(server);

    const health = await getJson("/api/health");
    assert.deepEqual(health, { ok: true });

    const positions = await rawGetJson("/api/positions");
    assert.equal(positions.status, 403);
    assert.equal(positions.body.code, "private_asset_api_disabled");
    for (const path of ["/api/accounts", "/api/assets", "/api/market-data/tasks", "/api/exports/backup.json"]) {
      const disabled = await rawGetJson(path);
      assert.equal(disabled.status, 403);
      assert.equal(disabled.body.code, "private_asset_api_disabled");
    }
    for (const path of ["/api/accounts", "/api/imports/preview"]) {
      const disabled = await rawPostJson(path, {});
      assert.equal(disabled.status, 403);
      assert.equal(disabled.body.code, "private_asset_api_disabled");
    }

    const instruments = await getJson("/api/instruments/search?query=00020");
    assert.equal(instruments.instruments[0].symbol, "00020");
    assert.equal(instruments.instruments[0].universe, "hstech");

    const fundSearch = await getJson("/api/instruments/search?query=110020");
    assert.equal(fundSearch.instruments[0].symbol, "110020.OF");
    assert.equal(fundSearch.instruments[0].type, "基金");

    const listedEtfSearch = await getJson("/api/instruments/search?query=513050");
    assert.equal(listedEtfSearch.instruments[0].symbol, "513050");
    assert.equal(listedEtfSearch.instruments[0].exchange, "SSE");
    assert.equal(listedEtfSearch.instruments[0].type, "ETF");

    const backfillTask = await rawPostJson("/api/market-data/tasks/backfill", {
      assetId: "asset-110020",
      symbol: "110020",
      assetName: "易方达沪深300ETF联接A",
      account: "长期账户",
      dateFrom: "2026-01-29",
      dateTo: "2026-06-02",
      trigger: "asset_created"
    });
    assert.equal(backfillTask.status, 403);
    assert.equal(backfillTask.body.code, "private_asset_api_disabled");

    const privateAssetUpload = await rawPostJson("/api/assets", {
      id: "asset-created-110020",
      name: "易方达沪深300ETF联接A",
      symbol: "110020",
      type: "基金",
      market: "CN",
      account: "长期账户",
      currency: "CNY",
      quantity: "1000",
      costPrice: "1.25",
      currentPrice: "1.25",
      fxRate: "1",
      purchaseDate: "2026-01-29"
    });
    assert.equal(privateAssetUpload.status, 403);
    assert.equal(privateAssetUpload.body.code, "private_asset_api_disabled");

    const cryptoHistory = await getJson("/api/market-data/history?symbol=BTC");
    assert.equal(cryptoHistory.points[0].close, 68000.55);
    assert.equal(cryptoHistory.points[0].source, "CoinGecko simple price");

    const latestLookup = await getJson("/api/instruments/lookup?query=BTC");
    assert.equal(latestLookup.price.currentPrice, "68000.55");
    const privateLookupField = await rawGetJson("/api/instruments/lookup?query=BTC&purchaseDate=2026-06-02");
    assert.equal(privateLookupField.status, 400);
    assert.equal(privateLookupField.body.code, "request_field_not_allowed");

    const fxRates = await getJson("/api/market-data/fx-rates?base=USD&quote=CNY");
    assert.equal(fxRates.rates[0].rate, "7.12");

    const csi300History = await getJson("/api/market-data/history?symbol=000300");
    assert.equal(csi300History.instrument.name, "沪深300指数");
    assert.equal(csi300History.points[1].close, 3939);

    const ndxHistory = await getJson("/api/market-data/history?symbol=NDX");
    assert.equal(ndxHistory.instrument.name, "Nasdaq-100 Index");
    assert.equal(ndxHistory.points[1].source, "Nasdaq historical public API");

    const sync = await postJson("/api/market-data/sync-daily", { symbols: ["00700"], autoFetch: false });
    assert.equal(sync.summary.syncedCount, 1);
    assert.equal(sync.fetch, null);
    assert.equal(sync.summary.dailyPriceRowsUpserted, 0);
    assert.equal(sync.summary.dailyPriceGapCount, 0);
    assert.equal(sync.results[0].after.currentPrice, "341.5");
    assert.equal(sync.results[0].after.previousPrice, "338");
    assert.equal(sync.results[0].after.priceStatus, "synced");
    assert.equal(sync.results[0].after.sourceFetchedAt, "2026-06-02T10:00:00.000Z");
    assert.equal(sync.results[0].dailyPrices.length, 0);

    const legacyListedEtfSync = await postJson("/api/market-data/sync-daily", {
      symbols: ["513050.OF", "513050"],
      autoFetch: false
    });
    assert.equal(legacyListedEtfSync.summary.requestedCount, 1);
    assert.equal(legacyListedEtfSync.summary.syncedCount, 1);
    assert.equal(legacyListedEtfSync.results[0].symbol, "513050");
    assert.equal(legacyListedEtfSync.results[0].after.currentPrice, "1.038");

    const coveredHistory = await postJson("/api/market-data/sync-daily", {
      symbols: ["00700"],
      days: 2,
      includeHistory: true,
      autoFetch: false
    });
    assert.equal(coveredHistory.fetch, null);
    assert.equal(coveredHistory.results[0].history.length, 2);

    const dailyPrices = await rawGetJson("/api/asset-prices/daily?assetId=asset-00700");
    assert.equal(dailyPrices.status, 403);
    assert.equal(dailyPrices.body.code, "private_asset_api_disabled");

    const privateAssetPayloadSync = await rawPostJson("/api/market-data/sync-daily", {
      symbols: ["00700"],
      autoFetch: false,
      assets: [
        {
          id: "asset-open-00700",
          name: "腾讯控股 当前持仓",
          symbol: "00700",
          type: "股票",
          market: "HK",
          account: "港股账户",
          currency: "HKD",
          quantity: "10",
          costPrice: "330",
          currentPrice: "338",
          previousPrice: "338",
          fxRate: "1",
          purchaseDate: "2026-06-01"
        },
        {
          id: "asset-closed-00700",
          name: "腾讯控股 历史持仓",
          symbol: "00700",
          type: "股票",
          market: "HK",
          account: "港股账户",
          currency: "HKD",
          quantity: "5",
          costPrice: "335",
          currentPrice: "341.5",
          previousPrice: "338",
          fxRate: "1",
          purchaseDate: "2026-06-02",
          closed: true,
          closedAt: "2026-06-02"
        }
      ]
    });
    assert.equal(privateAssetPayloadSync.status, 400);
    assert.equal(privateAssetPayloadSync.body.code, "request_field_not_allowed");

    for (const forbiddenField of ["purchaseDate", "dateFrom", "dateTo", "account", "assetId", "notes"]) {
      const rejected = await rawPostJson("/api/market-data/sync-daily", {
        symbols: ["00700"],
        [forbiddenField]: forbiddenField === "notes" ? "private" : "2026-06-01"
      });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.code, "request_field_not_allowed");
    }

    const missingSync = await postJson("/api/market-data/sync-daily", { symbols: ["IWM"], autoFetch: false });
    assert.equal(missingSync.fetch, null);
    assert.equal(missingSync.summary.syncedCount, 0);
    assert.equal(missingSync.summary.missingCount, 1);
    assert.equal(missingSync.results[0].status, "missing");
    assert.match(missingSync.results[0].message, /价格缓存/);

    const benchmarkSync = await postJson("/api/market-data/sync-daily", { symbols: ["000300", "NDX"], autoFetch: false });
    assert.equal(benchmarkSync.summary.syncedCount, 2);
    assert.equal(benchmarkSync.results[0].after.priceStatus, "synced");

    const assetAndBenchmarkSync = await postJson("/api/market-data/sync-daily", { includeBenchmarks: true, autoFetch: false });
    const syncedSymbols = assetAndBenchmarkSync.results
      .filter((result) => result.status === "synced")
      .map((result) => result.symbol);
    assert.equal(syncedSymbols.includes("00700"), false);
    assert.ok(syncedSymbols.includes("000300"));

    const attribution = await rawPostJson("/api/attribution/runs", {
      startDate: "2026-01-29",
      endDate: "2026-04-29"
    });
    assert.equal(attribution.status, 403);
    assert.equal(attribution.body.code, "private_asset_api_disabled");
  } finally {
    server.kill("SIGTERM");
    await fs.rm(marketDataDir, { recursive: true, force: true });
  }
});

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("API server did not start")), 5000);
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Asset Trail API running")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    server.stderr.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes("EADDRINUSE")) {
        clearTimeout(timeout);
        reject(new Error(text));
      }
    });
    server.on("exit", (code) => {
      if (code && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`API server exited with ${code}`));
      }
    });
  });
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true);
  return response.json();
}

async function rawGetJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    ok: response.ok,
    status: response.status,
    body: await response.json()
  };
}

async function postJson(path, body) {
  const response = await rawPostJson(path, body);
  assert.equal(response.ok, true);
  return response.body;
}

async function rawPostJson(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    ok: response.ok,
    status: response.status,
    body: await response.json()
  };
}
