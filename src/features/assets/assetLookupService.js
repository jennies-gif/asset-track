import { marketHistoryWindowDays } from "../../domain/marketHistoryCoverage.js";
import { selectPurchasePriceAtOrBefore } from "../../domain/purchasePrice.js";
import { todayIsoDate } from "../../utils/date.js";

export async function searchPublicInstruments(apiBaseUrl, query) {
  const response = await fetch(`${apiBaseUrl}/api/instruments/search?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`资产库查询返回 ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload?.instruments) ? payload.instruments : [];
}

export async function lookupPublicInstrument(apiBaseUrl, query) {
  const response = await fetch(`${apiBaseUrl}/api/instruments/lookup?query=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json();
}

export async function lookupPurchasePrice({
  apiBaseUrl,
  symbol,
  purchaseDate,
  currentDate = todayIsoDate()
}) {
  const response = await fetch(`${apiBaseUrl}/api/market-data/sync-daily`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbols: [symbol],
      days: marketHistoryWindowDays(purchaseDate, currentDate),
      includeHistory: true,
      includeBenchmarks: false,
      trigger: "asset_created"
    })
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  const result = (payload.results || []).find((item) =>
    canonicalSymbol(item?.symbol) === canonicalSymbol(symbol)
  );
  return {
    purchasePrice: selectPurchasePriceAtOrBefore(result?.history || [], purchaseDate),
    result,
    fetch: payload.fetch || null
  };
}

async function readApiError(response) {
  try {
    const payload = await response.clone().json();
    return payload?.message || payload?.code || `行情 API 返回 ${response.status}`;
  } catch {
    return `行情 API 返回 ${response.status}`;
  }
}

function canonicalSymbol(value) {
  return String(value || "").trim().toUpperCase();
}
