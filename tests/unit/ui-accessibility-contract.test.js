import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(new URL("../..", import.meta.url).pathname);

test("static MVP exposes one primary heading, skip navigation and accessible top-level tabs", async () => {
  const source = await readFile(resolve(projectRoot, "index.html"), "utf8");

  assert.match(source, /<a class="skip-link" href="#main-content">/u);
  assert.equal((source.match(/<h1\b/gu) || []).length, 1);
  assert.match(source, /<main[^>]+id="main-content"/u);

  for (const name of ["home", "assets", "analysis", "notes"]) {
    assert.match(source, new RegExp(`id="${name}-tab"[^>]+role="tab"[^>]+aria-controls="${name}-panel"`, "u"));
    assert.match(source, new RegExp(`id="${name}-panel"[^>]+role="tabpanel"[^>]+aria-labelledby="${name}-tab"`, "u"));
  }
});

test("unimplemented global controls are not presented as available actions", async () => {
  const source = await readFile(resolve(projectRoot, "index.html"), "utf8");

  assert.equal(source.includes('id="global-search"'), false);
  assert.equal(source.includes("notes-sort-control"), false);
  assert.equal(source.includes(">新增记录<"), false);
});

test("trend chart includes a screen-reader summary and tabular alternative", async () => {
  const source = await readFile(resolve(projectRoot, "src/features/trends/trendRender.js"), "utf8");

  assert.match(source, /aria-describedby="trend-chart-accessible-summary"/u);
  assert.match(source, /查看趋势数据表/u);
  assert.match(source, /<caption>当前筛选范围内的总资产趋势明细<\/caption>/u);
  assert.match(source, /`\$\{periodLabel\}最高`/u);
  assert.match(source, /`\$\{periodLabel\}最低`/u);
  assert.match(source, /`\$\{periodLabel\}资产变化`/u);
  assert.match(source, /未扣除投入\/提现/u);
  assert.equal(source.includes('label: "今年最高"'), false);
  assert.equal(source.includes('label: "今年最低"'), false);
});

test("overview and analysis expose one consistent reporting range vocabulary", async () => {
  const source = await readFile(resolve(projectRoot, "index.html"), "utf8");
  const overviewRanges = [...source.matchAll(/data-range-value="([^"]+)"[^>]*>([^<]+)<\/button>/gu)]
    .map(([, value, label]) => [value, label]);
  const analysisRanges = [...source.matchAll(/data-analysis-range-value="([^"]+)"[^>]*>([^<]+)<\/button>/gu)]
    .map(([, value, label]) => [value, label]);

  assert.deepEqual(overviewRanges, [
    ["1", "近1月"],
    ["3", "近3月"],
    ["ytd", "今年"],
    ["all", "记录至今"],
    ["custom", "自定义"]
  ]);
  assert.deepEqual(analysisRanges, overviewRanges);
  assert.equal(source.includes('data-range-value="day"'), false);
  assert.equal(source.includes('data-analysis-range-value="6"'), false);
});

test("analysis keeps benchmark comparison and its trend chart permanently visible", async () => {
  const [indexSource, analysisRenderSource] = await Promise.all([
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    readFile(resolve(projectRoot, "src/features/analysis/analysisRender.js"), "utf8")
  ]);

  assert.equal(indexSource.includes('class="home-section benchmark-section"'), false);
  assert.match(indexSource, /<section class="analysis-card analysis-card-wide"[^>]+aria-labelledby="analysis-benchmark-title"/u);
  assert.equal(indexSource.includes("<summary><span>收益表现对比</span>"), false);
  assert.match(indexSource, /id="analysis-benchmark-selector"/u);
  assert.match(indexSource, /id="analysis-benchmark-trend-chart"/u);
  assert.match(analysisRenderSource, /renderAnalysisBenchmarkTrendChart\(analysis\);/u);
});

test("analysis filters by account and market without exposing an individual asset selector", async () => {
  const source = await readFile(resolve(projectRoot, "index.html"), "utf8");

  assert.match(source, /<select id="analysis-account-filter"><\/select>/u);
  assert.match(source, /<select id="analysis-market-filter"><\/select>/u);
  assert.equal(source.includes('id="analysis-asset-filter"'), false);
});

test("analysis keeps concentration and return contribution as adjacent multi-asset cards", async () => {
  const source = await readFile(resolve(projectRoot, "index.html"), "utf8");
  const concentrationIndex = source.indexOf('id="analysis-concentration-title"');
  const contributionIndex = source.indexOf('id="analysis-contribution-title"');
  const attributionIndex = source.indexOf("<summary><span>资产变动归因</span>");

  assert.notEqual(concentrationIndex, -1);
  assert.notEqual(contributionIndex, -1);
  assert.ok(concentrationIndex < contributionIndex);
  assert.ok(contributionIndex < attributionIndex);
  assert.equal(source.includes("<summary><span>资产贡献排行</span>"), false);
  assert.match(source, /data-analysis-requires-multiple-assets[^>]+aria-labelledby="analysis-contribution-title"/u);
  assert.match(source, /id="analysis-single-asset-notice-section"/u);
});

test("analysis hides change attribution for the seed release and opens risk details by default", async () => {
  const [indexSource, analysisUiSource] = await Promise.all([
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    readFile(resolve(projectRoot, "src/features/analysis/analysisUi.js"), "utf8")
  ]);

  assert.match(indexSource, /<details class="analysis-card analysis-card-wide analysis-disclosure is-hidden" id="analysis-attribution-section" hidden>/u);
  assert.match(indexSource, /<details class="analysis-card analysis-disclosure" data-analysis-requires-assets open>/u);
  assert.match(indexSource, /class="analysis-detail-metrics" id="analysis-concentration-metrics"/u);
  assert.match(indexSource, /class="analysis-detail-metrics" id="analysis-risk-metrics"/u);
  assert.match(analysisUiSource, /class="attribution-equation" role="img" aria-label=/u);
});

test("mobile interaction rules preserve 44px touch targets", async () => {
  const [spacingSource, analysisSource] = await Promise.all([
    readFile(resolve(projectRoot, "src/styles/210-spacing-breathing.css"), "utf8"),
    readFile(resolve(projectRoot, "src/styles/180-analysis-alert.css"), "utf8")
  ]);

  assert.match(spacingSource, /@media \(max-width: 1023px\)[\s\S]*?\.primary-button,[\s\S]*?min-height: 44px;/u);
  assert.match(spacingSource, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u);
  assert.match(analysisSource, /@media \(max-width: 1279px\)[\s\S]*?#analysis-panel \.analysis-focus-grid > \.analysis-card \{\s*grid-column: 1 \/ -1;/u);
});

test("responsive shell centers wide content and switches navigation at the canonical tablet boundary", async () => {
  const spacingSource = await readFile(resolve(projectRoot, "src/styles/210-spacing-breathing.css"), "utf8");

  assert.match(spacingSource, /@media \(min-width: 1024px\)[\s\S]*?width: min\(1360px, calc\(100% - var\(--sidebar-current-width\) - 48px\)\);/u);
  assert.match(spacingSource, /margin-left: calc\(var\(--sidebar-current-width\) \+ max\(24px, calc\(\(100% - var\(--sidebar-current-width\) - 1360px\) \/ 2\)\)\);/u);
  assert.match(spacingSource, /@media \(max-width: 1023px\)[\s\S]*?--sidebar-current-width: 0px;[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/u);
});

test("asset rows and the edit form expose accessible delete actions without overlapping search results", async () => {
  const [indexSource, renderSource, formSource, eventsSource, elementsSource, baseStyles] = await Promise.all([
    readFile(resolve(projectRoot, "index.html"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetRender.js"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetForm.js"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetEvents.js"), "utf8"),
    readFile(resolve(projectRoot, "src/features/assets/assetElements.js"), "utf8"),
    readFile(resolve(projectRoot, "src/styles/00-base.css"), "utf8")
  ]);

  assert.match(renderSource, /<summary aria-label="更多资产操作"[^>]*>⋯<\/summary>/u);
  assert.match(renderSource, /class="row-action-link" data-edit-asset-id=.*type="button">编辑<\/button>/u);
  assert.match(renderSource, /data-delete-asset-id=.*type="button">删除资产<\/button>/u);
  assert.match(indexSource, /id="delete-editing-asset" type="button">删除资产<\/button>/u);
  assert.match(elementsSource, /assetDeleteButton: document\.querySelector\("#delete-editing-asset"\)/u);
  assert.match(eventsSource, /assetDeleteButton\?\.addEventListener\("click"[\s\S]*?deleteAsset\(editingId\)/u);
  assert.match(formSource, /assetDeleteButton\.classList\.toggle\("is-hidden", mode !== "edit"\)/u);
  assert.match(formSource, /assetDeleteButton\.disabled = mode !== "edit"/u);
  assert.match(baseStyles, /\.asset-name-field\s*\{\s*grid-column: span 2;/u);
  assert.match(baseStyles, /\.asset-match-panel\s*\{[\s\S]*?position: static;/u);
});
