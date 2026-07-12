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
