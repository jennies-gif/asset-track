import { calculatePortfolio } from "../domain/calculations.js";
import { demoState } from "../state/demoState.js";
import { normalizeSnapshots } from "../state/normalizers.js";
import { getStorageLoadResult, isStorageWriteLocked, loadState, saveState } from "../state/storage.js";
import { todayIsoDate } from "../utils/date.js";

const initialStorageLoad = loadState();
let state = initialStorageLoad.state || createRecoverySafeState();
let portfolioFilter = { account: "all", type: "all", status: "all" };
const initialAnalysisEnd = todayIsoDate();
let analysisFilter = { account: "all", assetId: "all", range: "ytd", startDate: `${initialAnalysisEnd.slice(0, 4)}-01-01`, endDate: initialAnalysisEnd };
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

export function getAppStorageLoadResult() {
  return getStorageLoadResult();
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
  if (isStorageWriteLocked()) return { ok: false, reason: "write_locked" };
  state = structuredClone(demoState);
  ctx.syncSettingsForm();
  ctx.renderAssetQuickMatchOptions();
  ctx.applySettings();
  ctx.initializeTrendControls();
  return persistAndRender();
}

export function persistAndRender() {
  if (isStorageWriteLocked()) return { ok: false, reason: "write_locked", message: "本地数据处于恢复保护状态。" };
  state.snapshots = upsertCurrentSnapshot(state.snapshots, calculatePortfolio(state.assets).totals.marketValueCents);
  const saved = saveState(state);
  if (!saved.ok) return saved;
  ctx.render();
  return saved;
}

export function saveCurrentState() {
  if (isStorageWriteLocked()) return { ok: false, reason: "write_locked", message: "本地数据处于恢复保护状态。" };
  return saveState(state);
}

function createRecoverySafeState() {
  return {
    session: { signedIn: false, email: "", name: "", signedInAt: "" },
    settings: structuredClone(demoState.settings),
    selectedAccount: "all",
    snapshots: [],
    assets: [],
    notes: [],
    posts: []
  };
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
