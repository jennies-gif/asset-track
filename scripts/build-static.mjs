import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "dist-static");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await Promise.all([
  cp(join(root, "index.html"), join(outDir, "index.html")),
  cp(join(root, "src"), join(outDir, "src"), { recursive: true }),
  cp(join(root, "public"), join(outDir, "public"), { recursive: true })
]);

const runtimeConfig = {
  marketApiBaseUrl: process.env.MARKET_API_BASE_URL || "",
  supabase: {
    url: process.env.SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || ""
  }
};

await rm(join(outDir, "public", "runtime-config.example.js"), { force: true });

await writeFile(
  join(outDir, "public", "runtime-config.js"),
  `window.ASSET_TRAIL_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`
);

console.log("Static deployment files written to dist-static");
