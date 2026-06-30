import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { benchmarkInstruments } from "../../domain/marketData.js";
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
  for (const benchmark of benchmarkInstruments) {
    const points = benchmarkPerformanceState().histories[benchmark.key] || [];
    if (!points.length) continue;
    rows.push({
      kind: "benchmark",
      label: benchmark.label,
      meta: benchmark.meta,
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
  return sharpeRatioFromReturnsBps(
    pointReturnBps(points.filter((point) => point.date >= windowStart && point.date <= end), "valueCents")
  );
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
  return sharpeRatioFromReturnsBps(pointReturnBps(windowPoints, "close"));
}

function pointReturnBps(points, valueKey) {
  const rows = [];
  for (let index = 1; index < points.length; index += 1) {
    const previousValue = Number(points[index - 1][valueKey] || 0);
    const currentValue = Number(points[index][valueKey] || 0);
    if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue) || previousValue <= 0) continue;
    rows.push(BigInt(Math.round(((currentValue - previousValue) / previousValue) * 10000)));
  }
  return rows;
}

function sharpeRatioFromReturnsBps(returns) {
  if (returns.length < 2) return null;
  const meanBps = returns.reduce((sum, item) => sum + Number(item), 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (Number(item) - meanBps) ** 2, 0) / (returns.length - 1);
  const volatilityBps = Math.sqrt(variance);
  if (!Number.isFinite(volatilityBps) || volatilityBps === 0) return null;
  return BigInt(Math.round((meanBps / volatilityBps) * Math.sqrt(252) * 10000));
}
