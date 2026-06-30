import { formatDate, normalizeSnapshotDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";

let ctx = {};
let analysisElements = {};
let analysisFilter = { account: "all", assetId: "all", startDate: "", endDate: "" };

export function configureAnalysisFilters(context = {}) {
  ctx = context;
  analysisElements = context.elements || {};
}

export function syncAnalysisFilters() {
  analysisFilter = ctx.getAnalysisFilter();
}

export function renderAnalysisFilters() {
  syncAnalysisFilters();
  if (!analysisElements.analysisAccountFilter || !analysisElements.analysisAssetFilter) return;
  const assets = openAssets();
  const accounts = buildAccountSummaries();
  const hasAccount = analysisFilter.account === "all" || accounts.some((account) => account.name === analysisFilter.account);
  if (!hasAccount) { analysisFilter = { ...analysisFilter, account: "all", assetId: "all" }; ctx.setAnalysisFilter(analysisFilter); }

  analysisElements.analysisAccountFilter.innerHTML = accounts
    .map((account) => `<option value="${escapeHtml(account.name)}">${escapeHtml(account.label)}</option>`)
    .join("");
  analysisElements.analysisAccountFilter.value = analysisFilter.account;

  const accountAssets = analysisFilter.account === "all"
    ? assets
    : assets.filter((asset) => asset.account === analysisFilter.account);
  const dateAssets = accountAssets.filter(assetMatchesAnalysisDateRange);
  const hasAsset = analysisFilter.assetId === "all" || dateAssets.some((asset) => asset.id === analysisFilter.assetId);
  if (!hasAsset) { analysisFilter = { ...analysisFilter, assetId: "all" }; ctx.setAnalysisFilter(analysisFilter); }

  analysisElements.analysisAssetFilter.innerHTML = [
    `<option value="all">全部资产</option>`,
    ...dateAssets.map((asset) => {
      const meta = [asset.symbol, asset.account].filter(Boolean).join(" · ");
      const label = meta ? `${asset.name}（${meta}）` : asset.name;
      return `<option value="${escapeHtml(asset.id)}">${escapeHtml(label)}</option>`;
    })
  ].join("");
  analysisElements.analysisAssetFilter.value = analysisFilter.assetId;
  if (analysisElements.analysisStart) analysisElements.analysisStart.value = analysisFilter.startDate || "";
  if (analysisElements.analysisEnd) analysisElements.analysisEnd.value = analysisFilter.endDate || "";
  if (analysisElements.analysisRangeSummary) {
    const rangeLabel = analysisDateRangeLabel();
    analysisElements.analysisRangeSummary.textContent = `${rangeLabel}，当前纳入 ${dateAssets.length}/${accountAssets.length} 个持仓`;
  }
}

export function selectedAnalysisAssets() {
  syncAnalysisFilters();
  const assets = openAssets();
  const accountAssets = analysisFilter.account === "all"
    ? assets
    : assets.filter((asset) => asset.account === analysisFilter.account);
  const dateAssets = accountAssets.filter(assetMatchesAnalysisDateRange);
  if (analysisFilter.assetId === "all") return dateAssets;
  return dateAssets.filter((asset) => asset.id === analysisFilter.assetId);
}

export function analysisScopeLabel() {
  syncAnalysisFilters();
  const accountLabel = analysisFilter.account === "all" ? "全部账户" : analysisFilter.account;
  if (analysisFilter.assetId === "all") return accountLabel;
  const asset = openAssets().find((item) => item.id === analysisFilter.assetId);
  return asset ? `${accountLabel} · ${asset.name}` : accountLabel;
}

function openAssets() { return ctx.openAssets(); }
function buildAccountSummaries() { return ctx.buildAccountSummaries(); }

function assetMatchesAnalysisDateRange(asset) {
  const date = assetAnalysisDate(asset);
  if (!date) return true;
  if (analysisFilter.startDate && date < analysisFilter.startDate) return false;
  if (analysisFilter.endDate && date > analysisFilter.endDate) return false;
  return true;
}

function assetAnalysisDate(asset) {
  return normalizeSnapshotDate(asset.purchaseDate || asset.buyDate || asset.acquiredAt || formatDate(asset.updatedAt) || "");
}

function analysisDateRangeLabel() {
  if (!analysisFilter.startDate && !analysisFilter.endDate) return "累计全部持仓收益";
  if (analysisFilter.startDate && analysisFilter.endDate) {
    return `交易日期 ${analysisFilter.startDate} 至 ${analysisFilter.endDate}`;
  }
  if (analysisFilter.startDate) return `交易日期 ${analysisFilter.startDate} 之后`;
  return `交易日期 ${analysisFilter.endDate} 之前`;
}
