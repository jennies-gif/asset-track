import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");

test("settings event elements exist in the static app markup", async () => {
  const [indexSource, elementsSource] = await Promise.all([
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    readFile(resolve(projectRoot, "src/features/settings/settingsElements.js"), "utf8")
  ]);
  const requiredIds = [...elementsSource.matchAll(/document\.querySelector\("#([^"]+)"\)/gu)]
    .map(([, id]) => id);

  assert.ok(requiredIds.length > 0, "expected settings element IDs to be declared");
  for (const id of requiredIds) {
    assert.match(indexSource, new RegExp(`id=["']${escapeRegExp(id)}["']`, "u"), `index.html is missing #${id}`);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
