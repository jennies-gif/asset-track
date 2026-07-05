import {
  configureAppState,
  getAnalysisFilter,
  getAnalysisReturnMetric,
  getBenchmarkPerformanceState,
  getMarketSyncState,
  getPortfolioFilter,
  getState,
  loadDemoState,
  persistAndRender,
  saveCurrentState,
  setAnalysisFilter,
  setAnalysisReturnMetric,
  setBenchmarkPerformanceState,
  setMarketSyncState,
  setPortfolioFilter,
  setState
} from "./core/appState.js";
import { configureRender, renderApp as render, renderTrendDependentViews } from "./core/render.js";
import { activatePortfolioView, activateTab, initRouterEvents } from "./core/router.js";
import {
  buildAccountSummaries,
  calculateDisplayPortfolio,
  configurePortfolioSelectors,
  convertUsdToDisplay,
  currentOverviewTotalCents,
  displayCurrency,
  openAssets,
  overviewAssets,
  selectedAccountLabel,
  selectedAccountName,
  selectedOpenAssets
} from "./domain/portfolioSelectors.js";
import {
  inferAccountType
} from "./features/assets/accountOptions.js";
import { getAssetElements } from "./features/assets/assetElements.js";
import { getAnalysisElements } from "./features/analysis/analysisElements.js";
import { initAnalysisEvents } from "./features/analysis/analysisEvents.js";
import {
  configureAnalysisRender,
  renderAttribution,
  renderCurrentAnalysisReturnRows
} from "./features/analysis/analysisRender.js";
import { getImportExportElements } from "./features/importExport/importExportElements.js";
import { initImportExportEvents } from "./features/importExport/importExportEvents.js";
import { configureImportExportService } from "./features/importExport/importExportService.js";
import { getMarketElements } from "./features/market/marketElements.js";
import { initMarketEvents } from "./features/market/marketEvents.js";
import { configureMarketRender, renderAssetPriceChart, renderMarketSyncResult } from "./features/market/marketRender.js";
import {
  benchmarkHistoryPeriodReturnBps,
  benchmarkReturnPeriods,
  configureBenchmarkRender,
  loadBenchmarkPerformance,
  renderBenchmarkPerformance
} from "./features/market/benchmarkRender.js";
import {
  configureMarketService,
  hideMarketSyncResult,
  syncDailyMarketPricesIfDue,
  syncBenchmarkMarketPrices,
  syncLatestMarketPrices
} from "./features/market/marketService.js";
import { getTrendElements } from "./features/trends/trendElements.js";
import {
  initTrendEvents,
  initializeTrendControls,
  syncRangePills
} from "./features/trends/trendEvents.js";
import {
  assetValueAtTrendDate,
  buildTrendDates,
  calculateTrendReturnBpsForRange,
  calculateTrendValueChangeForRange,
  configureTrendModel,
  latestTrendDate
} from "./features/trends/trendModel.js";
import { buildEvenlySpacedXAxisLabels, configureTrendRender, renderTrendChart } from "./features/trends/trendRender.js";
import { initPortfolioEvents } from "./features/portfolio/portfolioEvents.js";
import {
  allocationWeightBps,
  assetTypeKey,
  configurePortfolioRender,
  renderAccounts,
  renderCategoryBreakdown,
  renderMarketDistribution,
  renderOverviewBreakdownDetail
} from "./features/portfolio/portfolioRender.js";
import { getSettingsElements } from "./features/settings/settingsElements.js";
import { configureDisplayCurrencyActions, handleInlineCurrencyChange } from "./features/settings/displayCurrencyActions.js";
import { initSettingsEvents } from "./features/settings/settingsEvents.js";
import {
  applySettings,
  configureSettingsRender,
  renderAuthState,
  syncSettingsForm
} from "./features/settings/settingsRender.js";
import {
  applyCashAssetFormMode as applyCashAssetFormModeFromModule,
  configureAssetForm,
  renderAccountPicker,
  renderAssetQuickMatchOptions,
  startCloseAsset,
  startQuickAsset,
  startSellAsset
} from "./features/assets/assetForm.js";
import { configureAssetFormPayload } from "./features/assets/assetFormPayload.js";
import { initAssetEvents } from "./features/assets/assetEvents.js";
import {
  configureAssetRender,
  formatUnitPrice,
  priceStatusClass,
  priceStatusLabel,
  renderPortfolio
} from "./features/assets/assetRender.js";
import { buildAssetChangeRecords, configureAssetTransactions } from "./features/assets/assetTransactions.js";
import { configureAssetValidation } from "./features/assets/assetValidation.js";
import { getPostsElements } from "./features/community/postsElements.js";
import { initPostsEvents } from "./features/community/postsEvents.js";
import { configurePostsRender, renderPosts } from "./features/community/postsRender.js";
import { initFeedbackEvents } from "./features/feedback/feedbackEvents.js";
import {
  applyNoteTemplate,
  applySelectedNoteTransaction,
  clearNoteTransactionLink,
  commitCustomNoteTag,
  configureNotesEditor,
  hideNoteEditor,
  noteTransactionLabel,
  openChangeReviewNote,
  openCloseReviewNote,
  reviewTemplateForChange,
  setNoteAssetLink,
  setNoteTransactionLink,
  showNoteEditor,
  updateNoteCounters
} from "./features/notes/notesEditor.js";
import {
  configureNotesActions,
  deleteNote,
  editNote,
  hideCloseReviewPrompt,
  openAssetById,
  openAssetChangeById,
  openNoteById,
  openPendingCloseReviewNote,
  openReviewNoteForAsset,
  saveNoteFromForm,
  showCloseReviewPrompt,
  toggleBody
} from "./features/notes/notesActions.js";
import { getNotesElements } from "./features/notes/notesElements.js";
import { initNotesEvents } from "./features/notes/notesEvents.js";
import {
  configureNotesRender,
  findNoteForChange,
  findReviewNote,
  hideNoteReader,
  noteAssetLabel,
  noteTagsFor,
  noteTypeFromTags,
  renderNotes,
  showNoteReader
} from "./features/notes/notesRender.js";
import { normalizeSnapshotDate } from "./utils/date.js";
import { homeElements } from "./features/home/homeElements.js";
import { bindHomeEvents } from "./features/home/homeEvents.js";
import {
  annualizedCumulativeReturnBps,
  buildHomeRenderContext,
  calculateCumulativeReturnBps,
  configureHomeModel,
  fxRateSummary,
  latestOverviewUpdateLabel,
  priceCompletenessClass,
  priceCompletenessLabel
} from "./features/home/homeModel.js";
import { renderHomeDashboard as renderHomeDashboardView, renderMetrics as renderMetricsView } from "./features/home/homeRender.js";
import { initializeComposeForms } from "./ui/composeForm.js";
import {
  configureFormatters,
  formatDateTimeMinute,
  toneClassForValue
} from "./ui/formatters.js";

const MARKET_API_BASE_URL = resolveMarketApiBaseUrl();
const DATA_UNAVAILABLE = "暂无数据";
const NOT_SYNCED = "未同步";

function resolveMarketApiBaseUrl() {
  const configured = String(globalThis.ASSET_TRAIL_CONFIG?.marketApiBaseUrl || "").trim();
  const fallback =
    globalThis.location?.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/u.test(globalThis.location?.hostname || "")
      ? `${globalThis.location.protocol}//127.0.0.1:4180`
      : "";
  const baseUrl = (configured || fallback).replace(/\/+$/u, "");
  if (!baseUrl) return "";
  try {
    const resolved = new URL(baseUrl, globalThis.location?.origin || "https://asset-trail.local");
    if (globalThis.location?.protocol === "https:" && resolved.protocol === "http:") return "";
    return resolved.origin === globalThis.location?.origin ? "" : resolved.toString().replace(/\/+$/u, "");
  } catch {
    return "";
  }
}
configurePortfolioSelectors({
  getState,
  inferAccountType
});
configureHomeModel({
  getState,
  getMarketSyncState,
  buildAssetChangeRecords,
  calculateDisplayPortfolio,
  calculateTrendValueChangeForRange,
  currentOverviewTotalCents,
  displayCurrency,
  findNoteForChange,
  formatDateTimeMinute,
  noteAssetLabel,
  noteTagsFor,
  notSynced: NOT_SYNCED,
  overviewAssets,
  priceStatusClass,
  priceStatusLabel
});
configureFormatters({
  displayCurrency,
  dataUnavailable: DATA_UNAVAILABLE,
  notSynced: NOT_SYNCED
});
configureAppState({
  applySettings,
  initializeTrendControls,
  render,
  renderAssetQuickMatchOptions,
  syncSettingsForm
});
configureDisplayCurrencyActions({
  getState,
  render,
  saveCurrentState,
  syncSettingsForm
});

const noteElements = getNotesElements();
const postElements = getPostsElements();
const marketElements = getMarketElements();
const trendElements = getTrendElements();
const elements = {
  categoryList: document.querySelector("#category-list"),
  ...trendElements,
  accountList: document.querySelector("#account-list"),
  accountSummary: document.querySelector("#account-summary"),
  accountTrendChart: document.querySelector("#account-trend-chart"),
  accountAssetRows: document.querySelector("#account-asset-rows"),
  accountSource: document.querySelector("#account-source"),
  accountDetailTitle: document.querySelector("#account-detail-title"),
  marketDistributionList: document.querySelector("#market-distribution-list"),
  distributionDetail: document.querySelector("#distribution-detail"),
  distributionDetailTitle: document.querySelector("#distribution-detail-title"),
  ...noteElements,
  categorySource: document.querySelector("#category-source"),
  ...marketElements
};

const assetElements = getAssetElements();
const analysisElements = getAnalysisElements();
const importExportElements = getImportExportElements();
const settingsElements = getSettingsElements();
const assetContext = {
  elements: assetElements,
  getState,
  setState,
  getPortfolioFilter,
  setPortfolioFilter,
  activateTab,
  calculateDisplayPortfolio,
  convertUsdToDisplay,
  findNoteForChange,
  findReviewNote,
  normalizeSnapshotDate,
  openChangeReviewNote,
  openCloseReviewNote,
  openNoteById,
  openReviewNoteForAsset,
  persistAndRender,
  renderPortfolio: () => renderPortfolio(),
  showCloseReviewPrompt,
  startCloseAsset,
  startSellAsset
};

configureAssetValidation(assetContext);
configureAssetFormPayload(assetContext);
configureAssetTransactions(assetContext);
configureAssetForm(assetContext);
configureAssetRender(assetContext);

const settingsContext = {
  elements: settingsElements,
  getState,
  hideMarketSyncResult,
  loadDemoState,
  persistAndRender
};
configureSettingsRender(settingsContext);

const marketContext = {
  elements: marketElements,
  getState,
  getMarketSyncState,
  setMarketSyncState,
  setBenchmarkPerformanceState,
  marketApiBaseUrl: MARKET_API_BASE_URL,
  openAssets,
  loadBenchmarkPerformance,
  persistAndRender,
  toneClassForValue
};
configureMarketRender(marketContext);
configureMarketService(marketContext);
configureBenchmarkRender({
  elements: marketElements,
  getBenchmarkPerformanceState,
  setBenchmarkPerformanceState,
  marketApiBaseUrl: MARKET_API_BASE_URL,
  calculateCumulativeReturnBps,
  annualizedCumulativeReturnBps,
  calculateTrendReturnBpsForRange,
  renderCurrentAnalysisReturnRows,
  dataUnavailable: DATA_UNAVAILABLE
});

const trendContext = {
  elements: trendElements,
  getState,
  openAssets,
  overviewAssets,
  currentOverviewTotalCents,
  convertUsdToDisplay,
  dataUnavailable: DATA_UNAVAILABLE,
  renderTrendDependentViews
};
configureTrendModel(trendContext);
configureTrendRender(trendContext);

const portfolioContext = {
  elements,
  getState,
  overviewAssets,
  buildAccountSummaries,
  calculateDisplayPortfolio,
  selectedOpenAssets,
  selectedAccountName,
  selectedAccountLabel,
  persistAndRender
};
configurePortfolioRender(portfolioContext);

const postContext = {
  elements: postElements,
  getState,
  persistAndRender
};
configurePostsRender(postContext);

configureNotesRender({
  elements,
  getState,
  buildAssetChangeRecords,
  convertUsdToDisplay,
  noteTransactionLabel
});

configureNotesEditor({
  elements,
  getState,
  activateTab,
  buildAssetChangeRecords,
  convertUsdToDisplay
});

configureNotesActions({
  elements,
  assetElements,
  getState,
  activatePortfolioView,
  activateTab,
  findReviewNote,
  hideNoteEditor,
  noteTypeFromTags,
  openCloseReviewNote,
  persistAndRender,
  renderPortfolio,
  showNoteEditor,
  showNoteReader
});

configureImportExportService({
  elements: importExportElements,
  getState,
  setState,
  syncSettingsForm,
  applySettings,
  initializeTrendControls,
  persistAndRender
});

configureAnalysisRender({
  elements: analysisElements,
  getAnalysisFilter,
  setAnalysisFilter,
  getAnalysisReturnMetric,
  getBenchmarkPerformanceState,
  openAssets,
  buildAccountSummaries,
  calculateDisplayPortfolio,
  convertUsdToDisplay,
  assetValueAtTrendDate,
  buildTrendDates,
  latestTrendDate,
  renderMarketSyncResult,
  latestOverviewUpdateLabel,
  fxRateSummary,
  calculateTrendValueChangeForRange,
  buildEvenlySpacedXAxisLabels,
  allocationWeightBps,
  benchmarkReturnPeriods,
  benchmarkHistoryPeriodReturnBps,
  assetTypeKey
});

configureRender({
  homeElements,
  homeRenderContext: buildHomeRenderContext,
  renderAccountPicker,
  renderAccounts,
  renderAttribution,
  renderAuthState,
  renderBenchmarkPerformance,
  renderCategoryBreakdown,
  renderHomeDashboardView,
  renderMarketDistribution,
  renderMetricsView,
  renderNotes,
  renderOverviewBreakdownDetail,
  renderPortfolio,
  renderPosts,
  renderTrendChart,
  syncRangePills
});

initRouterEvents({ startQuickAsset });
initFeedbackEvents({ getState });
initSettingsEvents(settingsContext);

initializeComposeForms(document.querySelectorAll(".compose-form"));

syncSettingsForm();
applySettings();
applyCashAssetFormModeFromModule();
initAssetEvents(assetContext);

initNotesEvents({
  elements,
  saveNoteFromForm,
  showNoteEditor,
  applyNoteTemplate,
  hideNoteEditor,
  hideNoteReader,
  editNote,
  deleteNote,
  persistAndRender,
  renderNotes,
  updateNoteCounters,
  commitCustomNoteTag,
  clearNoteTransactionLink,
  applySelectedNoteTransaction,
  noteTransactionLabel,
  setNoteAssetLink,
  setNoteTransactionLink,
  reviewTemplateForChange,
  hideCloseReviewPrompt,
  openPendingCloseReviewNote,
  toggleBody,
  openAssetChangeById,
  showNoteReader,
  openAssetById
});

initPostsEvents(postContext);
initPortfolioEvents(portfolioContext);

initAnalysisEvents({
  elements: analysisElements,
  getAnalysisFilter,
  setAnalysisFilter,
  getAnalysisReturnMetric,
  setAnalysisReturnMetric,
  renderAttribution,
  handleInlineCurrencyChange,
  syncBenchmarkMarketPrices
});

initMarketEvents({
  elements: marketElements,
  syncLatestMarketPrices,
  renderAssetPriceChart
});

homeElements.metrics.addEventListener("change", handleInlineCurrencyChange);
bindHomeEvents({
  activateTab,
  startQuickAsset,
  loadDemoState,
  showNoteEditor,
  applyNoteTemplate
});

initTrendEvents(trendContext);

initImportExportEvents(importExportElements);

initializeTrendControls();
render();
syncDailyMarketPricesIfDue();
