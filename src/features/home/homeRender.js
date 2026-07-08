import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { escapeHtml } from "../../utils/dom.js";
import { formatDate, todayIsoDate } from "../../utils/date.js";
import { trustBadge } from "../../ui/badges.js";
import { emptyActionState, emptyStateInner } from "../../ui/emptyState.js";
import {
  formatDisplayCurrency,
  formatDisplayCurrencyParts,
  formatOptionalSignedAmount,
  formatShare,
  formatSignedAmountOnly,
  formatSignedCurrency,
  toneClassForValue
} from "../../ui/formatters.js";

export function renderMetrics(elements, context) {
  const latestChange = context.calculateTrendValueChangeForRange("day");
  const hasAssets = context.overviewAssets().length > 0;
  const portfolio = context.calculateDisplayPortfolio(context.overviewAssets());
  const cumulativePnl = portfolio.totals.unrealizedPnlCents;
  elements.metrics.innerHTML = `
    <section class="portfolio-snapshot">
      <div class="snapshot-main">
        <div class="snapshot-heading">
          <span class="snapshot-card-title">核心资产总览</span>
          ${hasAssets ? "" : trustBadge("当前暂无资产")}
        </div>
        <div class="snapshot-balance-block">
          <span class="snapshot-label">当前总资产 <small>(Total Balance)</small></span>
          <strong>${escapeHtml(formatDisplayCurrency(context.currentOverviewTotalCents()))}</strong>
        </div>
        <div class="snapshot-inline-metrics">
          <span>
            <small>累计收益</small>
            <b class="${toneClassForValue(cumulativePnl)}">${escapeHtml(formatSignedCurrency(cumulativePnl))}</b>
          </span>
          <span>
            <small>最近变化</small>
            <b class="${toneClassForValue(latestChange || 0n)}">${escapeHtml(formatOptionalSignedAmount(latestChange))}</b>
          </span>
        </div>
        ${hasAssets ? "" : `
          <div class="home-empty-intro">
            <strong>当前暂无资产。</strong>
            <p>数据保存在本浏览器本地。</p>
          </div>
        `}
        <div class="snapshot-actions">
          <button class="secondary-button snapshot-action-button" data-home-action="add-asset" type="button">➕ ${hasAssets ? "记录一笔交易" : "添加第一笔资产"}</button>
          ${hasAssets ? `<button class="secondary-button snapshot-action-button" data-home-action="view-assets" type="button">🔍 查看全部资产</button>` : `<button class="secondary-button snapshot-action-button" data-home-action="load-demo" type="button">加载示例数据</button>`}
        </div>
      </div>
      <aside class="snapshot-status" aria-label="核心数据状态">
        <div class="snapshot-heading">
          <span class="snapshot-card-title">同步状态面板</span>
        </div>
        <div class="snapshot-status-list">
          ${snapshotStatusItem("本地保存", "已保存在当前浏览器", "positive")}
          ${snapshotStatusItem("数据上传", "数据未上传", "warning")}
          ${snapshotStatusItem("更新时间", context.latestOverviewUpdateLabel(), "")}
          ${snapshotStatusItem("价格核对", context.priceCompletenessLabel(), context.priceCompletenessClass())}
        </div>
      </aside>
    </section>
  `;
}

function snapshotStatusItem(label, value, className = "") {
  const tone = className === "positive" ? "positive" : className === "warning" || className === "negative" ? "warning" : "neutral";
  return `
    <div class="snapshot-status-item">
      <i class="snapshot-status-dot is-${tone}" aria-hidden="true"></i>
      <span>
        <small>${escapeHtml(label)}</small>
        <b>${escapeHtml(value)}</b>
      </span>
    </div>
  `;
}

export function renderHomeDashboard(elements, context) {
  renderHomeDataStatus(elements, context);
  renderHomeHoldings(elements, context);
  renderHomeTransactions(elements, context);
  renderHomeNotes(elements, context);
  renderHomeChecklist(elements, context);
}

export function renderHomeDataStatus(elements, context) {
  if (!elements.homeDataStatus) return;
  elements.homeDataStatus.innerHTML = [
    trustBadge(`上次更新：${context.latestOverviewUpdateLabel()}`),
    trustBadge(context.priceCompletenessLabel(), context.priceCompletenessClass()),
    trustBadge(context.fxRateSummary()),
    `<span class="home-risk-note">数据保存在本机浏览器，重要修改后建议导出备份。</span>`
  ].join("");
}

export function renderHomeHoldings(elements, context) {
  if (!elements.homeHoldingsList) return;
  const assets = context.overviewAssets();
  const { positions, totals } = context.calculateDisplayPortfolio(assets);
  const rows = [...positions]
    .sort((left, right) => Number(right.marketValueCents - left.marketValueCents))
    .slice(0, 5);
  if (!rows.length) {
    elements.homeHoldingsList.innerHTML = emptyActionState("暂无当前持仓", "", "添加第一笔资产", "add-asset");
    return;
  }
  elements.homeHoldingsList.innerHTML = `
    <div class="home-holdings-table-wrap">
      <table class="home-holdings-table">
        <thead>
          <tr>
            <th>资产</th>
            <th>账户 / 类别</th>
            <th>市值</th>
            <th>收益</th>
            <th>占比</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((position) => {
            const asset = assets.find((item) => item.id === position.id) || position;
            const pnlClass = position.hasCostBasis ? toneClassForValue(position.unrealizedPnlCents) : "";
            const weightBps = totals.marketValueCents === 0n ? 0n : roundDivide(position.marketValueCents * 10000n, totals.marketValueCents);
            return `
              <tr>
                <td>
                  <strong>${escapeHtml(position.name)}</strong>
                  <span>${escapeHtml([position.symbol, position.currency].filter(Boolean).join(" · "))}</span>
                </td>
                <td>
                  <strong>${escapeHtml(position.account || "-")}</strong>
                  <span>${escapeHtml(position.type || "-")}</span>
                </td>
                <td class="home-holdings-number home-market-value">${renderDisplayCurrencyAmount(position.marketValueCents)}</td>
                <td class="home-holdings-return">
                  <strong class="${pnlClass}">${position.hasCostBasis ? formatPercent(position.returnBps) : "成本缺失"}</strong>
                  <span class="${pnlClass}">${position.hasCostBasis ? formatSignedAmountOnly(position.unrealizedPnlCents) : "暂无法计算"}</span>
                </td>
                <td class="home-holdings-number">${formatShare(weightBps)}</td>
                <td class="home-holdings-status">${trustBadge(context.priceStatusLabel(asset), context.priceStatusClass(asset))}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDisplayCurrencyAmount(cents) {
  const { currency, amount } = formatDisplayCurrencyParts(cents);
  return `
    <span class="asset-money">
      <span class="asset-money-currency">${escapeHtml(currency)}</span>
      <span class="asset-money-amount">${escapeHtml(amount)}</span>
    </span>
  `;
}

export function renderHomeTransactions(elements, context) {
  if (!elements.homeTransactionsList) return;
  const rows = context.buildAssetChangeRecords().slice(0, 5);
  if (!rows.length) {
    elements.homeTransactionsList.innerHTML = emptyStateInner("暂无交易记录", "添加资产或记录买卖后，这里会显示最近 5 条资产变化。");
    return;
  }
  elements.homeTransactionsList.innerHTML = rows.map((change) => `
    <article class="home-list-row compact">
      <div>
        <strong>${escapeHtml(change.action)} · ${escapeHtml(change.asset.name)}</strong>
        <span>${escapeHtml(change.date || "-")} · ${escapeHtml(change.quantity || "-")} ${escapeHtml(change.asset.currency || "")}</span>
      </div>
      <div class="home-list-value">
        <strong>${formatDisplayCurrency(change.valueCents)}</strong>
        <span>费用 ${escapeHtml(change.fees || "0")}</span>
      </div>
    </article>
  `).join("");
}

export function renderHomeNotes(elements, context) {
  if (!elements.homeNotesList) return;
  const rows = [...context.state().notes]
    .sort((left, right) => String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || "")))
    .slice(0, 3);
  if (!rows.length) {
    elements.homeNotesList.innerHTML = emptyActionState("暂无复盘", "默认私有，不公开个人资产数据。", "写一条复盘", "write-note");
    return;
  }
  elements.homeNotesList.innerHTML = rows.map((note) => {
    const tags = context.noteTagsFor(note).slice(0, 2);
    return `
      <article class="home-list-row compact">
        <div>
          <strong>${escapeHtml(note.title || "未命名复盘")}</strong>
          <span>${escapeHtml(context.noteAssetLabel(note) || "未关联资产")} · ${escapeHtml(formatDate(note.updatedAt || note.createdAt || todayIsoDate()))}</span>
        </div>
        <div class="home-list-tags">
          ${tags.map((tag) => trustBadge(`# ${tag}`)).join("")}
        </div>
      </article>
    `;
  }).join("");
}

export function renderHomeChecklist(elements, context) {
  if (!elements.homeChecklist) return;
  const assets = context.overviewAssets();
  const priceMissing = assets.filter((asset) => asset.priceStatus === "pending" || !asset.pricedAt || !asset.priceSource).length;
  const accountMissing = assets.filter((asset) => !String(asset.account || "").trim()).length;
  const transactionCount = context.buildAssetChangeRecords().length;
  const reviewedChanges = context.buildAssetChangeRecords().filter((change) => context.findNoteForChange(change)).length;
  const unreviewedTransactions = Math.max(0, transactionCount - reviewedChanges);
  const items = [
    {
      label: priceMissing ? `${priceMissing} 个资产缺少可追踪价格` : "价格记录较完整",
      detail: priceMissing ? "会影响收益、配置和归因可信度。" : "价格来源和时间可追踪。",
      done: priceMissing === 0
    },
    {
      label: accountMissing ? `${accountMissing} 个资产未关联账户` : "资产已关联账户",
      detail: accountMissing ? "会影响账户维度筛选和对账。" : "账户维度完整。",
      done: accountMissing === 0
    },
    {
      label: unreviewedTransactions ? `${unreviewedTransactions} 条交易尚未关联复盘` : "交易复盘已覆盖",
      detail: unreviewedTransactions ? "会影响后续复盘追溯。" : "交易记录已有复盘线索。",
      done: unreviewedTransactions === 0
    },
    {
      label: "建议导出 JSON 备份",
      detail: "当前数据保存在浏览器本地，集中录入或导入后建议备份。",
      done: false
    }
  ];
  elements.homeChecklist.innerHTML = items.map((item) => `
    <div class="home-check-item${item.done ? " is-done" : ""}">
      <span aria-hidden="true">${item.done ? "✓" : "•"}</span>
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <small>${escapeHtml(item.detail)}</small>
      </div>
    </div>
  `).join("");
}
