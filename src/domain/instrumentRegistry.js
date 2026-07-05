import { instrumentRegistry, instrumentRegistryGeneratedAt, instrumentRegistrySummary } from "./instrumentRegistry.generated.js";
import { aliasesForInstrument } from "./instrumentAliases.js";
import { securityWhitelist } from "./marketData.js";

export { instrumentRegistry, instrumentRegistryGeneratedAt, instrumentRegistrySummary };

export function activeInstrumentRegistry() {
  return instrumentRegistry.length ? instrumentRegistry : securityWhitelist.map(normalizeLegacyInstrument);
}

export function lookupInstrument(query, options = {}) {
  return searchInstruments(query, { ...options, limit: 1 })[0] || null;
}

export function searchInstruments(query, options = {}) {
  const normalized = normalizeInstrumentSearchText(query);
  if (!normalized) return [];
  const market = String(options.market || "").trim().toUpperCase();
  const type = String(options.type || "").trim();
  const limit = Number(options.limit || 8);
  return activeInstrumentRegistry()
    .filter((item) => !market || item.market === market)
    .filter((item) => !type || item.type === type)
    .map((item) => ({ item, score: scoreInstrumentMatch(item, normalized) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || marketPriority(left.item) - marketPriority(right.item) || compareInstrument(left.item, right.item))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 8)
    .map((result) => result.item);
}

export function instrumentMatchStatus(query) {
  const normalized = normalizeInstrumentSearchText(query);
  if (!normalized) return { status: "empty", matches: [] };
  const matches = searchInstruments(query, { limit: 6 });
  if (!matches.length) return { status: "uncovered", matches: [] };
  const exact = matches.find((item) =>
    normalizeInstrumentSearchText(item.symbol) === normalized ||
    normalizeInstrumentSearchText(item.name) === normalized ||
    (item.aliases || []).some((alias) => normalizeInstrumentSearchText(alias) === normalized)
  );
  if (exact) return { status: "matched", matches: [exact, ...matches.filter((item) => item.id !== exact.id)] };
  return { status: matches.length === 1 ? "possible" : "multiple", matches };
}

export function normalizeInstrumentSearchText(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/gu, "");
}

function scoreInstrumentMatch(item, normalized) {
  const symbol = normalizeInstrumentSearchText(item.symbol);
  const name = normalizeInstrumentSearchText(item.name);
  const aliases = [...(item.aliases || []), ...aliasesForInstrument(item)].map(normalizeInstrumentSearchText);
  if (symbol && symbol === normalized) return 1000;
  if (name && name === normalized) return 900;
  if (aliases.some((alias) => alias === normalized)) return 850;
  if (symbol && symbol.startsWith(normalized)) return 700 - Math.abs(symbol.length - normalized.length);
  if (normalized.length < 2) return 0;
  if (name && name.includes(normalized)) return 600 - Math.abs(name.length - normalized.length);
  const aliasScore = aliases.find((alias) => alias.includes(normalized));
  if (aliasScore) return 500 - Math.abs(aliasScore.length - normalized.length);
  return 0;
}

function normalizeLegacyInstrument(item) {
  return {
    id: [item.market, item.type, item.symbol].filter(Boolean).join(":"),
    name: item.name,
    symbol: item.symbol,
    market: item.market,
    exchange: item.exchange || "",
    type: item.type,
    currency: item.currency,
    aliases: [item.symbol, item.name, ...aliasesForInstrument(item)].filter(Boolean),
    status: "active",
    universe: item.universe || "",
    marketDataSupported: true,
    dataSource: item.source || "Asset Trail core whitelist",
    sourceUpdatedAt: "",
    updatedAt: ""
  };
}

function compareInstrument(left, right) {
  return `${left.market}:${left.symbol}:${left.name}`.localeCompare(`${right.market}:${right.symbol}:${right.name}`, "zh-CN");
}

function marketPriority(item) {
  return {
    CN: 1,
    HK: 2,
    WEB3: 3,
    METAL: 4,
    US: 5,
    CASH: 6,
    OTHER: 7
  }[item.market] || 9;
}
