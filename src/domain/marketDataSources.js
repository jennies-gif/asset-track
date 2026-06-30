export const preciousMetalInstruments = [
  { symbol: "XAU", name: "黄金", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD", metalKey: "gold" },
  { symbol: "XAG", name: "白银", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD", metalKey: "silver" },
  { symbol: "XPT", name: "铂金", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD", metalKey: "platinum" },
  { symbol: "XPD", name: "钯金", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD", metalKey: "palladium" }
];

export const cryptoInstruments = [
  { symbol: "BTC", name: "Bitcoin", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD", coinGeckoId: "bitcoin", binanceSymbol: "BTCUSDT" },
  { symbol: "ETH", name: "Ethereum", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD", coinGeckoId: "ethereum", binanceSymbol: "ETHUSDT" },
  { symbol: "SOL", name: "Solana", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD", coinGeckoId: "solana", binanceSymbol: "SOLUSDT" },
  { symbol: "BNB", name: "BNB", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD", coinGeckoId: "binancecoin", binanceSymbol: "BNBUSDT" },
  { symbol: "USDT", name: "Tether", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD", coinGeckoId: "tether", binanceSymbol: "" },
  { symbol: "USDC", name: "USD Coin", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD", coinGeckoId: "usd-coin", binanceSymbol: "USDCUSDT" }
];

export const defaultFxPairs = [
  { baseCurrency: "USD", quoteCurrency: "CNY" },
  { baseCurrency: "HKD", quoteCurrency: "CNY" },
  { baseCurrency: "USD", quoteCurrency: "HKD" },
  { baseCurrency: "EUR", quoteCurrency: "CNY" }
];

export function normalizeMetalsDevLatest(payload, instruments, options = {}) {
  const fetchedAt = options.sourceFetchedAt || new Date().toISOString();
  const tradeDate = normalizeSnapshotDate(options.tradeDate || payload?.timestamp || fetchedAt);
  return instruments
    .map((instrument) => {
      const closePrice = pickNestedNumber(payload, [
        ["metals", instrument.metalKey],
        ["metals", instrument.symbol.toLowerCase()],
        ["rates", instrument.metalKey],
        ["rates", instrument.symbol.toLowerCase()],
        [instrument.metalKey],
        [instrument.symbol.toLowerCase()]
      ]);
      return priceSnapshotRow({
        instrument,
        tradeDate,
        closePrice,
        source: "Metals.Dev latest",
        sourceFetchedAt: fetchedAt
      });
    })
    .filter(Boolean);
}

export function normalizeCoinGeckoSimplePrice(payload, instruments, options = {}) {
  const fetchedAt = options.sourceFetchedAt || new Date().toISOString();
  const tradeDate = normalizeSnapshotDate(options.tradeDate || fetchedAt);
  const vsCurrency = String(options.vsCurrency || "usd").toLowerCase();
  return instruments
    .map((instrument) => {
      const bucket = payload?.[instrument.coinGeckoId] || {};
      const lastUpdated = bucket.last_updated_at
        ? new Date(Number(bucket.last_updated_at) * 1000).toISOString()
        : fetchedAt;
      return priceSnapshotRow({
        instrument,
        tradeDate,
        closePrice: bucket[vsCurrency],
        source: "CoinGecko simple price",
        sourceFetchedAt: lastUpdated
      });
    })
    .filter(Boolean);
}

export function normalizeBinanceKlines(payload, instrument, options = {}) {
  const fetchedAt = options.sourceFetchedAt || new Date().toISOString();
  return (Array.isArray(payload) ? payload : [])
    .map((row) => {
      const openTime = Number(row?.[0]);
      const closePrice = row?.[4];
      return priceSnapshotRow({
        instrument,
        tradeDate: normalizeSnapshotDate(Number.isFinite(openTime) ? new Date(openTime).toISOString() : fetchedAt),
        closePrice,
        source: "Binance daily kline public API",
        sourceFetchedAt: fetchedAt
      });
    })
    .filter(Boolean);
}

export function normalizeBinanceTickerPrice(payload, instrument, options = {}) {
  const fetchedAt = options.sourceFetchedAt || new Date().toISOString();
  const tradeDate = normalizeSnapshotDate(options.tradeDate || fetchedAt);
  return [
    priceSnapshotRow({
      instrument,
      tradeDate,
      closePrice: payload?.price,
      source: "Binance ticker price public API",
      sourceFetchedAt: fetchedAt
    })
  ].filter(Boolean);
}

export function normalizeGoldApiPrice(payload, instrument, options = {}) {
  const fetchedAt = options.sourceFetchedAt || new Date().toISOString();
  const tradeDate = normalizeSnapshotDate(options.tradeDate || payload?.timestamp || fetchedAt);
  const closePrice = payload?.price || payload?.ask || payload?.bid;
  return [
    priceSnapshotRow({
      instrument,
      tradeDate,
      closePrice,
      source: "Gold API metals price",
      sourceFetchedAt: fetchedAt
    })
  ].filter(Boolean);
}

export function normalizeFrankfurterLatest(payload, pairs, options = {}) {
  const fetchedAt = options.sourceFetchedAt || new Date().toISOString();
  const rateDate = normalizeSnapshotDate(payload?.date || fetchedAt);
  const baseCurrency = String(payload?.base || "").toUpperCase();
  const rates = payload?.rates || {};
  return pairs
    .filter((pair) => pair.baseCurrency === baseCurrency)
    .map((pair) => {
      const rate = rates[pair.quoteCurrency];
      if (!isPositiveNumber(rate)) return null;
      return {
        baseCurrency: pair.baseCurrency,
        quoteCurrency: pair.quoteCurrency,
        rateDate,
        rate: decimalString(rate),
        source: "Frankfurter reference rate",
        sourceFetchedAt: fetchedAt,
        qualityStatus: "ok"
      };
    })
    .filter(Boolean);
}

export function groupFxPairsByBase(pairs) {
  const grouped = new Map();
  for (const pair of pairs) {
    const base = String(pair.baseCurrency || "").toUpperCase();
    const quote = String(pair.quoteCurrency || "").toUpperCase();
    if (!base || !quote || base === quote) continue;
    const current = grouped.get(base) || [];
    current.push({ baseCurrency: base, quoteCurrency: quote });
    grouped.set(base, current);
  }
  return grouped;
}

function priceSnapshotRow({ instrument, tradeDate, closePrice, source, sourceFetchedAt }) {
  if (!isPositiveNumber(closePrice)) return null;
  return {
    instrumentSymbol: instrument.symbol,
    instrumentName: instrument.name,
    market: instrument.market,
    currency: instrument.currency,
    tradeDate,
    closePrice: decimalString(closePrice),
    adjustedClosePrice: decimalString(closePrice),
    source,
    sourceFetchedAt,
    qualityStatus: "ok"
  };
}

function pickNestedNumber(payload, paths) {
  for (const path of paths) {
    let value = payload;
    for (const segment of path) value = value?.[segment];
    if (isPositiveNumber(value)) return value;
  }
  return null;
}

function isPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function decimalString(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return String(value);
}

function normalizeSnapshotDate(value) {
  const raw = String(value || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}
