import { calculateMoneyFromQuantity, roundDivide } from "../../domain/calculations.js";
import { demoTrendEndDate } from "../../constants/appConstants.js";
import { addDays, addMonths, normalizeSnapshotDate, todayIsoDate } from "../../utils/date.js";
import { normalizeSnapshots } from "../../state/normalizers.js";

let ctx = {};

export function configureTrendModel(context) {
  ctx = context;
}

export function annualizedReturnBps(returnBps) {
  const { elements } = ctx;
  const start = new Date(`${elements.trendStart.value || todayIsoDate()}T00:00:00.000Z`);
  const end = new Date(`${elements.trendEnd.value || todayIsoDate()}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((end - start) / 86400000));
  return roundDivide(BigInt(returnBps) * 365n, BigInt(days));
}

export function buildTrendPoints() {
  return buildTrendSeries().points;
}

export function buildTrendSeries() {
  const { start, end } = selectedTrendBounds();
  const dates = buildTrendDates(start, end);
  const assets = ctx.overviewAssets();
  if (assets.some((asset) => Number(asset.quantity) > 0)) {
    return {
      points: buildAssetTrendPoints(assets, dates),
      source: trendSourceForAssets(assets)
    };
  }
  const snapshots = normalizeSnapshots(ctx.getState().snapshots);
  return {
    points: buildSnapshotTrendPoints(dates),
    source: trendSourceForSnapshots(snapshots, assets)
  };
}

export function assetValueAtTrendDate(asset, date, index, end) {
  const start = assetTrendStartDate(asset);
  if (date < start) return 0n;

  const costValueCents = calculateMoneyFromQuantity(asset.quantity, asset.costPrice, asset.fxRate || "1");
  const progress = dateProgress(start, end, date);
  const targetBps = assetTrendReturnBps(asset);
  const returnBps = trendReturnAtProgress(targetBps, progress, index);
  return roundDivide(costValueCents * BigInt(10000 + returnBps), 10000n);
}

export function assetTrendStartDate(asset) {
  const explicitDate = normalizeSnapshotDate(asset.purchaseDate || asset.buyDate || asset.acquiredAt || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicitDate)) return explicitDate;

  const recordedDate = normalizeSnapshotDate(asset.updatedAt || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(recordedDate) ? recordedDate : todayIsoDate();
}

export function buildTrendDates(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((endDate - cursor) / 86400000));
  const stepDays = days <= 1 ? 1 : days <= 35 ? 1 : days <= 120 ? 7 : days <= 370 ? 14 : 30;
  while (cursor <= endDate) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }
  if (dates.at(-1) !== end) dates.push(end);
  return dates;
}

export function latestTrendDate(assets) {
  const updatedDates = assets
    .map((asset) => normalizeSnapshotDate(asset.updatedAt || ""))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const dates = [demoTrendEndDate, todayIsoDate(), ...updatedDates].sort();
  return dates.at(-1);
}

export function calculateMaxDrawdownBps(points) {
  if (points.length < 2) return null;
  let peak = points[0].valueCents;
  let maxDrawdown = 0n;
  points.forEach((point) => {
    if (point.valueCents > peak) peak = point.valueCents;
    if (peak <= 0n) return;
    const drawdown = roundDivide((point.valueCents - peak) * 10000n, peak);
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  });
  return maxDrawdown;
}

export function calculateTrendValueChange() {
  const points = buildTrendPoints();
  if (points.length < 2) return 0n;
  return points.at(-1).valueCents - points[0].valueCents;
}

export function calculateTrendValueChangeForRange(range) {
  const points = buildTrendPointsForRange(range);
  if (points.length < 2) return null;
  return points.at(-1).valueCents - points[0].valueCents;
}

export function calculateTrendReturnBps() {
  const points = buildTrendPoints();
  if (points.length < 2 || points[0].valueCents === 0n) return 0n;
  return roundDivide((points.at(-1).valueCents - points[0].valueCents) * 10000n, points[0].valueCents);
}

export function calculateTrendReturnBpsForRange(range) {
  const points = buildTrendPointsForRange(range);
  if (points.length < 2 || points[0].valueCents === 0n) return 0n;
  return roundDivide((points.at(-1).valueCents - points[0].valueCents) * 10000n, points[0].valueCents);
}

export function buildTrendPointsForRange(range) {
  return buildTrendSeriesForRange(range).points;
}

export function buildTrendSeriesForRange(range) {
  const end = latestTrendControlDate();
  let start = addMonths(end, -12);
  if (range === "day") start = addDays(end, -1);
  else if (range === "ytd") start = `${end.slice(0, 4)}-01-01`;
  else start = addMonths(end, -Number(range || 12));
  const dates = buildTrendDates(start, end);
  const assets = ctx.overviewAssets();
  if (assets.some((asset) => Number(asset.quantity) > 0)) {
    return {
      points: buildAssetTrendPoints(assets, dates),
      source: trendSourceForAssets(assets)
    };
  }
  const snapshots = normalizeSnapshots(ctx.getState().snapshots);
  return {
    points: buildSnapshotTrendPoints(dates),
    source: trendSourceForSnapshots(snapshots, assets)
  };
}

export function latestTrendControlDate() {
  const state = ctx.getState();
  const snapshots = normalizeSnapshots(state.snapshots);
  const openAssets = ctx.openAssets();
  const assetLatest = openAssets.length ? latestTrendDate(openAssets) : "";
  return assetLatest || snapshots.at(-1)?.date || todayIsoDate();
}

export function trendRangeLabel() {
  const { elements } = ctx;
  return {
    day: "一日变化",
    "1": "一月变化",
    "3": "近3月变化",
    ytd: "今年变化",
    "12": "一年变化",
    custom: "区间变化"
  }[elements.trendRange.value] || "一年变化";
}

export function buildReturnTrendPoints(points) {
  if (!points.length) return [];
  const base = points[0].valueCents;
  return points.map((point) => ({
    ...point,
    valueCents: base === 0n ? 0n : roundDivide((point.valueCents - base) * 10000n, base)
  }));
}

function selectedTrendBounds() {
  const state = ctx.getState();
  const { elements } = ctx;
  const snapshots = normalizeSnapshots(state.snapshots);
  const openAssets = ctx.openAssets();
  const assetLatest = openAssets.length ? latestTrendDate(openAssets) : "";
  const latest = elements.trendEnd.value || assetLatest || snapshots.at(-1)?.date || todayIsoDate();
  let start = elements.trendStart.value;
  if (!start) {
    if (elements.trendRange.value === "day") start = addDays(latest, -1);
    else if (elements.trendRange.value === "ytd") start = `${latest.slice(0, 4)}-01-01`;
    else {
      const months = Number(elements.trendRange.value);
      start = addMonths(latest, Number.isFinite(months) ? -months : -12);
    }
  }
  return { start, end: latest };
}

function buildSnapshotTrendPoints(dates) {
  const state = ctx.getState();
  const selectedAssets = ctx.overviewAssets();
  const total = ctx.currentOverviewTotalCents();
  const snapshots = normalizeSnapshots(state.snapshots);
  if (!selectedAssets.length) {
    return dates.map((date) => ({ date, valueCents: 0n }));
  }
  if (!snapshots.length) {
    return dates.map((date, index) => ({
      date,
      valueCents: index === dates.length - 1 ? total : 0n
    }));
  }

  const points = snapshots.map((snapshot) => ({
    date: normalizeSnapshotDate(snapshot.date),
    valueCents: ctx.convertUsdToDisplay(BigInt(snapshot.valueCents || "0"))
  }));
  points[points.length - 1] = { ...points[points.length - 1], valueCents: total };
  return dates.map((date) => {
    const matched = [...points].reverse().find((point) => point.date <= date);
    return { date, valueCents: matched?.valueCents || 0n };
  });
}

function buildAssetTrendPoints(assets, dates) {
  const activeAssets = assets.filter((asset) => Number(asset.quantity) > 0);
  if (!activeAssets.length) return [];

  const valuationDate = latestTrendDate(activeAssets);
  const points = dates.map((date) => {
    const valueCents = activeAssets.reduce((total, asset, index) => {
      return total + assetValueAtTrendDate(asset, date, index, valuationDate);
    }, 0n);
    return { date, valueCents: ctx.convertUsdToDisplay(valueCents) };
  });
  const currentTotal = ctx.currentOverviewTotalCents();
  return points.map((point) =>
    point.date >= valuationDate ? { ...point, valueCents: currentTotal } : point
  );
}

function trendSourceForAssets(assets) {
  const hasDemoAssets = assets.some((asset) => String(asset.id || "").startsWith("demo-") || String(asset.priceSource || "").includes("模拟"));
  const hasManualPrices = assets.some((asset) => String(asset.priceSource || "").includes("用户录入") || asset.priceStatus === "manual");
  return {
    type: hasDemoAssets ? "demo-estimated" : "estimated",
    label: hasDemoAssets ? "演示估算" : "估算趋势",
    tone: hasDemoAssets ? "warning" : "warning",
    description: hasDemoAssets
      ? "当前包含示例资产；曲线基于演示持仓、成本价、当前价和日期推导，不代表真实历史净值。"
      : `曲线基于${hasManualPrices ? "用户录入价格、" : ""}持仓成本、当前价格和日期推导中间点，不代表真实每日净值。补齐历史价格或估值快照后可生成真实曲线。`
  };
}

function trendSourceForSnapshots(snapshots, assets) {
  if (!assets.length) {
    return {
      type: "no-data",
      label: "暂无数据",
      tone: "",
      description: "添加资产或导入备份后，再生成趋势。"
    };
  }
  if (snapshots.length) {
    return {
      type: "snapshot",
      label: "价值快照",
      tone: "positive",
      description: "曲线基于本地保存的组合估值快照；快照由用户数据和当时估值计算生成。"
    };
  }
  return {
    type: "endpoint",
    label: "端点估算",
    tone: "warning",
    description: "当前缺少历史快照，仅能显示起止估值，不能代表真实历史波动。"
  };
}

function assetTrendReturnBps(asset) {
  if (asset.trendReturnBps !== undefined && asset.trendReturnBps !== "") {
    return clampMinimumReturnBps(Number(asset.trendReturnBps));
  }

  const costValueCents = calculateMoneyFromQuantity(asset.quantity, asset.costPrice, asset.fxRate || "1");
  const currentValueCents = calculateMoneyFromQuantity(asset.quantity, asset.currentPrice, asset.fxRate || "1");
  if (costValueCents === 0n) return 0;
  return clampMinimumReturnBps(Number(roundDivide((currentValueCents - costValueCents) * 10000n, costValueCents)));
}

function trendReturnAtProgress(targetBps, progress, index) {
  if (progress >= 1) return targetBps;
  const smoothProgress = progress * progress * (3 - 2 * progress);
  const seed = (index + 1) * 1.73;
  const wave = Math.sin(progress * Math.PI * 4 + seed) * 75 + Math.sin(progress * Math.PI * 9 + seed) * 35;
  const taperedWave = wave * progress * (1 - progress);
  return clampMinimumReturnBps(Math.round(targetBps * smoothProgress + taperedWave));
}

function clampMinimumReturnBps(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-10000, Math.round(value));
}

function dateProgress(start, end, date) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const dateMs = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 1;
  return Math.max(0, Math.min(1, (dateMs - startMs) / (endMs - startMs)));
}
