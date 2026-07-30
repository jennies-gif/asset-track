import { reportingPresetBounds } from "../../domain/reportingRange.js";
import { todayIsoDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import { inferAssetMarket, marketLabel } from "../assets/marketOptions.js";

let ctx = {};
let analysisElements = {};
let analysisFilter = { account: "all", market: "all", range: "ytd", startDate: "", endDate: "" };

export function configureAnalysisFilters(context = {}) {
  ctx = context;
  analysisElements = context.elements || {};
}

export function syncAnalysisFilters() {
  analysisFilter = ctx.getAnalysisFilter();
}

export function renderAnalysisFilters() {
  syncAnalysisFilters();
  if (!analysisElements.analysisAccountFilter || !analysisElements.analysisMarketFilter) return;
  const assets = openAssets();
  const accounts = buildAccountSummaries();
  const hasAccount = analysisFilter.account === "all" || accounts.some((account) => account.name === analysisFilter.account);
  if (!hasAccount) {
    analysisFilter = { ...analysisFilter, account: "all", market: "all" };
    ctx.setAnalysisFilter(analysisFilter);
  }

  analysisElements.analysisAccountFilter.innerHTML = accounts
    .map((account) => `<option value="${escapeHtml(account.name)}">${escapeHtml(account.label)}</option>`)
    .join("");
  analysisElements.analysisAccountFilter.value = analysisFilter.account;

  const accountAssets = analysisFilter.account === "all"
    ? assets
    : assets.filter((asset) => asset.account === analysisFilter.account);
  const markets = [...new Set(accountAssets.map(inferAssetMarket))].sort((left, right) =>
    marketLabel(left).localeCompare(marketLabel(right), "zh-CN")
  );
  const hasMarket = analysisFilter.market === "all" || markets.includes(analysisFilter.market);
  if (!hasMarket) {
    analysisFilter = { ...analysisFilter, market: "all" };
    ctx.setAnalysisFilter(analysisFilter);
  }
  analysisElements.analysisMarketFilter.innerHTML = [
    `<option value="all">全部市场</option>`,
    ...markets.map((market) => `<option value="${escapeHtml(market)}">${escapeHtml(marketLabel(market))}</option>`)
  ].join("");
  analysisElements.analysisMarketFilter.value = analysisFilter.market;
  if (analysisElements.analysisMarketFilterField) {
    const shouldShowMarketFilter = markets.length > 1;
    analysisElements.analysisMarketFilterField.classList.toggle("is-hidden", !shouldShowMarketFilter);
    analysisElements.analysisMarketFilterField.hidden = !shouldShowMarketFilter;
  }
  if (analysisElements.analysisStart) analysisElements.analysisStart.value = analysisFilter.startDate || "";
  if (analysisElements.analysisEnd) analysisElements.analysisEnd.value = analysisFilter.endDate || "";
  document.querySelectorAll("[data-analysis-range-value]").forEach((button) => {
    const active = button.dataset.analysisRangeValue === (analysisFilter.range || "ytd");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (analysisElements.analysisRangeSummary) {
    const rangeLabel = analysisDateRangeLabel();
    analysisElements.analysisRangeSummary.textContent = `${rangeLabel}，当前纳入 ${analysisAssetsForFilter(analysisFilter).length} 个持仓`;
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
  if (!filter.market || filter.market === "all") return accountAssets;
  return accountAssets.filter((asset) => inferAssetMarket(asset) === filter.market);
}

export function analysisScopeLabel() {
  syncAnalysisFilters();
  const accountLabel = analysisFilter.account === "all" ? "全部账户" : analysisFilter.account;
  if (!analysisFilter.market || analysisFilter.market === "all") return accountLabel;
  return `${accountLabel} · ${marketLabel(analysisFilter.market)}`;
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
