import { buildHistorySeries, inferUniverse } from "../../domain/marketData.js";
import { formatShortDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import { buildSmoothAreaPath, buildSmoothLinePath } from "../../ui/charts.js";
import { formatMonthDayTimeMinute } from "../../ui/formatters.js";

let ctx = {};
let assetPriceChartRequestId = 0;

export function configureMarketRender(context) {
  ctx = context;
}

export function renderMarketSyncResult() {
  const { elements } = ctx;
  const marketSyncState = ctx.getMarketSyncState();
  if (!elements.marketSyncResult || !elements.syncMarketDataButton) return;
  const isLoading = marketSyncState.status === "loading";
  elements.syncMarketDataButton.disabled = isLoading;
  elements.syncMarketDataButton.textContent = isLoading ? "同步中..." : "同步价格";
  if (marketSyncState.status === "idle") {
    elements.marketSyncResult.innerHTML = "";
    return;
  }
  const rows = (marketSyncState.results || []).slice(0, 6);
  elements.marketSyncResult.innerHTML = `
    <div class="market-sync-summary is-${escapeHtml(marketSyncState.status)}">
      <strong>${escapeHtml(marketSyncState.message)}</strong>
      ${marketSyncState.syncedAt ? `<span>${escapeHtml(formatMonthDayTimeMinute(marketSyncState.syncedAt))}</span>` : ""}
    </div>
    ${rows.length ? `
      <div class="market-sync-list">
        ${rows.map(renderMarketSyncRow).join("")}
      </div>
    ` : ""}
  `;
}

export function renderAssetTrendSelector() {
  const { elements } = ctx;
  const assets = ctx.openAssets();
  const current = elements.assetTrendSelect.value;
  elements.assetTrendSelect.innerHTML = assets.length
    ? assets
        .map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}${asset.symbol ? ` · ${escapeHtml(asset.symbol)}` : ""}</option>`)
        .join("")
    : `<option value="">暂无资产，先到资产页添加</option>`;
  if (assets.some((asset) => asset.id === current)) {
    elements.assetTrendSelect.value = current;
  }
}

export function renderAssetPriceChart() {
  const { elements } = ctx;
  const openAssets = ctx.openAssets();
  const assetId = elements.assetTrendSelect.value || openAssets[0]?.id || "";
  const asset = openAssets.find((item) => item.id === assetId);
  if (!asset) {
    elements.assetPriceChart.innerHTML = `<p class="empty-state">暂无资产。先到“资产”页录入一笔资产，再查看单资产历史价格曲线。</p>`;
    return;
  }
  const requestId = ++assetPriceChartRequestId;
  const fallbackSeries = buildHistorySeries(asset);
  renderAssetPriceChartSeries(asset, fallbackSeries, "fallback");
  loadDailyAssetPriceSeries(asset).then((series) => {
    if (requestId !== assetPriceChartRequestId || !series.length) return;
    renderAssetPriceChartSeries(asset, series, "daily");
  });
}

function renderAssetPriceChartSeries(asset, series, sourceKind) {
  const { elements } = ctx;
  const values = series.map((point) => BigInt(Math.round(point.close * 10000)));
  const min = values.reduce((current, value) => (value < current ? value : current), values[0]);
  const max = values.reduce((current, value) => (value > current ? value : current), values[0]);
  const range = max === min ? 1n : max - min;
  const width = 680;
  const height = 250;
  const pad = 24;
  const leftPad = 72;
  const rightPad = 20;
  const usableWidth = width - leftPad - rightPad;
  const usableHeight = height - pad * 2;
  const points = series.map((point, index) => {
    const scaled = BigInt(Math.round(point.close * 10000));
    const x = leftPad + (series.length === 1 ? 0 : (usableWidth * index) / (series.length - 1));
    const yRatio = Number(((scaled - min) * 10000n) / range) / 10000;
    const y = pad + usableHeight - yRatio * usableHeight;
    return { ...point, x, y, scaled };
  });
  const path = buildSmoothLinePath(points);
  const areaPath = buildSmoothAreaPath(points, height - pad, leftPad, width - rightPad);
  const latest = series.at(-1);
  const first = series[0];
  const change = latest.close - first.close;
  const universe = inferUniverse(asset);
  const sourceLabel = sourceKind === "daily" ? "每日价格快照" : universe?.label || "用户录入";

  elements.assetPriceChart.innerHTML = `
    <div class="trend-summary">
      <div>
        <span>最新${latest.type}</span>
        <strong>${latest.close.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}</strong>
      </div>
      <div>
        <span>三个月变化</span>
        <strong class="${ctx.toneClassForValue(change)}">${change >= 0 ? "+" : ""}${change.toFixed(4)}</strong>
      </div>
      <div>
        <span>数据来源</span>
        <strong>${escapeHtml(sourceLabel)}</strong>
      </div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(asset.name)}历史价格曲线">
      <line x1="${leftPad}" y1="${height - pad}" x2="${width - rightPad}" y2="${height - pad}" class="chart-axis"></line>
      <line x1="${leftPad}" y1="${pad}" x2="${leftPad}" y2="${height - pad}" class="chart-axis"></line>
      <text x="${leftPad - 8}" y="${pad + 4}" text-anchor="end">${escapeHtml(String(seriesMax(series)))}</text>
      <text x="${leftPad - 8}" y="${height - pad}" text-anchor="end">${escapeHtml(String(seriesMin(series)))}</text>
      <path d="${areaPath}" class="chart-area"></path>
      <path d="${path}" class="chart-line"></path>
      ${points
        .filter((_, index) => index === 0 || index === points.length - 1 || index % 16 === 0)
        .map((point) => `<text x="${point.x.toFixed(1)}" y="${height - 6}" text-anchor="middle">${escapeHtml(formatShortDate(point.date))}</text>`)
        .join("")}
    </svg>
  `;
}

async function loadDailyAssetPriceSeries(asset) {
  if (!ctx.marketApiBaseUrl || !asset.id) return [];
  try {
    const response = await fetch(`${ctx.marketApiBaseUrl}/api/asset-prices/daily?assetId=${encodeURIComponent(asset.id)}`);
    if (!response.ok) return [];
    const payload = await response.json();
    return (payload.points || [])
      .map((point) => ({
        date: point.priceDate,
        close: Number(point.closePrice),
        source: point.source,
        sourceFetchedAt: point.sourceFetchedAt,
        type: point.priceType === "unit_nav" ? "单位净值" : "日收盘价",
        priceBasis: point.priceBasis,
        carriedFromDate: point.carriedFromDate
      }))
      .filter((point) => point.date && Number.isFinite(point.close) && point.close > 0)
      .sort((left, right) => left.date.localeCompare(right.date));
  } catch {
    return [];
  }
}

function renderMarketSyncRow(result) {
  const after = result.after || {};
  const status = result.status === "synced" ? "已更新" : "缺缓存";
  const fetchedAt = after.sourceFetchedAt || after.syncedAt || result.sourceFetchedAt || result.syncedAt || "";
  const timeLabel = fetchedAt ? formatMonthDayTimeMinute(fetchedAt) : after.pricedAt || "-";
  const detail = result.status === "synced"
    ? `${after.currentPrice || "-"} · ${timeLabel} · ${after.priceSource || "-"}`
    : result.message || "未找到可用价格缓存";
  return `
    <article class="market-sync-row">
      <strong>${escapeHtml(result.name || result.symbol || "未知资产")}</strong>
      <span>${escapeHtml([result.symbol, status].filter(Boolean).join(" · "))}</span>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function seriesMax(series) {
  return Math.max(...series.map((point) => point.close)).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function seriesMin(series) {
  return Math.min(...series.map((point) => point.close)).toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}
