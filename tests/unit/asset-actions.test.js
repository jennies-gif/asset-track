import assert from "node:assert/strict";
import test from "node:test";

import { removeAssetFromState } from "../../src/features/assets/assetForm.js";

test("removes one local asset while preserving and unlinking its review notes", () => {
  const state = {
    assets: [
      { id: "asset-a", name: "资产 A", buyRecords: [{ id: "buy-a" }] },
      { id: "asset-b", name: "资产 B" }
    ],
    notes: [
      { id: "note-a", assetId: "asset-a", asset: "资产 A", content: "保留正文" },
      { id: "note-a-without-label", assetId: "asset-a", content: "保留无标签正文" },
      { id: "note-b", assetId: "asset-b", asset: "资产 B", content: "其他复盘" }
    ],
    settings: { displayCurrency: "CNY" }
  };

  const nextState = removeAssetFromState(state, "asset-a");

  assert.deepEqual(nextState.assets, [{ id: "asset-b", name: "资产 B" }]);
  assert.deepEqual(nextState.notes, [
    { id: "note-a", asset: "资产 A", content: "保留正文" },
    { id: "note-a-without-label", asset: "资产 A", content: "保留无标签正文" },
    { id: "note-b", assetId: "asset-b", asset: "资产 B", content: "其他复盘" }
  ]);
  assert.deepEqual(nextState.settings, state.settings);
  assert.equal(state.assets.length, 2);
  assert.equal(state.notes[0].assetId, "asset-a");
});

test("does not change state when the requested asset does not exist", () => {
  const state = { assets: [{ id: "asset-a" }], notes: [] };

  assert.equal(removeAssetFromState(state, "missing"), state);
});
