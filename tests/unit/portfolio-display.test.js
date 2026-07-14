import assert from "node:assert/strict";
import test from "node:test";

import {
  configurePortfolioSelectors,
  displayFxRateSummary
} from "../../src/domain/portfolioSelectors.js";
import { resolvePriceStatus } from "../../src/domain/priceStatus.js";
import { buildAssetDataIssues } from "../../src/features/assets/dataQuality.js";

test("treats cash face value as balance semantics instead of a market price", () => {
  assert.deepEqual(resolvePriceStatus({
    type: "现金",
    currentPrice: "1",
    costPrice: "1",
    pricedAt: "2026-01-01",
    priceSource: "用户录入"
  }), {
    key: "cash",
    label: "现金按余额",
    className: "data-ok",
    needsReview: false
  });
});

test("does not require market-price metadata for cash balances", () => {
  assert.deepEqual(buildAssetDataIssues({
    type: "现金",
    currency: "USD",
    quantity: "1000",
    purchaseDate: "2026-07-01",
    fxRate: "1"
  }), []);
});

test("uses the same display settings to explain foreign-currency valuation", () => {
  configurePortfolioSelectors({
    getState: () => ({
      settings: {
        displayCurrency: "CNY",
        usdCnyRate: "7.12",
        usdHkdRate: "7.82"
      }
    })
  });

  assert.equal(displayFxRateSummary({ currency: "USD", fxRate: "1" }), "USD/CNY 7.12");
  assert.equal(displayFxRateSummary({ currency: "HKD", fxRate: "0.1279" }), "HKD/CNY 0.9105");
  assert.equal(displayFxRateSummary({ currency: "CNY", fxRate: "0.1404" }), "");
});

test("explains inverse display rates without floating-point calculations", () => {
  configurePortfolioSelectors({
    getState: () => ({
      settings: {
        displayCurrency: "USD",
        usdCnyRate: "7.12",
        usdHkdRate: "7.82"
      }
    })
  });

  assert.equal(displayFxRateSummary({ currency: "CNY", fxRate: "0.1404" }), "CNY/USD 0.1404");
  assert.equal(displayFxRateSummary({ currency: "HKD", fxRate: "0.1279" }), "HKD/USD 0.1279");
});
