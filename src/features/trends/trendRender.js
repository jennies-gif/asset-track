import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { buildSmoothAreaPath, buildSmoothLinePath } from "../../ui/charts.js";
import { emptyActionState, emptyStateInner } from "../../ui/emptyState.js";
import {
  formatCompactCurrency,
  formatDisplayCurrency,
  formatOptionalSignedAmount,
  formatTrendReturn,
  toneClassForValue
} from "../../ui/formatters.js";
import { absBigInt } from "../../utils/bigint.js";
import { escapeHtml } from "../../utils/dom.js";
import {
  buildReturnTrendPoints,
  buildTrendSeries,
  calculateMaxDrawdownAsset,
  calculateMaxDrawdownBps
} from "./trendModel.js";

let ctx = {};

export function configureTrendRender(context) {
  ctx = context;
}

export function renderTrendChart() {
  const { elements } = ctx;
  const series = buildTrendSeries();
  const rawPoints = series.points;
  const isReturnMode = elements.trendMetric.value === "return";
  const points = isReturnMode ? buildReturnTrendPoints(rawPoints) : rawPoints;
  if (!ctx.overviewAssets().length) {
    elements.trendChart.innerHTML = emptyActionState("暂无资产变化曲线", "", "添加第一笔资产", "add-asset");
    return;
  }
  if (!points.length) {
    elements.trendChart.innerHTML = emptyStateInner("当前范围没有价值快照", "添加资产或加载示例数据后，趋势会基于价格、估值和快照生成。");
    return;
  }
  const values = points.map((point) => point.valueCents);
  const min = values.reduce((current, value) => (value < current ? value : current), values[0] || 0n);
  const max = values.reduce((current, value) => (value > current ? value : current), values[0] || 0n);
  const range = max === min ? 1n : max - min;
  const width = 920;
  const height = 300;
  const pad = 32;
  const topPad = 24;
  const leftPad = 96;
  const rightPad = 28;
  const usableChartWidth = width - leftPad - rightPad;
  const usableHeight = height - topPad - pad;
  const yTicks = buildTrendYAxisTicks(min, max, isReturnMode);

  const chartPoints = points.map((point, index) => {
    const x = leftPad + (points.length === 1 ? usableChartWidth : (usableChartWidth * index) / (points.length - 1));
    const yRatio = Number((point.valueCents - min) * 10000n / range) / 10000;
    const y = topPad + usableHeight - yRatio * usableHeight;
    return { ...point, x, y };
  });

  const path = buildSmoothLinePath(chartPoints);
  const areaPath = buildSmoothAreaPath(chartPoints, height - pad, leftPad, width - rightPad);
  const xAxisLabels = buildEvenlySpacedXAxisLabels(chartPoints);
  const latest = points.at(-1);
  const chartSummary = buildTrendChartSummary(rawPoints, ctx.overviewAssets());
  const trendPrimaryValue = isReturnMode ? formatTrendReturn(latest.valueCents) : formatDisplayCurrency(latest.valueCents);
  elements.trendChart.innerHTML = `
    <div class="trend-chart-shell">
      <div class="trend-plot">
        <div class="trend-chart-meta">
          <div>
            <span>${escapeHtml(isReturnMode ? "收益率" : "当前总资产")}</span>
            <strong class="${isReturnMode ? toneClassForValue(trendPrimaryValue) : ""}">${escapeHtml(trendPrimaryValue)}</strong>
          </div>
          ${renderChartSource(series.source)}
      </div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${isReturnMode ? "收益率变化曲线" : "总资产变化曲线"}">
      <defs>
        <linearGradient id="trendAreaGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="currentColor" stop-opacity="0.08"></stop>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0.02"></stop>
        </linearGradient>
      </defs>
      <line x1="${leftPad}" y1="${height - pad}" x2="${width - rightPad}" y2="${height - pad}" class="chart-axis"></line>
      ${yTicks
        .map((tick) => {
          const yRatio = Number(((tick.value - min) * 10000n) / range) / 10000;
          const y = topPad + usableHeight - yRatio * usableHeight;
          return `
            <line x1="${leftPad}" y1="${y.toFixed(1)}" x2="${width - rightPad}" y2="${y.toFixed(1)}" class="chart-grid"></line>
            <text x="${leftPad - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="chart-y-label">${escapeHtml(tick.label)}</text>
          `;
        })
        .join("")}
      <path d="${areaPath}" class="chart-area"></path>
      <path d="${path}" class="chart-line"></path>
      ${xAxisLabels
        .map((label) => {
          return `<text x="${label.x.toFixed(1)}" y="${height - 7}" text-anchor="${label.anchor}" class="chart-x-label">${escapeHtml(label.date)}</text>`;
        })
        .join("")}
      ${chartPoints
        .map((point, index) => `
          <circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.2" class="chart-point">
            <title>${escapeHtml(buildTrendPointTooltip(rawPoints[index] || point, rawPoints[index - 1] || null, rawPoints[0] || null))}</title>
          </circle>
        `)
        .join("")}
    </svg>
      </div>
      <aside class="trend-summary-panel" aria-label="总资产曲线摘要">
        ${chartSummary
          .map((item) => `
            <span>
              <small>${escapeHtml(item.label)}</small>
              <b class="${escapeHtml(item.className || "")}">${escapeHtml(item.value)}</b>
              ${item.detail ? `<small class="trend-summary-detail">${escapeHtml(item.detail)}</small>` : ""}
            </span>
          `)
          .join("")}
      </aside>
    </div>
  `;
}

function renderChartSource(source) {
  if (!source) return "";
  return `
    <div class="chart-source-line">
      <span class="chart-source-badge ${escapeHtml(source.tone || "")}">${escapeHtml(source.label)}</span>
      <small>${escapeHtml(source.description)}</small>
    </div>
  `;
}

function buildTrendPointTooltip(point, previousPoint, firstPoint) {
  const change = previousPoint ? point.valueCents - previousPoint.valueCents : 0n;
  const cumulativeReturn = firstPoint?.valueCents
    ? roundDivide((point.valueCents - firstPoint.valueCents) * 10000n, firstPoint.valueCents)
    : 0n;
  return [
    `日期：${point.date}`,
    `总资产：${formatDisplayCurrency(point.valueCents)}`,
    `当日变化：${formatOptionalSignedAmount(change)}`,
    `累计收益：${formatPercent(cumulativeReturn)}`
  ].join("\n");
}

function buildTrendChartSummary(points, assets) {
  if (!points.length) {
    return [
      { label: "当前总资产", value: ctx.dataUnavailable },
      { label: "今年最高", value: ctx.dataUnavailable },
      { label: "今年最低", value: ctx.dataUnavailable },
      { label: "最大回撤", value: ctx.dataUnavailable }
    ];
  }
  const values = points.map((point) => point.valueCents);
  const latest = points.at(-1).valueCents;
  const high = values.reduce((current, value) => (value > current ? value : current), values[0]);
  const low = values.reduce((current, value) => (value < current ? value : current), values[0]);
  const drawdownBps = calculateMaxDrawdownBps(points);
  const drawdownAsset = drawdownBps < 0n ? calculateMaxDrawdownAsset(points, assets) : null;
  return [
    { label: "当前总资产", value: formatDisplayCurrency(latest) },
    { label: "今年最高", value: formatDisplayCurrency(high) },
    { label: "今年最低", value: formatDisplayCurrency(low) },
    {
      label: "最大回撤",
      value: drawdownBps === null ? ctx.dataUnavailable : formatPercent(drawdownBps),
      className: drawdownBps < 0n ? "negative" : "",
      detail: drawdownAsset ? `主要回撤资产：${drawdownAsset.name || drawdownAsset.symbol || "未命名资产"}` : ""
    }
  ];
}

export function buildEvenlySpacedXAxisLabels(points, maxLabels = 5) {
  if (!points.length) return [];
  if (points.length === 1) {
    return [{ ...points[0], anchor: "middle" }];
  }

  const labelCount = Math.min(maxLabels, points.length);
  const indexes = new Set(
    Array.from({ length: labelCount }, (_, index) => Math.round((index * (points.length - 1)) / (labelCount - 1)))
  );

  return [...indexes]
    .sort((left, right) => left - right)
    .map((index) => ({
      ...points[index],
      anchor: index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"
    }));
}

function buildTrendYAxisTicks(min, max, isReturnMode) {
  if (min === max) {
    return [{ value: min, label: isReturnMode ? formatTrendReturn(min) : formatCompactCurrency(min, max) }];
  }
  const tickCount = 4n;
  const maxAbs = absBigInt(max) > absBigInt(min) ? absBigInt(max) : absBigInt(min);
  return Array.from({ length: Number(tickCount) }, (_, index) => {
    const step = BigInt(index);
    return max - ((max - min) * step) / (tickCount - 1n);
  }).map((value) => ({
    value,
    label: isReturnMode ? formatTrendReturn(value) : formatCompactCurrency(value, maxAbs)
  }));
}
