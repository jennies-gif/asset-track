const hostport = String(process.env.MARKET_API_HOSTPORT || "").trim();
const configuredBaseUrl = String(process.env.MARKET_API_BASE_URL || "").trim();
const secret = String(process.env.MARKET_CRON_SECRET || "");
const baseUrl = configuredBaseUrl || (hostport ? `http://${hostport}` : "");

if (!baseUrl) throw new Error("MARKET_API_HOSTPORT or MARKET_API_BASE_URL is required");
if (!secret) throw new Error("MARKET_CRON_SECRET is required");

const response = await fetch(new URL("/api/market-data/scheduled-sync", baseUrl), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Market-Cron-Secret": secret
  },
  body: "{}",
  signal: AbortSignal.timeout(10 * 60 * 1000)
});

const payload = await readPayload(response);
if (!response.ok) {
  throw new Error(payload?.message || payload?.code || `Scheduled market sync returned ${response.status}`);
}

console.log(JSON.stringify({
  trigger: payload.trigger,
  syncedAt: payload.syncedAt,
  summary: payload.summary
}));

async function readPayload(result) {
  try {
    return await result.json();
  } catch {
    return null;
  }
}
