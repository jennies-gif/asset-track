import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { escapeHtml } from "../../utils/dom.js";
import { trustBadge } from "../../ui/badges.js";
import { emptyStateInner } from "../../ui/emptyState.js";
import {
  displayCurrencySymbol,
  formatDisplayCurrency,
  formatMonthDayTimeMinute,
  formatShare,
  formatSignedAmountOnly,
  toneClassForValue
} from "../../ui/formatters.js";
import { buildAssetDataIssues } from "./dataQuality.js";
import { marketLabel } from "./marketOptions.js";
import { buildAssetChangeRecords, latestSellPrice } from "./assetTransactions.js";
import { formatHoldingDays } from "./assetForm.js";

let ctx = {};

export function configureAssetRender(context) {
  ctx = context;
}

export function priceStatusLabel(asset) {
  if (asset.priceStatus === "synced") return "同步价格";
  if (asset.priceStatus === "pending") return "按成本价暂估";
  if (!asset.currentPrice || asset.currentPrice === asset.costPrice) return "手动价格";
  return "手动价格";
}

export function priceStatusClass(asset) {
  if (asset.priceStatus === "synced") return "positive";
  if (asset.priceStatus === "pending") return "warning";
  return "";
}

export function renderPortfolioFilters(openAssets) {
  if (!ctx.elements.portfolioAccountFilter || !ctx.elements.portfolioTypeFilter || !ctx.elements.portfolioStatusFilter) return;
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
  ctx.elements.portfolioStatusFilter.value = portfolioFilter.status;
}

function uniqueSorted(items) {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function assetMatchesPortfolioFilter(asset) {
  const portfolioFilter = ctx.getPortfolioFilter();
  if (portfolioFilter.account !== "all" && asset.account !== portfolioFilter.account) return false;
  if (portfolioFilter.type !== "all" && asset.type !== portfolioFilter.type) return false;
  if (portfolioFilter.status === "all") return true;
  const hasIssues = buildAssetDataIssues(asset).length > 0;
  if (portfolioFilter.status === "needs-review") return hasIssues;
  if (portfolioFilter.status === "complete") return !hasIssues;
  return true;
}

function portfolioFilterLabel() {
  const portfolioFilter = ctx.getPortfolioFilter();
  const labels = [];
  if (portfolioFilter.account !== "all") labels.push(`账户：${portfolioFilter.account}`);
  if (portfolioFilter.type !== "all") labels.push(`类型：${portfolioFilter.type}`);
  if (portfolioFilter.status === "needs-review") labels.push("数据状态：待核对");
  if (portfolioFilter.status === "complete") labels.push("数据状态：关键数据完整");
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
  ctx.elements.marketValueHeading.textContent = `市值 ${displayCurrencySymbol()}`;
  renderCurrentPriceHeadings(openAssets, closedAssets);
  ctx.elements.portfolioRows.innerHTML = visiblePositions.length
    ? visiblePositions
    .map((position) => {
      const asset = openAssets.find((item) => item.id === position.id) || position;
      const pnlClass = toneClassForValue(position.unrealizedPnlCents);
      const weightBps = totals.marketValueCents === 0n ? 0n : roundDivide(position.marketValueCents * 10000n, totals.marketValueCents);
      return `
        <tr data-asset-row-id="${escapeHtml(asset.id)}">
          <td>
            <strong>${escapeHtml(position.name)}</strong>
            <span>${escapeHtml([position.symbol, position.currency].filter(Boolean).join(" · "))}</span>
          </td>
          <td>${escapeHtml(position.account)}</td>
          <td>${escapeHtml([position.type, marketLabel(position.market)].filter(Boolean).join(" / "))}</td>
          <td>${escapeHtml(formatUnitPrice(asset.costPrice, asset.currency))}</td>
          <td>${renderPriceCell(asset)}</td>
          <td>${escapeHtml(formatHoldingDays(asset))}</td>
          <td>${formatDisplayCurrency(position.marketValueCents)}</td>
          <td>
            <div class="return-cell">
              <strong class="${pnlClass}">${formatPercent(position.returnBps)}</strong>
              <span class="${pnlClass}">${formatSignedAmountOnly(position.unrealizedPnlCents)}</span>
            </div>
          </td>
          <td>${formatShare(weightBps)}</td>
          <td>${renderDataStatus(asset)}</td>
          <td>
            <div class="row-actions">
              ${renderTransactionMenu(position.id)}
              <details class="row-more-menu">
                <summary aria-label="更多操作">···</summary>
                <button data-edit-asset-id="${position.id}" type="button">编辑资产</button>
              </details>
            </div>
          </td>
        </tr>
      `;
    })
    .join("")
    : `<tr><td colspan="11" class="empty-table-cell">${
        positions.length
          ? emptyStateInner("当前筛选下暂无持仓", "请调整账户、类型或数据状态筛选，或新增一笔资产记录。")
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
  return `
    <div class="price-cell">
      <span>${escapeHtml(formatUnitPrice(asset.currentPrice || asset.costPrice, asset.currency))}</span>
    </div>
  `;
}

function renderCurrentPriceHeadings(openAssets, closedAssets) {
  const openHeadingHtml = renderCurrentPriceHeading(openAssets);
  const historyHeadingHtml = renderCurrentPriceHeading(closedAssets);
  if (ctx.elements.portfolioCurrentPriceHeading) ctx.elements.portfolioCurrentPriceHeading.innerHTML = openHeadingHtml;
  if (ctx.elements.historyCurrentPriceHeading) ctx.elements.historyCurrentPriceHeading.innerHTML = historyHeadingHtml;
  if (ctx.elements.changesCurrentPriceHeading) ctx.elements.changesCurrentPriceHeading.innerHTML = openHeadingHtml;
}

function renderCurrentPriceHeading(assets) {
  const latestLabel = latestPriceUpdateLabel(assets);
  return `当前价${latestLabel ? `<small class="column-sync-time">最新同步 ${escapeHtml(latestLabel)}</small>` : ""}`;
}

function latestPriceUpdateLabel(assets) {
  const latest = assets
    .flatMap((asset) => [asset.updatedAt, asset.pricedAt])
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => right - left)[0];
  return latest ? formatMonthDayTimeMinute(new Date(latest).toISOString()) : "";
}

function renderTransactionMenu(assetId) {
  const actions = [
    ["buy", "买入", false],
    ["sell", "卖出", false],
    ["dividend", "分红", true],
    ["transfer-in", "转入", true],
    ["transfer-out", "转出", true],
    ["adjust-cost", "调整成本", true],
    ["close", "清仓", false]
  ];
  return `
    <details class="transaction-menu">
      <summary>记录交易</summary>
      <div class="transaction-menu-panel">
        ${actions.map(([action, label, disabled]) => `
          <button data-asset-id="${escapeHtml(assetId)}" data-transaction-action="${escapeHtml(action)}" ${disabled ? "disabled aria-disabled=\"true\" title=\"后续支持\"" : ""} type="button">
            ${escapeHtml(disabled ? `${label}（后续支持）` : label)}
          </button>
        `).join("")}
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

export function formatUnitPrice(price, currency = "") {
  const value = String(price || "").trim();
  return value ? `${value} ${currency || ""}`.trim() : "-";
}

function renderDataStatus(asset) {
  const issues = buildAssetDataIssues(asset);
  if (!issues.length) return `<div class="status-stack">${trustBadge(priceStatusLabel(asset), priceStatusClass(asset))}<span class="status-pill good">完整</span></div>`;
  return `
    <div class="status-stack">
      ${trustBadge(priceStatusLabel(asset), priceStatusClass(asset))}
      ${issues.slice(0, 2).map((issue) => `<span class="status-pill ${issue.severity === "high" ? "warning" : ""}">${escapeHtml(issue.label)}</span>`).join("")}
      ${issues.length > 2 ? `<small>另 ${issues.length - 2} 项待补全</small>` : ""}
    </div>
  `;
}
