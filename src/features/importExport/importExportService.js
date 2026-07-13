import { normalizeAsset, validateAsset } from "../../domain/calculations.js";
import { normalizeLoadedSnapshots, normalizeSelectedAccount, normalizeSettings, normalizeSession } from "../../state/normalizers.js";
import { validateBackupPayload } from "../../state/stateValidation.js";
import { csvCell } from "../../utils/csv.js";
import { todayIsoDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import { humanizeAssetError } from "../assets/assetValidation.js";

let ctx = {};
let pendingImportState = null;
let pendingImportMode = "normal";

export function configureImportExportService(context) {
  ctx = context;
}

export function exportJsonBackup() {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "asset-trail",
    version: 1,
    state: ctx.getState()
  };
  downloadText(`asset-trail-backup-${todayIsoDate()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export function exportCsvBackup() {
  const state = ctx.getState();
  const headers = [
    "name",
    "symbol",
    "type",
    "market",
    "account",
    "accountType",
    "currency",
    "quantity",
    "costPrice",
    "previousPrice",
    "currentPrice",
    "priceStatus",
    "fxRate",
    "previousFxRate",
    "contribution",
    "dividends",
    "interest",
    "fees",
    "taxes",
    "manualAdjustment",
    "purchaseDate",
    "pricedAt",
    "priceSource",
    "priceKind",
    "priceAt",
    "marketTimezone",
    "sourceFetchedAt"
  ];
  const rows = [headers.join(",")].concat(
    state.assets.map((asset) => headers.map((field) => csvCell(asset[field] ?? "")).join(","))
  );
  downloadText(`asset-trail-assets-${todayIsoDate()}.csv`, rows.join("\n"), "text/csv");
}

export function importJsonBackup(event) {
  event.preventDefault();
  const { elements } = ctx;
  elements.importError.textContent = "";
  if (elements.importStatus) elements.importStatus.textContent = "";
  try {
    const parsed = JSON.parse(elements.importJson.value);
    const state = ctx.getState();
    const prepared = prepareBackupState(parsed, state);
    if (!prepared.ok) {
      elements.importError.textContent = `导入失败：${prepared.message}`;
      return;
    }
    pendingImportState = prepared.state;
    pendingImportMode = "normal";
    if (elements.importPreview) {
      elements.importPreview.innerHTML = renderImportPreview(state, pendingImportState, parsed);
    }
    elements.importConfirmModal?.classList.remove("is-hidden");
    elements.importContinue?.focus();
  } catch {
    elements.importError.textContent = "导入失败：请输入有效 JSON。";
  }
}

export function cancelPendingImport() {
  pendingImportState = null;
  pendingImportMode = "normal";
  if (ctx.elements.importPreview) ctx.elements.importPreview.innerHTML = "";
  ctx.elements.importConfirmModal?.classList.add("is-hidden");
}

export function applyPendingImport() {
  if (!pendingImportState) {
    cancelPendingImport();
    return;
  }
  ctx.setState(pendingImportState);
  pendingImportState = null;
  ctx.syncSettingsForm();
  ctx.applySettings();
  ctx.initializeTrendControls();
  ctx.elements.importJson.value = "";
  if (ctx.elements.importPreview) ctx.elements.importPreview.innerHTML = "";
  ctx.elements.importConfirmModal?.classList.add("is-hidden");
  ctx.persistAndRender();
  if (ctx.elements.importStatus) {
    ctx.elements.importStatus.textContent = "导入成功：本地数据已更新。建议现在导出一份新的 JSON 备份。";
  }
}

export function initializeStorageRecovery() {
  const loadResult = ctx.getStorageLoadResult?.();
  if (!loadResult || !["recovery_required", "unavailable"].includes(loadResult.status)) return;
  const { elements } = ctx;
  elements.recoveryModal?.classList.remove("is-hidden");
  if (elements.recoveryMessage) {
    elements.recoveryMessage.textContent = loadResult.status === "unavailable"
      ? "浏览器当前无法访问本地存储。为避免误导，当前没有加载或修改任何资产。请检查浏览器存储权限后刷新页面。"
      : "未能读取此浏览器中的资产数据。为避免覆盖，当前没有加载或修改任何资产。你可以从 JSON 备份恢复，或先下载损坏数据留存。";
  }
  if (elements.downloadCorruptedButton) {
    elements.downloadCorruptedButton.disabled = typeof loadResult.recovery?.raw !== "string";
  }
  elements.recoveryFile?.focus();
}

export async function selectRecoveryBackup(event) {
  const { elements } = ctx;
  clearRecoveryFeedback();
  const file = event?.target?.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const prepared = prepareBackupState(parsed, ctx.getState());
    if (!prepared.ok) {
      elements.recoveryError.textContent = `恢复失败：${prepared.message}`;
      return;
    }
    pendingImportState = prepared.state;
    pendingImportMode = "recovery";
    elements.recoveryPreview.innerHTML = renderImportPreview(ctx.getState(), prepared.state, parsed);
    elements.recoveryConfirm.disabled = false;
    elements.recoveryStatus.textContent = "备份校验通过。确认后才会尝试替换当前损坏数据。";
  } catch {
    elements.recoveryError.textContent = "恢复失败：请选择有效的 JSON 备份文件。";
  }
}

export function cancelPendingRecovery() {
  if (pendingImportMode === "recovery") pendingImportState = null;
  pendingImportMode = "normal";
  if (ctx.elements.recoveryFile) ctx.elements.recoveryFile.value = "";
  if (ctx.elements.recoveryPreview) ctx.elements.recoveryPreview.innerHTML = "";
  if (ctx.elements.recoveryConfirm) ctx.elements.recoveryConfirm.disabled = true;
  clearRecoveryFeedback();
}

export function applyPendingRecovery() {
  const { elements } = ctx;
  if (pendingImportMode !== "recovery" || !pendingImportState) {
    elements.recoveryError.textContent = "请先选择并校验 JSON 备份。";
    return { ok: false, reason: "no_pending_recovery" };
  }
  const result = ctx.replaceStateFromRecovery(pendingImportState);
  if (!result.ok) {
    elements.recoveryError.textContent = result.message || "恢复未完成，原始数据仍处于保护状态。";
    elements.recoveryStatus.textContent = result.originalPreserved
      ? "系统已尝试保持原始损坏数据不变。"
      : "无法确认原始数据是否保持不变，请保留已下载的损坏数据。";
    return result;
  }
  pendingImportState = null;
  pendingImportMode = "normal";
  elements.recoveryStatus.textContent = "恢复成功，正在重新载入本地数据。";
  ctx.reloadApp?.();
  return result;
}

export function downloadCorruptedStorage() {
  const recovery = ctx.getStorageLoadResult?.()?.recovery;
  if (typeof recovery?.raw !== "string") return { ok: false, reason: "raw_unavailable" };
  const payload = {
    app: "asset-trail",
    type: "corrupted-local-storage-recovery",
    capturedAt: new Date().toISOString(),
    storageKey: "asset-trail-state-v1",
    reason: recovery.reason,
    raw: recovery.raw
  };
  downloadText(`asset-trail-corrupted-data-${todayIsoDate()}.json`, JSON.stringify(payload, null, 2), "application/json");
  return { ok: true };
}

export function prepareBackupState(parsed, fallbackState = {}) {
  const validation = validateBackupPayload(parsed);
  if (!validation.ok) return { ok: false, reason: validation.reason, message: validation.message, issues: validation.issues };
  const incoming = validation.state;
  const assets = incoming.assets.map((asset) => normalizeAsset(asset));
  const invalid = assets.map(validateAsset).find(Boolean);
  if (invalid) return { ok: false, reason: "asset_invalid", message: humanizeAssetError(invalid), issues: [] };
  return {
    ok: true,
    state: {
      schemaVersion: Number(incoming.schemaVersion) || 1,
      session: normalizeSession(incoming.session || fallbackState.session),
      settings: normalizeSettings(incoming.settings || fallbackState.settings),
      selectedAccount: normalizeSelectedAccount(incoming.selectedAccount || "all", assets),
      snapshots: normalizeLoadedSnapshots(incoming.snapshots),
      assets,
      notes: Array.isArray(incoming.notes) ? incoming.notes : [],
      posts: Array.isArray(incoming.posts) ? incoming.posts : []
    }
  };
}

function clearRecoveryFeedback() {
  if (ctx.elements.recoveryError) ctx.elements.recoveryError.textContent = "";
  if (ctx.elements.recoveryStatus) ctx.elements.recoveryStatus.textContent = "";
}

function renderImportPreview(currentState, nextState, rawPayload) {
  const currentSummary = summarizeImportState(currentState);
  const nextSummary = summarizeImportState(nextState);
  const exportedAt = rawPayload?.exportedAt ? String(rawPayload.exportedAt) : "";
  return `
    <section class="import-preview-grid" aria-label="导入预览">
      ${renderImportSummaryCard("当前本地数据", currentSummary)}
      ${renderImportSummaryCard("即将导入", nextSummary, exportedAt)}
    </section>
    <div class="import-preview-warning">
      <strong>继续导入会替换当前本地数据。</strong>
      <span>取消不会修改任何数据。导入前如需保留当前状态，请先导出 JSON 备份。</span>
    </div>
  `;
}

function renderImportSummaryCard(title, summary, exportedAt = "") {
  const rows = [
    ["当前持仓", `${summary.openAssets} 个`],
    ["历史持仓", `${summary.closedAssets} 个`],
    ["复盘", `${summary.notes} 条`],
    ["估值快照", `${summary.snapshots} 条`],
    ["社区草稿", `${summary.posts} 条`],
    ["设置", summary.hasSettings ? "包含" : "未包含"]
  ];
  return `
    <article class="import-preview-card">
      <strong>${escapeHtml(title)}</strong>
      ${exportedAt ? `<small>导出时间：${escapeHtml(exportedAt)}</small>` : ""}
      <dl>
        ${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
    </article>
  `;
}

function summarizeImportState(state = {}) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  return {
    openAssets: assets.filter((asset) => !asset.closed).length,
    closedAssets: assets.filter((asset) => asset.closed).length,
    notes: Array.isArray(state.notes) ? state.notes.length : 0,
    posts: Array.isArray(state.posts) ? state.posts.length : 0,
    snapshots: Array.isArray(state.snapshots) ? state.snapshots.length : 0,
    hasSettings: Boolean(state.settings)
  };
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
