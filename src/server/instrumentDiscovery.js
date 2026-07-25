export function inferPublicInstrumentCandidate(query, benchmarkInstruments = []) {
  const normalized = String(query || "").trim().toUpperCase();
  const benchmark = benchmarkInstruments.find((item) => String(item.symbol || "").trim().toUpperCase() === normalized);
  if (benchmark) return benchmark;
  if (/^\d{5}$/u.test(normalized)) {
    return { symbol: normalized, name: normalized, type: "股票", universe: "runtime-hk", market: "HK", currency: "HKD" };
  }
  if (/^\d{6}$/u.test(normalized)) {
    return {
      symbol: normalized,
      name: normalized,
      type: normalized.startsWith("5") ? "ETF" : normalized.startsWith("1") ? "基金" : "股票",
      universe: normalized.startsWith("1") ? "fund" : "runtime-cn",
      market: "CN",
      currency: "CNY"
    };
  }
  if (/^[A-Z]{1,5}$/u.test(normalized)) {
    return { symbol: normalized, name: normalized, type: "股票", universe: "runtime-us", market: "US", currency: "USD" };
  }
  return null;
}

export function isVerifiedInstrumentSyncResult(syncResult, symbol) {
  const normalized = String(symbol || "").trim().toUpperCase();
  return (syncResult?.results || []).some((item) =>
    String(item?.symbol || "").trim().toUpperCase() === normalized &&
    item.status === "synced" &&
    Number(item.after?.currentPrice) > 0
  );
}

export function exactPublicInstrumentMatch(matches = [], query = "") {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  return (Array.isArray(matches) ? matches : []).find((item) =>
    [item?.symbol, item?.name, ...(Array.isArray(item?.aliases) ? item.aliases : [])]
      .some((value) => normalizeQuery(value) === normalized)
  ) || null;
}

function normalizeQuery(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/gu, "");
}
