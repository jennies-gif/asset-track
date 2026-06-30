export function getSettingsElements() {
  return {
    settingsButton: document.querySelector("#settings-button"),
    settingsPanel: document.querySelector("#settings-panel"),
    authButton: document.querySelector("#auth-button"),
    authPanel: document.querySelector("#auth-panel"),
    authEmail: document.querySelector("#auth-email"),
    authPassword: document.querySelector("#auth-password"),
    authName: document.querySelector("#auth-name"),
    authStatus: document.querySelector("#auth-status"),
    authLogoutButton: document.querySelector("#auth-logout-button"),
    settingCurrency: document.querySelector("#setting-currency"),
    settingUsdCnyRate: document.querySelector("#setting-usd-cny-rate"),
    settingBtcUsdRate: document.querySelector("#setting-btc-usd-rate"),
    settingUsdHkdRate: document.querySelector("#setting-usd-hkd-rate"),
    settingLanguage: document.querySelector("#setting-language"),
    settingFont: document.querySelector("#setting-font"),
    settingTheme: document.querySelector("#setting-theme"),
    resetDemo: document.querySelector("#reset-demo")
  };
}
