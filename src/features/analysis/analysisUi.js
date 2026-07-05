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

export function renderBenchmarkComparisonChart(series, buildEvenlySpacedXAxisLabels) {
  const normalizedSeries = series
    .map((item, index) => ({
      ...item,
      colorIndex: index + 1,
      points: item.points.filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.returnBps !== null && point.returnBps !== undefined)
    }));
  const visibleSeries = normalizedSeries.filter((item) => item.points.length >= 2);
  const missingBenchmarkLabels = normalizedSeries
    .filter((item) => item.label !== "我的组合" && item.points.length < 2)
    .map((item) => item.label);
  if (!visibleSeries.length) {
    return `<p class="empty-state">暂无走势对比数据。同步已选基准后，这里会展示组合与基准的归一化收益曲线。</p>`;
  }

  const width = 720;
  const height = 260;
  const pad = 28;
  const leftPad = 66;
  const rightPad = 18;
  const chartTop = pad;
  const chartBottom = height - 46;
  const allPoints = visibleSeries.flatMap((item) => item.points);
  const firstDate = allPoints.reduce((current, point) => point.date < current ? point.date : current, allPoints[0].date);
  const lastDate = allPoints.reduce((current, point) => point.date > current ? point.date : current, allPoints[0].date);
  const minReturn = allPoints.reduce((current, point) => BigInt(point.returnBps) < current ? BigInt(point.returnBps) : current, 0n);
  const maxReturn = allPoints.reduce((current, point) => BigInt(point.returnBps) > current ? BigInt(point.returnBps) : current, 0n);
  const range = maxReturn === minReturn ? 1n : maxReturn - minReturn;
  const startMs = Date.parse(`${firstDate}T00:00:00.000Z`);
  const endMs = Date.parse(`${lastDate}T00:00:00.000Z`);
  const timeRange = Math.max(1, endMs - startMs);
  const yFor = (returnBps) => chartTop + Number(((maxReturn - BigInt(returnBps)) * BigInt(chartBottom - chartTop)) / range);
  const xFor = (date) => {
    const dateMs = Date.parse(`${date}T00:00:00.000Z`);
    return leftPad + ((width - leftPad - rightPad) * (dateMs - startMs)) / timeRange;
  };
  const yTicks = [
    { value: maxReturn, label: formatPercent(maxReturn), className: "chart-grid" },
    { value: 0n, label: "0%", className: "chart-axis" },
    { value: minReturn, label: formatPercent(minReturn), className: "chart-grid" }
  ]
    .map((tick) => ({ ...tick, y: yFor(tick.value) }))
    .sort((left, right) => left.y - right.y)
    .filter((tick, index, ticks) => {
      const duplicateValue = ticks.findIndex((item) => item.value === tick.value) !== index;
      const overlapsPrevious = index > 0 && Math.abs(tick.y - ticks[index - 1].y) < 18;
      return !duplicateValue && !overlapsPrevious;
    });
  const xAxisPoints = buildEvenlySpacedXAxisLabels(
    [{ date: firstDate, x: leftPad }, { date: lastDate, x: width - rightPad }],
    2
  );

  return `
    <div class="analysis-chart-title">走势对比（筛选范围内首个可用点归一为 0%）</div>
    <svg class="analysis-line-chart benchmark-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="组合和已选基准走势对比">
      ${yTicks.map((tick) => `
        <line x1="${leftPad}" y1="${tick.y.toFixed(1)}" x2="${width - rightPad}" y2="${tick.y.toFixed(1)}" class="${tick.className}"></line>
        <text x="${leftPad - 12}" y="${tick.y.toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="chart-y-label">${escapeHtml(tick.label)}</text>
      `).join("")}
      ${visibleSeries.map((item) => {
        const path = item.points.map((point) => `${xFor(point.date).toFixed(1)},${yFor(point.returnBps).toFixed(1)}`).join(" ");
        return `<polyline points="${path}" class="benchmark-series-line benchmark-series-${item.colorIndex}"></polyline>`;
      }).join("")}
      ${visibleSeries.map((item) => {
        const last = item.points.at(-1);
        return `<circle cx="${xFor(last.date).toFixed(1)}" cy="${yFor(last.returnBps).toFixed(1)}" r="3.8" class="benchmark-series-point benchmark-series-${item.colorIndex}"></circle>`;
      }).join("")}
      ${xAxisPoints.map((point) => `<text x="${point.x.toFixed(1)}" y="${height - 15}" text-anchor="${point.anchor}" class="chart-x-label">${escapeHtml(formatShortDate(point.date))}</text>`).join("")}
    </svg>
    <div class="benchmark-chart-legend">
      ${visibleSeries.map((item) => `
        <span><i class="benchmark-series-${item.colorIndex}"></i>${escapeHtml(item.label)}</span>
      `).join("")}
    </div>
    ${missingBenchmarkLabels.length ? `<p class="benchmark-chart-note">${escapeHtml(`${missingBenchmarkLabels.join("、")} 在当前筛选范围内没有足够历史点，暂未进入走势图。`)}</p>` : ""}
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
