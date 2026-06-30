import { escapeHtml } from "../utils/dom.js";

export function emptyStateInner(title, description) {
  return `
    <div class="empty-state empty-state-block">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </div>
  `;
}

export function emptyActionState(title, description, actionLabel = "", action = "") {
  return `
    <div class="empty-state empty-state-block empty-state-action">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
      ${action ? `<button class="primary-button compact-button" data-home-action="${escapeHtml(action)}" type="button">${escapeHtml(actionLabel)}</button>` : ""}
    </div>
  `;
}
