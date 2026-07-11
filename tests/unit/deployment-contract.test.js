import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");

test("Vercel deploys only the root static MVP entry", async () => {
  const [vercelConfig, packageJson, indexSource] = await Promise.all([
    readJson("vercel.json"),
    readJson("package.json"),
    readFile(resolve(projectRoot, "index.html"), "utf8")
  ]);

  assert.equal(vercelConfig.buildCommand, "npm run build:static");
  assert.equal(vercelConfig.outputDirectory, "dist-static");
  assert.equal(packageJson.scripts["build:static"], "node scripts/build-static.mjs");
  assert.equal(
    packageJson.scripts["verify:release"],
    "npm test && npm run typecheck && npm run build && npm run build:static"
  );
  assert.match(indexSource, /<script type="module" src="\/src\/app\.js"><\/script>/u);
});

async function readJson(file) {
  return JSON.parse(await readFile(resolve(projectRoot, file), "utf8"));
}
