import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  calculateAttribution,
  calculateBuyPreview,
  calculateCategoryBreakdown,
  calculateMoneyFromQuantity,
  calculatePortfolio,
  calculateRealizedPnl,
  calculateSellPreview,
  formatPercent,
  normalizeAsset,
  parseDecimalToScaledInt,
  scaledIntToDecimal,
  validateAsset
} from "../../src/domain/calculations.js";
import {
  benchmarkInstruments,
  buildDataTasks,
  buildHistorySeries,
  defaultBenchmarkSyncSymbols,
  inferUniverse,
  lookupSecurity
} from "../../src/domain/marketData.js";
import { buildUserAssetDailyPriceSnapshots } from "../../src/domain/userAssetDailyPrices.js";
import { missingMarketHistoryRanges } from "../../src/domain/marketHistoryCoverage.js";
import { isDailyHistoryPoint, isMarketCloseAvailable, selectCurrentValuationPoint } from "../../src/domain/marketPriceSemantics.js";
import { isCnExchangeListedFundSymbol, normalizeCnListedFundInstrument, removeOtcDuplicatesOfListedCnInstruments } from "../../src/domain/cnInstrumentClassification.js";
import { activeInstrumentRegistry, instrumentMatchStatus, lookupInstrument, searchInstruments } from "../../src/domain/instrumentRegistry.js";
import { priceUsesCostFallback, resolvePriceStatus } from "../../src/domain/priceStatus.js";
import {
  cryptoInstruments,
  defaultFxPairs,
  normalizeBinanceKlines,
  normalizeBinanceTickerPrice,
  normalizeCoinGeckoSimplePrice,
  normalizeFrankfurterLatest,
  normalizeGoldApiPrice,
  normalizeMetalsDevLatest,
  preciousMetalInstruments
} from "../../src/domain/marketDataSources.js";
import { findAssetQuickMatch } from "../../src/features/assets/assetQuickMatch.js";
import { findAssetQuickMatches } from "../../src/features/assets/assetQuickMatch.js";
import { normalizeAccountTypeFormValue, savedAccountOptionsFromAssets } from "../../src/features/assets/accountOptions.js";
import { configureNotesRender, noteDisplayTagsFor, noteTypeFromTags, showNoteReader } from "../../src/features/notes/notesRender.js";
import { buildTrendPoints, calculateMaxDrawdownAsset, configureTrendModel } from "../../src/features/trends/trendModel.js";
import { analysisPresetBounds, configureAnalysisFilters, selectedAnalysisAssets } from "../../src/features/analysis/analysisFilters.js";
import { buildWorstMonth } from "../../src/features/analysis/analysisModel.js";
import { calculateRiskAdjustedMetrics } from "../../src/features/analysis/analysisReturns.js";
import { decorateMarketSyncResults, marketFetchPresentation } from "../../src/features/market/marketService.js";
import { configureFormatters, formatDisplayCurrency, formatSignedCurrency, formatUnitPrice } from "../../src/ui/formatters.js";

test("parses decimal values with deterministic rounding", () => {
  assert.equal(parseDecimalToScaledInt("12.345", 2), 1235n);
  assert.equal(parseDecimalToScaledInt("-12.345", 2), -1235n);
  assert.equal(scaledIntToDecimal(123500n, 4), "12.35");
});

test("uses the same explicit analysis periods as the total asset trend", () => {
  assert.deepEqual(analysisPresetBounds("1", "2026-07-12"), { startDate: "2026-06-12", endDate: "2026-07-12" });
  assert.deepEqual(analysisPresetBounds("3", "2026-07-12"), { startDate: "2026-04-12", endDate: "2026-07-12" });
  assert.deepEqual(analysisPresetBounds("6", "2026-07-12"), { startDate: "2026-01-12", endDate: "2026-07-12" });
  assert.deepEqual(analysisPresetBounds("ytd", "2026-07-12"), { startDate: "2026-01-01", endDate: "2026-07-12" });
});

test("keeps holdings opened before the analysis period in drawdown calculations", () => {
  const assets = [{ id: "legacy-holding", purchaseDate: "2024-06-01", account: "长期账户" }];
  configureAnalysisFilters({
    elements: {},
    getAnalysisFilter: () => ({ account: "all", assetId: "all", range: "ytd", startDate: "2026-01-01", endDate: "2026-07-12" }),
    openAssets: () => assets,
    buildAccountSummaries: () => []
  });
  assert.deepEqual(selectedAnalysisAssets(), assets);
});

test("annualizes volatility and Sharpe ratio using the observed interval", () => {
  const points = [10000n, 10100n, 9999n, 10199n].map((valueCents, index) => ({
    date: `2026-01-${String(1 + index * 7).padStart(2, "0")}`,
    valueCents
  }));
  const metrics = calculateRiskAdjustedMetrics(points);
  assert.equal(metrics.observationCount, 3);
  assert.equal(metrics.intervalDays, 7);
  assert.equal(typeof metrics.annualizedVolatilityBps, "bigint");
  assert.equal(typeof metrics.sharpeRatioBps, "bigint");
});

test("does not publish volatility or Sharpe ratio with too few observations", () => {
  const metrics = calculateRiskAdjustedMetrics([
    { date: "2026-01-01", valueCents: 10000n },
    { date: "2026-01-08", valueCents: 10100n }
  ]);
  assert.equal(metrics.annualizedVolatilityBps, null);
  assert.equal(metrics.sharpeRatioBps, null);
});

test("calculates the worst month from month-end values instead of sampling intervals", () => {
  const worst = buildWorstMonth([
    { date: "2026-01-01", valueCents: 10000n },
    { date: "2026-01-31", valueCents: 11000n },
    { date: "2026-02-14", valueCents: 9000n },
    { date: "2026-02-28", valueCents: 9900n },
    { date: "2026-03-31", valueCents: 10890n }
  ]);
  assert.equal(worst.month, "2026-02");
  assert.equal(worst.returnBps, -1000n);
});

test("keeps custom review tags visible instead of replacing them with note type", () => {
  const note = {
    type: "交易复盘",
    tags: ["自建标签", "交易复盘"]
  };

  assert.equal(noteTypeFromTags(note.tags), "交易复盘");
  assert.deepEqual(noteDisplayTagsFor(note), ["自建标签", "交易复盘"]);
});

test("renders blank note reader tags without the review detail grid", () => {
  const classList = () => ({ add() {}, remove() {}, toggle() {} });
  const elements = {
    notesReader: { dataset: {}, classList: classList(), scrollIntoView() {} },
    noteReaderTitle: { textContent: "" },
    noteReaderMeta: { innerHTML: "" },
    noteReaderAsset: { innerHTML: "", classList: classList() },
    noteReaderContent: { innerHTML: "" },
    notesEditor: { classList: classList() },
    notesHome: { classList: classList() },
    notesList: { querySelectorAll: () => [] }
  };
  configureNotesRender({
    elements,
    getState: () => ({
      assets: [],
      notes: [{
        id: "note-blank",
        title: "空白笔记",
        template: "blank",
        type: "理财学习",
        tags: ["闪念"],
        content: "只记录正文。",
        createdAt: "2026-05-28T00:00:00.000Z"
      }]
    }),
    buildAssetChangeRecords: () => [],
    noteTransactionLabel: () => "",
    convertUsdToDisplay: (value) => value
  });

  showNoteReader("note-blank", { scroll: false });

  assert.match(elements.noteReaderMeta.innerHTML, /#闪念/);
  assert.doesNotMatch(elements.noteReaderMeta.innerHTML, /note-reader-meta-grid/);
  assert.doesNotMatch(elements.noteReaderMeta.innerHTML, /日期|关联资产|实现收益/);
});

test("formats invalid percent inputs as unavailable data", () => {
  assert.equal(formatPercent(null), "暂无数据");
  assert.equal(formatPercent(Number.NaN), "暂无数据");
  assert.equal(formatPercent(Number.POSITIVE_INFINITY), "暂无数据");
});

test("formats displayed prices with one currency-code convention", () => {
  configureFormatters({ displayCurrency: () => "USD" });

  assert.equal(formatDisplayCurrency(7800n), "USD 78.00");
  assert.equal(formatSignedCurrency(-1250n), "USD -12.50");
  assert.equal(formatUnitPrice("500", "CNY"), "CNY 500.00");
  assert.equal(formatUnitPrice("1.23456789", "USD"), "USD 1.23456789");

  configureFormatters({ displayCurrency: () => "CNY" });
});

test("validates asset records before they enter calculations", () => {
  const validAsset = {
    name: "Test Asset",
    type: "股票",
    account: "测试账户",
    currency: "USD",
    quantity: "1",
    costPrice: "100.00",
    previousPrice: "99.00",
    currentPrice: "101.00",
    fxRate: "1",
    previousFxRate: "1",
    purchaseDate: "2026-07-01",
    fees: "0",
    taxes: "0"
  };
  assert.equal(validateAsset(validAsset), "");
  assert.equal(validateAsset({ ...validAsset, currency: "" }), "currency 不能为空");
  assert.equal(validateAsset({ ...validAsset, purchaseDate: "07/01/2026" }), "交易日期格式无效");
  assert.equal(validateAsset({ ...validAsset, costPrice: "" }), "");
  assert.equal(validateAsset({ ...validAsset, purchaseDate: "" }), "");
  assert.equal(validateAsset({ ...validAsset, currentPrice: "0" }), "");
  assert.equal(validateAsset({ ...validAsset, costPrice: "-1" }), "成本价不能为负数");
  assert.equal(validateAsset({ ...validAsset, fees: "-0.01" }), "费用不能为负数");
});

test("keeps missing cost basis from producing fake returns", () => {
  const asset = normalizeAsset({
    name: "Unknown Cost Asset",
    type: "股票",
    account: "测试账户",
    currency: "USD",
    quantity: "2",
    costPrice: "",
    previousPrice: "10",
    currentPrice: "120",
    fxRate: "1"
  });
  const portfolio = calculatePortfolio([asset]);
  const position = portfolio.positions[0];

  assert.equal(validateAsset(asset), "");
  assert.equal(position.hasCostBasis, false);
  assert.equal(position.marketValueCents, 24000n);
  assert.equal(position.costValueCents, 0n);
  assert.equal(position.unrealizedPnlCents, 0n);
  assert.equal(position.returnBps, null);
  assert.equal(portfolio.totals.returnBps, null);
});

test("does not label omitted current prices as user-entered prices", () => {
  const asset = normalizeAsset({
    name: "No Price Asset",
    type: "股票",
    account: "测试账户",
    currency: "USD",
    quantity: "1",
    costPrice: "100",
    previousPrice: "100",
    currentPrice: "",
    fxRate: "1"
  });

  assert.equal(asset.priceStatus, "pending");
  assert.equal(asset.priceSource, "");
});

test("calculates position value with quantity and FX rate", () => {
  const value = calculateMoneyFromQuantity("10.5", "100.00", "0.5");
  assert.equal(value, 52500n);
});

test("classifies price status without hiding missing or stale prices", () => {
  assert.deepEqual(resolvePriceStatus({
    currentPrice: "100",
    costPrice: "100",
    priceStatus: "pending",
    pricedAt: "",
    priceSource: ""
  }, { today: "2026-07-05" }), {
    key: "pending",
    label: "按成本价暂估",
    className: "data-warning",
    needsReview: true
  });
  assert.equal(priceUsesCostFallback({
    currentPrice: "100",
    costPrice: "100",
    priceStatus: "pending"
  }), true);
  assert.deepEqual(resolvePriceStatus({
    currentPrice: "101",
    costPrice: "100",
    priceStatus: "synced",
    pricedAt: "2026-06-20",
    priceSource: "test source"
  }, { today: "2026-07-05" }), {
    key: "stale",
    label: "价格过期",
    className: "data-error",
    needsReview: true
  });
  assert.equal(resolvePriceStatus({
    currentPrice: "101",
    costPrice: "100",
    priceStatus: "synced",
    pricedAt: "2026-07-04",
    priceSource: "test source"
  }, { today: "2026-07-05" }).key, "synced");
  assert.equal(resolvePriceStatus({
    currentPrice: "101",
    costPrice: "100",
    priceStatus: "error",
    pricedAt: "2026-07-04",
    priceSource: "test source"
  }).key, "error");
});

test("builds auditable daily user asset prices from first holding date", () => {
  const result = buildUserAssetDailyPriceSnapshots({
    userId: "demo-user",
    asset: {
      id: "asset-00700",
      account: "港股账户",
      symbol: "00700",
      market: "HK",
      currency: "HKD",
      type: "股票",
      purchaseDate: "2026-06-01"
    },
    history: [
      {
        date: "2026-06-01",
        closeDecimal: "338.00",
        source: "test price source",
        sourceFetchedAt: "2026-06-01T10:00:00.000Z",
        qualityStatus: "ok"
      },
      {
        date: "2026-06-03",
        closeDecimal: "341.50",
        source: "test price source",
        sourceFetchedAt: "2026-06-03T10:00:00.000Z",
        qualityStatus: "ok"
      }
    ],
    dateTo: "2026-06-03"
  });

  assert.equal(result.status, "complete");
  assert.deepEqual(result.rows.map((row) => row.priceDate), ["2026-06-01", "2026-06-02", "2026-06-03"]);
  assert.equal(result.rows[1].closePrice, "338");
  assert.equal(result.rows[1].priceBasis, "carry_forward");
  assert.equal(result.rows[1].carriedFromDate, "2026-06-01");
  assert.equal(result.rows[2].qualityStatus, "ok");
});

test("finds only uncovered boundary ranges in shared market history", () => {
  assert.deepEqual(
    missingMarketHistoryRanges(
      [{ tradeDate: "2026-06-02" }, { tradeDate: "2026-06-03" }],
      "2026-06-01",
      "2026-06-05"
    ),
    [
      { dateFrom: "2026-06-01", dateTo: "2026-06-01" },
      { dateFrom: "2026-06-04", dateTo: "2026-06-05" }
    ]
  );
});

test("does not schedule another market history fetch when the requested range is covered", () => {
  assert.deepEqual(
    missingMarketHistoryRanges(
      [{ date: "2026-06-01" }, { date: "2026-06-05" }],
      "2026-06-01",
      "2026-06-05"
    ),
    []
  );
});

test("builds portfolio trend from synced daily asset prices before falling back to estimates", () => {
  configureTrendModel({
    elements: {
      trendStart: { value: "2026-06-01" },
      trendEnd: { value: "2026-06-03" },
      trendRange: { value: "custom" }
    },
    getState: () => ({ snapshots: [] }),
    openAssets: () => [],
    overviewAssets: () => [
      {
        id: "asset-priced",
        quantity: "10",
        costPrice: "90",
        currentPrice: "120",
        fxRate: "1",
        purchaseDate: "2026-06-01",
        dailyPrices: [
          { priceDate: "2026-06-01", closePrice: "100", priceBasis: "actual" },
          { priceDate: "2026-06-03", closePrice: "120", priceBasis: "actual" }
        ]
      }
    ],
    currentOverviewTotalCents: () => 120000n,
    convertUsdToDisplay: (value) => value
  });

  const points = buildTrendPoints();
  assert.deepEqual(points.map((point) => [point.date, point.valueCents]), [
    ["2026-06-01", 100000n],
    ["2026-06-02", 100000n],
    ["2026-06-03", 120000n]
  ]);
});

test("identifies the asset with the largest value loss during the maximum drawdown interval", () => {
  const assets = [
    {
      name: "资产 A",
      quantity: "10",
      fxRate: "1",
      purchaseDate: "2026-06-01",
      dailyPrices: [
        { priceDate: "2026-06-01", closePrice: "100" },
        { priceDate: "2026-06-03", closePrice: "70" }
      ]
    },
    {
      name: "资产 B",
      quantity: "10",
      fxRate: "1",
      purchaseDate: "2026-06-01",
      dailyPrices: [
        { priceDate: "2026-06-01", closePrice: "100" },
        { priceDate: "2026-06-03", closePrice: "90" }
      ]
    }
  ];
  const points = [
    { date: "2026-06-01", valueCents: 200000n },
    { date: "2026-06-03", valueCents: 160000n }
  ];

  assert.equal(calculateMaxDrawdownAsset(points, assets)?.name, "资产 A");
  assert.equal(calculateMaxDrawdownAsset([{ date: "2026-06-01", valueCents: 200000n }], assets), null);
  assert.equal(calculateMaxDrawdownAsset([
    { date: "2026-06-01", valueCents: 200000n },
    { date: "2026-06-03", valueCents: 210000n }
  ], assets), null);
});

test("calculates realized PnL for partial sells with fees and taxes", () => {
  const result = calculateRealizedPnl({
    quantity: "4",
    costPrice: "100.00",
    sellPrice: "125.00",
    fxRate: "1",
    fees: "1.50",
    taxes: "0.50"
  });

  assert.equal(result.grossProceedsCents, 50000n);
  assert.equal(result.costBasisCents, 40000n);
  assert.equal(result.realizedPnlCents, 9800n);
});

test("calculates average cost after additional buy", () => {
  const result = calculateBuyPreview({
    currentQuantity: "10",
    currentCostPrice: "100.00",
    buyQuantity: "5",
    buyPrice: "130.00",
    fxRate: "1",
    fees: "2.00"
  });

  assert.equal(result.grossCostCents, 65000n);
  assert.equal(result.totalQuantity, "15");
  assert.equal(result.averageCostPrice, "110");
  assert.equal(result.totalCostCents, 165200n);
});

test("calculates remaining cost and realized gain after partial sell", () => {
  const result = calculateSellPreview({
    currentQuantity: "10",
    costPrice: "100.00",
    sellQuantity: "4",
    sellPrice: "125.00",
    fxRate: "1",
    fees: "1.50",
    taxes: "0.50"
  });

  assert.equal(result.grossProceedsCents, 50000n);
  assert.equal(result.costBasisCents, 40000n);
  assert.equal(result.realizedPnlCents, 9800n);
  assert.equal(result.remainingQuantity, "6");
  assert.equal(result.remainingCostCents, 60000n);
});

test("calculates close-out realized gain", () => {
  const result = calculateSellPreview({
    currentQuantity: "3",
    costPrice: "90.00",
    sellQuantity: "3",
    sellPrice: "120.00",
    fxRate: "1",
    fees: "3.00"
  });

  assert.equal(result.remainingQuantity, "0");
  assert.equal(result.grossProceedsCents, 36000n);
  assert.equal(result.costBasisCents, 27000n);
  assert.equal(result.realizedPnlCents, 8700n);
});

test("rejects selling more than the current holding", () => {
  assert.throws(() => calculateSellPreview({
    currentQuantity: "2",
    costPrice: "100.00",
    sellQuantity: "3",
    sellPrice: "110.00"
  }), /Sell quantity exceeds holding/);
});

test("calculates portfolio totals without floating point arithmetic", () => {
  const portfolio = calculatePortfolio([
    {
      name: "Asset A",
      type: "基金",
      account: "长期账户",
      currency: "USD",
      quantity: "2",
      costPrice: "100.00",
      previousPrice: "110.00",
      currentPrice: "125.00",
      fxRate: "1",
      contribution: "0",
      fees: "1.00"
    },
    {
      name: "Asset B",
      type: "现金",
      account: "备用金",
      currency: "CNY",
      quantity: "1000",
      costPrice: "1.00",
      previousPrice: "1.00",
      currentPrice: "1.00",
      fxRate: "0.14",
      contribution: "20.00",
      fees: "0"
    }
  ]);

  assert.equal(portfolio.totals.marketValueCents, 39000n);
  assert.equal(portfolio.totals.costValueCents, 34000n);
  assert.equal(portfolio.totals.unrealizedPnlCents, 5000n);
});

test("handles zero values, negative cash flows and multi-currency fees deterministically", () => {
  const portfolio = calculatePortfolio([
    {
      name: "USD Asset",
      type: "股票",
      account: "美股账户",
      currency: "USD",
      quantity: "0.125",
      costPrice: "80.00",
      previousPrice: "80.00",
      currentPrice: "88.00",
      previousFxRate: "1",
      fxRate: "1",
      contribution: "-1.25",
      fees: "0.10",
      taxes: "0"
    },
    {
      name: "HKD Asset",
      type: "股票",
      account: "港股账户",
      currency: "HKD",
      quantity: "3",
      costPrice: "10.00",
      previousPrice: "10.00",
      currentPrice: "9.50",
      previousFxRate: "0.12",
      fxRate: "0.13",
      contribution: "0",
      dividends: "0.20",
      fees: "0",
      taxes: "0.01"
    }
  ]);

  assert.equal(portfolio.totals.marketValueCents, 1471n);
  assert.equal(portfolio.totals.costValueCents, 1390n);
  assert.equal(portfolio.totals.contributionCents, -125n);
  assert.equal(portfolio.totals.feesCents, 10n);
  assert.equal(portfolio.totals.taxesCents, 1n);
});

test("keeps attribution reconciled to portfolio value change", () => {
  const attribution = calculateAttribution([
    {
      name: "Asset A",
      type: "基金",
      account: "长期账户",
      currency: "USD",
      quantity: "3",
      costPrice: "90.00",
      previousPrice: "100.00",
      currentPrice: "110.00",
      fxRate: "1",
      contribution: "25.00",
      fees: "2.00"
    }
  ]);

  const sum = attribution.items.reduce((total, item) => total + item.amountCents, 0n);
  assert.equal(sum, attribution.valueChangeCents);
  assert.equal(attribution.valueChangeCents, 3000n);
});

test("separates price, fx, income, fees, taxes and manual attribution", () => {
  const attribution = calculateAttribution([
    {
      name: "HK Tech",
      type: "股票",
      account: "港股账户",
      currency: "HKD",
      quantity: "100",
      costPrice: "10.00",
      previousPrice: "10.00",
      currentPrice: "12.00",
      previousFxRate: "0.12",
      fxRate: "0.13",
      contribution: "5.00",
      dividends: "1.00",
      interest: "2.00",
      fees: "1.00",
      taxes: "1.50",
      manualAdjustment: "0.50"
    }
  ]);

  const byKey = Object.fromEntries(attribution.items.map((item) => [item.key, item.amountCents]));
  assert.equal(byKey.price, 2400n);
  assert.equal(byKey.fx, 1200n);
  assert.equal(byKey.income, 300n);
  assert.equal(byKey.fees, -100n);
  assert.equal(byKey.taxes, -150n);
  assert.equal(byKey.manual, 50n);
  assert.equal(attribution.items.reduce((total, item) => total + item.amountCents, 0n), attribution.valueChangeCents);
});

test("maps first-version market coverage to data tasks and price series", () => {
  assert.equal(lookupSecurity("00700.HK").universe, "hstech");
  assert.equal(inferUniverse({ symbol: "QQQ" }).key, "etf");

  const tasks = buildDataTasks([
    { name: "腾讯控股", symbol: "00700", currency: "HKD", type: "股票" },
    { name: "沪深300ETF", symbol: "510300", currency: "CNY", type: "ETF" }
  ]);
  assert.deepEqual(tasks.map((task) => task.id).sort(), ["task-etf", "task-hstech"]);

  const series = buildHistorySeries({
    name: "腾讯控股",
    symbol: "00700",
    type: "股票",
    costPrice: "300",
    previousPrice: "310",
    currentPrice: "320",
    updatedAt: "2026-04-28T00:00:00.000Z"
  });
  assert.ok(series.length > 40);
  assert.equal(series.at(-1).close, 320);
});

test("keeps analysis benchmark symbols in the default market sync set", () => {
  assert.deepEqual(
    [...new Set(defaultBenchmarkSyncSymbols)].sort(),
    [...new Set(benchmarkInstruments.map((benchmark) => benchmark.symbol))].sort()
  );
});

test("normalizes exchange-listed CN funds without changing OTC feeder funds", () => {
  assert.equal(isCnExchangeListedFundSymbol("513050.OF", "中概互联网ETF易方达"), true);
  assert.equal(isCnExchangeListedFundSymbol("159915.OF", "创业板ETF"), true);
  assert.equal(isCnExchangeListedFundSymbol("110020.OF", "易方达沪深300ETF联接A"), false);
  assert.equal(isCnExchangeListedFundSymbol("150005.OF", "银河银富货币A"), false);
  assert.deepEqual(
    normalizeCnListedFundInstrument({
      symbol: "513050.OF",
      name: "中概互联网ETF易方达",
      market: "CN",
      exchange: "OTC",
      type: "基金",
      universe: "fund",
      aliases: ["513050"]
    }),
    {
      symbol: "513050",
      name: "中概互联网ETF易方达",
      market: "CN",
      exchange: "SSE",
      type: "ETF",
      universe: "etf",
      aliases: ["513050", "513050.OF"],
      id: undefined,
      dataSource: "",
      source: ""
    }
  );
  assert.equal(normalizeCnListedFundInstrument({ symbol: "110020.OF", market: "CN" }).symbol, "110020.OF");
});

test("lets authoritative exchange listings suppress conflicting OTC registry rows", () => {
  const rows = removeOtcDuplicatesOfListedCnInstruments([
    { symbol: "513050", market: "CN", exchange: "SSE", type: "ETF", dataSource: "SSE official fund list" },
    { symbol: "513050.OF", market: "CN", exchange: "OTC", type: "基金", dataSource: "Eastmoney fund code search" },
    { symbol: "110020.OF", market: "CN", exchange: "OTC", type: "基金", dataSource: "Eastmoney fund code search" }
  ]);
  assert.deepEqual(rows.map((row) => row.symbol), ["513050", "110020.OF"]);
});

test("does not use the full instrument registry as the default market data sync set", async () => {
  const marketDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "asset-trail-registry-boundary-"));
  await fs.writeFile(
    path.join(marketDataDir, "instrument-registry.json"),
    JSON.stringify([
      {
        symbol: "ZZZ999",
        name: "不应默认抓取的资源库标的",
        market: "US",
        type: "股票",
        currency: "USD"
      }
    ])
  );

  const previousMarketDataDir = process.env.MARKET_DATA_DIR;
  process.env.MARKET_DATA_DIR = marketDataDir;
  try {
    const moduleUrl = `../../scripts/market-data/fetch-market-data.mjs?boundary=${Date.now()}`;
    const { selectInstruments } = await import(moduleUrl);
    const defaultSelection = await selectInstruments({}, "2026-07-11");
    assert.equal(defaultSelection.some((item) => item.symbol === "ZZZ999"), false);
    assert.ok(defaultSelection.length < 500);

    const fullRegistrySelection = await selectInstruments({ "all-registry": "true" }, "2026-07-11");
    assert.equal(fullRegistrySelection.some((item) => item.symbol === "ZZZ999"), true);
  } finally {
    if (previousMarketDataDir === undefined) delete process.env.MARKET_DATA_DIR;
    else process.env.MARKET_DATA_DIR = previousMarketDataDir;
  }
});

test("keeps seed-version private asset data out of default API payloads", async () => {
  const assetFormSource = await fs.readFile(path.resolve("src/features/assets/assetForm.js"), "utf8");
  const marketServiceSource = await fs.readFile(path.resolve("src/features/market/marketService.js"), "utf8");
  const marketRenderSource = await fs.readFile(path.resolve("src/features/market/marketRender.js"), "utf8");
  const apiSource = await fs.readFile(path.resolve("apps/api/server.mjs"), "utf8");
  const fetchScriptSource = await fs.readFile(path.resolve("scripts/market-data/fetch-market-data.mjs"), "utf8");
  assert.equal(assetFormSource.includes("/api/assets"), false);
  assert.equal(assetFormSource.includes("&purchaseDate="), false);
  assert.equal(marketServiceSource.includes("assetsForMarketSyncPayload"), false);
  assert.equal(marketServiceSource.includes("JSON.stringify({ symbols, assets"), false);
  assert.equal(marketServiceSource.includes("quantity: asset.quantity"), false);
  assert.equal(marketServiceSource.includes("costPrice: asset.costPrice"), false);
  assert.equal(marketServiceSource.includes("account: asset.account"), false);
  assert.equal(marketServiceSource.includes("body: JSON.stringify({\n        symbols: [symbol],\n        dateFrom"), false);
  assert.equal(marketRenderSource.includes("/api/asset-prices/daily"), false);
  assert.equal(apiSource.includes("requestedSymbols: []"), true);
  assert.equal(apiSource.includes('{ persistRun: false }'), true);
  assert.equal(fetchScriptSource.includes('options["persist-run"] !== "false"'), true);
});

test("searches the lightweight instrument seed for common assets", () => {
  assert.ok(activeInstrumentRegistry().length >= 100);
  assert.ok(activeInstrumentRegistry().length < 500);
  assert.equal(lookupInstrument("AAPL").market, "US");
  assert.equal(lookupInstrument("NVDA").type, "股票");
  assert.equal(searchInstruments("浦发银行", { limit: 3 })[0].symbol, "600000");
  assert.equal(lookupInstrument("600519").name, "贵州茅台");
  assert.equal(searchInstruments("茅台", { limit: 3 })[0].symbol, "600519");
  assert.equal(searchInstruments("平安", { limit: 3 })[0].symbol, "601318");
  assert.equal(searchInstruments("招行", { limit: 3 })[0].symbol, "600036");
  assert.equal(searchInstruments("宁王", { limit: 3 })[0].symbol, "300750");
  assert.equal(searchInstruments("寒武纪", { limit: 3 })[0].symbol, "688256");
  assert.equal(searchInstruments("中芯", { limit: 3 })[0].symbol, "688981");
  assert.equal(searchInstruments("狗狗币", { limit: 3 })[0].symbol, "DOGE");
  assert.equal(lookupInstrument("腾讯控股").symbol, "00700");
  assert.equal(searchInstruments("Apple", { limit: 3 })[0].symbol, "AAPL");
  assert.equal(instrumentMatchStatus("不存在资产XYZ999").status, "uncovered");
});

test("prioritizes asset entry matches from the instrument registry", () => {
  const matches = findAssetQuickMatches("NVDA", 5);
  assert.equal(matches[0].symbol, "NVDA");
  assert.equal(matches[0].market, "US");
  assert.equal(findAssetQuickMatches("茅台", 5)[0].symbol, "600519");
  assert.equal(findAssetQuickMatches("比亚迪", 5)[0].symbol, "002594");
  assert.equal(findAssetQuickMatches("寒武纪", 5)[0].symbol, "688256");
  assert.equal(findAssetQuickMatches("狗狗币", 5)[0].symbol, "DOGE");
  assert.equal(findAssetQuickMatches("不存在资产XYZ999", 5).length, 0);
});

test("recognizes gold assets without changing gold ETFs into precious metals", () => {
  assert.equal(findAssetQuickMatch("黄金").type, "贵金属");
  assert.equal(findAssetQuickMatch("金条").type, "实物资产");
  assert.equal(findAssetQuickMatch("GLD")?.type, "ETF");
  assert.equal(lookupSecurity("XAU").universe, "precious-metals");
  assert.equal(lookupSecurity("BTC").universe, "crypto");
  assert.equal(inferUniverse({ symbol: "BTC" }).key, "crypto");
});

test("normalizes metals crypto and fx provider payloads", () => {
  const metals = normalizeMetalsDevLatest(
    { metals: { gold: 2350.125, silver: 30.5 } },
    preciousMetalInstruments.filter((item) => ["XAU", "XAG"].includes(item.symbol)),
    { tradeDate: "2026-06-02", sourceFetchedAt: "2026-06-02T10:00:00.000Z" }
  );
  assert.deepEqual(metals.map((row) => [row.instrumentSymbol, row.closePrice]), [
    ["XAU", "2350.125"],
    ["XAG", "30.5"]
  ]);

  const crypto = normalizeCoinGeckoSimplePrice(
    { bitcoin: { usd: 68000.55, last_updated_at: 1780400000 } },
    cryptoInstruments.filter((item) => item.symbol === "BTC"),
    { tradeDate: "2026-06-02", vsCurrency: "usd" }
  );
  assert.equal(crypto[0].instrumentSymbol, "BTC");
  assert.equal(crypto[0].closePrice, "68000.55");
  assert.equal(crypto[0].source, "CoinGecko simple price");

  const fx = normalizeFrankfurterLatest(
    { base: "USD", date: "2026-06-02", rates: { CNY: 7.12, HKD: 7.81 } },
    defaultFxPairs,
    { sourceFetchedAt: "2026-06-02T10:00:00.000Z" }
  );
  assert.deepEqual(fx.map((row) => `${row.baseCurrency}/${row.quoteCurrency}:${row.rate}`), [
    "USD/CNY:7.12",
    "USD/HKD:7.81"
  ]);
});

test("normalizes Binance and Gold API market payloads", () => {
  const btc = cryptoInstruments.find((item) => item.symbol === "BTC");
  const klines = normalizeBinanceKlines(
    [[1780358400000, "66000", "67000", "65000", "66628.00000000"]],
    btc,
    { sourceFetchedAt: "2026-06-03T01:50:15.158Z" }
  );
  assert.equal(klines[0].tradeDate, "2026-06-02");
  assert.equal(klines[0].closePrice, "66628.00000000");
  assert.equal(klines[0].source, "Binance daily kline public API");
  assert.equal(klines[0].priceKind, "close");
  assert.equal(klines[0].marketTimezone, "UTC");

  const ticker = normalizeBinanceTickerPrice(
    { symbol: "BTCUSDT", price: "66630.12000000" },
    btc,
    { tradeDate: "2026-06-03", sourceFetchedAt: "2026-06-03T01:50:15.217Z" }
  );
  assert.equal(ticker[0].tradeDate, "2026-06-03");
  assert.equal(ticker[0].closePrice, "66630.12000000");
  assert.equal(ticker[0].priceKind, "latest");

  const xau = preciousMetalInstruments.find((item) => item.symbol === "XAU");
  const gold = normalizeGoldApiPrice(
    { price: 4476.100098 },
    xau,
    { tradeDate: "2026-06-03", sourceFetchedAt: "2026-06-03T01:50:12.842Z" }
  );
  assert.equal(gold[0].instrumentSymbol, "XAU");
  assert.equal(gold[0].source, "Gold API metals price");
  assert.equal(gold[0].priceKind, "reference");
});

test("keeps crypto latest valuation separate from completed UTC daily history", () => {
  const asset = { symbol: "BTC", type: "数字资产", market: "WEB3" };
  const points = [
    {
      date: "2026-07-11",
      close: 62000,
      priceKind: "close",
      priceAt: "2026-07-11T23:59:59.999Z",
      source: "Binance daily kline public API",
      qualityStatus: "ok"
    },
    {
      date: "2026-07-12",
      close: 62500,
      priceKind: "latest",
      priceAt: "2026-07-12T06:00:00.000Z",
      source: "Binance ticker price public API",
      qualityStatus: "ok"
    }
  ];
  assert.equal(selectCurrentValuationPoint(asset, points).close, 62500);
  assert.deepEqual(points.filter(isDailyHistoryPoint).map((point) => point.date), ["2026-07-11"]);
});

test("rejects legacy Binance daily rows fetched before the UTC candle completed", () => {
  const partial = {
    date: "2026-07-13",
    close: 62500,
    source: "Binance daily kline public API",
    sourceFetchedAt: "2026-07-13T13:00:00.000Z",
    qualityStatus: "ok"
  };
  const completed = {
    ...partial,
    sourceFetchedAt: "2026-07-14T00:00:01.000Z"
  };
  assert.equal(isDailyHistoryPoint(partial), false);
  assert.equal(isDailyHistoryPoint(completed), true);
});

test("does not use realtime quote rows as listed-stock closes", () => {
  const asset = { symbol: "SPY", type: "ETF", market: "US" };
  const points = [
    { date: "2026-07-10", close: 620, source: "Nasdaq historical public API", qualityStatus: "ok" },
    { date: "2026-07-12", close: 625, source: "Nasdaq quote public API", qualityStatus: "ok" }
  ];
  const selected = selectCurrentValuationPoint(asset, points);
  assert.equal(selected.date, "2026-07-10");
  assert.equal(selected.close, 620);
});

test("selects the latest trade date before considering when daily prices were fetched", () => {
  const asset = { symbol: "NVDA", type: "股票", market: "US" };
  const points = [
    {
      date: "2026-07-13",
      close: 203.53,
      source: "Nasdaq historical public API",
      sourceFetchedAt: "2026-07-14T01:00:00.000Z",
      qualityStatus: "ok"
    },
    {
      date: "2026-07-06",
      close: 195.55,
      source: "Nasdaq historical public API",
      sourceFetchedAt: "2026-07-14T01:00:00.500Z",
      qualityStatus: "ok"
    }
  ];
  const selected = selectCurrentValuationPoint(asset, points);
  assert.equal(selected.date, "2026-07-13");
  assert.equal(selected.close, 203.53);
});

test("reports skipped market fetches as cache usage instead of successful updates", () => {
  const fetchResult = {
    status: "completed_with_warnings",
    run: {
      failureCount: 0,
      skippedCount: 1,
      messages: [{ symbol: "NVDA", level: "warn", message: "Nasdaq 暂无可用日线" }]
    }
  };
  assert.deepEqual(marketFetchPresentation(fetchResult), {
    hasWarning: true,
    message: "抓取完成，1 个代码暂无新日线"
  });
  assert.equal(
    decorateMarketSyncResults([{ symbol: "NVDA", status: "synced" }], fetchResult)[0].syncDisplayStatus,
    "cached"
  );
});

test("does not treat an already-covered market cache as a skipped fetch warning", () => {
  const fetchResult = {
    status: "covered",
    run: { failureCount: 0, skippedCount: 2, messages: [] }
  };
  assert.deepEqual(
    marketFetchPresentation(fetchResult),
    { hasWarning: false, message: "行情缓存已覆盖当前请求区间" }
  );
  assert.equal(
    decorateMarketSyncResults([{ symbol: "NVDA", status: "synced" }], fetchResult)[0].syncDisplayStatus,
    "cached"
  );
});

test("labels an explicit cache-only market response as cache usage", () => {
  assert.deepEqual(
    marketFetchPresentation(null),
    { hasWarning: false, message: "已读取行情缓存" }
  );
  assert.equal(
    decorateMarketSyncResults([{ symbol: "NVDA", status: "synced" }], null)[0].syncDisplayStatus,
    "cached"
  );
});

test("accepts listed-market daily prices only after the local close", () => {
  assert.equal(isMarketCloseAvailable("CN", "2026-07-13", new Date("2026-07-13T06:59:00.000Z")), false);
  assert.equal(isMarketCloseAvailable("CN", "2026-07-13", new Date("2026-07-13T07:00:00.000Z")), true);
  assert.equal(isMarketCloseAvailable("HK", "2026-07-13", new Date("2026-07-13T07:59:00.000Z")), false);
  assert.equal(isMarketCloseAvailable("HK", "2026-07-13", new Date("2026-07-13T08:00:00.000Z")), true);
  assert.equal(isMarketCloseAvailable("US", "2026-07-13", new Date("2026-07-13T19:59:00.000Z")), false);
  assert.equal(isMarketCloseAvailable("US", "2026-07-13", new Date("2026-07-13T20:00:00.000Z")), true);
});

test("groups current market value by asset category", () => {
  const breakdown = calculateCategoryBreakdown([
    {
      name: "Stock A",
      type: "股票",
      account: "长期账户",
      currency: "USD",
      quantity: "1",
      costPrice: "90.00",
      previousPrice: "100.00",
      currentPrice: "120.00",
      fxRate: "1",
      contribution: "0",
      fees: "0"
    },
    {
      name: "Fund A",
      type: "基金",
      account: "长期账户",
      currency: "USD",
      quantity: "2",
      costPrice: "50.00",
      previousPrice: "50.00",
      currentPrice: "60.00",
      fxRate: "1",
      contribution: "0",
      fees: "0"
    },
    {
      name: "Cash",
      type: "现金",
      account: "备用金",
      currency: "USD",
      quantity: "80",
      costPrice: "1.00",
      previousPrice: "1.00",
      currentPrice: "1.00",
      fxRate: "1",
      contribution: "0",
      fees: "0"
    }
  ]);

  assert.deepEqual(
    breakdown.map((item) => [item.type, item.marketValueCents, item.weightBps]),
    [
      ["基金", 12000n, 3750n],
      ["股票", 12000n, 3750n],
      ["现金", 8000n, 2500n]
    ]
  );
});

test("collects saved account names from existing assets for future asset entry", () => {
  const accounts = savedAccountOptionsFromAssets([
    { account: "长期账户", accountType: "long_term" },
    { account: "长期账户", accountType: "long_term" },
    { account: "长期账户", accountType: "securities" },
    { account: "美股账户", type: "股票" },
    { account: "冷钱包", type: "数字资产" },
    { account: "  " }
  ]);

  assert.deepEqual(accounts, [
    { name: "冷钱包", accountType: "crypto", saved: true },
    { name: "美股账户", accountType: "securities", saved: true },
    { name: "长期账户", accountType: "long_term", saved: true }
  ]);
});

test("normalizes legacy account type form values", () => {
  assert.equal(normalizeAccountTypeFormValue("brokerage"), "securities");
  assert.equal(normalizeAccountTypeFormValue("custom", "家庭账户"), "custom:家庭账户");
  assert.equal(normalizeAccountTypeFormValue("__custom__", "长期实验账户"), "custom:长期实验账户");
});

test("formats basis point returns with explicit sign", () => {
  assert.equal(formatPercent(1250n), "+12.50%");
  assert.equal(formatPercent(-80n), "-0.80%");
});
