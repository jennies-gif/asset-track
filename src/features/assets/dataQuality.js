import { resolvePriceStatus } from "../../domain/priceStatus.js";

export function buildAssetDataIssues(asset) {
  const issues = [];
  const priceStatus = resolvePriceStatus(asset);
  const usesMarketPrice = priceStatus.key !== "cash";
  if (usesMarketPrice && !hasPositiveValue(asset.costPrice)) {
    issues.push({ key: "missing-cost-basis", label: "缺成本", severity: "high", action: "补充平均成本价或总成本后，收益和归因才可完整计算。" });
  }
  if (!asset.purchaseDate) {
    issues.push({ key: "missing-purchase-date", label: "缺首次持有日期", severity: "medium", action: "补充首次持有日期后，持有天数、趋势起点和复盘时间线更准确。" });
  }
  if (usesMarketPrice && priceStatus.key === "pending") {
    issues.push({ key: "price-pending", label: "待获取价格", severity: "high", action: "在数据模块手动补录价格，或等待行情接入。" });
  }
  if (usesMarketPrice && priceStatus.key === "missing") {
    issues.push({ key: "price-missing", label: "缺可用价格", severity: "high", action: "同步行情缓存或手动补录当前价格。" });
  }
  if (usesMarketPrice && priceStatus.key === "stale") {
    issues.push({ key: "price-stale", label: "价格过期", severity: "medium", action: "同步最新价格，或确认该价格仍适合作为估值依据。" });
  }
  if (usesMarketPrice && priceStatus.key === "error") {
    issues.push({ key: "price-sync-error", label: "同步失败", severity: "high", action: "查看同步结果中的失败原因，修复后重试。" });
  }
  if (usesMarketPrice && !asset.pricedAt) {
    issues.push({ key: "missing-priced-at", label: "缺价格日期", severity: "medium", action: "补充价格/净值对应日期。" });
  }
  if (usesMarketPrice && !asset.priceSource) {
    issues.push({ key: "missing-price-source", label: "缺数据来源", severity: "medium", action: "标明用户录入、券商账单或行情来源。" });
  }
  if (usesMarketPrice && (!asset.previousPrice || asset.previousPrice === "0")) {
    issues.push({ key: "missing-previous-price", label: "缺期初价", severity: "medium", action: "补充区间起点价格，提高分析准确性。" });
  }
  return issues;
}

function hasPositiveValue(value) {
  return Number(String(value || "0").trim()) > 0;
}
