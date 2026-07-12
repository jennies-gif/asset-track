import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { addMonths, todayIsoDate } from "../../utils/date.js";
import { buildAnalysisTrendPoints, daysBetween, selectedAnalysisBounds } from "./analysisModel.js";

const DATA_UNAVAILABLE = "暂无数据";
let ctx = {};

export function configureAnalysisReturns(context = {}) {
  ctx = { ...ctx, ...context };
}

function analysisReturnMetric() { return ctx.getAnalysisReturnMetric(); }
function benchmarkPerformanceState() { return ctx.getBenchmarkPerformanceState(); }

export function formatAnalysisReturnValue(valueBps) {
  if (analysisReturnMetric() !== "sr") return formatPercent(valueBps);
  const ratio = Number(valueBps) / 10000;
  if (!Number.isFinite(ratio)) return DATA_UNAVAILABLE;
  return `${ratio >= 0 ? "+" : ""}${ratio.toFixed(2)}`;
}

export function syncAnalysisReturnMetricButtons() {
  document.querySelectorAll("[data-analysis-return-metric]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.analysisReturnMetric === analysisReturnMetric());
  });
}

export function buildAnalysisReturnRows(analysis, analysisScopeLabel) {
  const periods = ctx.benchmarkReturnPeriods();
  const { start, end } = selectedAnalysisBounds(analysis.assets);
  const portfolioPoints = buildAnalysisTrendPoints(analysis.assets);
  const rows = [
    {
      kind: "portfolio",
      label: "我的组合",
      meta: analysisReturnMetricMeta(analysisScopeLabel),
      periods: periods.map((period) => ({ label: period.label, valueBps: portfolioReturnMetricBps(portfolioPoints, period, start, end, analysis) }))
    }
  ];
  for (const benchmark of ctx.selectedBenchmarkInstruments()) {
    const points = benchmarkPerformanceState().histories[benchmark.key] || [];
    rows.push({
      kind: "benchmark",
      label: benchmark.label,
      meta: benchmark.meta,
      hasData: points.length >= 2,
      periods: periods.map((period) => ({
        label: period.label,
        valueBps: benchmarkReturnMetricBps(points, period, { start, end })
      }))
    });
  }
  return rows;
}

function analysisReturnMetricMeta(analysisScopeLabel) {
  if (analysisReturnMetric() === "twr") return `${analysisScopeLabel()} · TWR 估算曲线近似`;
  if (analysisReturnMetric() === "sr") return `${analysisScopeLabel()} · SR 基于估算收益序列`;
  return `${analysisScopeLabel()} · MWR 本地现金流近似`;
}

function portfolioReturnMetricBps(points, period, start, end, analysis) {
  if (analysisReturnMetric() === "twr") return portfolioTimeWeightedReturnBps(points, period, start, end);
  if (analysisReturnMetric() === "sr") return portfolioSharpeRatioBps(points, period, start, end);
  if (period.all) return analysis.realReturnBps;
  if (period.annualized) return annualizePeriodReturnBps(analysis.realReturnBps, start, end);
  return portfolioPeriodReturnBps(points, period, start, end);
}

function benchmarkReturnMetricBps(points, period, bounds) {
  if (analysisReturnMetric() === "sr") return benchmarkSharpeRatioBps(points, period, bounds);
  return ctx.benchmarkHistoryPeriodReturnBps(points, period, bounds);
}

function portfolioPeriodReturnBps(points, period, start, end) {
  if (period.annualized) {
    const all = portfolioPeriodReturnBps(points, { all: true }, start, end);
    return annualizePeriodReturnBps(all, start, end);
  }
  const windowStart = periodStartDate(period, start, end);
  const first = nearestPointOnOrAfter(points, windowStart) || points[0];
  const last = points.at(-1);
  if (!first || !last || first.valueCents === 0n) return 0n;
  return roundDivide((last.valueCents - first.valueCents) * 10000n, first.valueCents);
}

function portfolioTimeWeightedReturnBps(points, period, start, end) {
  if (period.annualized) {
    const all = portfolioTimeWeightedReturnBps(points, { all: true }, start, end);
    return annualizePeriodReturnBps(all, start, end);
  }
  const windowStart = periodStartDate(period, start, end);
  return compoundPointReturnsBps(points.filter((point) => point.date >= windowStart && point.date <= end), "valueCents");
}

function compoundPointReturnsBps(points, valueKey) {
  if (points.length < 2) return 0n;
  let compounded = 10000n;
  for (let index = 1; index < points.length; index += 1) {
    const previousValue = BigInt(points[index - 1][valueKey] || 0);
    const currentValue = BigInt(points[index][valueKey] || 0);
    if (previousValue <= 0n) continue;
    const periodFactorBps = 10000n + roundDivide((currentValue - previousValue) * 10000n, previousValue);
    compounded = roundDivide(compounded * periodFactorBps, 10000n);
  }
  return compounded - 10000n;
}

function portfolioSharpeRatioBps(points, period, start, end) {
  const windowStart = periodStartDate(period.annualized ? { all: true } : period, start, end);
  return calculateRiskAdjustedMetrics(
    points.filter((point) => point.date >= windowStart && point.date <= end),
    "valueCents"
  ).sharpeRatioBps;
}

function periodStartDate(period, start, end) {
  if (period.all) return start;
  if (period.ytd) return `${end.slice(0, 4)}-01-01`;
  if (period.months) return addMonths(end, -period.months);
  return start;
}

function nearestPointOnOrAfter(points, date) {
  return points.find((point) => point.date >= date) || points[0] || null;
}

function annualizePeriodReturnBps(returnBps, start, end) {
  const days = Math.max(1, daysBetween(start, end));
  return roundDivide(BigInt(returnBps) * 365n, BigInt(days));
}

function benchmarkSharpeRatioBps(points, period, bounds = null) {
  const end = bounds?.end || points.at(-1)?.date || todayIsoDate();
  const start = bounds?.start || points[0]?.date || end;
  const windowStart = periodStartDate(period.annualized ? { all: true } : period, start, end);
  const windowPoints = points.filter((point) => point.date >= windowStart && point.date <= end);
  return calculateRiskAdjustedMetrics(windowPoints, "close").sharpeRatioBps;
}

function pointReturns(points, valueKey) {
  const rows = [];
  for (let index = 1; index < points.length; index += 1) {
    const previousValue = Number(points[index - 1][valueKey] || 0);
    const currentValue = Number(points[index][valueKey] || 0);
    if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue) || previousValue <= 0) continue;
    const intervalDays = Math.max(1, daysBetween(points[index - 1].date, points[index].date));
    rows.push({ returnBps: BigInt(Math.round(((currentValue - previousValue) / previousValue) * 10000)), intervalDays });
  }
  return rows;
}

export function calculateRiskAdjustedMetrics(points, valueKey = "valueCents") {
  const returns = pointReturns(points, valueKey);
  if (returns.length < 3) {
    return { annualizedVolatilityBps: null, sharpeRatioBps: null, observationCount: returns.length, intervalDays: null };
  }
  const values = returns.map((item) => Number(item.returnBps));
  const meanBps = values.reduce((sum, item) => sum + item, 0) / values.length;
  const variance = values.reduce((sum, item) => sum + (item - meanBps) ** 2, 0) / (values.length - 1);
  const periodVolatilityBps = Math.sqrt(variance);
  const sortedIntervals = returns.map((item) => item.intervalDays).sort((left, right) => left - right);
  const intervalDays = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  const periodsPerYear = 365 / intervalDays;
  if (!Number.isFinite(periodVolatilityBps) || periodVolatilityBps === 0 || !Number.isFinite(periodsPerYear)) {
    return { annualizedVolatilityBps: null, sharpeRatioBps: null, observationCount: returns.length, intervalDays };
  }
  return {
    annualizedVolatilityBps: BigInt(Math.round(periodVolatilityBps * Math.sqrt(periodsPerYear))),
    sharpeRatioBps: BigInt(Math.round((meanBps / periodVolatilityBps) * Math.sqrt(periodsPerYear) * 10000)),
    observationCount: returns.length,
    intervalDays
  };
}
