import { formatDisplayCurrency, formatUnitPrice } from "../../ui/formatters.js";
import { resolvePriceStatus } from "../../domain/priceStatus.js";
import { escapeHtml } from "../../utils/dom.js";
import { inferNoteAssetId, noteTagsFor } from "./notesRender.js";

let ctx = {};

export function configureNotesEditor(context) {
  ctx = context;
}

export function openCloseReviewNote(asset, type = "close") {
  const elements = ctx.elements;
  ctx.activateTab("notes");
  showNoteEditor();
  const titleInput = elements.noteForm.querySelector('[name="title"]');
  const assetInput = elements.noteForm.querySelector('[name="asset"]');
  const formatSelect = elements.noteForm.querySelector('[name="format"]');
  const contentInput = elements.noteForm.querySelector('[name="content"]');
  const reviewTag = elements.noteForm.querySelector('input[name="tags"][value="交易复盘"]');
  const template = reviewTemplateForAction(type);
  const actionLabel = { buy: "买入", sell: "卖出", close: "清仓", hold: "持有观察" }[type] || "操作";
  if (titleInput) titleInput.value = `${asset.name} ${actionLabel}复盘`;
  if (assetInput) assetInput.value = asset.name;
  setNoteAssetLink(asset.id);
  if (formatSelect) formatSelect.value = "plain";
  if (reviewTag) reviewTag.checked = true;
  updateSelectedNoteTags();
  setNoteTemplateSelection(template);
  elements.noteForm.dataset.template = template;
  if (contentInput) contentInput.value = buildReviewTemplate(template);
  elements.noteForm.dataset.defaultTitle = titleInput?.value || "";
  syncNoteAssetSelection();
  updateNoteCounters();
  contentInput?.focus();
  requestAnimationFrame(() => {
    elements.notesEditor.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

export function openChangeReviewNote(change) {
  const elements = ctx.elements;
  ctx.activateTab("notes");
  showNoteEditor();
  const titleInput = elements.noteForm.querySelector('[name="title"]');
  const assetInput = elements.noteForm.querySelector('[name="asset"]');
  const formatSelect = elements.noteForm.querySelector('[name="format"]');
  const contentInput = elements.noteForm.querySelector('[name="content"]');
  const reviewTag = elements.noteForm.querySelector('input[name="tags"][value="交易复盘"]');
  const template = reviewTemplateForChange(change);
  if (titleInput) titleInput.value = `${change.asset.name} ${change.action}复盘`;
  if (assetInput) assetInput.value = noteTransactionLabel(change);
  setNoteAssetLink(change.asset.id);
  if (formatSelect) formatSelect.value = "plain";
  if (reviewTag) reviewTag.checked = true;
  updateSelectedNoteTags();
  setNoteTemplateSelection(template);
  elements.noteForm.dataset.template = template;
  if (contentInput) contentInput.value = buildReviewTemplate(template);
  elements.noteForm.dataset.defaultTitle = titleInput?.value || "";
  populateNoteTransactionOptions(change.asset.id, noteTransactionLabel(change));
  setNoteTransactionLink(noteTransactionLabel(change));
  updateNoteContextPreview();
  updateNoteCounters();
  contentInput?.focus();
  requestAnimationFrame(() => {
    elements.notesEditor.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

export function reviewTemplateForAction(type = "hold") {
  if (type === "buy") return "buy";
  if (type === "close" || type === "sell") return "close";
  return "hold";
}

export function reviewTemplateForChange(change) {
  if (change.action === "买入" || change.action === "加仓") return "buy";
  if (change.action === "卖出" || change.action === "清仓") return "close";
  return "hold";
}

export function applyNoteTemplate(template = "blank", options = {}) {
  const elements = ctx.elements;
  const contentInput = elements.noteForm.elements.content;
  const titleInput = elements.noteForm.elements.title;
  const currentContent = contentInput.value.trim();
  const currentTemplate = elements.noteForm.dataset.template || "";
  const currentTemplateContent = currentTemplate ? buildReviewTemplate(currentTemplate) : "";
  const canOverwrite = options.overwrite || !currentContent || currentContent === currentTemplateContent.trim();
  if (!canOverwrite) {
    setNoteTemplateSelection(currentTemplate || "blank");
    return;
  }

  setNoteTemplateSelection(template);
  elements.noteForm.dataset.template = template;
  contentInput.value = buildReviewTemplate(template);
  updateDefaultNoteTitle({ template, force: options.overwrite && !titleInput.value.trim() });
  const defaultTag = template === "hold" ? "持有观察" : "交易复盘";
  const reviewTag = elements.noteForm.querySelector(`input[name="tags"][value="${defaultTag}"]`);
  if (template !== "blank" && reviewTag) reviewTag.checked = true;
  updateSelectedNoteTags();
  updateNoteCounters();
}

export function setNoteTemplateSelection(template = "blank") {
  const elements = ctx.elements;
  if (elements.noteForm.elements.template) elements.noteForm.elements.template.value = template;
  elements.noteTemplateCards?.querySelectorAll("[data-note-template]").forEach((card) => {
    card.classList.toggle("is-selected", card.dataset.noteTemplate === template);
  });
}

export function showNoteEditor(note = null) {
  const elements = ctx.elements;
  elements.notesHome.classList.add("is-hidden");
  elements.notesReader.classList.add("is-hidden");
  elements.notesEditor.classList.remove("is-hidden");
  elements.noteForm.reset();
  delete elements.noteForm.dataset.template;
  delete elements.noteForm.dataset.defaultTitle;
  clearDynamicNoteTags();
  elements.noteCustomTagField.classList.add("is-hidden");
  populateNoteAssetOptions();
  populateNoteTransactionOptions();
  clearNoteTransactionLink();
  setNoteTemplateSelection("blank");
  delete elements.noteForm.dataset.editingId;
  if (note) {
    elements.noteForm.dataset.editingId = note.id;
    elements.noteForm.elements.title.value = note.title || "";
    elements.noteForm.elements.asset.value = note.asset || "";
    const linkedAssetId = note.assetId || inferNoteAssetId(note);
    setNoteAssetLink(linkedAssetId);
    populateNoteTransactionOptions(linkedAssetId, note.asset || "");
    elements.noteForm.elements.format.value = note.format || "plain";
    elements.noteForm.elements.status.value = note.status || "published";
    elements.noteForm.dataset.template = note.template || "blank";
    setNoteTemplateSelection(note.template || "blank");
    elements.noteForm.elements.content.value = note.content || "";
    if (note.asset) setNoteTransactionLink(note.asset);
    noteTagsFor(note).forEach((tag) => {
      const input = [...elements.noteForm.querySelectorAll('input[name="tags"]')].find((item) => item.value === tag);
      if (input) {
        input.checked = true;
      } else {
        addCustomNoteTag(tag);
      }
    });
  }
  updateSelectedNoteTags();
  updateNoteContextPreview();
  updateNoteCounters();
  elements.noteForm.elements.title.focus();
}

export function hideNoteEditor() {
  const elements = ctx.elements;
  elements.notesEditor.classList.add("is-hidden");
  elements.notesReader.classList.add("is-hidden");
  elements.notesHome.classList.remove("is-hidden");
  elements.noteForm.reset();
  delete elements.noteForm.dataset.template;
  delete elements.noteForm.dataset.defaultTitle;
  clearDynamicNoteTags();
  elements.noteCustomTagField.classList.add("is-hidden");
  clearNoteTransactionLink();
  updateSelectedNoteTags();
  updateNoteContextPreview();
  setNoteTemplateSelection("blank");
  delete elements.noteForm.dataset.editingId;
  updateNoteCounters();
}

export function commitCustomNoteTag() {
  const elements = ctx.elements;
  const tag = normalizeNoteTag(elements.noteForm.elements.customTag.value);
  elements.noteForm.elements.customTag.value = "";
  elements.noteCustomTagField.classList.add("is-hidden");
  if (!tag) {
    updateSelectedNoteTags();
    return;
  }
  addCustomNoteTag(tag);
}

export function updateSelectedNoteTags() {
  const elements = ctx.elements;
  if (!elements.noteSelectedTags) return;
  const tags = [...elements.noteForm.querySelectorAll('input[name="tags"]:checked')]
    .map((input) => {
      const visibleLabel = input.nextElementSibling?.textContent?.trim();
      return visibleLabel || `# ${normalizeNoteTag(input.value)}`;
    })
    .filter(Boolean);
  elements.noteSelectedTags.innerHTML = tags
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  elements.noteSelectedTags.hidden = tags.length === 0;
}

export function updateNoteCounters() {
  const elements = ctx.elements;
  const title = elements.noteForm.elements.title?.value || "";
  const content = elements.noteForm.elements.content?.value || "";
  elements.noteTitleCount.textContent = `${title.length}/80`;
  elements.noteContentCount.textContent = `${content.length}/5000`;
}

export function noteTransactionLabel(change) {
  return `${change.date || "-"} · ${change.action} · ${change.asset.name} · ${formatDisplayCurrency(change.valueCents)}`;
}

export function applySelectedNoteTransaction() {
  const elements = ctx.elements;
  const value = elements.noteTransactionSelect.value;
  if (!value) {
    clearNoteTransactionLink({ keepAsset: true });
    updateNoteContextPreview();
    return;
  }
  const selectedOption = elements.noteTransactionSelect.selectedOptions[0];
  if (selectedOption?.dataset.assetId) {
    setNoteAssetLink(selectedOption.dataset.assetId);
    populateNoteTransactionOptions(selectedOption.dataset.assetId, value);
  }
  setNoteTransactionLink(value);
  updateDefaultNoteTitle();
  updateNoteContextPreview();
}

export function syncNoteAssetSelection() {
  const elements = ctx.elements;
  const assetId = elements.noteAssetSelect?.value || "";
  const linkedOption = elements.noteTransactionSelect?.selectedOptions?.[0];
  const selectedTransaction = linkedOption?.dataset.assetId === assetId ? elements.noteTransactionSelect.value : "";
  populateNoteTransactionOptions(assetId, selectedTransaction);
  setNoteTransactionLink(selectedTransaction);
  updateDefaultNoteTitle();
  updateNoteContextPreview();
}

export function setNoteAssetLink(assetId) {
  const elements = ctx.elements;
  const state = ctx.getState();
  if (!elements.noteAssetSelect) return;
  const value = state.assets.some((asset) => asset.id === assetId) ? assetId : "";
  elements.noteAssetSelect.value = value;
}

export function setNoteTransactionLink(value) {
  const elements = ctx.elements;
  elements.noteForm.elements.asset.value = value;
  if (elements.noteTransactionSelect) elements.noteTransactionSelect.value = value;
}

export function clearNoteTransactionLink(options = {}) {
  const elements = ctx.elements;
  const keepAsset = Boolean(options?.keepAsset);
  elements.noteForm.elements.asset.value = "";
  if (!keepAsset) setNoteAssetLink("");
  elements.noteTransactionSelect.value = "";
}

export function buildReviewTemplate(template = "blank") {
  if (template === "buy") return buildBuyReviewTemplate();
  if (template === "hold") return buildHoldReviewTemplate();
  if (template === "close") return buildCloseReviewTemplate();
  return "";
}

function buildBuyReviewTemplate() {
  return [
    "买入理由：",
    "",
    "核心假设：",
    "",
    "主要风险：",
    "",
    "后续验证点："
  ].join("\n");
}

function buildHoldReviewTemplate() {
  return [
    "持有理由是否仍成立：",
    "",
    "这段时间发生了什么变化：",
    "",
    "需要继续观察的指标或事件：",
    "",
    "下一次复盘时间："
  ].join("\n");
}

function buildCloseReviewTemplate() {
  return [
    "卖出或清仓原因：",
    "",
    "当时的情绪和风险感受：",
    "",
    "这次操作之后的结论：",
    "",
    "如果重来一次会怎么做："
  ].join("\n");
}

function normalizeNoteTag(tag) {
  return String(tag || "").trim().replace(/^#+\s*/, "").slice(0, 12);
}

function addCustomNoteTag(tag) {
  const elements = ctx.elements;
  const normalizedTag = normalizeNoteTag(tag);
  if (!normalizedTag) return;
  const existingInput = [...elements.noteForm.querySelectorAll('input[name="tags"]')]
    .find((input) => input.value === normalizedTag);
  if (existingInput) {
    existingInput.checked = true;
    updateSelectedNoteTags();
    return;
  }

  const tagControl = document.createElement("div");
  tagControl.className = "note-dynamic-tag";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "tags";
  input.value = normalizedTag;
  input.checked = true;
  const chip = document.createElement("span");
  chip.className = "note-dynamic-tag-chip";
  chip.textContent = `# ${normalizedTag}`;
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "note-tag-action";
  editButton.textContent = "编辑";
  editButton.addEventListener("click", () => startEditingCustomNoteTag(tagControl));
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "note-tag-action";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", () => {
    tagControl.remove();
    updateSelectedNoteTags();
  });
  tagControl.append(input, chip, editButton, deleteButton);
  elements.noteNewTagButton.before(tagControl);
  updateSelectedNoteTags();
}

function clearDynamicNoteTags() {
  ctx.elements.noteForm.querySelectorAll(".note-dynamic-tag").forEach((tag) => tag.remove());
}

function startEditingCustomNoteTag(tagControl) {
  const elements = ctx.elements;
  const input = tagControl.querySelector('input[name="tags"]');
  const chip = tagControl.querySelector(".note-dynamic-tag-chip");
  if (!input || !chip || tagControl.querySelector(".note-tag-edit-input")) return;

  const editor = document.createElement("input");
  const originalTag = input.value;
  let isFinishing = false;
  editor.type = "text";
  editor.maxLength = 12;
  editor.className = "note-tag-edit-input";
  editor.value = input.value;

  const finish = () => {
    if (isFinishing) return;
    isFinishing = true;
    const nextTag = normalizeNoteTag(editor.value) || originalTag;
    if (!nextTag) {
      editor.replaceWith(chip);
      return;
    }
    const duplicate = [...elements.noteForm.querySelectorAll('input[name="tags"]')]
      .find((item) => item !== input && item.value === nextTag);
    if (duplicate) {
      duplicate.checked = true;
      tagControl.remove();
      updateSelectedNoteTags();
      return;
    }
    input.value = nextTag;
    chip.textContent = `# ${nextTag}`;
    editor.replaceWith(chip);
    updateSelectedNoteTags();
  };

  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      isFinishing = true;
      input.value = originalTag;
      chip.textContent = `# ${originalTag}`;
      editor.replaceWith(chip);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finish();
    }
  });
  editor.addEventListener("blur", finish);
  chip.replaceWith(editor);
  editor.focus();
  editor.select();
}

function populateNoteAssetOptions() {
  const elements = ctx.elements;
  const state = ctx.getState();
  if (!elements.noteAssetSelect) return;
  const assets = state.assets;
  elements.noteAssetSelect.innerHTML = [
    `<option value="">不关联资产</option>`,
    ...assets.map((asset) => {
      const meta = [asset.symbol, asset.account].filter(Boolean).join(" · ");
      const label = meta ? `${asset.name}（${meta}）` : asset.name;
      return `<option value="${escapeHtml(asset.id)}">${escapeHtml(label)}</option>`;
    })
  ].join("");
}

function populateNoteTransactionOptions(assetId = "", selectedValue = "") {
  const elements = ctx.elements;
  const changes = ctx.buildAssetChangeRecords()
    .filter((change) => !assetId || change.asset.id === assetId);
  elements.noteTransactionSelect.innerHTML = changes.length
    ? `<option value="">不关联交易</option>${changes
        .map((change) => `<option value="${escapeHtml(noteTransactionLabel(change))}" data-asset-id="${escapeHtml(change.asset.id)}">${escapeHtml(noteTransactionLabel(change))}</option>`)
        .join("")}`
    : `<option value="">${assetId ? "该资产暂无可关联交易" : "暂无可关联交易"}</option>`;
  elements.noteTransactionSelect.value = changes.some((change) => noteTransactionLabel(change) === selectedValue)
    ? selectedValue
    : "";
}

function defaultNoteTitle(template = "blank", asset = null) {
  const base = {
    buy: "买入复盘",
    hold: "持有观察",
    close: "卖出/清仓复盘"
  }[template] || "";
  return asset && base ? `${asset.name} ${base}` : base;
}

function updateDefaultNoteTitle(options = {}) {
  const elements = ctx.elements;
  const titleInput = elements.noteForm.elements.title;
  const template = elements.noteForm.dataset.template || elements.noteForm.elements.template?.value || "blank";
  const asset = ctx.getState().assets.find((item) => item.id === elements.noteAssetSelect?.value);
  const previousDefault = elements.noteForm.dataset.defaultTitle || "";
  const nextDefault = defaultNoteTitle(template, asset);
  const currentTitle = titleInput.value.trim();
  const mayUpdate = options.force || !currentTitle || (previousDefault && currentTitle === previousDefault);
  if (mayUpdate) titleInput.value = nextDefault;
  elements.noteForm.dataset.defaultTitle = mayUpdate ? nextDefault : previousDefault;
  updateNoteCounters();
}

export function updateNoteContextPreview() {
  const elements = ctx.elements;
  if (!elements.noteContextPreview) return;
  const snapshot = buildNoteContextSnapshot({ capturedAt: "" });
  if (!snapshot) {
    elements.noteContextPreview.innerHTML = "<span class=\"note-context-source\">尚未关联资产或交易。</span>";
    return;
  }
  elements.noteContextPreview.innerHTML = renderContextSnapshot(snapshot);
}

export function buildNoteContextSnapshot(options = {}) {
  const elements = ctx.elements;
  const state = ctx.getState();
  const assetId = String(elements.noteAssetSelect?.value || "").trim();
  const transactionLabel = String(elements.noteForm.elements.asset?.value || "").trim();
  const asset = state.assets.find((item) => item.id === assetId);
  const change = transactionLabel
    ? ctx.buildAssetChangeRecords().find((item) => noteTransactionLabel(item) === transactionLabel)
    : null;
  if (!asset && !change) return null;
  const sourceAsset = asset || change.asset;
  const priceStatus = resolvePriceStatus(sourceAsset);
  return {
    version: 1,
    capturedAt: options.capturedAt === "" ? "" : new Date().toISOString(),
    assetId: String(sourceAsset.id || ""),
    assetName: String(sourceAsset.name || ""),
    symbol: String(sourceAsset.symbol || ""),
    account: String(sourceAsset.account || ""),
    currency: String(sourceAsset.currency || ""),
    quantity: String(sourceAsset.quantity || ""),
    costPrice: String(sourceAsset.costPrice || ""),
    currentPrice: String(sourceAsset.currentPrice || ""),
    pricedAt: String(sourceAsset.pricedAt || ""),
    priceSource: String(sourceAsset.priceSource || ""),
    priceStatus: priceStatus.key,
    priceStatusLabel: priceStatus.label,
    transactionLabel,
    transactionDate: String(change?.date || ""),
    transactionAction: String(change?.action || ""),
    transactionQuantity: String(change?.quantity || ""),
    transactionPrice: String(change?.changePrice || "")
  };
}

function renderContextSnapshot(snapshot) {
  const assetSummary = [snapshot.assetName, snapshot.symbol, snapshot.account].filter(Boolean).join(" · ") || "未关联资产";
  const priceSummary = [
    formatUnitPrice(snapshot.currentPrice, snapshot.currency, "待补价格"),
    snapshot.priceStatusLabel,
    snapshot.pricedAt,
    snapshot.priceSource
  ].filter(Boolean).join(" · ");
  return `
    <dl>
      <div><dt>资产</dt><dd>${escapeHtml(assetSummary)}</dd></div>
      <div><dt>当前价</dt><dd>${escapeHtml(priceSummary)}</dd></div>
      ${snapshot.transactionLabel ? `<div><dt>交易</dt><dd>${escapeHtml(snapshot.transactionLabel)}</dd></div>` : ""}
    </dl>
  `;
}
