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

test("analysis keeps concentration and return contribution as adjacent persistent cards", async () => {
  const source = await readFile(resolve(projectRoot, "index.html"), "utf8");
  const concentrationIndex = source.indexOf('id="analysis-concentration-title"');
  const contributionIndex = source.indexOf('id="analysis-contribution-title"');
  const attributionIndex = source.indexOf("<summary><span>资产变动归因</span>");

  assert.notEqual(concentrationIndex, -1);
  assert.notEqual(contributionIndex, -1);
  assert.ok(concentrationIndex < contributionIndex);
  assert.ok(contributionIndex < attributionIndex);
  assert.equal(source.includes("<summary><span>资产贡献排行</span>"), false);
  assert.match(source, /<section class="analysis-card"[^>]+aria-labelledby="analysis-contribution-title"/u);
});

test("mobile interaction rules preserve 44px touch targets", async () => {
  const source = await readFile(resolve(projectRoot, "src/styles/210-spacing-breathing.css"), "utf8");

  assert.match(source, /@media \(max-width: 900px\)[\s\S]*?\.primary-button,[\s\S]*?min-height: 44px;/u);
  assert.match(source, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u);
});
