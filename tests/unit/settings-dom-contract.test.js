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

test("asset entry keeps the requested date, buy price and share order without a visible current price field", async () => {
  const indexSource = await readFile(resolve(projectRoot, "index.html"), "utf8");
  const currencyIndex = indexSource.indexOf('name="currency"');
  const purchaseDateIndex = indexSource.indexOf('name="purchaseDate"');
  const costPriceIndex = indexSource.indexOf('name="costPrice"');
  const quantityIndex = indexSource.indexOf('name="quantity"');

  assert.ok(currencyIndex < purchaseDateIndex);
  assert.ok(purchaseDateIndex < costPriceIndex);
  assert.ok(costPriceIndex < quantityIndex);
  assert.match(indexSource, /<input name="currentPrice" type="hidden">/u);
  assert.doesNotMatch(indexSource, /<label>当前价格/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
