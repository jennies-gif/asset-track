import assert from "node:assert/strict";
import test from "node:test";

import { storageKey } from "../../src/constants/appConstants.js";
import {
  isStorageWriteLocked,
  loadState,
  replaceStateFromRecovery,
  saveState
} from "../../src/state/storage.js";

const validState = {
  session: { signedIn: false },
  settings: {},
  selectedAccount: "all",
  snapshots: [],
  assets: [{
    id: "asset-1",
    name: "测试资产",
    account: "测试账户",
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

test("loadState distinguishes empty and ready storage", () => {
  globalThis.localStorage = memoryStorage();
  const empty = loadState();
  assert.equal(empty.status, "empty");
  assert.equal(empty.state.session.signedIn, false);
  assert.deepEqual(empty.state.assets, []);
  assert.deepEqual(empty.state.snapshots, []);
  assert.deepEqual(empty.state.notes, []);
  assert.deepEqual(empty.state.posts, []);
  localStorage.setItem(storageKey, JSON.stringify(validState));
  const result = loadState();
  assert.equal(result.status, "ready");
  assert.equal(result.state.schemaVersion, 1);
});

test("loadState does not fill missing optional collections with demo content", () => {
  globalThis.localStorage = memoryStorage({
    [storageKey]: JSON.stringify({ assets: [] })
  });
  const result = loadState();
  assert.equal(result.status, "ready");
  assert.deepEqual(result.state.assets, []);
  assert.deepEqual(result.state.snapshots, []);
  assert.deepEqual(result.state.notes, []);
  assert.deepEqual(result.state.posts, []);
});

test("loadState protects invalid JSON, roots and asset structures", () => {
  const cases = [
    "{broken",
    JSON.stringify([]),
    JSON.stringify({ notes: [] }),
    JSON.stringify({ assets: {} })
  ];
  for (const raw of cases) {
    globalThis.localStorage = memoryStorage({ [storageKey]: raw });
    const result = loadState();
    assert.equal(result.status, "recovery_required");
    assert.equal(isStorageWriteLocked(), true);
    assert.equal(result.recovery.raw, raw);
  }
});

test("loadState reports localStorage access errors", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  };
  const result = loadState();
  assert.equal(result.status, "unavailable");
  assert.equal(isStorageWriteLocked(), true);
});

test("saveState writes schemaVersion normally and rejects protected writes", () => {
  globalThis.localStorage = memoryStorage();
  loadState();
  assert.equal(saveState(validState).ok, true);
  assert.equal(JSON.parse(localStorage.getItem(storageKey)).schemaVersion, 1);

  const corruptRaw = "{broken";
  globalThis.localStorage = memoryStorage({ [storageKey]: corruptRaw });
  loadState();
  assert.equal(saveState(validState).reason, "write_locked");
  assert.equal(localStorage.getItem(storageKey), corruptRaw);
});

test("saveState returns an explicit write error", () => {
  globalThis.localStorage = memoryStorage();
  loadState();
  localStorage.setItem = () => { throw new Error("quota exceeded"); };
  const result = saveState(validState);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage_write_failed");
});

test("replaceStateFromRecovery writes, rereads and unlocks a valid backup", () => {
  globalThis.localStorage = memoryStorage({ [storageKey]: "{broken" });
  loadState();
  const result = replaceStateFromRecovery(validState);
  assert.equal(result.ok, true);
  assert.equal(isStorageWriteLocked(), false);
  assert.equal(loadState().status, "ready");
});

test("failed recovery verification attempts to preserve the original raw value", () => {
  const originalRaw = "{broken";
  const storage = memoryStorage({ [storageKey]: originalRaw });
  const regularGet = storage.getItem.bind(storage);
  let corruptNextRead = false;
  storage.setItem = (key, value) => {
    storage.values.set(key, String(value));
    if (String(value) !== originalRaw) corruptNextRead = true;
  };
  storage.getItem = (key) => {
    if (corruptNextRead) {
      corruptNextRead = false;
      return "{verification-failed";
    }
    return regularGet(key);
  };
  globalThis.localStorage = storage;
  loadState();
  const result = replaceStateFromRecovery(validState);
  assert.equal(result.ok, false);
  assert.equal(result.originalPreserved, true);
  assert.equal(regularGet(storageKey), originalRaw);
  assert.equal(isStorageWriteLocked(), true);
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}
