import { calculatePortfolio } from "../domain/calculations.js";
import { demoState } from "../state/demoState.js";
import { normalizeSnapshots } from "../state/normalizers.js";
import { loadState, saveState } from "../state/storage.js";
import { todayIsoDate } from "../utils/date.js";

let state = loadState();
let portfolioFilter = { account: "all", type: "all", status: "all" };
let analysisFilter = { account: "all", assetId: "all", startDate: "", endDate: "" };
let analysisReturnMetric = "mwr";
let selectedBenchmarkKeys = ["csi300", "sp500", "qqq"];
let marketSyncState = { status: "idle", message: "", results: [], syncedAt: "" };
let benchmarkPerformanceState = { status: "idle", histories: {}, error: "" };

let ctx = {
  applySettings: () => {},
  initializeTrendControls: () => {},
  render: () => {},
  renderAssetQuickMatchOptions: () => {},
  syncSettingsForm: () => {}
};

export function configureAppState(context = {}) {
  ctx = { ...ctx, ...context };
}

export function getState() {
  return state;
}

export function setState(nextState) {
  state = nextState;
}

export function getPortfolioFilter() {
  return portfolioFilter;
}

export function setPortfolioFilter(nextFilter) {
  portfolioFilter = nextFilter;
}

export function getAnalysisFilter() {
  return analysisFilter;
}

export function setAnalysisFilter(nextFilter) {
  analysisFilter = nextFilter;
}

export function getAnalysisReturnMetric() {
  return analysisReturnMetric;
}

export function setAnalysisReturnMetric(nextMetric) {
  analysisReturnMetric = nextMetric;
}

export function getSelectedBenchmarkKeys() {
  return selectedBenchmarkKeys;
}

export function setSelectedBenchmarkKeys(nextKeys) {
  selectedBenchmarkKeys = Array.isArray(nextKeys) && nextKeys.length ? [...new Set(nextKeys)] : ["csi300", "sp500", "qqq"];
}

export function getMarketSyncState() {
  return marketSyncState;
}

export function setMarketSyncState(nextState) {
  marketSyncState = nextState;
}

export function getBenchmarkPerformanceState() {
  return benchmarkPerformanceState;
}

export function setBenchmarkPerformanceState(nextState) {
  benchmarkPerformanceState = nextState;
}

export function loadDemoState() {
  state = structuredClone(demoState);
  ctx.syncSettingsForm();
  ctx.renderAssetQuickMatchOptions();
  ctx.applySettings();
  ctx.initializeTrendControls();
  persistAndRender();
}

export function persistAndRender() {
  state.snapshots = upsertCurrentSnapshot(state.snapshots, calculatePortfolio(state.assets).totals.marketValueCents);
  saveState(state);
  ctx.render();
}

export function saveCurrentState() {
  saveState(state);
}

function upsertCurrentSnapshot(snapshots, valueCents) {
  const today = todayIsoDate();
  const current = normalizeSnapshots(snapshots);
  const next = { date: today, valueCents: String(valueCents) };
  const existingIndex = current.findIndex((snapshot) => snapshot.date === today);
  if (existingIndex >= 0) {
    current[existingIndex] = next;
  } else {
    current.push(next);
  }
  return current.slice(-12);
}
