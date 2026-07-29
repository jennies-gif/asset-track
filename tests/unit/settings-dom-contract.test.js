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

test("asset entry exposes manual current price only from the edit recovery control", async () => {
  const indexSource = await readFile(resolve(projectRoot, "index.html"), "utf8");
  const currencyIndex = indexSource.indexOf('name="currency"');
  const purchaseDateIndex = indexSource.indexOf('name="purchaseDate"');
  const costPriceIndex = indexSource.indexOf('name="costPrice"');
  const quantityIndex = indexSource.indexOf('name="quantity"');

  assert.ok(currencyIndex < purchaseDateIndex);
  assert.ok(purchaseDateIndex < costPriceIndex);
  assert.ok(costPriceIndex < quantityIndex);
  assert.match(indexSource, /class="manual-current-price-control is-hidden"[^>]*id="manual-current-price-control"/u);
  assert.match(indexSource, /id="toggle-manual-current-price"[^>]*aria-expanded="false"[^>]*aria-controls="manual-current-price-panel"[^>]*>手动填写当前价/u);
  assert.match(indexSource, /class="manual-current-price-panel is-hidden"[^>]*id="manual-current-price-panel"/u);
  assert.match(indexSource, /当前价\s*<input name="currentPrice" inputmode="decimal"/u);
  assert.match(indexSource, /价格日期\s*<input name="pricedAt" type="date"/u);
  assert.match(indexSource, /成功获取公共行情时会更新为同步价格/u);
  assert.doesNotMatch(indexSource, /当前价格 \/ 最新净值/u);
  assert.match(indexSource, /自动填写首次持有日期当日或此前最近交易日的买入价格/u);
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
  assert.match(assetFormSource, /未找到首次持有日期当日或此前的公共价格，请手动填写买入价格/u);
});

test("cash ledger hides internal face-value prices, price returns and inline exchange rates", async () => {
  const [renderSource, indexSource, formSource] = await Promise.all([
    readFile(resolve(projectRoot, "src/features/assets/assetRender.js"), "utf8"),
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetForm.js"), "utf8")
  ]);

  assert.match(renderSource, /isCash \? "—" : escapeHtml\(formatUnitPrice\(asset\.costPrice/u);
  assert.match(renderSource, /现金按余额/u);
  assert.match(renderSource, /现金无价格收益/u);
  assert.doesNotMatch(renderSource, /asset-fx-rate|折算 .*设置汇率/u);
  assert.match(renderSource, /外币折算汇率可在设置中调整/u);
  assert.match(indexSource, /id="setting-usd-cny-rate"/u);
  assert.match(indexSource, /id="setting-usd-hkd-rate"/u);
  assert.match(indexSource, /<label><span>股数<\/span>\s*<input name="quantity"/u);
  assert.match(formSource, /setFieldLabel\(quantityField, isCash \? "现金金额" : "股数"\)/u);
});

test("mobile note tags keep transparent checkboxes from widening the page", async () => {
  const baseStyles = await readFile(resolve(projectRoot, "src/styles/00-base.css"), "utf8");
  const checkboxRule = baseStyles.match(/\.note-tag-options input\s*\{(?<body>[^}]+)\}/u);

  assert.ok(checkboxRule?.groups?.body, "expected a dedicated note tag checkbox rule");
  assert.match(checkboxRule.groups.body, /width:\s*1px/u);
  assert.match(checkboxRule.groups.body, /height:\s*1px/u);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
