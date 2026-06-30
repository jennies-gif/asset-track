import { escapeHtml } from "../../utils/dom.js";

export function renderNoteContent(note) {
  if (!String(note.content || "").trim()) {
    return `<p class="note-empty-hint">暂无记录，建议补充这次操作的决策依据。</p>`;
  }
  if (note.format === "plain") {
    return `<p>${escapeHtml(note.content).replace(/\n/g, "<br>")}</p>`;
  }
  return renderMarkdown(note.content);
}

export function renderMarkdown(content) {
  const lines = escapeHtml(content).split(/\r?\n/);
  const html = [];
  let listOpen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      continue;
    }

    if (trimmed.startsWith("## ")) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<h4>${formatInlineMarkdown(trimmed.slice(3))}</h4>`);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${formatInlineMarkdown(trimmed.slice(2))}</li>`);
      continue;
    }

    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
    html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
  }

  if (listOpen) html.push("</ul>");
  return html.join("");
}

function formatInlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
