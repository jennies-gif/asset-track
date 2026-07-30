import assert from "node:assert/strict";
import test from "node:test";

import {
  annualizedAnalysisReturnBps,
  buildAnalysisScope,
  buildAnalysisModel,
  configureAnalysisModel
} from "../../src/features/analysis/analysisModel.js";

configureAnalysisModel({
  getAnalysisFilter: () => ({
    startDate: "2025-01-01",
    endDate: "2026-01-01"
  }),
  openAssets: () => [],
  latestTrendDate: () => "2026-01-01",
  calculateDisplayPortfolio: () => ({
    totals: { marketValueCents: 22000n }
  }),
  convertUsdToDisplay: (value) => value,
  assetValueAtTrendDate: () => 0n,
  buildTrendDates: () => [
    "2025-01-01",
    "2026-01-01"
  ],
  assetTypeKey: (asset) => asset.type
});

test("annualized return remains unavailable when the portfolio has no cost basis", () => {
  assert.equal(annualizedAnalysisReturnBps(null, []), null);
});

test("annualized return is calculated when a return value is available", () => {
  assert.equal(annualizedAnalysisReturnBps(1000n, []), 1000n);
});

test("analysis model accepts a restored portfolio without cost basis", () => {
  const portfolio = {
    positions: [{
      name: "测试现金",
      type: "现金",
      market: "OTHER",
      account: "测试账户",
      marketValueCents: 22000n
    }],
    totals: {
      marketValueCents: 22000n,
      costValueCents: 0n,
      returnBps: null
    }
  };
  const analysis = buildAnalysisModel([], portfolio, {
    startValueCents: 22000n,
    items: []
  });

  assert.equal(analysis.returnBps, null);
  assert.equal(analysis.annualizedReturnBps, null);
  assert.equal(analysis.endValueCents, 22000n);
  assert.deepEqual(analysis.scope, {
    assetCount: 1,
    supportsPortfolioComparisons: false
  });
});

test("portfolio-relative analysis requires more than one holding", () => {
  assert.equal(buildAnalysisScope([]).supportsPortfolioComparisons, false);
  assert.equal(buildAnalysisScope([{}]).supportsPortfolioComparisons, false);
  assert.equal(buildAnalysisScope([{}, {}]).supportsPortfolioComparisons, true);
});
