import { todayIsoDate } from "../utils/date.js";

const staleAfterDays = 7;

export const priceStatusOrder = ["synced", "manual", "pending", "stale", "missing", "error"];

export function resolvePriceStatus(asset = {}, options = {}) {
  const explicit = String(asset.priceStatus || "").trim().toLowerCase();
  const currentPrice = String(asset.currentPrice || "").trim();
  const costPrice = String(asset.costPrice || "").trim();
  const pricedAt = String(asset.pricedAt || "").trim();
  const priceSource = String(asset.priceSource || "").trim();

  if (explicit === "error") return status("error", "同步失败", "data-error", true);
  if (explicit === "missing") return status("missing", "缺少缓存", "data-warning", true);
  if (explicit === "pending") return status("pending", costPrice && costPrice !== "0" ? "按成本价暂估" : "待补价格", "data-warning", true);
  if (!currentPrice || currentPrice === "0") return status("missing", "缺当前价格", "data-warning", true);
  if (!pricedAt || !priceSource) return status("missing", "价格待核对", "data-warning", true);
  if (isStalePrice(pricedAt, options.today)) return status("stale", "价格过期", "data-warning", true);
  if (explicit === "synced") return status("synced", "同步价格", "data-ok", false);
  if (explicit === "manual" || currentPrice === costPrice) return status("manual", "手动价格", "", false);
  return status("manual", "手动价格", "", false);
}

export function priceUsesCostFallback(asset = {}) {
  const resolved = resolvePriceStatus(asset);
  return resolved.key === "pending" || (
    String(asset.currentPrice || "").trim() &&
    String(asset.currentPrice || "").trim() === String(asset.costPrice || "").trim() &&
    !String(asset.pricedAt || "").trim()
  );
}

export function isStalePrice(pricedAt, today = todayIsoDate()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pricedAt || ""))) return false;
  const pricedTime = Date.parse(`${pricedAt}T00:00:00.000Z`);
  const todayTime = Date.parse(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(pricedTime) || !Number.isFinite(todayTime)) return false;
  return todayTime - pricedTime > staleAfterDays * 24 * 60 * 60 * 1000;
}

function status(key, label, className, needsReview) {
  return { key, label, className, needsReview };
}
