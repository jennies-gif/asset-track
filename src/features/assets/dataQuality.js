export function buildAssetDataIssues(asset) {
  const issues = [];
  if (asset.priceStatus === "pending") {
    issues.push({ key: "price-pending", label: "待获取价格", severity: "high", action: "在数据模块手动补录价格，或等待行情接入。" });
  }
  if (!asset.pricedAt) {
    issues.push({ key: "missing-priced-at", label: "缺价格日期", severity: "medium", action: "补充价格/净值对应日期。" });
  }
  if (!asset.priceSource) {
    issues.push({ key: "missing-price-source", label: "缺数据来源", severity: "medium", action: "标明用户录入、券商账单或行情来源。" });
  }
  if (!asset.previousPrice || asset.previousPrice === "0") {
    issues.push({ key: "missing-previous-price", label: "缺期初价", severity: "medium", action: "补充区间起点价格，提高分析准确性。" });
  }
  return issues;
}
