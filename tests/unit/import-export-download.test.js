import assert from "node:assert/strict";
import test from "node:test";

import { downloadText } from "../../src/features/importExport/importExportService.js";

test("text downloads keep the object URL alive until after the click has started", () => {
  const originalBlob = globalThis.Blob;
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const originalUrl = globalThis.URL;
  const calls = [];
  let scheduledCallback = null;
  const link = {
    href: "",
    download: "",
    click() { calls.push("click"); },
    remove() { calls.push("remove"); }
  };

  globalThis.Blob = class {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  };
  globalThis.URL = {
    createObjectURL(blob) {
      calls.push(["create", blob.parts, blob.type]);
      return "blob:test-download";
    },
    revokeObjectURL(url) {
      calls.push(["revoke", url]);
    }
  };
  globalThis.document = {
    createElement(name) {
      assert.equal(name, "a");
      return link;
    },
    body: {
      append(node) {
        assert.equal(node, link);
        calls.push("append");
      }
    }
  };
  globalThis.setTimeout = (callback, delay) => {
    scheduledCallback = callback;
    calls.push(["schedule", delay]);
    return 1;
  };

  try {
    downloadText("backup.json", "{\"ok\":true}", "application/json");
    assert.equal(link.href, "blob:test-download");
    assert.equal(link.download, "backup.json");
    assert.deepEqual(calls, [
      ["create", ["{\"ok\":true}"], "application/json"],
      "append",
      "click",
      "remove",
      ["schedule", 1000]
    ]);

    scheduledCallback();
    assert.deepEqual(calls.at(-1), ["revoke", "blob:test-download"]);
  } finally {
    globalThis.Blob = originalBlob;
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.URL = originalUrl;
  }
});
