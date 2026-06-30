import { formatPercent } from "../../domain/calculations.js";
import { absBigInt } from "../../utils/bigint.js";
import { formatShortDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import {
  formatDisplayAmountOnly,
  formatDisplayCurrency,
  formatShare,
  formatSignedCurrency,
  toneClassForValue
} from "../../ui/formatters.js";

export function analysisStatusLabel(status) {
  return {
    high: "风险偏高",
    medium: "需关注",
    low: "健康",
    empty: "暂无数据，先录入资产"
  }[status] || "需核对";
}

export function analysisStatusClass(status) {
  if (status === "high") return "is-high";
  if (status === "medium") return "is-medium";
  return "is-low";
}

export function analysisMiniMetric(label, value, hint) {
  return `
    <article class="analysis-mini-metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${toneClassForValue(value)}">${escapeHtml(value)}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}

export function stageMetric(label, valueCents, hint) {
  const amount = BigInt(valueCents);
  const valueClass = amount < 0n ? "negative" : amount > 0n ? "positive" : "";
  return `
    <article class="stage-metric">
      <span>${escapeHtml(label)}</span>
      <strong class="${valueClass}">${escapeHtml(formatDisplayCurrency(amount))}</strong>
      <small>${escapeHtml(hint)}</small>
    </article>
  `;
}

export function analysisBarRow(label, meta, valueCents, max, signed = true) {
  const amount = BigInt(valueCents);
  const width = Number((absBigInt(amount) * 10000n) / max) / 100;
  const valueClass = toneClassForValue(amount);
  return `
    <article class="attribution-row">
      <div class="bar-label">
        <strong>${escapeHtml(label)}<small>${escapeHtml(meta)}</small></strong>
        <span class="${valueClass}">${escapeHtml(signed ? formatSignedCurrency(amount) : formatDisplayCurrency(amount))}</span>
      </div>
      <div class="bar-track">
        <span class="bar ${valueClass}" style="width: ${Math.max(2, width).toFixed(2)}%"></span>
      </div>
    </article>
  `;
}

export function renderColumnChart(items, label) {
  if (!items.length) return `<p class="empty-state">暂无图表数据。先录入资产并保留价值快照，再查看趋势。</p>`;
  const max = items.reduce((current, item) => absBigInt(item.value) > current ? absBigInt(item.value) : current, 1n);
  return `
    <div class="analysis-chart-title">${escapeHtml(label)}</div>
    <div class="analysis-column-chart">
      ${items.map((item) => {
        const height = Number((absBigInt(item.value) * 10000n) / max) / 100;
        return `
          <div class="analysis-column-item" title="${escapeHtml(item.text)}">
            <span class="analysis-column ${toneClassForValue(item.value)}" style="height: ${Math.max(4, height).toFixed(2)}%"></span>
            <small>${escapeHtml(item.label)}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

export function renderDrawdownChart(points, buildEvenlySpacedXAxisLabels) {
  if (!points.length) return `<p class="empty-state">暂无回撤数据。先录入资产并积累价值快照，再查看回撤变化。</p>`;
  const width = 720;
  const height = 220;
  const pad = 28;
  const leftPad = 66;
  const rightPad = 18;
  const min = points.reduce((current, point) => point.drawdownBps < current ? point.drawdownBps : current, 0n);
  const range = min === 0n ? 1n : -min;
  const chartPoints = points.map((point, index) => {
    const x = leftPad + (points.length === 1 ? 0 : ((width - leftPad - rightPad) * index) / (points.length - 1));
    const y = pad + Number((-point.drawdownBps * BigInt(height - pad * 2)) / range);
    return { ...point, x, y };
  });
  const path = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return `
    <svg class="analysis-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="回撤曲线">
      <line x1="${leftPad}" y1="${pad}" x2="${width - rightPad}" y2="${pad}" class="chart-axis"></line>
      <text x="${leftPad - 10}" y="${pad + 4}" text-anchor="end" class="chart-y-label">0%</text>
      <line x1="${leftPad}" y1="${height - pad}" x2="${width - rightPad}" y2="${height - pad}" class="chart-grid"></line>
      <text x="${leftPad - 10}" y="${height - pad + 4}" text-anchor="end" class="chart-y-label">${escapeHtml(formatPercent(min))}</text>
      <polyline points="${path}" class="analysis-drawdown-line"></polyline>
      ${buildEvenlySpacedXAxisLabels(chartPoints, 4).map((point) => `<text x="${point.x.toFixed(1)}" y="${height - 7}" text-anchor="${point.anchor}" class="chart-x-label">${escapeHtml(formatShortDate(point.date))}</text>`).join("")}
    </svg>
  `;
}

export function renderAllocationBars(rows) {
  if (!rows.length) return `<p class="empty-state">暂无配置数据。先添加股票、基金、现金等资产后查看配置偏离。</p>`;
  return `
    <div class="allocation-bars">
      ${rows.map((row) => `
        <article class="allocation-row">
          <strong>${escapeHtml(row.type)}</strong>
          <div>
            <span class="allocation-track"><b class="allocation-current" style="width: ${Math.min(100, Number(row.currentBps) / 100).toFixed(2)}%"></b></span>
            <span class="allocation-track"><b class="allocation-target" style="width: ${Math.min(100, Number(row.targetBps) / 100).toFixed(2)}%"></b></span>
          </div>
          <small>当前 ${escapeHtml(formatShare(row.currentBps))} / 目标 ${escapeHtml(formatShare(row.targetBps))}</small>
        </article>
      `).join("")}
    </div>
  `;
}

export function renderWaterfallChart(items) {
  const max = items.reduce((current, item) => absBigInt(item.value) > current ? absBigInt(item.value) : current, 1n);
  return `
    <div class="analysis-waterfall">
      ${items.map((item) => {
        const height = Number((absBigInt(item.value) * 10000n) / max) / 100;
        const valueClass = toneClassForValue(item.value);
        return `
          <article>
            <span class="waterfall-bar ${item.total ? "total" : valueClass}" style="height: ${Math.max(8, height).toFixed(2)}%"></span>
            <strong class="${valueClass}">${escapeHtml(formatDisplayAmountOnly(item.value))}</strong>
            <small>${escapeHtml(item.label)}</small>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

export function analysisSummaryCard(title, value, meta, description, status) {
  return `
    <article class="metric analysis-summary-card ${analysisStatusClass(status)}">
      <span class="metric-title">${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(meta)}</small>
      <p>${escapeHtml(description)}</p>
      <b>${escapeHtml(analysisStatusLabel(status))}</b>
    </article>
  `;
}
