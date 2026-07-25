import assert from "node:assert/strict";
import test from "node:test";

import {
  exactPublicInstrumentMatch,
  inferPublicInstrumentCandidate,
  isVerifiedInstrumentSyncResult
} from "../../src/server/instrumentDiscovery.js";

test("only creates runtime discovery candidates for standardized public codes", () => {
  assert.deepEqual(inferPublicInstrumentCandidate("00700"), {
    symbol: "00700",
    name: "00700",
    type: "股票",
    universe: "runtime-hk",
    market: "HK",
    currency: "HKD"
  });
  assert.equal(inferPublicInstrumentCandidate("我的长期资产"), null);
  assert.equal(inferPublicInstrumentCandidate("ABC-123"), null);
});

test("requires a successful positive public price before a discovered code is verified", () => {
  assert.equal(isVerifiedInstrumentSyncResult({
    results: [{ symbol: "IWM", status: "missing" }]
  }, "IWM"), false);
  assert.equal(isVerifiedInstrumentSyncResult({
    results: [{ symbol: "IWM", status: "synced", after: { currentPrice: "0" } }]
  }, "IWM"), false);
  assert.equal(isVerifiedInstrumentSyncResult({
    results: [{ symbol: "IWM", status: "synced", after: { currentPrice: "221.45" } }]
  }, "iwm"), true);
});

test("does not silently choose the first partial-name match", () => {
  const matches = [
    { symbol: "AAA", name: "同名资产 A", aliases: ["资产A"] },
    { symbol: "BBB", name: "同名资产 B", aliases: ["资产B"] }
  ];
  assert.equal(exactPublicInstrumentMatch(matches, "同名资产"), null);
  assert.equal(exactPublicInstrumentMatch(matches, "bbb"), matches[1]);
  assert.equal(exactPublicInstrumentMatch(matches, "资产A"), matches[0]);
});
