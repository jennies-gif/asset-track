import { lookupSecurity, securityWhitelist } from "../../domain/marketData.js";

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
  const symbolMatch = lookupSecurity(query);
  if (symbolMatch) return symbolMatch;
  const manualMatch = manualAssetMatches.find((item) => {
    const fields = [item.symbol, item.name, ...(item.aliases || [])].map(normalizeQuickMatchText);
    return fields.some((field) => field && (field === normalized || field.includes(normalized) || normalized.includes(field)));
  });
  if (manualMatch) return manualMatch;
  return securityWhitelist.find((item) => {
    const name = normalizeQuickMatchText(item.name);
    const symbol = normalizeQuickMatchText(item.symbol);
    return name.includes(normalized) || symbol.includes(normalized);
  }) || null;
}

export function normalizeQuickMatchText(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isManualCashMatch(match) {
  return match.type === "现金" && !match.symbol;
}
