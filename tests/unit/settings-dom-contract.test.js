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

test("asset entry keeps manual current price recovery hidden from the normal flow", async () => {
  const indexSource = await readFile(resolve(projectRoot, "index.html"), "utf8");
  const currencyIndex = indexSource.indexOf('name="currency"');
  const purchaseDateIndex = indexSource.indexOf('name="purchaseDate"');
  const costPriceIndex = indexSource.indexOf('name="costPrice"');
  const quantityIndex = indexSource.indexOf('name="quantity"');

  assert.ok(currencyIndex < purchaseDateIndex);
  assert.ok(purchaseDateIndex < costPriceIndex);
  assert.ok(costPriceIndex < quantityIndex);
  assert.match(
    indexSource,
    /<label class="manual-current-price-field is-hidden">当前价格 \/ 最新净值[\s\S]*?<input name="currentPrice"/u
  );
  assert.match(indexSource, /自动同步失败时可手动填写/u);
});

test("valuation exceptions replace pervasive completeness fields", async () => {
  const [indexSource, homeSource, assetSource, assetFormSource] = await Promise.all([
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    readFile(resolve(projectRoot, "src/features/home/homeRender.js"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetRender.js"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetForm.js"), "utf8")
  ]);

  assert.match(indexSource, /id="home-attention-section"[\s\S]*?>待处理</u);
  assert.match(indexSource, /id="analysis-data-notice-section"[\s\S]*?>分析限制</u);
  assert.doesNotMatch(indexSource, /id="portfolio-status-filter"/u);
  assert.doesNotMatch(indexSource, /<th>数据状态<\/th>/u);
  assert.match(homeSource, /valuationAttentionItems/u);
  assert.match(homeSource, /data-home-action="resolve-price"/u);
  assert.match(assetSource, /price-attention-dot/u);
  assert.match(assetFormSource, /\["error", "missing", "warning"\]\.includes\(status\)[\s\S]*?manualPriceField\?\.classList\.remove\("is-hidden"\)/u);
});

test("cash ledger hides internal face-value prices, price returns and inline exchange rates", async () => {
  const [renderSource, indexSource] = await Promise.all([
    readFile(resolve(projectRoot, "src/features/assets/assetRender.js"), "utf8"),
    readFile(resolve(projectRoot, "index.html"), "utf8")
  ]);

  assert.match(renderSource, /isCash \? "—" : escapeHtml\(formatUnitPrice\(asset\.costPrice/u);
  assert.match(renderSource, /现金按余额/u);
  assert.match(renderSource, /现金无价格收益/u);
  assert.doesNotMatch(renderSource, /asset-fx-rate|折算 .*设置汇率/u);
  assert.match(renderSource, /外币折算汇率可在设置中调整/u);
  assert.match(indexSource, /id="setting-usd-cny-rate"/u);
  assert.match(indexSource, /id="setting-usd-hkd-rate"/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
