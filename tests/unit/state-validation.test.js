import assert from "node:assert/strict";
import test from "node:test";

import { validateBackupPayload, validateStoredState } from "../../src/state/stateValidation.js";

const validAsset = {
  id: "asset-1",
  name: "测试资产",
  account: "测试账户",
  quantity: "1",
  costPrice: "10",
  previousPrice: "10",
  currentPrice: "11",
  fxRate: "1",
  previousFxRate: "1"
};

test("stored state accepts legacy data without schemaVersion", () => {
  assert.equal(validateStoredState({ assets: [validAsset], notes: [], posts: [], snapshots: [] }).ok, true);
});

test("stored state rejects invalid roots and asset containers", () => {
  assert.equal(validateStoredState(null).reason, "invalid_root");
  assert.equal(validateStoredState([]).reason, "invalid_root");
  assert.equal(validateStoredState({}).reason, "assets_missing");
  assert.equal(validateStoredState({ assets: {} }).reason, "assets_invalid");
});

test("stored state rejects unsafe asset fields and invalid optional collections", () => {
  const invalidAsset = { ...validAsset, quantity: "not-a-number" };
  const result = validateStoredState({ assets: [invalidAsset], notes: {} });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.path === "assets[0].quantity"));
  assert.ok(result.issues.some((item) => item.path === "notes"));
});

test("backup validation accepts wrapped and direct states", () => {
  const state = { assets: [validAsset] };
  assert.equal(validateBackupPayload({ state }).ok, true);
  assert.equal(validateBackupPayload(state).ok, true);
});

test("stored state accepts legacy notes and optional versioned review context", () => {
  const legacy = { id: "note-legacy", title: "旧复盘", content: "正文" };
  const withContext = {
    id: "note-context",
    title: "带依据的复盘",
    content: "正文",
    contextSnapshot: {
      version: 1,
      capturedAt: "2026-07-29T00:00:00.000Z",
      assetId: "asset-1",
      assetName: "测试资产",
      currency: "CNY",
      quantity: "1",
      costPrice: "10",
      currentPrice: "11",
      priceStatus: "manual",
      priceStatusLabel: "手动价格",
      transactionLabel: ""
    }
  };
  assert.equal(validateStoredState({ assets: [validAsset], notes: [legacy, withContext] }).ok, true);
});

test("stored state rejects malformed review context without affecting legacy compatibility", () => {
  const result = validateStoredState({
    assets: [validAsset],
    notes: [{
      id: "note-invalid-context",
      contextSnapshot: { version: 2, currentPrice: "not-a-number" }
    }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.path === "notes[0].contextSnapshot.version"));
  assert.ok(result.issues.some((item) => item.path === "notes[0].contextSnapshot.currentPrice"));
});
