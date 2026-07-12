import assert from "node:assert/strict";
import test from "node:test";

import { initImportExportEvents } from "../../src/features/importExport/importExportEvents.js";

test("backup menu closes after a click outside and stays open after a click inside", () => {
  const listeners = new Map();
  const originalDocument = globalThis.document;
  globalThis.document = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };

  const insideTarget = {};
  const menu = {
    open: true,
    contains(target) {
      return target === insideTarget;
    },
    removeAttribute(name) {
      if (name === "open") this.open = false;
    },
    querySelector() {
      return null;
    }
  };

  try {
    initImportExportEvents({ backupMenu: menu });
    listeners.get("click")({ target: insideTarget });
    assert.equal(menu.open, true);

    listeners.get("click")({ target: {} });
    assert.equal(menu.open, false);
  } finally {
    globalThis.document = originalDocument;
  }
});

test("Escape closes the backup menu and returns focus to its trigger", () => {
  const listeners = new Map();
  const originalDocument = globalThis.document;
  globalThis.document = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };

  let focused = false;
  const menu = {
    open: true,
    contains() {
      return false;
    },
    removeAttribute(name) {
      if (name === "open") this.open = false;
    },
    querySelector() {
      return { focus: () => { focused = true; } };
    }
  };

  try {
    initImportExportEvents({ backupMenu: menu });
    listeners.get("keydown")({ key: "Escape" });
    assert.equal(menu.open, false);
    assert.equal(focused, true);
  } finally {
    globalThis.document = originalDocument;
  }
});
