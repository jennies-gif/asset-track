import { randomId } from "../../utils/ids.js";

let ctx = {};
let pendingCloseReviewAsset = null;
let pendingReviewType = "close";

export function configureNotesActions(context = {}) {
  ctx = { ...ctx, ...context };
}

export function saveNoteFromForm(status = "published") {
  const state = ctx.getState();
  const { elements } = ctx;
  const formData = new FormData(elements.noteForm);
  const editingId = elements.noteForm.dataset.editingId;
  let title = String(formData.get("title") || "").trim();
  let content = String(formData.get("content") || "").trim();
  const tags = formData.getAll("tags").map((tag) => String(tag).trim()).filter(Boolean);
  const customTag = String(formData.get("customTag") || "").trim().replace(/^#/, "");
  if (customTag) tags.push(customTag);
  const asset = String(formData.get("asset") || "").trim();
  const assetId = String(formData.get("assetId") || "").trim();
  const format = String(formData.get("format") || "plain");
  const type = ctx.noteTypeFromTags(tags);

  if (status !== "draft" && (!title || !content)) {
    elements.noteForm.reportValidity();
    return;
  }

  if (status === "draft") {
    if (!title && !content) {
      elements.noteForm.elements.title.focus();
      return;
    }
    title = title || "未命名草稿";
  }

  if (editingId) {
    state.notes = state.notes.map((note) =>
      note.id === editingId
        ? {
            ...note,
            title,
            asset,
            assetId,
            type,
            tags,
            format,
            status,
            content,
            updatedAt: new Date().toISOString()
          }
        : note
    );
  } else {
    state.notes = [{
      id: randomId("note"),
      title,
      asset,
      assetId,
      type,
      tags,
      format,
      status,
      content,
      createdAt: new Date().toISOString()
    }, ...state.notes];
  }

  elements.noteForm.reset();
  ctx.hideNoteEditor();
  ctx.persistAndRender();
}

export function openNoteById(id) {
  const note = ctx.getState().notes.find((item) => item.id === id);
  if (!note) return;
  ctx.activateTab("notes");
  requestAnimationFrame(() => ctx.showNoteReader(note.id));
}

export function openReviewNoteForAsset(assetId) {
  const asset = ctx.getState().assets.find((item) => item.id === assetId);
  if (!asset) return;
  const note = ctx.findReviewNote(asset);
  ctx.activateTab("notes");
  if (!note) {
    ctx.openCloseReviewNote(asset, "close");
    return;
  }
  requestAnimationFrame(() => ctx.showNoteReader(note.id));
}

export function showCloseReviewPrompt(asset, type = "close") {
  const { elements } = ctx;
  pendingCloseReviewAsset = asset;
  pendingReviewType = type;
  elements.closeReviewModal.dataset.assetId = asset.id;
  const actionLabel = { buy: "买入", sell: "卖出", close: "清仓" }[type] || "操作";
  elements.closeReviewModal.querySelector("#close-review-title").textContent = `记录这次${actionLabel}`;
  elements.closeReviewMessage.textContent = `${asset.name} 已完成${actionLabel}。可以顺手写一条复盘，把原因、情绪或结论留存下来。`;
  elements.closeReviewModal.classList.remove("is-hidden");
  elements.closeReviewWrite.focus();
}

export function hideCloseReviewPrompt() {
  const { elements } = ctx;
  pendingCloseReviewAsset = null;
  pendingReviewType = "close";
  delete elements.closeReviewModal.dataset.assetId;
  elements.closeReviewModal.classList.add("is-hidden");
}

export function openPendingCloseReviewNote() {
  const { elements } = ctx;
  const asset = pendingCloseReviewAsset;
  elements.closeReviewModal.classList.add("is-hidden");
  delete elements.closeReviewModal.dataset.assetId;
  if (!asset) return;
  ctx.openCloseReviewNote(asset, pendingReviewType || "close");
  pendingCloseReviewAsset = null;
  pendingReviewType = "close";
}

export function openAssetChangeById(changeId) {
  if (!changeId) return;
  ctx.activateTab("assets");
  ctx.activatePortfolioView("changes");
  requestAnimationFrame(() => {
    ctx.renderPortfolio();
    const row = [...(ctx.assetElements.assetChangeRows?.querySelectorAll("[data-change-id]") || [])]
      .find((item) => item.dataset.changeId === changeId);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("is-highlighted");
    setTimeout(() => row.classList.remove("is-highlighted"), 1800);
  });
}

export function openAssetById(assetId) {
  if (!assetId) return;
  const asset = ctx.getState().assets.find((item) => item.id === assetId);
  if (!asset) return;
  ctx.activateTab("assets");
  ctx.activatePortfolioView(asset.closed ? "history" : "open");
  requestAnimationFrame(() => {
    ctx.renderPortfolio();
    const row = [...document.querySelectorAll("[data-asset-row-id]")]
      .find((item) => item.dataset.assetRowId === assetId);
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("is-highlighted");
    setTimeout(() => row.classList.remove("is-highlighted"), 1800);
  });
}

export function editNote(id) {
  const note = ctx.getState().notes.find((item) => item.id === id);
  if (!note) return;
  ctx.showNoteEditor(note);
}

export function deleteNote(id) {
  const state = ctx.getState();
  state.notes = state.notes.filter((item) => item.id !== id);
}

export function toggleBody(button) {
  const body = document.getElementById(button.dataset.toggleBodyId);
  if (!body) return;
  const collapsed = body.classList.toggle("is-collapsed");
  button.textContent = collapsed ? "展开" : "收起";
}
