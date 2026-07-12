const listedFundSymbolPattern = /^(?:5\d{5}|1[568]\d{4})$/u;

export function isCnExchangeListedFundSymbol(symbol, name = "") {
  const normalized = String(symbol || "").trim().toUpperCase().replace(/\.OF$/u, "");
  const normalizedName = String(name || "").trim();
  return listedFundSymbolPattern.test(normalized) && /ETF|LOF/iu.test(normalizedName) && !/联接/iu.test(normalizedName);
}

export function normalizeCnListedFundInstrument(instrument) {
  const market = String(instrument?.market || "").trim().toUpperCase();
  const originalSymbol = String(instrument?.symbol || "").trim().toUpperCase();
  const name = String(instrument?.name || "").trim();
  if (market !== "CN" || !originalSymbol.endsWith(".OF") || !isCnExchangeListedFundSymbol(originalSymbol, name)) {
    return instrument;
  }

  const symbol = originalSymbol.replace(/\.OF$/u, "");
  const isEtf = /ETF/iu.test(name);
  return {
    ...instrument,
    id: undefined,
    symbol,
    exchange: symbol.startsWith("5") ? "SSE" : "SZSE",
    type: isEtf ? "ETF" : "基金",
    universe: isEtf ? "etf" : "listed-fund",
    aliases: [...new Set([...(instrument.aliases || []), originalSymbol, symbol])],
    dataSource: instrument.dataSource || instrument.source || "",
    source: instrument.source || instrument.dataSource || ""
  };
}

export function removeOtcDuplicatesOfListedCnInstruments(rows) {
  const listedSymbols = new Set((rows || [])
    .filter((row) => row.market === "CN" && row.exchange !== "OTC" && !String(row.symbol || "").endsWith(".OF"))
    .map((row) => String(row.symbol || "").toUpperCase()));
  return (rows || []).filter((row) => !(
    row.market === "CN" &&
    String(row.symbol || "").endsWith(".OF") &&
    listedSymbols.has(String(row.symbol).toUpperCase().replace(/\.OF$/u, ""))
  ));
}
