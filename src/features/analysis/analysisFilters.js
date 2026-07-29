import { reportingPresetBounds } from "../../domain/reportingRange.js";
import { todayIsoDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";

let ctx = {};
let analysisElements = {};
let analysisFilter = { account: "all", assetId: "all", range: "ytd", startDate: "", endDate: "" };

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
  const hasAsset = analysisFilter.assetId === "all" || accountAssets.some((asset) => asset.id === analysisFilter.assetId);
  if (!hasAsset) { analysisFilter = { ...analysisFilter, assetId: "all" }; ctx.setAnalysisFilter(analysisFilter); }

  analysisElements.analysisAssetFilter.innerHTML = [
    `<option value="all">全部资产</option>`,
    ...accountAssets.map((asset) => {
      const meta = [asset.symbol, asset.account].filter(Boolean).join(" · ");
      const label = meta ? `${asset.name}（${meta}）` : asset.name;
      return `<option value="${escapeHtml(asset.id)}">${escapeHtml(label)}</option>`;
    })
  ].join("");
  analysisElements.analysisAssetFilter.value = analysisFilter.assetId;
  if (analysisElements.analysisStart) analysisElements.analysisStart.value = analysisFilter.startDate || "";
  if (analysisElements.analysisEnd) analysisElements.analysisEnd.value = analysisFilter.endDate || "";
  document.querySelectorAll("[data-analysis-range-value]").forEach((button) => {
    const active = button.dataset.analysisRangeValue === (analysisFilter.range || "ytd");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (analysisElements.analysisRangeSummary) {
    const rangeLabel = analysisDateRangeLabel();
    analysisElements.analysisRangeSummary.textContent = `${rangeLabel}，当前纳入 ${accountAssets.length} 个持仓`;
  }
}

export function selectedAnalysisAssets() {
  syncAnalysisFilters();
  return analysisAssetsForFilter(analysisFilter);
}

export function analysisAssetsForFilter(filter = analysisFilter) {
  const assets = openAssets();
  const accountAssets = filter.account === "all"
    ? assets
    : assets.filter((asset) => asset.account === filter.account);
  if (filter.assetId === "all") return accountAssets;
  return accountAssets.filter((asset) => asset.id === filter.assetId);
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

function analysisDateRangeLabel() {
  const presetLabel = {
    "1": "近1月",
    "3": "近3月",
    ytd: "今年",
    all: "记录至今"
  }[analysisFilter.range];
  if (presetLabel) return `${presetLabel}（${analysisFilter.startDate} 至 ${analysisFilter.endDate}）`;
  if (!analysisFilter.startDate && !analysisFilter.endDate) return "累计全部持仓收益";
  if (analysisFilter.startDate && analysisFilter.endDate) {
    return `交易日期 ${analysisFilter.startDate} 至 ${analysisFilter.endDate}`;
  }
  if (analysisFilter.startDate) return `交易日期 ${analysisFilter.startDate} 之后`;
  return `交易日期 ${analysisFilter.endDate} 之前`;
}

export function analysisPresetBounds(range, end = todayIsoDate(), assets = []) {
  return reportingPresetBounds(range, { end, assets });
}
