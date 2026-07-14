import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const userFacingBoundaryFiles = [
  "index.html",
  "README.md",
  "docs/product/seed-user-trial.md",
  "src/features/analysis/analysisRender.js",
  "src/features/home/homeRender.js",
  "src/features/settings/settingsRender.js"
];

test("user-facing data-boundary copy distinguishes private local data from public market queries", async () => {
  const sources = await Promise.all(
    userFacingBoundaryFiles.map(async (file) => [file, await fs.readFile(path.resolve(file), "utf8")])
  );

  for (const [file, source] of sources) {
    assert.equal(source.includes("数据未上传"), false, `${file} must not make an absolute no-upload claim`);
    assert.equal(source.includes("不会主动上传"), false, `${file} must not make an ambiguous no-upload claim`);
    assert.equal(source.includes("Data not uploaded"), false, `${file} must not make an absolute English no-upload claim`);
    assert.equal(source.includes("does not actively upload"), false, `${file} must not make an ambiguous English no-upload claim`);
  }

  const combined = sources.map(([, source]) => source).join("\n");
  assert.match(combined, /私人资产明细|私人资产、交易、复盘和设置/u);
  assert.match(combined, /公共查询字段/u);
});
