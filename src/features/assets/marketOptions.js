export function inferAssetMarket(asset = {}) {
  const explicit = String(asset.market || "").toUpperCase();
  if (["CN", "HK", "US", "FUND", "WEB3", "METAL", "CASH", "OTHER"].includes(explicit)) return explicit;
  const symbol = String(asset.symbol || "").trim().toUpperCase();
  if (String(asset.type || "").includes("基金") || symbol.endsWith(".OF")) return "FUND";
  if (String(asset.type || "") === "现金") return "CASH";
  if (String(asset.type || "") === "数字资产" || asset.accountType === "crypto") return "WEB3";
  if (String(asset.type || "") === "贵金属") return "METAL";
  if (String(asset.type || "") === "实物资产") return "OTHER";
  if (/^\d{5}$/.test(symbol)) return "HK";
  if (/^\d{6}$/.test(symbol)) return "CN";
  if (/^[A-Z]{1,5}$/.test(symbol)) return "US";
  if (asset.currency === "HKD") return "HK";
  if (asset.currency === "USD") return "US";
  if (asset.currency === "CNY") return "CN";
  return "OTHER";
}

export function marketLabel(market) {
  return {
    CN: "A股",
    HK: "港股",
    US: "美股",
    FUND: "国内基金",
    WEB3: "Web3",
    METAL: "贵金属",
    CASH: "现金",
    OTHER: "其他",
    "手动": "手动"
  }[market] || market || "";
}
