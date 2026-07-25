import { priceUsesCostFallback, resolvePriceStatus } from "../../domain/priceStatus.js";

export function buildAssetValuationNotices(asset) {
  if (String(asset?.type || "").trim() === "现金") return [];
  const priceStatus = resolvePriceStatus(asset);
  const hasCurrentPrice = hasPositiveValue(asset.currentPrice);
  const dateLabel = String(asset.pricedAt || "").trim();

  if (priceStatus.key === "pending" || priceUsesCostFallback(asset)) {
    return [notice({
      key: "price-estimated",
      severity: "warning",
      label: "按成本价暂估",
      detail: "尚未获得当前价格，当前市值暂按买入价格估算。",
      action: "补充当前价格或重新同步。",
      affectsAnalysis: true
    })];
  }
  if (priceStatus.key === "error") {
    return [notice({
      key: hasCurrentPrice ? "price-sync-error-cached" : "price-sync-error",
      severity: hasCurrentPrice ? "warning" : "danger",
      label: hasCurrentPrice ? "同步失败，使用旧价格" : "同步失败且无可用价格",
      detail: hasCurrentPrice
        ? `当前仍使用${dateLabel ? ` ${dateLabel} 的` : "上一次"}有效价格。`
        : "当前市值缺少可用价格，结果可能不准确。",
      action: "重新同步；仍失败时可手动填写当前价格。",
      affectsAnalysis: !hasCurrentPrice
    })];
  }
  if (priceStatus.key === "missing") {
    return [notice({
      key: hasCurrentPrice ? "price-cache-missing" : "price-missing",
      severity: hasCurrentPrice ? "warning" : "danger",
      label: hasCurrentPrice ? "未获取新价格，使用旧价格" : "缺少当前价格",
      detail: hasCurrentPrice
        ? `当前仍使用${dateLabel ? ` ${dateLabel} 的` : "已有"}价格。`
        : "当前市值缺少可用价格，结果可能不准确。",
      action: "重新同步；仍无法获取时可手动填写当前价格。",
      affectsAnalysis: !hasCurrentPrice
    })];
  }
  if (priceStatus.key === "stale") {
    return [notice({
      key: "price-stale",
      severity: "warning",
      label: "价格较旧",
      detail: `当前使用${dateLabel ? ` ${dateLabel} 的` : "较早的"}价格。`,
      action: "检查价格更新，或手动确认当前价格。",
      affectsAnalysis: false
    })];
  }
  return [];
}

export function buildAssetAnalysisLimitations(asset) {
  if (String(asset?.type || "").trim() === "现金") return [];
  const limitations = buildAssetValuationNotices(asset).filter((item) => item.affectsAnalysis);
  if (!hasPositiveValue(asset.costPrice)) {
    limitations.push(notice({
      key: "missing-cost-basis",
      scope: "analysis",
      severity: "warning",
      label: "缺少成本价",
      detail: "当前市值仍可查看，但收益和归因暂无法计算。",
      action: "补充平均成本价或总成本。"
    }));
  }
  if (!asset.purchaseDate) {
    limitations.push(notice({
      key: "missing-purchase-date",
      scope: "analysis",
      severity: "warning",
      label: "缺少首次持有日期",
      detail: "不影响当前市值，但会影响持有天数、趋势起点和复盘时间线。",
      action: "补充首次持有日期。"
    }));
  }
  if (!hasPositiveValue(asset.previousPrice)) {
    limitations.push(notice({
      key: "missing-previous-price",
      scope: "analysis",
      severity: "warning",
      label: "缺少期初价格",
      detail: "不影响当前市值，但区间变化和归因可能不完整。",
      action: "补充区间起点价格或等待历史行情回补。"
    }));
  }
  return uniqueNotices(limitations);
}

export function buildAssetDataIssues(asset) {
  return uniqueNotices([
    ...buildAssetValuationNotices(asset),
    ...buildAssetAnalysisLimitations(asset)
  ]);
}

function notice({
  key,
  scope = "valuation",
  severity,
  label,
  detail,
  action,
  affectsAnalysis = scope === "analysis"
}) {
  return { key, scope, severity, label, detail, action, affectsAnalysis };
}

function uniqueNotices(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

function hasPositiveValue(value) {
  return Number(String(value || "0").trim()) > 0;
}
