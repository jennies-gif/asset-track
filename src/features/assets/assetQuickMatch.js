import { activeInstrumentRegistry, lookupInstrument, normalizeInstrumentSearchText, searchInstruments } from "../../domain/instrumentRegistry.js";

export const manualAssetMatches = [
  { symbol: "CASH-CNY", name: "现金备用金", type: "现金", currency: "CNY", market: "CASH", aliases: ["现金", "CASH", "备用金"] },
  { symbol: "CASH-USD", name: "美元现金", type: "现金", currency: "USD", market: "CASH", aliases: ["美元现金", "USD现金"] },
  { symbol: "CASH-HKD", name: "港币现金", type: "现金", currency: "HKD", market: "CASH", aliases: ["港币现金", "HKD现金"] },
  { symbol: "XAU", name: "现货黄金", type: "贵金属", currency: "USD", market: "OTHER", aliases: ["黄金", "现货黄金", "纸黄金", "积存金", "XAU", "XAUUSD"] },
  { symbol: "", name: "实物金条", type: "实物资产", currency: "CNY", market: "OTHER", aliases: ["金条", "金币", "实物黄金", "投资金条"] }
];

export function findAssetQuickMatch(query) {
  const normalized = normalizeQuickMatchText(query);
  if (!normalized) return null;
  const symbolMatch = lookupInstrument(query);
  if (symbolMatch) return symbolMatch;
  const manualMatch = manualAssetMatches.find((item) => {
    const fields = [item.symbol, item.name, ...(item.aliases || [])].map(normalizeQuickMatchText);
    return fields.some((field) => field && (field === normalized || field.includes(normalized) || normalized.includes(field)));
  });
  if (manualMatch) return manualMatch;
  return searchInstruments(query, { limit: 1 })[0] || null;
}

export function findAssetQuickMatches(query, limit = 5) {
  const normalized = normalizeQuickMatchText(query);
  if (!normalized) return [];
  const registryMatches = searchInstruments(query, { limit });
  const manualMatches = manualAssetMatches.filter((item) => {
    const fields = [item.symbol, item.name, ...(item.aliases || [])].map(normalizeQuickMatchText);
    return fields.some((field) => field && (field === normalized || field.includes(normalized) || normalized.includes(field)));
  });
  const merged = [...manualMatches, ...registryMatches];
  const seen = new Set();
  return merged.filter((item) => {
    const key = `${item.market || ""}:${item.symbol || ""}:${item.name || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export function assetQuickMatchOptions() {
  return [...activeInstrumentRegistry().slice(0, 300), ...manualAssetMatches];
}

export function normalizeQuickMatchText(value) {
  return normalizeInstrumentSearchText(value);
}

export function isManualCashMatch(match) {
  return match.type === "现金" && !match.symbol;
}
