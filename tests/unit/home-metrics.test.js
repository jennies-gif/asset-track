import assert from "node:assert/strict";
import test from "node:test";

import {
  configureHomeModel,
  dailyPnlMetricLabel,
  latestDailyPnlSnapshot,
  latestOverviewSyncSummary
} from "../../src/features/home/homeModel.js";
import { calculatePortfolio } from "../../src/domain/calculations.js";

function configure(assets, marketSyncState = { status: "idle", syncedAt: "" }) {
  configureHomeModel({
    allAssets: () => assets,
    overviewAssets: () => assets,
    calculateDisplayPortfolio: calculatePortfolio,
    getMarketSyncState: () => marketSyncState,
    formatDateTimeMinute: (value) => `格式化 ${value}`
  });
}

test("calculates yesterday pnl from aligned calendar-day history across markets", () => {
  configure([
    {
      type: "股票",
      market: "US",
      quantity: "2",
      purchaseDate: "2026-01-01",
      fxRate: "1",
      dailyPrices: [
        { priceDate: "2026-07-26", closePrice: "100" },
        { priceDate: "2026-07-27", closePrice: "105" }
      ]
    },
    {
      type: "基金",
      market: "CN",
      quantity: "1",
      purchaseDate: "2026-01-01",
      fxRate: "1",
      dailyPrices: [
        { priceDate: "2026-07-26", closePrice: "10", priceBasis: "actual" },
        { priceDate: "2026-07-27", closePrice: "10", priceBasis: "carry_forward" }
      ]
    },
    {
      type: "现金",
      market: "CASH",
      quantity: "100",
      costPrice: "1",
      previousPrice: "1",
      currentPrice: "1",
      previousFxRate: "1",
      fxRate: "1"
    }
  ]);

  assert.deepEqual(latestDailyPnlSnapshot("2026-07-28"), {
    amountCents: 1000n,
    valuationDate: "2026-07-27",
    reason: "",
    detail: "按昨日持仓与已缓存日线计算；跨币种按当前汇率估算"
  });
});

test("does not publish yesterday pnl when either calendar-day price is missing", () => {
  configure([
    {
      type: "股票",
      quantity: "2",
      purchaseDate: "2026-01-01",
      fxRate: "1",
      dailyPrices: [{ priceDate: "2026-07-27", closePrice: "105" }]
    }
  ]);

  assert.equal(latestDailyPnlSnapshot("2026-07-28").amountCents, null);
  assert.match(latestDailyPnlSnapshot("2026-07-28").reason, /行情尚未齐备/u);
});

test("does not publish yesterday pnl when a transaction occurred yesterday", () => {
  configure([
    {
      type: "股票",
      quantity: "2",
      purchaseDate: "2026-01-01",
      fxRate: "1",
      buyRecords: [{ quantity: "1", boughtAt: "2026-07-27T00:00:00.000Z" }],
      dailyPrices: [
        { priceDate: "2026-07-26", closePrice: "100" },
        { priceDate: "2026-07-27", closePrice: "105" }
      ]
    }
  ]);

  assert.equal(latestDailyPnlSnapshot("2026-07-28").amountCents, null);
  assert.match(latestDailyPnlSnapshot("2026-07-28").reason, /买卖记录/u);
});

test("keeps an asset closed today in yesterday's pnl", () => {
  configure([
    {
      type: "股票",
      market: "US",
      quantity: "2",
      closed: true,
      purchaseDate: "2026-01-01",
      fxRate: "1",
      sellRecords: [{ quantity: "2", soldAt: "2026-07-28T00:00:00.000Z" }],
      dailyPrices: [
        { priceDate: "2026-07-26", closePrice: "100" },
        { priceDate: "2026-07-27", closePrice: "105" }
      ]
    }
  ]);

  assert.equal(latestDailyPnlSnapshot("2026-07-28").amountCents, 1000n);
});

test("does not invent yesterday pnl for a cash-only portfolio", () => {
  configure([
    {
      type: "现金",
      market: "CASH",
      quantity: "100",
      previousPrice: "1",
      currentPrice: "1",
      previousFxRate: "1",
      fxRate: "1"
    }
  ]);

  assert.equal(latestDailyPnlSnapshot("2026-07-28").amountCents, null);
  assert.match(latestDailyPnlSnapshot("2026-07-28").reason, /纯现金组合/u);
});

test("labels the metric as yesterday with its calendar date", () => {
  assert.equal(
    dailyPnlMetricLabel({ valuationDate: "2026-07-27" }),
    "昨日收益（07-27）"
  );
  assert.equal(dailyPnlMetricLabel({ valuationDate: "" }), "昨日收益");
});

test("reports persisted synced asset metadata as synced after a reload", () => {
  configure([{
    type: "股票",
    market: "US",
    priceStatus: "synced",
    sourceFetchedAt: "2026-07-28T01:30:00.000Z",
    pricedAt: "2026-07-27"
  }]);

  assert.deepEqual(latestOverviewSyncSummary(), {
    value: "已同步",
    detail: "上次检查 格式化 2026-07-28T01:30:00.000Z",
    tone: "positive"
  });
});

test("reports partial and failed market states without calling them unsynced", () => {
  const assets = [
    { type: "股票", priceStatus: "synced", pricedAt: "2026-07-27" },
    { type: "基金", priceStatus: "missing" }
  ];
  configure(assets);
  assert.deepEqual(latestOverviewSyncSummary(), {
    value: "部分同步",
    detail: "最新行情 2026-07-27",
    tone: "warning"
  });

  configure(assets, { status: "error", syncedAt: "" });
  assert.deepEqual(latestOverviewSyncSummary(), {
    value: "同步失败",
    detail: "请重新检查价格",
    tone: "negative"
  });
});

test("restores a failed sync state from asset metadata after reload", () => {
  configure([{
    type: "股票",
    priceStatus: "error",
    updatedAt: "2026-07-28T02:00:00.000Z"
  }]);

  assert.deepEqual(latestOverviewSyncSummary(), {
    value: "同步异常",
    detail: "1 项失败 · 上次尝试 格式化 2026-07-28T02:00:00.000Z",
    tone: "negative"
  });
});
