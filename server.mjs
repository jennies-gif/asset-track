import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolvePath(url) {
  const pathname = new URL(url, `http://localhost:${port}`).pathname;
  const cleanPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  return join(root, cleanPath === "/" ? "index.html" : cleanPath);
}

createServer(async (request, response) => {
  try {
    const filePath = resolvePath(request.url);
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(body);
  } catch {
    const pathname = new URL(request.url || "/", `http://localhost:${port}`).pathname;
    if (pathname === "/public/runtime-config.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end('window.ASSET_TRAIL_CONFIG = { marketApiBaseUrl: "", supabase: { url: "", anonKey: "" } };\n');
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Asset Trail running at http://${displayHost}:${port}`);
  if (host === "0.0.0.0") {
    console.log(`Listening on all network interfaces. Use a firewall or SSH tunnel for access control.`);
  }
});
