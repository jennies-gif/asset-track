import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { escapeHtml } from "../../utils/dom.js";
import { formatDate, todayIsoDate } from "../../utils/date.js";
import { trustBadge, snapshotKpi, snapshotStatusRow } from "../../ui/badges.js";
import { emptyActionState, emptyStateInner } from "../../ui/emptyState.js";
import {
  formatDisplayCurrency,
  formatOptionalSignedAmount,
  formatShare,
  formatSignedAmountOnly,
  formatSignedCurrency,
  toneClassForValue
} from "../../ui/formatters.js";

export function renderMetrics(elements, context) {
  const cumulativeReturnBps = context.calculateCumulativeReturnBps();
  const latestChange = context.calculateTrendValueChangeForRange("day");
  const hasAssets = context.overviewAssets().length > 0;
  elements.metrics.innerHTML = `
    <section class="portfolio-snapshot">
      <div class="snapshot-main">
        <div class="snapshot-heading">
          <div>
            <span class="snapshot-label">资产总览</span>
            <h1>记录资产变化，回看收益来源和投资决策。</h1>
          </div>
          ${hasAssets ? "" : trustBadge("当前暂无资产")}
        </div>
        <span class="snapshot-label">当前总资产</span>
        <strong>${escapeHtml(formatDisplayCurrency(context.currentOverviewTotalCents()))}</strong>
        <div class="snapshot-kpis">
          ${snapshotKpi("累计收益", formatSignedCurrency(context.calculateDisplayPortfolio(context.overviewAssets()).totals.unrealizedPnlCents), toneClassForValue(context.calculateDisplayPortfolio(context.overviewAssets()).totals.unrealizedPnlCents))}
          ${snapshotKpi("收益率", formatPercent(cumulativeReturnBps), toneClassForValue(cumulativeReturnBps))}
          ${snapshotKpi("最近变化", formatOptionalSignedAmount(latestChange), toneClassForValue(latestChange || 0n))}
        </div>
        ${hasAssets ? "" : `
          <div class="home-empty-intro">
            <strong>当前暂无资产。</strong>
            <p>数据保存在本浏览器本地。</p>
          </div>
        `}
        <div class="snapshot-actions">
          <button class="primary-button" data-home-action="add-asset" type="button">${hasAssets ? "记录一笔交易" : "添加第一笔资产"}</button>
          ${hasAssets ? `<button class="secondary-button" data-home-action="view-assets" type="button">查看全部资产</button>` : `<button class="secondary-button" data-home-action="load-demo" type="button">加载示例数据</button>`}
        </div>
      </div>
      <aside class="snapshot-status" aria-label="核心数据状态">
        ${snapshotStatusRow("保存", "本地保存", "positive")}
        ${snapshotStatusRow("上传", "数据未上传", "")}
        ${snapshotStatusRow("更新", context.latestOverviewUpdateLabel(), "")}
        ${snapshotStatusRow("价格", context.priceCompletenessLabel(), context.priceCompletenessClass())}
        ${snapshotStatusRow("折算", context.fxRateSummary(), "")}
      </aside>
    </section>
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
  elements.homeHoldingsList.innerHTML = rows.map((position) => {
    const asset = assets.find((item) => item.id === position.id) || position;
    const pnlClass = position.hasCostBasis ? toneClassForValue(position.unrealizedPnlCents) : "";
    const weightBps = totals.marketValueCents === 0n ? 0n : roundDivide(position.marketValueCents * 10000n, totals.marketValueCents);
    return `
      <article class="home-list-row">
        <div>
          <strong>${escapeHtml(position.name)}</strong>
          <span>${escapeHtml([position.type, position.account].filter(Boolean).join(" · "))}</span>
        </div>
        <div class="home-list-value">
          <strong>${formatDisplayCurrency(position.marketValueCents)}</strong>
          <span class="${pnlClass}">${position.hasCostBasis ? `${formatSignedAmountOnly(position.unrealizedPnlCents)} / ${formatPercent(position.returnBps)}` : "成本缺失"}</span>
        </div>
        <div class="home-list-status">
          ${trustBadge(formatShare(weightBps))}
          ${trustBadge(context.priceStatusLabel(asset), context.priceStatusClass(asset))}
        </div>
      </article>
    `;
  }).join("");
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
