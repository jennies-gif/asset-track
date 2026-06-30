import { normalizeAsset, validateAsset } from "../../domain/calculations.js";
import { normalizeLoadedSnapshots, normalizeSelectedAccount, normalizeSettings, normalizeSession } from "../../state/normalizers.js";
import { csvCell } from "../../utils/csv.js";
import { todayIsoDate } from "../../utils/date.js";
import { escapeHtml } from "../../utils/dom.js";
import { humanizeAssetError } from "../assets/assetValidation.js";

let ctx = {};
let pendingImportState = null;

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
    "priceSource"
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
    const incoming = parsed.state || parsed;
    if (!Array.isArray(incoming.assets)) {
      elements.importError.textContent = "导入失败：JSON 中缺少 assets 数组。";
      return;
    }
    const assets = incoming.assets.map((asset) => normalizeAsset(asset));
    const invalid = assets.map(validateAsset).find(Boolean);
    if (invalid) {
      elements.importError.textContent = `导入失败：${humanizeAssetError(invalid)}`;
      return;
    }
    const state = ctx.getState();
    pendingImportState = {
      session: normalizeSession(incoming.session || state.session),
      settings: normalizeSettings(incoming.settings || state.settings),
      selectedAccount: normalizeSelectedAccount(incoming.selectedAccount || "all", assets),
      snapshots: normalizeLoadedSnapshots(incoming.snapshots),
      assets,
      notes: Array.isArray(incoming.notes) ? incoming.notes : [],
      posts: Array.isArray(incoming.posts) ? incoming.posts : []
    };
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
