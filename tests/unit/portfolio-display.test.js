import assert from "node:assert/strict";
import test from "node:test";

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
