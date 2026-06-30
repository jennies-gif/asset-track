import { normalizeSettings } from "../../state/normalizers.js";

let ctx = {};

export function configureDisplayCurrencyActions(context = {}) {
  ctx = { ...ctx, ...context };
}

export function handleInlineCurrencyChange(event) {
  const select = event.target.closest("[data-display-currency]");
  if (!select) return;
  const state = ctx.getState();
  state.settings = normalizeSettings({
    ...state.settings,
    displayCurrency: select.value
  });
  ctx.syncSettingsForm();
  ctx.saveCurrentState();
  ctx.render();
}
