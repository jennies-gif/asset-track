import assert from "node:assert/strict";
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
  parseDecimalToScaledInt,
  scaledIntToDecimal
} from "../../src/domain/calculations.js";
import { buildDataTasks, buildHistorySeries, inferUniverse, lookupSecurity } from "../../src/domain/marketData.js";
import { activeInstrumentRegistry, instrumentMatchStatus, lookupInstrument, searchInstruments } from "../../src/domain/instrumentRegistry.js";
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

test("parses decimal values with deterministic rounding", () => {
  assert.equal(parseDecimalToScaledInt("12.345", 2), 1235n);
  assert.equal(parseDecimalToScaledInt("-12.345", 2), -1235n);
  assert.equal(scaledIntToDecimal(123500n, 4), "12.35");
});

test("formats invalid percent inputs as unavailable data", () => {
  assert.equal(formatPercent(Number.NaN), "暂无数据");
  assert.equal(formatPercent(Number.POSITIVE_INFINITY), "暂无数据");
});

test("calculates position value with quantity and FX rate", () => {
  const value = calculateMoneyFromQuantity("10.5", "100.00", "0.5");
  assert.equal(value, 52500n);
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

test("searches the generated instrument registry for mainstream assets", () => {
  assert.ok(activeInstrumentRegistry().length >= 5000);
  assert.equal(lookupInstrument("AAPL").market, "US");
  assert.equal(lookupInstrument("NVDA").type, "股票");
  assert.equal(lookupInstrument("600519").name, "贵州茅台");
  assert.equal(searchInstruments("茅台", { limit: 3 })[0].symbol, "600519");
  assert.equal(searchInstruments("平安", { limit: 3 })[0].symbol, "601318");
  assert.equal(searchInstruments("招行", { limit: 3 })[0].symbol, "600036");
  assert.equal(searchInstruments("宁王", { limit: 3 })[0].symbol, "300750");
  assert.equal(searchInstruments("美光", { limit: 3 })[0].symbol, "MU");
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
  assert.equal(findAssetQuickMatches("美光", 5)[0].symbol, "MU");
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

  const ticker = normalizeBinanceTickerPrice(
    { symbol: "BTCUSDT", price: "66630.12000000" },
    btc,
    { tradeDate: "2026-06-03", sourceFetchedAt: "2026-06-03T01:50:15.217Z" }
  );
  assert.equal(ticker[0].tradeDate, "2026-06-03");
  assert.equal(ticker[0].closePrice, "66630.12000000");

  const xau = preciousMetalInstruments.find((item) => item.symbol === "XAU");
  const gold = normalizeGoldApiPrice(
    { price: 4476.100098 },
    xau,
    { tradeDate: "2026-06-03", sourceFetchedAt: "2026-06-03T01:50:12.842Z" }
  );
  assert.equal(gold[0].instrumentSymbol, "XAU");
  assert.equal(gold[0].source, "Gold API metals price");
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

test("formats basis point returns with explicit sign", () => {
  assert.equal(formatPercent(1250n), "+12.50%");
  assert.equal(formatPercent(-80n), "-0.80%");
});
