import { normalizeSettings, normalizeSession } from "../../state/normalizers.js";

let ctx = {};

export function configureSettingsRender(context) {
  ctx = context;
}

export function syncSettingsForm() {
  const state = ctx.getState();
  state.settings = normalizeSettings(state.settings);
  ctx.elements.settingCurrency.value = state.settings.displayCurrency;
  ctx.elements.settingUsdCnyRate.value = state.settings.usdCnyRate;
  ctx.elements.settingBtcUsdRate.value = state.settings.btcUsdRate;
  ctx.elements.settingUsdHkdRate.value = state.settings.usdHkdRate;
  ctx.elements.settingLanguage.value = state.settings.language;
  ctx.elements.settingFont.value = state.settings.font;
  ctx.elements.settingTheme.value = state.settings.theme;
}

export function readSettingsForm() {
  return normalizeSettings({
    displayCurrency: ctx.elements.settingCurrency.value,
    usdCnyRate: ctx.elements.settingUsdCnyRate.value,
    btcUsdRate: ctx.elements.settingBtcUsdRate.value,
    usdHkdRate: ctx.elements.settingUsdHkdRate.value,
    language: ctx.elements.settingLanguage.value,
    font: ctx.elements.settingFont.value,
    theme: ctx.elements.settingTheme.value
  });
}

export function applySettings() {
  const state = ctx.getState();
  state.settings = normalizeSettings(state.settings);
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.font = state.settings.font;
  document.documentElement.lang = state.settings.language === "en" ? "en" : "zh-CN";
  applyLanguage();
}

export function renderAuthState() {
  const state = ctx.getState();
  state.session = normalizeSession(state.session);
  const name = state.session.signedIn ? state.session.name || "本地用户" : "登录";
  ctx.elements.authButton.textContent = state.session.signedIn ? name.slice(0, 1).toUpperCase() : "登";
  ctx.elements.authButton.setAttribute("aria-label", `${name}菜单`);
  ctx.elements.authButton.title = name;
  ctx.elements.authEmail.value = state.session.email || "";
  ctx.elements.authName.value = state.session.name || "";
  ctx.elements.authPassword.value = "";
  if (!state.session.signedIn) ctx.elements.authUserMenu.classList.add("is-hidden");
}

function applyLanguage() {
  const state = ctx.getState();
  const isEnglish = state.settings?.language === "en";
  document.querySelector(".brand").innerHTML = `
    <img class="brand-icon" src="/public/icon.svg" alt="">
    <span class="brand-copy">
      <strong>资产轨迹</strong>
      <small>${isEnglish ? "An asset recordkeeping and investment review tool for individual investors" : "一款面向个人投资者的资产记录和投资复盘工具"}</small>
    </span>
  `;
  ctx.elements.settingsButton.textContent = isEnglish ? "Settings" : "设置";
  setTabLabel("home", isEnglish ? "Overview" : "总览");
  setTabLabel("assets", isEnglish ? "Assets" : "资产");
  setTabLabel("analysis", isEnglish ? "Analysis" : "分析");
  setTabLabel("notes", isEnglish ? "Journal" : "复盘");
  document.querySelectorAll(".privacy-note").forEach((note) => {
    note.textContent = isEnglish
      ? "Private asset details stay in this browser. Public query fields such as symbols, markets and date ranges may be sent to the market-data service. Export JSON backups regularly."
      : "私人资产明细保存在当前浏览器；证券代码、市场和日期范围等公共查询字段可能发送给行情服务。请定期导出 JSON 备份。";
  });
  document.querySelectorAll(".risk-note").forEach((note) => {
    note.textContent = isEnglish
      ? "Risk notice: data is for recordkeeping and analysis only. It is not investment advice."
      : "风险提示：数据仅供记录和分析，不构成投资建议。";
  });
  document.querySelectorAll(".backup-note").forEach((note) => {
    note.textContent = isEnglish
      ? "Data is stored in this browser. During the MVP, export a JSON backup after meaningful data entry or edits to avoid data loss if browser storage is cleared."
      : "当前数据保存在本机浏览器中。上线 MVP 阶段建议每次集中录入或修改后导出 JSON 备份，避免清理浏览器数据后丢失。";
  });
  document.querySelectorAll(".market-data-note").forEach((note) => {
    note.textContent = isEnglish
      ? "Market data note: you can manually sync cached prices for stocks, ETFs, metals, crypto assets and FX rates. Prices may be delayed or missing; verify sources and transaction records."
      : "行情说明：可手动同步股票、ETF、贵金属、数字资产和汇率缓存；价格可能延迟或缺失，请以来源与交易确认记录为准。";
  });
  document.querySelectorAll(".site-status-note").forEach((note) => {
    note.textContent = isEnglish
      ? "Private data saved locally · Market queries send public fields only · Prices may be delayed · For records and reviews only"
      : "私人数据本地保存 · 行情仅发送公共查询字段 · 价格可能延迟 · 仅供记录与复盘";
  });
}

function setTabLabel(tabName, label) {
  const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if (!tab) return;
  const labelNode = tab.querySelector(".tab-label");
  if (labelNode) {
    labelNode.textContent = label;
    return;
  }
  tab.textContent = label;
}
