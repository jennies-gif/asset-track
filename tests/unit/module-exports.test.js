import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "../..");

test("app named imports match exported browser modules", async () => {
  const appPath = resolve(projectRoot, "src/app.js");
  const appSource = await readFile(appPath, "utf8");
  const imports = [...appSource.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+"(\.[^"]+)";/gu)];

  for (const [, importedBlock, specifier] of imports) {
    const modulePath = resolve(dirname(appPath), specifier);
    const moduleSource = await readFile(modulePath, "utf8");
    const exports = exportedNames(moduleSource);
    const importedNames = importedBlock
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/u)[0].trim())
      .filter(Boolean);

    for (const name of importedNames) {
      assert.ok(exports.has(name), `${specifier} does not export ${name}`);
    }
  }
});

function exportedNames(source) {
  const names = new Set();
  for (const [, name] of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gu)) names.add(name);
  for (const [, name] of source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)/gu)) names.add(name);
  for (const [, name] of source.matchAll(/export\s+let\s+([A-Za-z_$][\w$]*)/gu)) names.add(name);
  for (const [, name] of source.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/gu)) names.add(name);
  return names;
}
