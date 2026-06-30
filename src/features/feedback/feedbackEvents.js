const FEEDBACK_EMAIL = "jennieshen1027@gmail.com";

let ctx = {};

export function initFeedbackEvents(context = {}) {
  ctx = context;
  const elements = feedbackElements();
  if (!elements.openButton || !elements.modal || !elements.body) return;

  elements.openButton.addEventListener("click", () => openFeedbackModal());
  elements.cancelButton?.addEventListener("click", closeFeedbackModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeFeedbackModal();
  });
  elements.copyButton?.addEventListener("click", copyFeedbackText);
  elements.contact?.addEventListener("input", updateMailLink);
  elements.body?.addEventListener("input", updateMailLink);
}

function feedbackElements() {
  return {
    openButton: document.querySelector("#open-feedback-modal"),
    modal: document.querySelector("#feedback-modal"),
    cancelButton: document.querySelector("#feedback-cancel"),
    copyButton: document.querySelector("#copy-feedback"),
    contact: document.querySelector("#feedback-contact"),
    body: document.querySelector("#feedback-body"),
    status: document.querySelector("#feedback-status"),
    mailLink: document.querySelector("#feedback-mail-link")
  };
}

function openFeedbackModal() {
  const elements = feedbackElements();
  elements.modal?.classList.remove("is-hidden");
  if (elements.body && !String(elements.body.value || "").trim()) {
    elements.body.value = buildFeedbackTemplate();
  }
  if (elements.status) elements.status.textContent = "";
  updateMailLink();
  elements.body?.focus();
}

function closeFeedbackModal() {
  feedbackElements().modal?.classList.add("is-hidden");
}

async function copyFeedbackText() {
  const elements = feedbackElements();
  const text = buildFeedbackPayload();
  try {
    await navigator.clipboard.writeText(text);
    if (elements.status) elements.status.textContent = "已复制反馈内容。";
  } catch {
    if (elements.status) elements.status.textContent = "复制失败，请手动选择文本复制。";
    elements.body?.select();
  }
}

function updateMailLink() {
  const elements = feedbackElements();
  if (!elements.mailLink) return;
  const subject = encodeURIComponent("资产轨迹 MVP 试用反馈");
  const body = encodeURIComponent(buildFeedbackPayload());
  elements.mailLink.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}

function buildFeedbackPayload() {
  const elements = feedbackElements();
  const contact = String(elements.contact?.value || "").trim();
  const body = String(elements.body?.value || "").trim() || buildFeedbackTemplate();
  return [contact ? `联系方式：${contact}` : "联系方式：", "", body].join("\n");
}

function buildFeedbackTemplate() {
  const state = ctx.getState?.() || {};
  const assets = Array.isArray(state.assets) ? state.assets : [];
  const openAssets = assets.filter((asset) => !asset.closed);
  const closedAssets = assets.filter((asset) => asset.closed);
  const notes = Array.isArray(state.notes) ? state.notes : [];
  const transactionCount = assets.reduce((total, asset) => total + (Array.isArray(asset.sellRecords) ? asset.sellRecords.length : 0), 0);
  const demoMode = assets.some((asset) => String(asset.id || "").startsWith("demo-"));
  return [
    "我试用的版本：本地 MVP",
    `当前模式：${demoMode ? "示例数据" : "自有数据/空白数据"}`,
    `试用数据概况：当前持仓 ${openAssets.length} 个，历史持仓 ${closedAssets.length} 个，交易记录约 ${transactionCount} 条，复盘 ${notes.length} 条`,
    "",
    "1. 我完成了哪些操作？",
    "- 添加资产：",
    "- 记录交易：",
    "- 查看分析/图表：",
    "- 写复盘：",
    "- 导出备份：",
    "",
    "2. 哪一步最卡？",
    "",
    "3. 哪个数字或图表让我不信任？为什么？",
    "",
    "4. 哪个功能最有价值？",
    "",
    "5. 如果继续使用，我最需要补什么？",
    "",
    "6. 是否愿意为它付费？愿意/不愿意的原因是什么？",
    "",
    "请勿附加完整资产备份、真实账户凭据、身份证明或其他敏感材料。"
  ].join("\n");
}
