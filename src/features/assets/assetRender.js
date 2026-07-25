import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { priceUsesCostFallback, resolvePriceStatus } from "../../domain/priceStatus.js";
import { marketPriceDisplayKind } from "../../domain/marketPriceSemantics.js";
import { escapeHtml } from "../../utils/dom.js";
import { formatShortDate } from "../../utils/date.js";
import { emptyStateInner } from "../../ui/emptyState.js";
import {
  displayCurrencyCode,
  formatDisplayCurrency,
  formatDisplayCurrencyParts,
  formatMonthDayTimeMinute,
  formatShare,
  formatSignedAmountOnly,
  formatUnitPrice,
  toneClassForValue
} from "../../ui/formatters.js";
import { buildAssetValuationNotices } from "./dataQuality.js";
import { marketLabel } from "./marketOptions.js";
import { buildAssetChangeRecords, latestSellPrice } from "./assetTransactions.js";
import { formatHoldingDays } from "./assetForm.js";

let ctx = {};

export function configureAssetRender(context) {
  ctx = context;
}

export function renderPortfolioFilters(openAssets) {
  if (!ctx.elements.portfolioAccountFilter || !ctx.elements.portfolioTypeFilter) return;
  const accounts = uniqueSorted(openAssets.map((asset) => asset.account).filter(Boolean));
  const types = uniqueSorted(openAssets.map((asset) => asset.type).filter(Boolean));
  let portfolioFilter = ctx.getPortfolioFilter();
  if (portfolioFilter.account !== "all" && !accounts.includes(portfolioFilter.account)) {
    portfolioFilter = { ...portfolioFilter, account: "all" };
  }
  if (portfolioFilter.type !== "all" && !types.includes(portfolioFilter.type)) {
    portfolioFilter = { ...portfolioFilter, type: "all" };
  }
  ctx.setPortfolioFilter(portfolioFilter);

  ctx.elements.portfolioAccountFilter.innerHTML = [
    `<option value="all">全部账户</option>`,
    ...accounts.map((account) => `<option value="${escapeHtml(account)}">${escapeHtml(account)}</option>`)
  ].join("");
  ctx.elements.portfolioAccountFilter.value = portfolioFilter.account;

  ctx.elements.portfolioTypeFilter.innerHTML = [
    `<option value="all">全部类型</option>`,
    ...types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
  ].join("");
  ctx.elements.portfolioTypeFilter.value = portfolioFilter.type;
}

function uniqueSorted(items) {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function assetMatchesPortfolioFilter(asset) {
  const portfolioFilter = ctx.getPortfolioFilter();
  if (portfolioFilter.account !== "all" && asset.account !== portfolioFilter.account) return false;
  if (portfolioFilter.type !== "all" && asset.type !== portfolioFilter.type) return false;
  return true;
}

function portfolioFilterLabel() {
  const portfolioFilter = ctx.getPortfolioFilter();
  const labels = [];
  if (portfolioFilter.account !== "all") labels.push(`账户：${portfolioFilter.account}`);
  if (portfolioFilter.type !== "all") labels.push(`类型：${portfolioFilter.type}`);
  return labels.join("，");
}

export function renderPortfolio() {
  const state = ctx.getState();
  const openAssets = state.assets.filter((asset) => !asset.closed);
  const closedAssets = state.assets.filter((asset) => asset.closed);
  renderPortfolioFilters(openAssets);
  const { positions, totals } = ctx.calculateDisplayPortfolio(openAssets);
  const visiblePositions = positions.filter((position) => {
    const asset = openAssets.find((item) => item.id === position.id) || position;
    return assetMatchesPortfolioFilter(asset);
  });
  if (ctx.elements.portfolioFilterSummary) {
    const filterText = portfolioFilterLabel();
    ctx.elements.portfolioFilterSummary.textContent = filterText
      ? `当前显示 ${visiblePositions.length}/${positions.length} 个持仓，${filterText}`
      : `当前显示全部 ${positions.length} 个持仓`;
  }
  ctx.elements.marketValueHeading.textContent = `市值 ${displayCurrencyCode()}`;
  renderCurrentPriceHeadings(openAssets, closedAssets);
  ctx.elements.portfolioRows.innerHTML = visiblePositions.length
    ? visiblePositions
    .map((position) => {
      const asset = openAssets.find((item) => item.id === position.id) || position;
      const isCash = resolvePriceStatus(asset).key === "cash";
      const pnlClass = position.hasCostBasis ? toneClassForValue(position.unrealizedPnlCents) : "";
      const weightBps = totals.marketValueCents === 0n ? 0n : roundDivide(position.marketValueCents * 10000n, totals.marketValueCents);
      return `
        <tr data-asset-row-id="${escapeHtml(asset.id)}">
          <td>
            <strong>${escapeHtml(position.name)}</strong>
            <span>${escapeHtml([position.symbol, position.currency].filter(Boolean).join(" · "))}</span>
          </td>
          <td>${escapeHtml(position.account)}</td>
          <td>${escapeHtml([position.type, marketLabel(position.market)].filter(Boolean).join(" / "))}</td>
          <td>
            <div class="price-cell cost-price-cell">
              <span>${isCash ? "—" : escapeHtml(formatUnitPrice(asset.costPrice, asset.currency, "未填写"))}</span>
            </div>
          </td>
          <td>${renderPriceCell(asset)}</td>
          <td>${escapeHtml(formatHoldingDays(asset))}</td>
          <td class="asset-market-value-cell">${renderDisplayCurrencyAmount(position.marketValueCents)}</td>
          <td>
            ${isCash
              ? `<div class="return-cell"><strong>—</strong><span>现金无价格收益</span></div>`
              : `<div class="return-cell">
                  <strong class="${pnlClass}">${position.hasCostBasis ? formatPercent(position.returnBps) : "成本缺失"}</strong>
                  <span class="${pnlClass}">${position.hasCostBasis ? formatSignedAmountOnly(position.unrealizedPnlCents) : "暂无法计算"}</span>
                </div>`}
          </td>
          <td>${formatShare(weightBps)}</td>
          <td>
            <div class="row-actions">
              ${renderRowActions(position.id)}
            </div>
          </td>
        </tr>
      `;
    })
    .join("")
    : `<tr><td colspan="10" class="empty-table-cell">${
        positions.length
          ? emptyStateInner("当前筛选下暂无持仓", "请调整账户或类型筛选，或新增一笔资产记录。")
          : emptyStateInner("暂无当前持仓", "添加第一笔资产后，这里会展示账户、成本价、当前价、市值、收益、占比和价格状态。")
      }</td></tr>`;

  ctx.elements.historyRows.innerHTML = closedAssets.length
    ? closedAssets.map((asset) => renderClosedAssetRow(asset)).join("")
    : `<tr><td colspan="7" class="empty-table-cell">${emptyStateInner("暂无历史持仓", "对当前持仓执行卖出或清仓后，这里会保留退出价格、实现收益和关联复盘。")}</td></tr>`;
  renderAssetChangeRows();
}

export function renderAssetChangeRows() {
  if (!ctx.elements.assetChangeRows) return;
  const changes = buildAssetChangeRecords().slice(0, 8);

  ctx.elements.assetChangeRows.innerHTML = changes.length
    ? changes
        .map((change) => {
          const note = ctx.findNoteForChange(change);
          return `
            <tr data-change-id="${escapeHtml(change.id)}">
              <td><strong>${escapeHtml(change.asset.name)}</strong></td>
              <td>${escapeHtml(change.action)}</td>
              <td>${escapeHtml(change.date || "-")}</td>
              <td>${escapeHtml(change.quantity || "-")}</td>
              <td>${escapeHtml(formatUnitPrice(change.changePrice, change.asset.currency))}</td>
              <td>${escapeHtml(formatUnitPrice(change.currentPrice, change.asset.currency))}</td>
              <td>${formatDisplayCurrency(change.valueCents)}</td>
              <td>${escapeHtml(change.fees || "0")}</td>
              <td>
                ${
                  note
                    ? `<button class="text-button" data-open-change-note-id="${escapeHtml(note.id)}" type="button">查看关联复盘</button>`
                    : `<button class="text-button" data-write-change-note-id="${escapeHtml(change.id)}" type="button">写复盘</button>`
                }
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9" class="empty-table-cell">${emptyStateInner("暂无交易记录", "记录买入、卖出或清仓后，你可以在这里回看每一次决策，并关联复盘。")}</td></tr>`;
}

function renderPriceCell(asset) {
  const status = resolvePriceStatus(asset);
  if (status.key === "cash") {
    return `
      <div class="price-cell is-cash" title="现金按原币余额估值；外币折算汇率可在设置中调整。">
        <span>—</span>
        <small class="data-ok">现金按余额</small>
      </div>
    `;
  }
  const attention = buildAssetValuationNotices(asset)[0];
  const shortMeta = attention ? attentionPriceMeta(asset, attention) : shortPriceMeta(asset, status);
  const detail = priceDetailTitle(asset, status);
  return `
    <div class="price-cell" title="${escapeHtml(detail)}">
      <span>${escapeHtml(formatUnitPrice(asset.currentPrice || asset.costPrice, asset.currency, "待补价格"))}</span>
      <small class="${escapeHtml(attention ? attention.severity === "danger" ? "data-error" : "data-warning" : status.className)}">
        ${attention ? `<i class="price-attention-dot" aria-hidden="true"></i>` : ""}
        ${escapeHtml(shortMeta)}
      </small>
    </div>
  `;
}

function attentionPriceMeta(asset, notice) {
  const date = asset.pricedAt ? formatShortDate(asset.pricedAt) : "";
  return [notice.label, date].filter(Boolean).join(" · ");
}

function renderDisplayCurrencyAmount(cents) {
  const { currency, amount } = formatDisplayCurrencyParts(cents);
  return `
    <span class="asset-value-stack">
      <span class="asset-money">
        <span class="asset-money-currency">${escapeHtml(currency)}</span>
        <span class="asset-money-amount">${escapeHtml(amount)}</span>
      </span>
    </span>
  `;
}

function shortPriceMeta(asset, status) {
  const date = asset.priceKind === "latest" && asset.priceAt
    ? formatMonthDayTimeMinute(asset.priceAt)
    : asset.pricedAt
      ? formatShortDate(asset.pricedAt)
      : "";
  const label = status.key === "synced" ? marketPriceDisplayKind(asset) : shortPriceStatusLabel(asset, status);
  return [date, label].filter(Boolean).join(" · ") || label;
}

function shortPriceStatusLabel(asset, status) {
  if (priceUsesCostFallback(asset)) return "待同步";
  return {
    synced: "同步",
    manual: "手动",
    pending: "待同步",
    stale: "过期",
    missing: "缺缓存",
    error: "失败"
  }[status.key] || status.label;
}

function priceDetailTitle(asset, status) {
  const source = asset.priceSource || (priceUsesCostFallback(asset) ? "成本价兜底" : "");
  return [
    `状态：${status.label}`,
    asset.pricedAt ? `价格日期：${asset.pricedAt}` : "",
    asset.priceAt ? `价格时点：${formatMonthDayTimeMinute(asset.priceAt)}${asset.marketTimezone ? `（${asset.marketTimezone}）` : ""}` : "",
    source ? `来源：${source}` : "",
    asset.sourceFetchedAt ? `抓取时间：${formatMonthDayTimeMinute(asset.sourceFetchedAt)}` : "",
    asset.updatedAt ? `检查时间：${formatMonthDayTimeMinute(asset.updatedAt)}` : "",
    asset.priceError ? `原因：${asset.priceError}` : ""
  ].filter(Boolean).join("\n");
}

function renderCurrentPriceHeadings(openAssets, closedAssets) {
  const openHeadingHtml = renderCurrentPriceHeading(openAssets);
  const historyHeadingHtml = renderCurrentPriceHeading(closedAssets);
  if (ctx.elements.portfolioCurrentPriceHeading) ctx.elements.portfolioCurrentPriceHeading.innerHTML = openHeadingHtml;
  if (ctx.elements.historyCurrentPriceHeading) ctx.elements.historyCurrentPriceHeading.innerHTML = historyHeadingHtml;
  if (ctx.elements.changesCurrentPriceHeading) ctx.elements.changesCurrentPriceHeading.innerHTML = openHeadingHtml;
}

function renderCurrentPriceHeading(assets) {
  return "当前价";
}

function renderRowActions(assetId) {
  return `
    <button class="row-action-link" data-asset-id="${escapeHtml(assetId)}" data-transaction-action="buy" type="button">买入</button>
    <span class="row-action-separator" aria-hidden="true">|</span>
    <button class="row-action-link" data-asset-id="${escapeHtml(assetId)}" data-transaction-action="sell" type="button">卖出</button>
    <span class="row-action-separator" aria-hidden="true">|</span>
    <button class="row-action-link" data-asset-id="${escapeHtml(assetId)}" data-transaction-action="close" type="button">清仓</button>
    <span class="row-action-separator" aria-hidden="true">|</span>
    <button class="row-action-link" data-edit-asset-id="${escapeHtml(assetId)}" type="button">编辑</button>
    <span class="row-action-separator" aria-hidden="true">|</span>
    <details class="row-more-menu">
      <summary aria-label="更多资产操作" title="更多资产操作">⋯</summary>
      <div class="row-more-panel" aria-label="资产操作">
        <button class="row-menu-danger" data-delete-asset-id="${escapeHtml(assetId)}" type="button">删除资产</button>
      </div>
    </details>
  `;
}

function renderClosedAssetRow(asset) {
  const display = ctx.calculateDisplayPortfolio([asset]).positions[0];
  const closeValueCents =
    asset.grossProceedsCents !== undefined ? ctx.convertUsdToDisplay(BigInt(asset.grossProceedsCents || "0")) : display.marketValueCents;
  const realizedPnlCents =
    asset.realizedPnlCents !== undefined ? ctx.convertUsdToDisplay(BigInt(asset.realizedPnlCents || "0")) : display.unrealizedPnlCents;
  const pnlClass = toneClassForValue(realizedPnlCents);
  const realizedPercent = asset.realizedPnlCents !== undefined ? "" : formatPercent(display.returnBps);
  const reviewNote = ctx.findReviewNote(asset);
  return `
    <tr data-asset-row-id="${escapeHtml(asset.id)}">
      <td>
        <strong>${escapeHtml(asset.name)}</strong>
        <span>${escapeHtml([asset.symbol, marketLabel(asset.market), asset.type, asset.currency].filter(Boolean).join(" · "))}</span>
      </td>
      <td>${escapeHtml(asset.account)}</td>
      <td>${escapeHtml(formatUnitPrice(asset.closePrice || latestSellPrice(asset) || asset.currentPrice, asset.currency))}</td>
      <td>${escapeHtml(formatUnitPrice(asset.currentPrice || asset.closePrice || latestSellPrice(asset), asset.currency))}</td>
      <td>${formatDisplayCurrency(closeValueCents)}</td>
      <td>
        <strong class="${pnlClass}">${realizedPercent || formatDisplayCurrency(realizedPnlCents)}</strong>
        ${realizedPercent ? `<span class="${pnlClass}">${formatDisplayCurrency(realizedPnlCents)}</span>` : ""}
      </td>
      <td>
        ${
          reviewNote
            ? `<button class="text-button" data-open-review-asset-id="${escapeHtml(asset.id)}" type="button">查看复盘</button>`
            : `<button class="text-button" data-write-review-asset-id="${escapeHtml(asset.id)}" type="button">写复盘</button>`
        }
      </td>
    </tr>
  `;
}
