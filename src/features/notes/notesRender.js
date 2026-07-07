import { normalizeQuickMatchText } from "../assets/assetQuickMatch.js";
import { emptyActionState } from "../../ui/emptyState.js";
import { formatDisplayCurrency } from "../../ui/formatters.js";
import { escapeHtml } from "../../utils/dom.js";
import { renderNoteContent } from "./markdown.js";

const NOTE_FILTERS = ["全部", "交易复盘", "持有观察", "原则", "交易心理", "理财学习"];

let ctx = {};

export function configureNotesRender(context) {
  ctx = context;
}

export function renderNotes() {
  const state = ctx.getState();
  const elements = ctx.elements;
  const tags = noteTagSummary();
  const activeFilter = elements.noteFilterTags.querySelector(".is-active")?.dataset.noteFilter || "全部";
  const query = normalizeQuickMatchText(elements.notesSearch.value || "");
  elements.notesMeta.textContent = `共 ${state.notes.length} 条复盘 / ${tags.length} 个标签`;
  elements.noteFilterTags.innerHTML = renderNoteFilterTags(tags, activeFilter);
  const notes = state.notes.filter((note) => {
    const noteTags = noteTagsFor(note);
    const matchesTag = activeFilter === "全部" || noteTypeForNote(note) === activeFilter || noteTags.includes(activeFilter);
    const haystack = normalizeQuickMatchText([note.title, note.content, note.asset, noteAssetLabel(note), noteTags.join(" ")].join(" "));
    return matchesTag && (!query || haystack.includes(query));
  });
  if (!notes.length) {
    elements.notesList.innerHTML = emptyActionState(
      state.notes.length ? "没有匹配的复盘" : "暂无复盘",
      "",
      "写复盘",
      "write-note"
    );
    elements.notesReader.classList.add("is-hidden");
    delete elements.notesReader.dataset.noteId;
    return;
  }

  const selectedId = notes.some((note) => note.id === elements.notesReader.dataset.noteId)
    ? elements.notesReader.dataset.noteId
    : notes[0].id;

  elements.notesList.innerHTML = notes
    .map((note) => {
      const displayTags = noteDisplayTagsFor(note);
      const isSelected = note.id === selectedId;
      return `
        <article class="note-card${isSelected ? " is-active" : ""}" data-open-note-id="${escapeHtml(note.id)}" tabindex="0" role="button" aria-label="查看复盘：${escapeHtml(note.title)}">
          <div class="note-card-main">
            <div class="note-card-meta">
              ${displayTags.map((tag) => `<span>${escapeHtml(`#${tag}`)}</span>`).join("")}
              <time>${escapeHtml(formatNoteDate(note.updatedAt || note.createdAt))}</time>
            </div>
            <h3>${escapeHtml(note.title)}</h3>
          </div>
          <div class="note-card-preview">
            <p>${escapeHtml(noteExcerpt(note))}</p>
            ${noteAssetLabel(note) ? `<small>🔗 关联资产：${escapeHtml(noteAssetLabel(note))}</small>` : ""}
            ${note.asset ? renderLinkedChangePreview(note) : ""}
          </div>
          <details class="note-card-menu">
            <summary aria-label="更多操作">...</summary>
            <button type="button" data-edit-note-id="${note.id}">编辑</button>
            <button type="button" data-delete-note-id="${note.id}">删除</button>
          </details>
        </article>
      `;
    })
    .join("");
  showNoteReader(selectedId, { scroll: false });
}

export function noteTagsFor(note) {
  if (Array.isArray(note.tags) && note.tags.length) return note.tags.map(normalizeNoteReviewTag);
  if (note.status === "draft") return ["草稿"];
  if (note.assetId || note.asset) return ["交易复盘"];
  return ["理财学习"];
}

export function noteTypeFromTags(tags) {
  return tags.map(normalizeNoteReviewTag).find((tag) => NOTE_FILTERS.includes(tag) && tag !== "全部") || "交易复盘";
}

export function noteDisplayTagsFor(note) {
  const tags = uniqueNoteTags(noteTagsFor(note));
  const type = noteTypeForNote(note);
  if (!tags.length) return [type];
  const customTags = tags.filter((tag) => !NOTE_FILTERS.includes(tag));
  const orderedTags = customTags.length ? [...customTags, ...tags.filter((tag) => NOTE_FILTERS.includes(tag))] : tags;
  return orderedTags.slice(0, 3);
}

export function noteAssetLabel(note) {
  const state = ctx.getState();
  const asset = state.assets.find((item) => item.id === (note.assetId || inferNoteAssetId(note)));
  if (!asset) return "";
  const meta = [asset.symbol, asset.account].filter(Boolean).join(" · ");
  return meta ? `${asset.name}（${meta}）` : asset.name;
}

export function inferNoteAssetId(note) {
  const state = ctx.getState();
  const text = `${note.asset || ""} ${note.title || ""} ${note.content || ""}`;
  const match = state.assets.find((asset) => text.includes(asset.name) || (asset.symbol && text.includes(asset.symbol)));
  return match?.id || "";
}

export function findNoteForChange(change) {
  const state = ctx.getState();
  const label = ctx.noteTransactionLabel(change);
  return state.notes.find((note) =>
    note.asset === label ||
    (note.assetId && note.assetId === change.asset.id && note.asset && label.includes(note.asset))
  );
}

export function findReviewNote(asset) {
  const state = ctx.getState();
  return state.notes.find((note) => {
    const linkedAssetId = note.assetId || inferNoteAssetId(note);
    if (linkedAssetId && linkedAssetId === asset.id) return true;
    const text = `${note.asset || ""} ${note.title || ""} ${note.content || ""}`;
    return text.includes(asset.name) || (asset.symbol && text.includes(asset.symbol));
  });
}

export function showNoteReader(id, options = {}) {
  const state = ctx.getState();
  const elements = ctx.elements;
  const note = state.notes.find((item) => item.id === id);
  if (!note) return;
  elements.notesReader.dataset.noteId = note.id;
  elements.noteReaderTitle.textContent = note.title || "未命名复盘";
  const linkedAsset = noteAssetLabel(note);
  const linkedChange = findLinkedChangeForNote(note);
  const noteDate = formatNoteDate(note.updatedAt || note.createdAt);
  elements.noteReaderMeta.innerHTML = renderNoteReaderMeta(note, {
    noteDate,
    type: noteTypeForNote(note),
    linkedAsset,
    linkedChange
  });
  elements.noteReaderAsset.innerHTML = "";
  elements.noteReaderAsset.classList.add("is-hidden");
  elements.noteReaderContent.innerHTML = renderNoteContent(note);
  elements.notesEditor.classList.add("is-hidden");
  elements.notesReader.classList.remove("is-hidden");
  elements.notesHome.classList.remove("is-hidden");
  elements.notesList.querySelectorAll(".note-card").forEach((card) => {
    card.classList.toggle("is-active", card.dataset.openNoteId === note.id);
  });
  if (options.scroll !== false) {
    elements.notesReader.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

export function hideNoteReader() {
  const elements = ctx.elements;
  elements.notesReader.classList.add("is-hidden");
  elements.notesHome.classList.remove("is-hidden");
  delete elements.notesReader.dataset.noteId;
}

function noteTagSummary() {
  const state = ctx.getState();
  const tags = new Set();
  state.notes.forEach((note) => noteTagsFor(note).forEach((tag) => tags.add(tag)));
  return [...tags];
}

function renderNoteFilterTags(tags, activeFilter) {
  const customTags = tags.filter((tag) => tag !== "全部" && !NOTE_FILTERS.includes(tag));
  const coreTags = [...NOTE_FILTERS, ...customTags];
  const iconFor = (tag) => ({
    全部: "▦",
    交易复盘: "♙",
    持有观察: "◌",
    原则: "¶",
    交易心理: "◈",
    理财学习: "◉",
    草稿: "□"
  }[tag] || "▣");
  return coreTags
    .map((tag) => `<button class="${tag === activeFilter ? "is-active" : ""}" data-note-filter="${escapeHtml(tag)}" type="button"><span aria-hidden="true">${iconFor(tag)}</span>${tag === "全部" ? "全部" : escapeHtml(tag)}</button>`)
    .join("");
}

function normalizeNoteReviewTag(tag) {
  const normalized = String(tag || "").trim();
  if (normalized === "复盘") return "交易复盘";
  return normalized;
}

function uniqueNoteTags(tags) {
  return [...new Set(tags.map(normalizeNoteReviewTag).filter(Boolean))];
}

function noteTypeForNote(note) {
  const storedType = normalizeNoteReviewTag(note.type);
  if (NOTE_FILTERS.includes(storedType) && storedType !== "全部") return storedType;
  return noteTypeFromTags(noteTagsFor(note));
}

function renderLinkedChangePreview(note) {
  const change = findLinkedChangeForNote(note);
  if (!change) return `<small>关联交易：${escapeHtml(note.asset)}</small>`;
  return `
    <button class="linked-change-button" data-open-linked-change-id="${escapeHtml(change.id)}" type="button">
      关联交易：${escapeHtml(note.asset)}
    </button>
  `;
}

function findLinkedChangeForNote(note) {
  if (!note.asset) return null;
  return ctx.buildAssetChangeRecords().find((change) => {
    const label = ctx.noteTransactionLabel(change);
    return label === note.asset || (note.assetId && change.asset.id === note.assetId && label.includes(note.asset));
  }) || null;
}

function noteExcerpt(note) {
  return String(note.content || "").replace(/[#*_`>-]/g, "").replace(/\s+/g, " ").trim().slice(0, 128) || "暂无正文";
}

function formatNoteDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function renderNoteReaderMeta(note, details) {
  const tags = renderNoteReaderTags(noteDisplayTagsFor(note));
  const status = note.status === "draft" ? "<span class=\"note-status-pill\">草稿</span>" : "";
  if (isBlankTemplateNote(note)) {
    return [tags, status].filter(Boolean).join("");
  }

  const realizedReturn = noteRealizedReturnLabel(note, details.linkedChange);
  const linkedAssetId = note.assetId || inferNoteAssetId(note);
  const rows = [
    { label: "日期", value: details.noteDate || "-" },
    { label: "类型", value: details.type || "交易复盘" },
    {
      label: "关联资产",
      value: details.linkedAsset || "未关联",
      html: details.linkedAsset && linkedAssetId
        ? `<button class="linked-change-button reader-link" data-open-linked-asset-id="${escapeHtml(linkedAssetId)}" type="button">${escapeHtml(details.linkedAsset)}</button>`
        : ""
    },
    {
      label: "关联交易",
      value: note.asset || "未关联",
      html: note.asset && details.linkedChange
        ? `<button class="linked-change-button reader-link" data-open-linked-change-id="${escapeHtml(details.linkedChange.id)}" type="button">${escapeHtml(note.asset)}</button>`
        : ""
    },
    { label: "实现收益", value: realizedReturn }
  ];
  return `
    ${tags}
    <dl class="note-reader-meta-grid">
      ${rows.map((row) => `
        <div>
          <dt>${escapeHtml(row.label)}</dt>
          <dd>${row.html || escapeHtml(row.value)}</dd>
        </div>
      `).join("")}
    </dl>
    ${status}
  `;
}

function renderNoteReaderTags(tags) {
  if (!tags.length) return "";
  return `
    <div class="note-reader-tags" aria-label="笔记标签">
      ${tags.map((tag) => `<span>${escapeHtml(`#${tag}`)}</span>`).join("")}
    </div>
  `;
}

function isBlankTemplateNote(note) {
  if (note.template) return note.template === "blank";
  return !note.asset && !note.assetId && note.realizedPnlCents === undefined;
}

function noteRealizedReturnLabel(note, linkedChange = null) {
  const state = ctx.getState();
  if (note.realizedPnlCents !== undefined) return formatDisplayCurrency(BigInt(note.realizedPnlCents || "0"));
  const asset = linkedChange?.asset || state.assets.find((item) => item.id === (note.assetId || inferNoteAssetId(note)));
  if (!asset) return "未记录";
  if (asset.realizedPnlCents !== undefined) return formatDisplayCurrency(ctx.convertUsdToDisplay(BigInt(asset.realizedPnlCents || "0")));
  if (linkedChange && (linkedChange.action === "卖出" || linkedChange.action === "清仓")) return "待核对";
  return "未记录";
}
