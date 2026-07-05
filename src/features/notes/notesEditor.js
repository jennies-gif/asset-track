import { formatDisplayCurrency } from "../../ui/formatters.js";
import { formatDate } from "../../utils/date.js";
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
  setNoteTemplateSelection(template);
  elements.noteForm.dataset.template = template;
  if (contentInput) contentInput.value = buildReviewTemplate(template, { asset, actionType: type });
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
  setNoteTemplateSelection(template);
  elements.noteForm.dataset.template = template;
  if (contentInput) contentInput.value = buildReviewTemplate(template, { asset: change.asset, change, actionType: change.action });
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
  const state = ctx.getState();
  const contentInput = elements.noteForm.elements.content;
  const titleInput = elements.noteForm.elements.title;
  const selectedAsset = state.assets.find((asset) => asset.id === elements.noteAssetSelect?.value);
  const currentContent = contentInput.value.trim();
  const currentTemplate = elements.noteForm.dataset.template || "";
  const currentTemplateContent = currentTemplate ? buildReviewTemplate(currentTemplate, { asset: selectedAsset }) : "";
  const canOverwrite = options.overwrite || !currentContent || currentContent === currentTemplateContent.trim();
  if (!canOverwrite) {
    setNoteTemplateSelection(currentTemplate || "blank");
    return;
  }

  setNoteTemplateSelection(template);
  elements.noteForm.dataset.template = template;
  contentInput.value = buildReviewTemplate(template, { asset: selectedAsset });
  if (!titleInput.value.trim()) {
    titleInput.value = {
      buy: selectedAsset ? `${selectedAsset.name} 买入复盘` : "买入复盘",
      hold: selectedAsset ? `${selectedAsset.name} 持有观察` : "持有观察",
      close: selectedAsset ? `${selectedAsset.name} 清仓复盘` : "清仓复盘"
    }[template] || "";
  }
  const defaultTag = template === "hold" ? "持有观察" : "交易复盘";
  const reviewTag = elements.noteForm.querySelector(`input[name="tags"][value="${defaultTag}"]`);
  if (template !== "blank" && reviewTag) reviewTag.checked = true;
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
    setNoteAssetLink(note.assetId || inferNoteAssetId(note));
    elements.noteForm.elements.format.value = note.format || "plain";
    elements.noteForm.elements.status.value = note.status || "published";
    setNoteTemplateSelection("blank");
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
  clearDynamicNoteTags();
  elements.noteCustomTagField.classList.add("is-hidden");
  clearNoteTransactionLink();
  setNoteTemplateSelection("blank");
  delete elements.noteForm.dataset.editingId;
  updateNoteCounters();
}

export function commitCustomNoteTag() {
  const elements = ctx.elements;
  const tag = normalizeNoteTag(elements.noteForm.elements.customTag.value);
  elements.noteForm.elements.customTag.value = "";
  elements.noteCustomTagField.classList.add("is-hidden");
  if (!tag) return;
  addCustomNoteTag(tag);
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
    return;
  }
  const selectedOption = elements.noteTransactionSelect.selectedOptions[0];
  if (selectedOption?.dataset.assetId) setNoteAssetLink(selectedOption.dataset.assetId);
  setNoteTransactionLink(value);
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

function buildReviewTemplate(template = "blank", context = {}) {
  if (template === "buy") return buildBuyReviewTemplate(context.asset, context.change);
  if (template === "hold") return buildHoldReviewTemplate(context.asset);
  if (template === "close") return buildCloseReviewTemplate(context.asset, context.actionType || "close", context.change);
  return "";
}

function buildBuyReviewTemplate(asset = {}, change = null) {
  const factLines = [
    `买入事实：${asset.name || "未关联资产"} / ${asset.account || "未填写账户"} / ${change?.date || formatDate(asset.purchaseDate || asset.updatedAt)}`,
    `数量：${change?.quantity || asset.quantity || "未填写"}`,
    `买入价格：${change?.changePrice || asset.costPrice || "未填写"} ${asset.currency || ""}`.trim(),
    `资金来源：${asset.contribution ? `${asset.contribution} ${asset.currency || ""}`.trim() : "未填写"}`
  ];
  return [
    ...factLines,
    "",
    "买入理由：",
    asset.buyReason || "",
    "",
    "核心假设：",
    "",
    "主要风险：",
    "",
    "后续验证点："
  ].join("\n");
}

function buildHoldReviewTemplate(asset = {}) {
  return [
    `观察对象：${asset.name || "未关联资产"} / ${asset.account || "未填写账户"}`,
    `当前价格：${asset.currentPrice || "未填写"} ${asset.currency || ""}`.trim(),
    `成本价格：${asset.costPrice || "未填写"} ${asset.currency || ""}`.trim(),
    "",
    "持有理由是否仍成立：",
    "",
    "这段时间发生了什么变化：",
    "",
    "需要继续观察的指标或事件：",
    "",
    "下一次复盘时间："
  ].join("\n");
}

function buildCloseReviewTemplate(asset = {}, type = "close", change = null) {
  const actionLabel = { buy: "买入", sell: "卖出", close: "清仓" }[type] || "清仓";
  const realizedPnl =
    asset.realizedPnlCents !== undefined ? formatDisplayCurrency(ctx.convertUsdToDisplay(BigInt(asset.realizedPnlCents || "0"))) : "待核对";
  const factLines = [
    `${actionLabel}事实：${asset.name || "未关联资产"} / ${asset.account || "未填写账户"} / ${change?.date || formatDate(asset.closedAt || asset.purchaseDate || asset.updatedAt)}`,
    `成交价格：${change?.changePrice || asset.closePrice || asset.currentPrice || asset.costPrice || "未填写"} ${asset.currency || ""}`.trim()
  ];
  if (type !== "buy") factLines.push(`已实现收益：${realizedPnl}`);
  return [
    ...factLines,
    "",
    `${actionLabel}原因：`,
    asset.closeReason || "",
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
  deleteButton.addEventListener("click", () => tagControl.remove());
  tagControl.append(input, chip, editButton, deleteButton);
  elements.noteNewTagButton.before(tagControl);
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
      return;
    }
    input.value = nextTag;
    chip.textContent = `# ${nextTag}`;
    editor.replaceWith(chip);
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

function populateNoteTransactionOptions() {
  const elements = ctx.elements;
  const changes = ctx.buildAssetChangeRecords();
  elements.noteTransactionSelect.innerHTML = changes.length
    ? `<option value="">不关联交易</option>${changes
        .map((change) => `<option value="${escapeHtml(noteTransactionLabel(change))}" data-asset-id="${escapeHtml(change.asset.id)}">${escapeHtml(noteTransactionLabel(change))}</option>`)
        .join("")}`
    : `<option value="">暂无可关联交易</option>`;
}
