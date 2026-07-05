import { categoryColors } from "../../constants/appConstants.js";
import { formatPercent, roundDivide } from "../../domain/calculations.js";
import { renderDonutChart } from "../../ui/charts.js";
import { emptyActionState, emptyStateInner } from "../../ui/emptyState.js";
import { formatDisplayCurrency, formatShare, toneClassForValue } from "../../ui/formatters.js";
import { escapeHtml } from "../../utils/dom.js";
import { inferAssetMarket, marketLabel } from "../assets/marketOptions.js";

let ctx = {};
let selectedOverviewBreakdown = { dimension: "type", key: "" };
let selectedAllocationView = "type";

export function configurePortfolioRender(context = {}) {
  ctx = { ...ctx, ...context };
}

export function setAllocationView(view) {
  selectedAllocationView = view || "type";
  selectedOverviewBreakdown = { dimension: selectedAllocationView, key: "" };
}

export function setOverviewBreakdown(selection = {}) {
  selectedOverviewBreakdown = {
    dimension: selection.dimension,
    key: selection.key || ""
  };
}

export function renderCategoryBreakdown() {
  const { elements } = ctx;
  if (!elements.categoryList || !elements.marketDistributionList) return;
  document.querySelectorAll(".allocation-tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.allocationView === selectedAllocationView);
  });
  const groups = allocationGroupsForView(selectedAllocationView);
  if (!groups.length) {
    elements.categoryList.innerHTML = emptyActionState("暂无资产配置", "添加股票、基金、现金等资产后，这里会按类别、市场、账户、币种和风险维度展示组合集中度。", "添加第一笔资产", "add-asset");
    elements.marketDistributionList.innerHTML = `<tr><td colspan="4" class="empty-table-cell">${emptyStateInner("暂无配置明细", "录入资产后，这里会列出各维度占比、市值和收益。")}</td></tr>`;
    return;
  }
  const hasSelectedGroup = groups.some((group) => group.key === selectedOverviewBreakdown.key);
  if (selectedOverviewBreakdown.dimension !== selectedAllocationView || !selectedOverviewBreakdown.key || !hasSelectedGroup) {
    selectedOverviewBreakdown = { dimension: selectedAllocationView, key: groups[0].key };
  }

  elements.categoryList.innerHTML = `
    ${renderCurrentValuationSource()}
    <div class="pie-wrap">
      ${renderDonutChart(groups, `${allocationViewLabel(selectedAllocationView)}占比图`)}
    </div>
  `;
  elements.marketDistributionList.innerHTML = groups
    .map((group, index) => {
      const color = categoryColors[index % categoryColors.length];
      const isActive = selectedOverviewBreakdown.dimension === selectedAllocationView && selectedOverviewBreakdown.key === group.key;
      return `
        <tr class="${isActive ? "is-active" : ""}" data-breakdown-dimension="${escapeHtml(selectedAllocationView)}" data-breakdown-key="${escapeHtml(group.key)}">
          <td><span class="allocation-name"><i class="legend-dot" style="background: ${color}"></i>${escapeHtml(group.label)}</span></td>
          <td>${formatShare(group.weightBps)}</td>
          <td>${formatDisplayCurrency(group.marketValueCents)}</td>
          <td class="${toneClassForValue(group.unrealizedPnlCents)}">${formatDisplayCurrency(group.unrealizedPnlCents)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderCurrentValuationSource() {
  return `
    <div class="chart-source-line compact">
      <span class="chart-source-badge positive">当前录入</span>
      <small>基于资产数量、当前价格/成本价兜底和汇率折算计算，不代表历史走势。</small>
    </div>
  `;
}

export function renderMarketDistribution() {
  renderCategoryBreakdown();
}

export function renderOverviewBreakdownDetail() {
  const { elements } = ctx;
  if (!elements.distributionDetail) return;
  const assets = selectedOverviewBreakdownAssets();
  if (!assets.length) {
    elements.distributionDetail.innerHTML = emptyStateInner("暂无分布详情", "选择一个资产类型、市场、账户、币种或风险维度后，这里会展示市值、未实现收益、收益率和 Top 持仓。");
    return;
  }

  const selectedAssets = ctx.overviewAssets();
  const totalValue = ctx.calculateDisplayPortfolio(selectedAssets).totals.marketValueCents || 1n;
  const { positions, totals } = ctx.calculateDisplayPortfolio(assets);
  const title = overviewBreakdownLabel();
  const weightBps = roundDivide(totals.marketValueCents * 10000n, totalValue);
  if (elements.distributionDetailTitle) {
    elements.distributionDetailTitle.innerHTML = `
      <span>${escapeHtml(title)}</span>
      <small>${formatShare(weightBps)} · ${positions.length} 个持仓 · ${formatDisplayCurrency(totals.marketValueCents)}</small>
    `;
  }
  const topPositions = [...positions].sort((left, right) => Number(right.marketValueCents - left.marketValueCents)).slice(0, 3);

  elements.distributionDetail.innerHTML = `
    <div class="mini-holdings">
      <div class="mini-holdings-head">
        <span>持仓</span>
        <span>市值</span>
        <span>收益</span>
      </div>
      ${topPositions
        .map((position) => {
          const pnlClass = position.hasCostBasis ? toneClassForValue(position.unrealizedPnlCents) : "";
          return `
            <div class="mini-holdings-row">
              <strong>${escapeHtml(position.name)}</strong>
              <span>${formatDisplayCurrency(position.marketValueCents)}</span>
              <span class="${pnlClass}">${position.hasCostBasis ? formatDisplayCurrency(position.unrealizedPnlCents) : "成本缺失"}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function selectedOverviewBreakdownAssets() {
  const assets = ctx.overviewAssets();
  if (selectedOverviewBreakdown.dimension === "market") {
    return assets.filter((asset) => inferAssetMarket(asset) === selectedOverviewBreakdown.key);
  }
  if (selectedOverviewBreakdown.dimension === "account") {
    return assets.filter((asset) => (asset.account || "未命名账户") === selectedOverviewBreakdown.key);
  }
  if (selectedOverviewBreakdown.dimension === "currency") {
    return assets.filter((asset) => (asset.currency || "未知币种") === selectedOverviewBreakdown.key);
  }
  if (selectedOverviewBreakdown.dimension === "risk") {
    return assets.filter((asset) => riskBucketForAsset(asset).key === selectedOverviewBreakdown.key);
  }
  return assets.filter((asset) => assetTypeKey(asset) === selectedOverviewBreakdown.key);
}

function overviewBreakdownLabel() {
  if (selectedOverviewBreakdown.dimension === "market") {
    return marketLabel(selectedOverviewBreakdown.key) || "市场详情";
  }
  if (selectedOverviewBreakdown.dimension === "account") return selectedOverviewBreakdown.key || "账户详情";
  if (selectedOverviewBreakdown.dimension === "currency") return selectedOverviewBreakdown.key || "币种详情";
  if (selectedOverviewBreakdown.dimension === "risk") return riskBucketLabel(selectedOverviewBreakdown.key);
  return selectedOverviewBreakdown.key || "分布详情";
}

function allocationGroupsForView(view) {
  const assets = ctx.overviewAssets();
  if (view === "market") return buildDisplayBreakdown(assets, (asset) => inferAssetMarket(asset), (key) => marketLabel(key) || "其他");
  if (view === "account") return buildDisplayBreakdown(assets, (asset) => asset.account || "未命名账户", (key) => key);
  if (view === "currency") return buildDisplayBreakdown(assets, (asset) => asset.currency || "未知币种", (key) => key);
  if (view === "risk") return buildDisplayBreakdown(assets, (asset) => riskBucketForAsset(asset).key, riskBucketLabel);
  return buildDisplayBreakdown(assets, assetTypeKey, (key) => key);
}

function allocationViewLabel(view) {
  return {
    type: "类别",
    market: "市场",
    account: "账户",
    currency: "币种",
    risk: "风险"
  }[view] || "类别";
}

function riskBucketForAsset(asset) {
  const market = inferAssetMarket(asset);
  const type = assetTypeKey(asset);
  if (market === "WEB3" || type === "数字资产") return { key: "high", label: "高波动" };
  if (market === "CASH" || type === "现金") return { key: "cash", label: "现金/低波动" };
  if (["股票", "ETF", "基金", "贵金属"].includes(type)) return { key: "market", label: "市场风险" };
  return { key: "other", label: "其他/待分类" };
}

function riskBucketLabel(key) {
  return {
    high: "高波动",
    cash: "现金/低波动",
    market: "市场风险",
    other: "其他/待分类"
  }[key] || key || "风险详情";
}

function buildDisplayBreakdown(assets, keySelector, labelSelector) {
  const totalValue = ctx.calculateDisplayPortfolio(assets).totals.marketValueCents || 1n;
  const groups = new Map();
  for (const asset of assets) {
    const key = String(keySelector(asset) || "其他").trim() || "其他";
    const current = groups.get(key) || { key, label: labelSelector(key) || key, assets: [] };
    current.assets.push(asset);
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((group) => {
      const { totals } = ctx.calculateDisplayPortfolio(group.assets);
      return {
        ...group,
        count: group.assets.length,
        marketValueCents: totals.marketValueCents,
        unrealizedPnlCents: totals.unrealizedPnlCents,
        returnBps: totals.returnBps,
        weightBps: roundDivide(totals.marketValueCents * 10000n, totalValue)
      };
    })
    .sort((left, right) => Number(right.marketValueCents - left.marketValueCents));
}

export function assetTypeKey(asset) {
  const explicitType = String(asset.type || "").trim();
  if (explicitType && explicitType !== "其他") return explicitType;
  if (asset.accountType === "cash" || inferAssetMarket(asset) === "CASH") return "现金";
  if (asset.accountType === "crypto") return "数字资产";
  if (asset.accountType === "fund" || inferAssetMarket(asset) === "FUND") return "基金";
  return explicitType || "其他";
}

export function renderAccounts() {
  const { elements } = ctx;
  if (!elements.accountList || !elements.accountSummary || !elements.accountTrendChart) return;
  const accounts = ctx.buildAccountSummaries();
  const selected = ctx.selectedAccountName();
  if (elements.accountSource) {
    elements.accountSource.textContent = selected === "all" ? "当前展示全部账户" : `当前展示：${selected}`;
  }
  if (elements.accountDetailTitle) {
    elements.accountDetailTitle.textContent = ctx.selectedAccountLabel();
  }

  const allAccount = accounts[0] || {
    name: "all",
    label: "全部账户",
    count: 0,
    totals: { marketValueCents: 0n }
  };
  const accountRows = accounts.filter((account) => account.name !== "all");
  const totalValue = allAccount.totals.marketValueCents || 1n;
  const pieAccounts = accountRows.map((account) => ({
    key: account.name,
    label: account.label,
    weightBps: roundDivide(account.totals.marketValueCents * 10000n, totalValue)
  }));

  elements.accountList.innerHTML = accountRows.length
    ? accountRows
    .map((account) => {
      const isActive = account.name === selected;
      const shareLabel = formatShare(roundDivide(account.totals.marketValueCents * 10000n, totalValue));
      return `
        <button class="account-card${isActive ? " is-active" : ""}" data-account-name="${escapeHtml(account.name)}" type="button">
          <strong>${escapeHtml(account.label)} ${escapeHtml(shareLabel)}</strong>
          <span>${formatDisplayCurrency(account.totals.marketValueCents)}</span>
        </button>
      `;
    })
    .join("")
    : `<p class="empty-state">暂无账户分布。先到“资产”页添加账户和资产，或导入 JSON 备份恢复已有记录。</p>`;

  const selectedAssets = ctx.selectedOpenAssets();
  const { positions } = ctx.calculateDisplayPortfolio(selectedAssets);
  elements.accountSummary.innerHTML = `
  `;
  elements.accountTrendChart.innerHTML = pieAccounts.length
    ? renderDonutChart(pieAccounts, "账户占比图")
    : `<p class="empty-state">暂无账户分布。先到“资产”页添加账户和资产，或导入 JSON 备份恢复已有记录。</p>`;
  if (elements.accountAssetRows) {
    elements.accountAssetRows.innerHTML = positions.length
    ? positions
        .map((position) => {
          const pnlClass = toneClassForValue(position.unrealizedPnlCents);
          return `
            <tr>
              <td>
                <strong>${escapeHtml(position.name)}</strong>
                <span>${escapeHtml([position.symbol, position.account].filter(Boolean).join(" · "))}</span>
              </td>
              <td>${escapeHtml(position.type)}</td>
              <td>${formatDisplayCurrency(position.marketValueCents)}</td>
              <td>
                <strong class="${pnlClass}">${position.hasCostBasis ? formatPercent(position.returnBps) : "成本缺失"}</strong>
                <span class="${pnlClass}">${position.hasCostBasis ? formatDisplayCurrency(position.unrealizedPnlCents) : "暂无法计算"}</span>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="4" class="empty-cell">该账户暂无当前持仓。可切换其他账户查看，或到“资产”页添加资产。</td></tr>`;
  }
}

export function allocationWeightBps(positions, totalValueCents, predicate) {
  if (!positions.length || totalValueCents === 0n) return 0n;
  const value = positions
    .filter(predicate)
    .reduce((total, position) => total + position.marketValueCents, 0n);
  return roundDivide(value * 10000n, totalValueCents);
}
