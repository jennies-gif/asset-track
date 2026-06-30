import { escapeHtml } from "../utils/dom.js";

export function trustBadge(label, className = "") {
  return `<span class="trust-badge ${escapeHtml(className)}">${escapeHtml(label)}</span>`;
}

export function snapshotKpi(label, value, className = "") {
  return `
    <span class="snapshot-kpi">
      <small>${escapeHtml(label)}</small>
      <b class="${escapeHtml(className)}">${escapeHtml(value)}</b>
    </span>
  `;
}

export function snapshotStatusRow(label, value, className = "") {
  return `
    <span class="snapshot-status-row">
      <small>${escapeHtml(label)}</small>
      <b class="${escapeHtml(className)}">${escapeHtml(value)}</b>
    </span>
  `;
}
