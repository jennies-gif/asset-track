import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPendingRecovery,
  cancelPendingRecovery,
  configureImportExportService,
  prepareBackupState,
  selectRecoveryBackup
} from "../../src/features/importExport/importExportService.js";

const validState = {
  session: { signedIn: false },
  settings: {},
  selectedAccount: "all",
  snapshots: [],
  assets: [{
    id: "asset-1",
    name: "测试资产",
    symbol: "TEST",
    type: "其他",
    account: "测试账户",
    currency: "USD",
    quantity: "1",
    costPrice: "10",
    previousPrice: "10",
    currentPrice: "11",
    fxRate: "1",
    previousFxRate: "1"
  }],
  notes: [],
  posts: []
};

test("prepareBackupState rejects invalid backups", () => {
  assert.equal(prepareBackupState({ nope: true }).ok, false);
  assert.equal(prepareBackupState({ assets: {} }).ok, false);
});

test("cancelling recovery does not invoke storage replacement", async () => {
  const harness = recoveryHarness();
  configureImportExportService(harness.context);
  await selectRecoveryBackup(fileEvent(validState));
  cancelPendingRecovery();
  assert.equal(harness.replacementCalls, 0);
  assert.equal(harness.elements.recoveryConfirm.disabled, true);
});

test("a valid backup is confirmed through protected replacement", async () => {
  const harness = recoveryHarness();
  configureImportExportService(harness.context);
  await selectRecoveryBackup(fileEvent({ app: "asset-trail", version: 1, state: validState }));
  const result = applyPendingRecovery();
  assert.equal(result.ok, true);
  assert.equal(harness.replacementCalls, 1);
  assert.equal(harness.reloadCalls, 1);
});

function fileEvent(payload) {
  return { target: { files: [{ text: async () => JSON.stringify(payload) }] } };
}

function recoveryHarness() {
  let replacementCalls = 0;
  let reloadCalls = 0;
  const elements = {
    recoveryFile: { value: "", focus() {} },
    recoveryPreview: { innerHTML: "" },
    recoveryError: { textContent: "" },
    recoveryStatus: { textContent: "" },
    recoveryConfirm: { disabled: true }
  };
  return {
    elements,
    get replacementCalls() { return replacementCalls; },
    get reloadCalls() { return reloadCalls; },
    context: {
      elements,
      getState: () => validState,
      replaceStateFromRecovery(state) {
        replacementCalls += 1;
        return { ok: true, state };
      },
      reloadApp() { reloadCalls += 1; }
    }
  };
}
