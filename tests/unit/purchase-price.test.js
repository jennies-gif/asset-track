import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAsset } from "../../src/domain/calculations.js";
import { selectPurchasePriceAtOrBefore } from "../../src/domain/purchasePrice.js";

test("selects the exact daily purchase price when the requested date is covered", () => {
  const result = selectPurchasePriceAtOrBefore([
    { date: "2026-07-23", close: "10.20", source: "daily source", priceKind: "close" },
    { date: "2026-07-24", close: "10.50", source: "daily source", priceKind: "close" }
  ], "2026-07-24");

  assert.equal(result.price, "10.50");
  assert.equal(result.priceDate, "2026-07-24");
  assert.equal(result.usedPreviousTradingDate, false);
});

test("uses the nearest previous trading date without treating a latest quote as daily history", () => {
  const result = selectPurchasePriceAtOrBefore([
    { date: "2026-07-24", close: "10.50", source: "daily source", priceKind: "close" },
    { date: "2026-07-25", close: "10.80", source: "ticker latest", priceKind: "latest" }
  ], "2026-07-25");

  assert.equal(result.price, "10.50");
  assert.equal(result.priceDate, "2026-07-24");
  assert.equal(result.usedPreviousTradingDate, true);
});

test("returns null when no valid public price exists on or before the requested date", () => {
  assert.equal(selectPurchasePriceAtOrBefore([
    { date: "2026-07-26", close: "10.80", source: "daily source", priceKind: "close" },
    { date: "2026-07-24", close: "0", source: "daily source", priceKind: "close" }
  ], "2026-07-25"), null);
});

test("keeps synced purchase-price provenance and treats zero cost as missing", () => {
  const synced = normalizeAsset({
    name: "测试资产",
    costPrice: "10.5",
    costPriceStatus: "synced",
    costPricedAt: "2026-07-24",
    costPriceSource: "daily source",
    costPriceKind: "close"
  });
  assert.equal(synced.costPriceStatus, "synced");
  assert.equal(synced.costPricedAt, "2026-07-24");
  assert.equal(synced.costPriceSource, "daily source");

  const missing = normalizeAsset({ name: "待补成本", costPrice: "0" });
  assert.equal(missing.costPriceStatus, "missing");
  assert.equal(missing.costPriceSource, "");
});
