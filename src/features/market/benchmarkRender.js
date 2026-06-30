import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { benchmarkInstruments } from "../../domain/marketData.js";
import { addMonths } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import { performanceValueClass } from "../../ui/formatters.js";

let ctx = {};

export function configureBenchmarkRender(context) {
  ctx = context;
}

export function renderBenchmarkPerformance() {
  const { elements } = ctx;
  if (!elements.benchmarkRows) return;
  ensureBenchmarkPerformanceLoaded();
  const cumulativeReturnBps = ctx.calculateCumulativeReturnBps();
  const annualizedReturn = ctx.annualizedCumulativeReturnBps(cumulativeReturnBps);
  const benchmarkRows = buildBenchmarkPerformanceRows();
  const hasBenchmarkData = benchmarkRows.some((row) => row.periods.some((period) => period.valueBps !== null));
  const tableWrap = elements.benchmarkRows.closest(".benchmark-table-wrap");
  tableWrap?.classList.toggle("is-hidden", !hasBenchmarkData);
  elements.benchmarkEmpty?.classList.toggle("is-hidden", hasBenchmarkData);
  if (!hasBenchmarkData) {
    elements.benchmarkRows.innerHTML = "";
    if (elements.benchmarkEmpty) {
      const isLoading = ctx.getBenchmarkPerformanceState().status === "loading";
      elements.benchmarkEmpty.textContent = isLoading
        ? "正在读取沪深300、标普500和纳斯达克100基准数据..."
        : "暂无基准数据。点击“分析”页的同步基准数据，或启动行情 API 后自动读取沪深300、标普500和纳斯达克100。";
    }
    return;
  }
  const rows = [{
    label: "我的组合",
    meta: "当前筛选资产 · 估算趋势，非真实每日净值",
    periods: [
      { value: formatPercent(ctx.calculateTrendReturnBpsForRange("1")) },
      { value: formatPercent(ctx.calculateTrendReturnBpsForRange("3")) },
      { value: formatPercent(ctx.calculateTrendReturnBpsForRange("ytd")) },
      { value: formatPercent(cumulativeReturnBps) },
      { value: formatPercent(annualizedReturn) }
    ]
  }, ...benchmarkRows.map((row) => ({
    label: row.label,
    meta: `${row.meta} · 行情缓存`,
    periods: row.periods.map((period) => ({ value: period.valueBps === null ? ctx.dataUnavailable : formatPercent(period.valueBps) }))
  }))];
  elements.benchmarkRows.innerHTML = rows
    .map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.meta)}</span></td>
        ${row.periods.map((period) => `<td class="${performanceValueClass(period.value)}">${escapeHtml(period.value)}</td>`).join("")}
      </tr>
    `)
    .join("");
}

export async function loadBenchmarkPerformance({ force = false } = {}) {
  const benchmarkPerformanceState = ctx.getBenchmarkPerformanceState();
  if (!force && benchmarkPerformanceState.status === "loading") return;
  ctx.setBenchmarkPerformanceState({ ...benchmarkPerformanceState, status: "loading", error: "" });
  try {
    const histories = {};
    const results = await Promise.allSettled(
      benchmarkInstruments.map(async (benchmark) => {
        const response = await fetch(`${ctx.marketApiBaseUrl}/api/market-data/history?symbol=${encodeURIComponent(benchmark.symbol)}`);
        if (!response.ok) throw new Error(`${benchmark.symbol} ${response.status}`);
        const payload = await response.json();
        return [benchmark.key, Array.isArray(payload.points) ? payload.points : []];
      })
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        const [key, points] = result.value;
        histories[key] = normalizeBenchmarkHistory(points);
      }
    }
    ctx.setBenchmarkPerformanceState({ status: "loaded", histories, error: "" });
  } catch (error) {
    ctx.setBenchmarkPerformanceState({
      status: "error",
      histories: {},
      error: error instanceof Error ? error.message : "基准数据读取失败"
    });
  }
  renderBenchmarkPerformance();
  ctx.renderCurrentAnalysisReturnRows();
}

export function benchmarkReturnPeriods() {
  return [
    { key: "1m", label: "近1月", months: 1 },
    { key: "3m", label: "近3月", months: 3 },
    { key: "ytd", label: "今年", ytd: true },
    { key: "all", label: "累计", all: true },
    { key: "annualized", label: "年化", annualized: true }
  ];
}

export function benchmarkHistoryPeriodReturnBps(points, period, bounds = null) {
  if (points.length < 2) return null;
  const end = bounds?.end || points.at(-1).date;
  const firstAvailable = points[0].date;
  const start = bounds?.start || firstAvailable;
  if (period.annualized) {
    const allReturn = benchmarkHistoryPeriodReturnBps(points, { all: true }, bounds);
    return allReturn === null ? null : annualizePeriodReturnBps(allReturn, start, end);
  }
  const windowStart = period.all ? start : period.ytd ? `${end.slice(0, 4)}-01-01` : addMonths(end, -Number(period.months || 12));
  const first = nearestBenchmarkPointOnOrAfter(points, windowStart) || points[0];
  const last = nearestBenchmarkPointOnOrBefore(points, end) || points.at(-1);
  if (!first || !last || first.close <= 0 || last.date < first.date) return null;
  return BigInt(Math.round(((last.close - first.close) / first.close) * 10000));
}

function ensureBenchmarkPerformanceLoaded() {
  const benchmarkPerformanceState = ctx.getBenchmarkPerformanceState();
  if (benchmarkPerformanceState.status === "loading" || benchmarkPerformanceState.status === "loaded") return;
  loadBenchmarkPerformance();
}

function normalizeBenchmarkHistory(points) {
  return points
    .map((point) => ({
      date: String(point.date || ""),
      close: Number(point.close),
      source: point.source || ""
    }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.close) && point.close > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildBenchmarkPerformanceRows() {
  const periods = benchmarkReturnPeriods();
  const benchmarkPerformanceState = ctx.getBenchmarkPerformanceState();
  return benchmarkInstruments.map((benchmark) => {
    const points = benchmarkPerformanceState.histories[benchmark.key] || [];
    return {
      ...benchmark,
      periods: periods.map((period) => ({
        label: period.label,
        valueBps: benchmarkHistoryPeriodReturnBps(points, period)
      }))
    };
  });
}

function nearestBenchmarkPointOnOrAfter(points, date) {
  return points.find((point) => point.date >= date) || null;
}

function nearestBenchmarkPointOnOrBefore(points, date) {
  return [...points].reverse().find((point) => point.date <= date) || null;
}

function annualizePeriodReturnBps(returnBps, start, end) {
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((endMs - startMs) / 86400000));
  return roundDivide(BigInt(returnBps) * 365n, BigInt(days));
}
