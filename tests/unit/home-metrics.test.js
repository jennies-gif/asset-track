import assert from "node:assert/strict";
import test from "node:test";

import {
  configureHomeModel,
  dailyPnlMetricLabel,
  latestDailyPnlSnapshot
} from "../../src/features/home/homeModel.js";
import { calculatePortfolio } from "../../src/domain/calculations.js";

function configure(assets) {
  configureHomeModel({
    overviewAssets: () => assets,
    calculateDisplayPortfolio: calculatePortfolio
  });
}

test("calculates the latest daily pnl from current and previous prices", () => {
  configure([
    {
      type: "股票",
      market: "US",
      quantity: "2",
      costPrice: "90",
      previousPrice: "100",
      currentPrice: "105",
      previousFxRate: "1",
      fxRate: "1",
      priceStatus: "synced",
      pricedAt: "2026-07-15"
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

  assert.deepEqual(latestDailyPnlSnapshot(), {
    amountCents: 1000n,
    valuationDate: "2026-07-15",
    reason: ""
  });
});

test("does not publish daily pnl when a previous price is missing", () => {
  configure([
    {
      type: "股票",
      quantity: "2",
      previousPrice: "0",
      currentPrice: "105",
      fxRate: "1",
      priceStatus: "synced",
      pricedAt: "2026-07-15"
    }
  ]);

  assert.equal(latestDailyPnlSnapshot().amountCents, null);
  assert.match(latestDailyPnlSnapshot().reason, /上一交易日价格/u);
});

test("does not combine assets with inconsistent latest price dates", () => {
  configure([
    {
      type: "股票",
      quantity: "1",
      previousPrice: "100",
      currentPrice: "105",
      fxRate: "1",
      priceStatus: "synced",
      pricedAt: "2026-07-15"
    },
    {
      type: "基金",
      quantity: "1",
      previousPrice: "10",
      currentPrice: "11",
      fxRate: "1",
      priceStatus: "synced",
      pricedAt: "2026-07-14"
    }
  ]);

  assert.equal(latestDailyPnlSnapshot().amountCents, null);
  assert.match(latestDailyPnlSnapshot().reason, /日期不一致/u);
});

test("labels stale data as the latest trading day instead of yesterday", () => {
  assert.equal(
    dailyPnlMetricLabel({ valuationDate: "2026-04-28" }),
    "最近交易日收益（04-28）"
  );
});

test("keeps the metric named yesterday pnl when there is no usable price date", () => {
  assert.equal(dailyPnlMetricLabel({ valuationDate: "" }), "昨日收益");
});
