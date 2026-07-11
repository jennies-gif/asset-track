import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");

const requiredElementSources = [
  "src/features/settings/settingsElements.js",
  "src/features/home/homeElements.js",
  "src/features/analysis/analysisElements.js",
  "src/features/importExport/importExportElements.js",
  "src/features/feedback/feedbackEvents.js"
];

test("core static app modules have unique DOM targets in index.html", async () => {
  const [indexSource, ...elementSources] = await Promise.all([
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    ...requiredElementSources.map((file) => readFile(resolve(projectRoot, file), "utf8"))
  ]);
  const requiredIds = [...new Set(elementSources.flatMap((source) =>
    [...source.matchAll(/document\.querySelector\("#([^"]+)"\)/gu)].map(([, id]) => id)
  ))];

  assert.ok(requiredIds.length > 0, "expected core module element IDs to be declared");
  for (const id of requiredIds) {
    const matches = indexSource.match(new RegExp(`id=["']${escapeRegExp(id)}["']`, "gu")) || [];
    assert.equal(matches.length, 1, `index.html must contain exactly one #${id}; found ${matches.length}`);
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
