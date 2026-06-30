import { roundDivide } from "../../domain/calculations.js";
import { absBigInt } from "../../utils/bigint.js";
import { addMonths, formatDate, normalizeSnapshotDate, todayIsoDate } from "../../utils/date.js";
import { marketLabel } from "../assets/marketOptions.js";
import { formatShare } from "../../ui/formatters.js";

let ctx = {};

export function configureAnalysisModel(context = {}) {
  ctx = { ...ctx, ...context };
}

function analysisFilter() { return ctx.getAnalysisFilter(); }
function openAssets() { return ctx.openAssets(); }
function calculateDisplayPortfolio(assets) { return ctx.calculateDisplayPortfolio(assets); }
function convertUsdToDisplay(cents) { return ctx.convertUsdToDisplay(cents); }
function assetValueAtTrendDate(asset, date, index, end) { return ctx.assetValueAtTrendDate(asset, date, index, end); }
function buildTrendDates(start, end) { return ctx.buildTrendDates(start, end); }
function latestTrendDate(assets) { return ctx.latestTrendDate(assets); }
function assetTypeKey(asset) { return ctx.assetTypeKey(asset); }

export function buildAnalysisModel(assets, portfolio, attribution) {
  const startValueCents = convertUsdToDisplay(attribution.startValueCents);
  const endValueCents = portfolio.totals.marketValueCents;
  const valueChangeCents = endValueCents - startValueCents;
  const contributionCents = convertUsdToDisplay(
    attribution.items.find((item) => item.key === "contribution")?.amountCents || 0n
  );
  const investmentResultCents = valueChangeCents - contributionCents;
  const returnBase = portfolio.totals.costValueCents || startValueCents || 1n;
  const returnBps = portfolio.totals.returnBps;
  const realReturnBase = (startValueCents + (contributionCents > 0n ? contributionCents : 0n)) || returnBase;
  const realReturnBps = realReturnBase === 0n ? 0n : roundDivide(investmentResultCents * 10000n, realReturnBase);
  const monthlyReturns = buildMonthlyAnalysisReturns(assets);
  const drawdown = calculateDrawdownStats(buildAnalysisTrendPoints(assets));
  const allocation = buildAllocationAnalysis(portfolio.positions, portfolio.totals.marketValueCents);
  const concentration = buildConcentrationAnalysis(portfolio.positions, portfolio.totals.marketValueCents);

  return {
    assets,
    portfolio,
    attribution,
    startValueCents,
    endValueCents,
    valueChangeCents,
    contributionCents,
    investmentResultCents,
    returnBps,
    realReturnBps,
    annualizedReturnBps: annualizedAnalysisReturnBps(returnBps, assets),
    monthlyReturns,
    drawdown,
    allocation,
    concentration
  };
}

function buildMonthlyAnalysisReturns(assets) {
  const latest = latestTrendDate(assets.length ? assets : openAssets());
  const dates = Array.from({ length: 13 }, (_, index) => addMonths(latest, index - 12));
  const points = dates.map((date) => ({
    date,
    valueCents: analysisPortfolioValueAtDate(assets, date, latest)
  }));
  return points.slice(1).map((point, index) => {
    const previous = points[index];
    const amountCents = point.valueCents - previous.valueCents;
    const returnBps = previous.valueCents === 0n ? 0n : roundDivide(amountCents * 10000n, previous.valueCents);
    return { month: point.date.slice(0, 7), amountCents, returnBps };
  });
}

export function buildAnalysisTrendPoints(assets) {
  const { start, end } = selectedAnalysisBounds(assets);
  const latest = latestTrendDate(assets.length ? assets : openAssets());
  return buildTrendDates(start, end).map((date) => ({
    date,
    valueCents: analysisPortfolioValueAtDate(assets, date, latest)
  }));
}

export function selectedAnalysisBounds(assets) {
  const filter = analysisFilter();
  const scopedAssets = assets.length ? assets : openAssets();
  const latest = latestTrendDate(scopedAssets);
  const end = filter.endDate || latest || todayIsoDate();
  const start = filter.startDate || earliestAnalysisAssetDate(scopedAssets) || addMonths(end, -12);
  return normalizeDateBounds(start, end);
}

function normalizeDateBounds(start, end) {
  if (start <= end) return { start, end };
  return { start: end, end: start };
}

export function earliestAnalysisAssetDate(assets) {
  const dates = assets
    .map(assetAnalysisDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates[0] || "";
}

function analysisPortfolioValueAtDate(assets, date, latest) {
  if (!assets.length) return 0n;
  if (date >= latest) return calculateDisplayPortfolio(assets).totals.marketValueCents;
  const valueCents = assets.reduce((total, asset, index) => total + assetValueAtTrendDate(asset, date, index, latest), 0n);
  return convertUsdToDisplay(valueCents);
}

function calculateDrawdownStats(points) {
  let peak = 0n;
  let peakDate = points[0]?.date || todayIsoDate();
  let maxDrawdownBps = 0n;
  let maxStartDate = peakDate;
  let maxEndDate = peakDate;
  let currentDrawdownBps = 0n;

  for (const point of points) {
    if (point.valueCents >= peak) {
      peak = point.valueCents;
      peakDate = point.date;
    }
    const drawdownBps = peak === 0n ? 0n : roundDivide((point.valueCents - peak) * 10000n, peak);
    if (drawdownBps < maxDrawdownBps) {
      maxDrawdownBps = drawdownBps;
      maxStartDate = peakDate;
      maxEndDate = point.date;
    }
    currentDrawdownBps = drawdownBps;
  }

  const maxDrawdownDays = daysBetween(maxStartDate, maxEndDate);
  const currentDrawdownDays = currentDrawdownBps < 0n ? daysBetween(peakDate, points.at(-1)?.date || peakDate) : 0;
  const worstMonth = buildWorstMonth(points);
  return {
    points: points.map((point) => ({ ...point, drawdownBps: pointDrawdownBps(points, point) })),
    maxDrawdownBps,
    currentDrawdownBps,
    maxStartDate,
    maxEndDate,
    maxDrawdownDays,
    currentDrawdownDays,
    worstMonthBps: worstMonth.returnBps,
    worstMonthLabel: worstMonth.month
  };
}

function pointDrawdownBps(points, target) {
  let peak = 0n;
  for (const point of points) {
    if (point.valueCents > peak) peak = point.valueCents;
    if (point === target) return peak === 0n ? 0n : roundDivide((point.valueCents - peak) * 10000n, peak);
  }
  return 0n;
}

function buildWorstMonth(points) {
  const monthly = points.slice(1).map((point, index) => {
    const previous = points[index];
    return {
      month: point.date.slice(0, 7),
      returnBps: previous.valueCents === 0n ? 0n : roundDivide((point.valueCents - previous.valueCents) * 10000n, previous.valueCents)
    };
  });
  return monthly.reduce((worst, item) => (item.returnBps < worst.returnBps ? item : worst), { month: "-", returnBps: 0n });
}

export function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 86400000));
}

function buildAllocationAnalysis(positions, totalValueCents) {
  const targets = defaultAllocationTargets();
  const groups = new Map();
  for (const position of positions) {
    const type = assetTypeKey(position);
    const current = groups.get(type) || { type, marketValueCents: 0n };
    current.marketValueCents += position.marketValueCents;
    groups.set(type, current);
  }
  for (const type of Object.keys(targets)) {
    if (!groups.has(type)) groups.set(type, { type, marketValueCents: 0n });
  }

  const rows = [...groups.values()]
    .map((item) => {
      const currentBps = totalValueCents === 0n ? 0n : roundDivide(item.marketValueCents * 10000n, totalValueCents);
      const targetBps = BigInt(targets[item.type] || 0);
      const deviationBps = currentBps - targetBps;
      return {
        ...item,
        currentBps,
        targetBps,
        deviationBps,
        deviationAmountCents: roundDivide(totalValueCents * deviationBps, 10000n),
        status: absBigInt(deviationBps) >= 1500n ? "明显偏离" : absBigInt(deviationBps) >= 800n ? "轻微偏离" : "正常"
      };
    })
    .filter((item) => item.marketValueCents !== 0n || item.targetBps !== 0n)
    .sort((left, right) => absBigInt(right.deviationBps) > absBigInt(left.deviationBps) ? 1 : -1);

  const max = rows[0] || { type: "暂无", deviationBps: 0n, currentBps: 0n, targetBps: 0n, deviationAmountCents: 0n };
  return {
    rows,
    maxAbsDeviationBps: absBigInt(max.deviationBps),
    maxDeviationLabel: max.deviationBps === 0n ? "接近目标" : `${max.type} ${max.deviationBps > 0n ? "高" : "低"} ${formatShare(absBigInt(max.deviationBps))}`,
    maxDeviationDetail: `当前 ${formatShare(max.currentBps)} / 目标 ${formatShare(max.targetBps)}`,
    highRiskBps: rows
      .filter((item) => !["现金", "债券/固收"].includes(item.type))
      .reduce((sum, item) => sum + item.currentBps, 0n),
    cashBps: rows.find((item) => item.type === "现金")?.currentBps || 0n
  };
}

function defaultAllocationTargets() {
  return {
    "基金": 3500,
    "股票": 3000,
    "债券/固收": 1500,
    "现金": 1500,
    "数字资产": 500
  };
}

function buildConcentrationAnalysis(positions, totalValueCents) {
  const sorted = [...positions].sort((left, right) => right.marketValueCents > left.marketValueCents ? 1 : -1);
  const top1WeightBps = sorted[0] && totalValueCents !== 0n ? roundDivide(sorted[0].marketValueCents * 10000n, totalValueCents) : 0n;
  const top5Value = sorted.slice(0, 5).reduce((sum, item) => sum + item.marketValueCents, 0n);
  const top5WeightBps = totalValueCents === 0n ? 0n : roundDivide(top5Value * 10000n, totalValueCents);
  const market = largestGroupWeight(positions, (position) => marketLabel(position.market) || "未标记市场", totalValueCents);
  const account = largestGroupWeight(positions, (position) => position.account || "未命名账户", totalValueCents);
  const status = top5WeightBps > 6000n || market.weightBps > 7000n || account.weightBps > 8000n || top1WeightBps > 2000n
    ? "high"
    : top5WeightBps > 4500n || top1WeightBps > 1500n
      ? "medium"
      : "low";
  return { sorted, top1WeightBps, top5WeightBps, market, account, status };
}

function largestGroupWeight(items, keySelector, totalValueCents) {
  const groups = new Map();
  for (const item of items) {
    const key = keySelector(item);
    groups.set(key, (groups.get(key) || 0n) + item.marketValueCents);
  }
  const largest = [...groups.entries()].sort((left, right) => right[1] > left[1] ? 1 : -1)[0] || ["暂无", 0n];
  return {
    label: largest[0],
    valueCents: largest[1],
    weightBps: totalValueCents === 0n ? 0n : roundDivide(largest[1] * 10000n, totalValueCents)
  };
}

function annualizedAnalysisReturnBps(returnBps, assets) {
  const { start, end } = selectedAnalysisBounds(assets);
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const days = Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(1, Math.round((endMs - startMs) / 86400000))
    : 365;
  return roundDivide(BigInt(returnBps) * 365n, BigInt(days));
}

export function analysisStageStartLabel(assets) {
  const filter = analysisFilter();
  if (filter.startDate) return filter.startDate;
  const earliest = earliestAnalysisAssetDate(assets);
  return earliest ? `累计起点 ${earliest}` : "累计起点";
}

export function analysisStageEndLabel(assets) {
  const filter = analysisFilter();
  if (filter.endDate) return filter.endDate;
  const latest = latestTrendDate(assets.length ? assets : openAssets());
  return latest ? `当前估值日 ${latest}` : "当前估值日";
}

function assetAnalysisDate(asset) {
  return normalizeSnapshotDate(asset.purchaseDate || asset.buyDate || asset.acquiredAt || formatDate(asset.updatedAt) || "");
}
