import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssetAnalysisLimitations,
  buildAssetValuationNotices
} from "../../src/features/assets/dataQuality.js";

test("keeps manual prices out of the valuation attention queue", () => {
  assert.deepEqual(buildAssetValuationNotices({
    type: "股票",
    currentPrice: "12.5",
    costPrice: "10",
    priceStatus: "manual",
    priceSource: "用户录入"
  }), []);
});

test("treats a missing current price as a blocking valuation notice", () => {
  assert.deepEqual(buildAssetValuationNotices({
    type: "股票",
    currentPrice: "0",
    costPrice: "0",
    priceStatus: "missing"
  })[0], {
    key: "price-missing",
    scope: "valuation",
    severity: "danger",
    label: "缺少当前价格",
    detail: "当前市值缺少可用价格，结果可能不准确。",
    action: "重新同步；仍无法获取时可手动填写当前价格。",
    affectsAnalysis: true
  });
});

test("keeps a failed sync with an old price as a non-blocking warning", () => {
  const notice = buildAssetValuationNotices({
    type: "股票",
    currentPrice: "12.5",
    costPrice: "10",
    pricedAt: "2026-07-22",
    priceStatus: "error"
  })[0];

  assert.equal(notice.key, "price-sync-error-cached");
  assert.equal(notice.severity, "warning");
  assert.equal(notice.affectsAnalysis, false);
  assert.match(notice.detail, /2026-07-22/u);
});

test("classifies missing cost and history as analysis limitations only", () => {
  const asset = {
    type: "股票",
    currentPrice: "12.5",
    costPrice: "0",
    previousPrice: "0",
    priceStatus: "manual",
    priceSource: "用户录入"
  };

  assert.deepEqual(buildAssetValuationNotices(asset), []);
  assert.deepEqual(
    buildAssetAnalysisLimitations(asset).map((item) => item.key),
    ["missing-cost-basis", "missing-purchase-date", "missing-previous-price"]
  );
});

test("does not create price or analysis notices for cash balances", () => {
  const cash = { type: "现金", quantity: "1000", currency: "USD" };
  assert.deepEqual(buildAssetValuationNotices(cash), []);
  assert.deepEqual(buildAssetAnalysisLimitations(cash), []);
});
