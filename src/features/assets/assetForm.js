import { calculateBuyPreview, calculateMoneyFromQuantity, calculateSellPreview, formatPercent, normalizeAsset, roundDivide, validateAsset } from "../../domain/calculations.js";
import { securityWhitelist } from "../../domain/marketData.js";
import { escapeHtml } from "../../utils/dom.js";
import { todayIsoDate } from "../../utils/date.js";
import { formatDisplayCurrency, formatSignedAmountOnly } from "../../ui/formatters.js";
import { accountNamePresets, accountTypeLabel, inferAccountType, normalizeAccountTypeFormValue } from "./accountOptions.js";
import { findAssetQuickMatch, isManualCashMatch, manualAssetMatches, normalizeQuickMatchText } from "./assetQuickMatch.js";
import { inferAssetMarket, marketLabel } from "./marketOptions.js";
import { buildAssetFormPayload, defaultAssetFxRate } from "./assetFormPayload.js";
import { buildAddAssetUpdate, buildSellAssetUpdate } from "./assetTransactions.js";
import { clearAssetFieldErrors, humanizeAssetError, setTransactionFieldError, validateAssetFormByMode } from "./assetValidation.js";

let ctx = {};

export function configureAssetForm(context) {
  ctx = context;
}

export function startQuickAsset() {
  resetAssetFormMode("create");
  ctx.elements.assetForm.reset();
  syncAccountPickerToName("");
  setDefaultAssetFormValues();
  applyCashAssetFormMode();
  updateAssetLiveSummary();
  ctx.elements.assetError.textContent = "";
  showAssetFormPanel("添加资产", "先建立资产档案；买入、卖出和清仓请从已有持仓的“记录交易”进入。");
}

export function submitAssetForm() {
  clearAssetFieldErrors();
  const state = ctx.getState();
  const editingId = ctx.elements.assetForm.dataset.editingId;
  const closingId = ctx.elements.assetForm.dataset.closingId;
  const sellingId = ctx.elements.assetForm.dataset.sellingId;
  const adjustmentType = ctx.elements.assetForm.elements.adjustmentType?.value || "sell";
  const activeAssetId = editingId || closingId || sellingId;
  const existingAsset = state.assets.find((item) => item.id === activeAssetId);
  let closeReviewAsset = null;
  let reviewPromptType = "";
  const formValidationError = validateAssetFormByMode(existingAsset);
  if (formValidationError) {
    ctx.elements.assetError.textContent = formValidationError;
    return;
  }
  if ((closingId || (sellingId && adjustmentType === "close")) && !confirm("清仓会将该资产移入历史持仓。确认继续？")) {
    return;
  }
  const asset = normalizeAsset(buildAssetFormPayload(existingAsset));
  const error = validateAsset(asset);
  if (error) {
    ctx.elements.assetError.textContent = humanizeAssetError(error);
    return;
  }

  let nextAssets = state.assets;
  if (sellingId && adjustmentType === "buy") {
    const addResult = buildAddAssetUpdate(existingAsset, asset);
    if (addResult.error) {
      ctx.elements.assetError.textContent = addResult.error;
      setTransactionFieldError(addResult.error);
      return;
    }
    reviewPromptType = "buy";
    closeReviewAsset = addResult.asset;
    nextAssets = state.assets.map((item) =>
      item.id === sellingId ? { ...item, ...addResult.asset, id: sellingId, updatedAt: new Date().toISOString() } : item
    );
  } else if (closingId || sellingId) {
    const isClose = Boolean(closingId) || adjustmentType === "close";
    const sellResult = buildSellAssetUpdate(existingAsset, asset, { closeAll: isClose });
    if (sellResult.error) {
      ctx.elements.assetError.textContent = sellResult.error;
      setTransactionFieldError(sellResult.error);
      return;
    }
    reviewPromptType = isClose ? "close" : "sell";
    closeReviewAsset = isClose
      ? sellResult.asset.closed && !existingAsset?.closed ? sellResult.asset : null
      : sellResult.asset;
    nextAssets = state.assets.map((item) =>
      item.id === activeAssetId ? { ...item, ...sellResult.asset, id: activeAssetId, updatedAt: new Date().toISOString() } : item
    );
  } else if (editingId) {
    nextAssets = state.assets.map((item) =>
      item.id === editingId ? { ...item, ...asset, id: editingId, updatedAt: new Date().toISOString() } : item
    );
  } else {
    nextAssets = [asset, ...state.assets];
    closeReviewAsset = asset;
    reviewPromptType = "buy";
  }

  ctx.setState({ ...state, assets: nextAssets });
  ctx.elements.assetForm.reset();
  resetAssetFormMode("create");
  setDefaultAssetFormValues();
  applyCashAssetFormMode();
  updateAssetLiveSummary();
  ctx.elements.assetError.textContent = "";
  hideAssetFormPanel();
  ctx.persistAndRender();
  ctx.activateTab("assets");
  if (closeReviewAsset) ctx.showCloseReviewPrompt(closeReviewAsset, reviewPromptType);
}

export function setDefaultAssetFormValues() {
  if (ctx.elements.assetForm.elements.currentPrice) ctx.elements.assetForm.elements.currentPrice.value = "";
  if (ctx.elements.assetForm.elements.previousPrice) ctx.elements.assetForm.elements.previousPrice.value = "";
  if (ctx.elements.assetForm.elements.previousFxRate) ctx.elements.assetForm.elements.previousFxRate.value = "1";
  if (ctx.elements.assetForm.elements.fxRate) ctx.elements.assetForm.elements.fxRate.value = "1";
  if (ctx.elements.assetForm.elements.contribution) ctx.elements.assetForm.elements.contribution.value = "0";
  if (ctx.elements.assetForm.elements.dividends) ctx.elements.assetForm.elements.dividends.value = "0";
  if (ctx.elements.assetForm.elements.interest) ctx.elements.assetForm.elements.interest.value = "0";
  if (ctx.elements.assetForm.elements.fees) ctx.elements.assetForm.elements.fees.value = "0";
  if (ctx.elements.assetForm.elements.taxes) ctx.elements.assetForm.elements.taxes.value = "0";
  if (ctx.elements.assetForm.elements.manualAdjustment) ctx.elements.assetForm.elements.manualAdjustment.value = "0";
  if (ctx.elements.assetForm.elements.transactionType) ctx.elements.assetForm.elements.transactionType.value = "买入";
  if (ctx.elements.assetForm.elements.priceSource) ctx.elements.assetForm.elements.priceSource.value = "";
  if (ctx.elements.assetForm.elements.priceStatus) ctx.elements.assetForm.elements.priceStatus.value = "";
  if (ctx.elements.assetForm.elements.purchaseDate) ctx.elements.assetForm.elements.purchaseDate.value = todayIsoDate();
}

export function updateAssetLiveSummary() {
  if (!ctx.elements.assetLiveSummary) return;
  if (isTransactionMode()) {
    ctx.elements.assetLiveSummary.innerHTML = "";
    return;
  }
  const quantity = String(ctx.elements.assetForm.elements.quantity?.value || "").trim();
  const costPrice = String(ctx.elements.assetForm.elements.costPrice?.value || "").trim();
  const currentPrice = String(ctx.elements.assetForm.elements.currentPrice?.value || "").trim() || costPrice;
  const fxRate = String(ctx.elements.assetForm.elements.fxRate?.value || "1").trim() || "1";
  const currency = String(ctx.elements.assetForm.elements.currency?.value || "").trim();
  let rows = [
    ["初始成本", "-"],
    ["当前估值", "-"],
    ["浮动收益", "-"]
  ];
  if (quantity && costPrice) {
    try {
      const cost = calculateMoneyFromQuantity(quantity, costPrice, fxRate);
      const market = calculateMoneyFromQuantity(quantity, currentPrice, fxRate);
      rows = [
        ["初始成本", formatDisplayCurrency(ctx.convertUsdToDisplay(cost))],
        ["当前估值", formatDisplayCurrency(ctx.convertUsdToDisplay(market))],
        ["浮动收益", formatSignedAmountOnly(ctx.convertUsdToDisplay(market - cost))]
      ];
    } catch {
      rows[0][1] = "待检查输入";
    }
  }
  ctx.elements.assetLiveSummary.innerHTML = `
    ${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    <p>${String(ctx.elements.assetForm.elements.currentPrice?.value || "").trim() ? `按当前价格估值，币种：${escapeHtml(currency)}` : "不填当前价格时，将暂按成本价估值。"}</p>
  `;
}

export function updateTransactionLiveSummary() {
  if (!ctx.elements.transactionLiveSummary) return;
  const asset = ctx.getState().assets.find((item) => item.id === ctx.elements.assetForm.dataset.sellingId || item.id === ctx.elements.assetForm.dataset.closingId);
  if (!asset || !isTransactionMode()) {
    ctx.elements.transactionLiveSummary.classList.add("is-hidden");
    ctx.elements.transactionLiveSummary.innerHTML = "";
    return;
  }
  const type = ctx.elements.assetForm.elements.adjustmentType?.value || "buy";
  const fxRate = String(ctx.elements.assetForm.elements.fxRate?.value || asset.fxRate || "1").trim() || "1";
  const rows = [];
  try {
    if (type === "buy") {
      const quantity = String(ctx.elements.assetForm.elements.addQuantity?.value || "").trim();
      const price = String(ctx.elements.assetForm.elements.addPrice?.value || "").trim();
      if (quantity && price) {
        const preview = calculateBuyPreview({
          currentQuantity: asset.quantity,
          currentCostPrice: asset.costPrice,
          buyQuantity: quantity,
          buyPrice: price,
          fxRate,
          fees: ctx.elements.assetForm.elements.addFees?.value || "0"
        });
        rows.push(["本次买入金额", formatDisplayCurrency(ctx.convertUsdToDisplay(preview.grossCostCents))]);
        rows.push(["买入后持仓数量", preview.totalQuantity]);
        rows.push(["买入后平均成本", `${preview.averageCostPrice} ${asset.currency || ""}`.trim()]);
        rows.push(["买入后总成本", formatDisplayCurrency(ctx.convertUsdToDisplay(preview.totalCostCents))]);
      }
    } else {
      const quantity = String(ctx.elements.assetForm.elements.sellQuantity?.value || "").trim();
      const price = String(ctx.elements.assetForm.elements.closePrice?.value || "").trim();
      if (quantity && price) {
        const preview = calculateSellPreview({
          currentQuantity: asset.quantity,
          costPrice: asset.costPrice,
          sellQuantity: quantity,
          sellPrice: price,
          fxRate,
          fees: ctx.elements.assetForm.elements.sellFees?.value || "0",
          taxes: ctx.elements.assetForm.elements.sellTaxes?.value || "0"
        });
        rows.push([type === "close" ? "清仓金额" : "本次卖出金额", formatDisplayCurrency(ctx.convertUsdToDisplay(preview.grossProceedsCents))]);
        rows.push([type === "close" ? "总投入成本" : "预计已实现收益", formatDisplayCurrency(ctx.convertUsdToDisplay(type === "close" ? preview.costBasisCents : preview.realizedPnlCents))]);
        rows.push([type === "close" ? "已实现收益" : "卖出后剩余数量", type === "close" ? formatDisplayCurrency(ctx.convertUsdToDisplay(preview.realizedPnlCents)) : preview.remainingQuantity]);
        rows.push([type === "close" ? "收益率" : "卖出后剩余成本", type === "close" ? formatPercent(preview.costBasisCents === 0n ? 0n : roundDivide(preview.realizedPnlCents * 10000n, preview.costBasisCents)) : formatDisplayCurrency(ctx.convertUsdToDisplay(preview.remainingCostCents))]);
        if (type === "close") rows.push(["持有周期", formatHoldingDays(asset)]);
      }
    }
  } catch {
    rows.push(["即时估算", "请检查数量、价格和费用"]);
  }
  ctx.elements.transactionLiveSummary.classList.toggle("is-hidden", rows.length === 0);
  ctx.elements.transactionLiveSummary.innerHTML = rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

export function renderAssetQuickMatchOptions() {
  const datalist = document.querySelector("#asset-quick-match-options");
  if (!datalist) return;
  datalist.innerHTML = [...securityWhitelist, ...manualAssetMatches]
    .map((item) => {
      const label = [item.name, item.symbol, marketLabel(item.market), item.type, item.currency].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(item.symbol)}">${escapeHtml(label)}</option><option value="${escapeHtml(item.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

export function applyAssetQuickMatch() {
  const form = ctx.elements.assetForm;
  const query = String(form.elements.symbol?.value || form.elements.name?.value || "").trim();
  const match = findAssetQuickMatch(query);
  if (!match) return;

  if (form.elements.name && (!form.elements.name.value.trim() || normalizeQuickMatchText(form.elements.name.value) === normalizeQuickMatchText(query))) {
    form.elements.name.value = match.name;
  }
  if (form.elements.symbol && !isManualCashMatch(match)) form.elements.symbol.value = match.symbol;
  if (form.elements.symbol && isManualCashMatch(match)) form.elements.symbol.value = "";
  if (form.elements.type) form.elements.type.value = match.type;
  if (form.elements.market) form.elements.market.value = inferAssetMarket(match);
  if (form.elements.accountType && (!form.elements.accountType.value || form.elements.accountType.value === "securities")) {
    form.elements.accountType.value = inferAccountType(match);
  }
  if (form.elements.currency) {
    form.elements.currency.value = match.currency;
    const nextRate = defaultAssetFxRate(match.currency);
    if (form.elements.fxRate && (!form.elements.fxRate.value || form.elements.fxRate.value === "1")) form.elements.fxRate.value = nextRate;
    if (form.elements.previousFxRate && (!form.elements.previousFxRate.value || form.elements.previousFxRate.value === "1")) {
      form.elements.previousFxRate.value = nextRate;
    }
  }
  applyCashAssetFormMode();
}

export function applyCashAssetFormMode() {
  const form = ctx.elements.assetForm;
  const isCash = form.elements.type?.value === "现金";
  const quantityField = form.elements.quantity;
  const costPriceField = form.elements.costPrice;
  const previousPriceField = form.elements.previousPrice;
  const currentPriceField = form.elements.currentPrice;
  const marketField = form.elements.market;
  const accountTypeField = form.elements.accountType;
  const transactionTypeField = form.elements.transactionType;

  setFieldLabel(quantityField, isCash ? "现金金额" : "持有数量/份额");
  if (quantityField) quantityField.placeholder = isCash ? "例如：50000" : "10.5";
  if (costPriceField) {
    costPriceField.value = isCash ? "1" : costPriceField.value;
    costPriceField.readOnly = isCash;
    costPriceField.closest("label")?.classList.toggle("is-hidden", isCash);
  }
  if (previousPriceField) {
    previousPriceField.value = isCash ? "1" : previousPriceField.value;
    previousPriceField.closest("label")?.classList.toggle("is-hidden", isCash);
  }
  if (currentPriceField) {
    currentPriceField.value = isCash ? "1" : currentPriceField.value;
    currentPriceField.closest("label")?.classList.toggle("is-hidden", isCash);
  }
  if (marketField && isCash) marketField.value = "CASH";
  if (accountTypeField && isCash && !String(accountTypeField.value || "").startsWith("custom:")) {
    accountTypeField.value = "cash";
    updateCustomAccountTypeVisibility();
    renderAccountPicker();
  }
  if (transactionTypeField && isCash && transactionTypeField.value === "买入") transactionTypeField.value = "转入";
}

export function setFieldLabel(field, text) {
  const label = field?.closest("label");
  const marker = label?.querySelector("em")?.outerHTML || "";
  const span = label?.querySelector("span");
  if (span) span.innerHTML = `${escapeHtml(text)} ${marker}`;
}

export function applyExistingAccountType() {
  const account = String(ctx.elements.assetForm.elements.account?.value || "").trim();
  if (!account || !ctx.elements.assetForm.elements.accountType) return;
  const existing = buildAccountOptions().find((item) => item.name === account && item.accountType);
  if (existing) {
    setAccountTypeControl(existing.accountType);
  }
}

export function syncAccountPickerToName(accountName) {
  if (!ctx.elements.accountPicker) return;
  ctx.elements.accountPicker.value = accountName || "";
}

export function renderAccountPicker() {
  if (!ctx.elements.accountNameOptions) return;
  const type = selectedAccountType();
  const options = buildAccountOptions().filter((account) => account.accountType === type);
  ctx.elements.accountNameOptions.innerHTML = options
    .map((account) => `<option value="${escapeHtml(account.name)}">${escapeHtml(accountTypeLabel(account.accountType))}</option>`)
    .join("");
}

export function buildAccountOptions() {
  const accounts = new Map(accountNamePresets().map((account) => [`${account.accountType}:${account.name}`, account]));
  for (const asset of ctx.getState().assets) {
    const name = String(asset.account || "").trim();
    const accountType = asset.accountType || inferAccountType(asset);
    const key = `${accountType}:${name}`;
    if (!name || accounts.has(key)) continue;
    accounts.set(key, { name, accountType });
  }
  return [...accounts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function handleAccountTypeChange() {
  updateCustomAccountTypeVisibility();
  ctx.elements.assetForm.elements.account.value = "";
  renderAccountPicker();
}

export function updateCustomAccountTypeVisibility() {
  const isCustom = ctx.elements.assetForm.elements.accountType?.value === "__custom__";
  ctx.elements.accountTypeCustomField?.classList.toggle("is-hidden", !isCustom);
}

export function selectedAccountType() {
  return normalizeAccountTypeFormValue(
    ctx.elements.assetForm.elements.accountType?.value,
    ctx.elements.assetForm.elements.accountTypeCustom?.value
  ) || "securities";
}

export function setAccountTypeControl(type) {
  if (!ctx.elements.assetForm.elements.accountType) return;
  if (String(type || "").startsWith("custom:")) {
    ctx.elements.assetForm.elements.accountType.value = "__custom__";
    ctx.elements.assetForm.elements.accountTypeCustom.value = String(type).slice("custom:".length);
  } else {
    ctx.elements.assetForm.elements.accountType.value = type || "securities";
    if (ctx.elements.assetForm.elements.accountTypeCustom) ctx.elements.assetForm.elements.accountTypeCustom.value = "";
  }
  updateCustomAccountTypeVisibility();
  renderAccountPicker();
}

export function editAsset(id) {
  const asset = ctx.getState().assets.find((item) => item.id === id);
  if (!asset) return;

  resetAssetFormMode("edit");
  ctx.elements.assetForm.dataset.editingId = id;
  fillAssetForm(asset);
  syncAccountPickerToName(asset.account);
  ctx.elements.assetSubmitButton.textContent = "更新资产";
  ctx.elements.assetError.textContent = "";
  updateAssetLiveSummary();
  ctx.activateTab("assets");
  showAssetFormPanel("完整编辑资产", "补充价格来源、费用、税费、备注和复盘线索。");
  ctx.elements.assetForm.elements.name.focus();
}

export function startCloseAsset(id) {
  const asset = ctx.getState().assets.find((item) => item.id === id);
  if (!asset || asset.closed) return;

  resetAssetFormMode("transaction");
  ctx.elements.assetForm.dataset.mode = "transaction";
  ctx.elements.assetForm.dataset.sellingId = id;
  fillAssetForm(asset);
  syncAccountPickerToName(asset.account);
  updateAssetAdjustmentSummary(asset);
  ctx.elements.assetForm.elements.sellQuantity.value = asset.quantity || "";
  ctx.elements.assetForm.elements.closedDate.value = todayIsoDate();
  ctx.elements.assetForm.elements.closePrice.value = asset.currentPrice || asset.costPrice || "";
  ctx.elements.assetForm.elements.sellFees.value = "0";
  ctx.elements.assetForm.elements.sellTaxes.value = "0";
  ctx.elements.assetForm.elements.closeReason.value = "";
  ctx.elements.assetForm.elements.adjustmentType.value = "close";
  ctx.elements.assetForm.dataset.adjustmentType = "close";
  ctx.elements.closeFields.classList.remove("is-hidden");
  syncAdjustmentMode();
  updateTransactionLiveSummary();
  ctx.elements.assetSubmitButton.textContent = "确认清仓";
  ctx.elements.assetError.textContent = "";
  ctx.activateTab("assets");
  showAssetFormPanel("记录交易", "清仓前请确认成交价格和费用，取消不会修改数据。");
  ctx.elements.assetForm.elements.closePrice.focus();
}

export function startSellAsset(id, action = "buy") {
  const asset = ctx.getState().assets.find((item) => item.id === id);
  if (!asset || asset.closed) return;

  resetAssetFormMode("transaction");
  ctx.elements.assetForm.dataset.mode = "transaction";
  ctx.elements.assetForm.dataset.sellingId = id;
  fillAssetForm(asset);
  syncAccountPickerToName(asset.account);
  updateAssetAdjustmentSummary(asset);
  const adjustmentAction = action === "sell" ? "sell" : "buy";
  ctx.elements.assetForm.elements.adjustmentType.value = adjustmentAction;
  ctx.elements.assetForm.dataset.adjustmentType = adjustmentAction;
  ctx.elements.assetForm.elements.addQuantity.value = "";
  ctx.elements.assetForm.elements.addPrice.value = asset.currentPrice || asset.costPrice || "";
  ctx.elements.assetForm.elements.addDate.value = todayIsoDate();
  ctx.elements.assetForm.elements.addFees.value = "0";
  ctx.elements.assetForm.elements.sellQuantity.value = "";
  ctx.elements.assetForm.elements.closedDate.value = todayIsoDate();
  ctx.elements.assetForm.elements.closePrice.value = asset.currentPrice || asset.costPrice || "";
  ctx.elements.assetForm.elements.sellFees.value = "0";
  ctx.elements.assetForm.elements.sellTaxes.value = "0";
  ctx.elements.assetForm.elements.closeReason.value = "";
  ctx.elements.closeFields.classList.remove("is-hidden");
  syncAdjustmentMode();
  updateTransactionLiveSummary();
  ctx.elements.assetSubmitButton.textContent = adjustmentAction === "sell" ? "确认卖出" : "确认买入";
  ctx.elements.assetError.textContent = "";
  ctx.activateTab("assets");
  showAssetFormPanel("记录交易", "仅记录已有资产的买入、卖出或清仓。保存后可在交易记录中查看。");
  (adjustmentAction === "sell" ? ctx.elements.assetForm.elements.sellQuantity : ctx.elements.assetForm.elements.addQuantity).focus();
}

export function showAssetFormPanel(title = "快速添加资产", subtitle = "") {
  const titleNode = document.querySelector("#asset-form-title");
  if (titleNode) titleNode.textContent = title;
  if (ctx.elements.assetFormSubtitle) ctx.elements.assetFormSubtitle.textContent = subtitle;
  ctx.elements.assetFormSection?.classList.remove("is-hidden");
  requestAnimationFrame(() => {
    ctx.elements.assetFormSection?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

export function requestHideAssetFormPanel() {
  if (isAssetFormDirty() && !confirm("表单填写后关闭会放弃本次修改，确认关闭？")) return;
  hideAssetFormPanel();
}

export function hideAssetFormPanel() {
  ctx.elements.assetFormSection?.classList.add("is-hidden");
  clearAssetFieldErrors();
}

function isAssetFormDirty() {
  if (ctx.elements.assetFormSection?.classList.contains("is-hidden")) return false;
  const form = Object.fromEntries(new FormData(ctx.elements.assetForm));
  const ignoredValues = new Set(["0", "1", "买入", "brokerage"]);
  return Object.entries(form).some(([key, value]) => {
    if (["adjustmentType", "fxRate", "previousFxRate", "contribution", "dividends", "interest", "fees", "taxes", "manualAdjustment", "transactionType", "accountType"].includes(key)) {
      return !ignoredValues.has(String(value || "").trim());
    }
    return String(value || "").trim() !== "";
  });
}

function fillAssetForm(asset) {
  for (const field of [
    "name",
    "symbol",
    "type",
    "market",
    "account",
    "currency",
    "quantity",
    "costPrice",
    "previousPrice",
    "currentPrice",
    "fxRate",
    "previousFxRate",
    "contribution",
    "dividends",
    "interest",
    "fees",
    "taxes",
    "soldQuantity",
    "realizedPnlCents",
    "grossProceedsCents",
    "costBasisCents",
    "manualAdjustment",
    "purchaseDate",
    "transactionType",
    "priceSource",
    "pricedAt",
    "priceStatus",
    "attachmentName",
    "buyReason",
    "upsideReasons",
    "downsideReasons"
  ]) {
    if (ctx.elements.assetForm.elements[field]) {
      ctx.elements.assetForm.elements[field].value = asset[field] || "";
    }
  }
  setAccountTypeControl(asset.accountType || inferAccountType(asset));
  applyCashAssetFormMode();
}

export function resetAssetFormMode(mode = "create") {
  delete ctx.elements.assetForm.dataset.editingId;
  delete ctx.elements.assetForm.dataset.closingId;
  delete ctx.elements.assetForm.dataset.sellingId;
  ctx.elements.assetForm.dataset.mode = mode;
  delete ctx.elements.assetForm.dataset.adjustmentType;
  ctx.elements.closeFields.classList.add("is-hidden");
  ctx.elements.transactionLiveSummary?.classList.add("is-hidden");
  if (ctx.elements.closeConfirmNote) ctx.elements.closeConfirmNote.classList.add("is-hidden");
  if (ctx.elements.accountPicker) ctx.elements.accountPicker.value = "";
  if (ctx.elements.assetForm.elements.accountTypeCustom) ctx.elements.assetForm.elements.accountTypeCustom.value = "";
  updateCustomAccountTypeVisibility();
  applyCashAssetFormMode();
  if (ctx.elements.assetForm.elements.adjustmentType) ctx.elements.assetForm.elements.adjustmentType.value = "buy";
  ctx.elements.assetSubmitButton.textContent = mode === "edit" ? "更新资产" : isTransactionModeName(mode) ? "确认买入" : "保存资产";
}

export function syncAdjustmentMode() {
  if (!isTransactionMode()) return;
  const type = ctx.elements.assetForm.elements.adjustmentType?.value || "buy";
  const asset = ctx.getState().assets.find((item) => item.id === ctx.elements.assetForm.dataset.sellingId);
  ctx.elements.assetForm.dataset.adjustmentType = type;
  ctx.elements.assetSubmitButton.textContent = type === "buy" ? "确认加仓" : type === "close" ? "确认清仓" : "确认减仓";

  const title = ctx.elements.closeFields?.querySelector(".close-fields-title strong");
  const hint = ctx.elements.closeFields?.querySelector(".close-fields-title span");
  if (title) title.textContent = type === "close" ? "清仓详情" : "减仓详情";
  if (hint) {
    hint.textContent = type === "close"
      ? "清空全部持仓，系统会自动把剩余数量归零。"
      : "只填写本次减仓相关字段。";
  }
  if (ctx.elements.closeConfirmNote) {
    ctx.elements.closeConfirmNote.classList.toggle("is-hidden", type !== "close");
  }

  if (!asset) return;
  if (type === "close") {
    ctx.elements.assetForm.elements.sellQuantity.value = asset.quantity || "";
    ctx.elements.assetForm.elements.closedDate.value ||= todayIsoDate();
    ctx.elements.assetForm.elements.closePrice.value ||= asset.currentPrice || asset.costPrice || "";
    ctx.elements.assetForm.elements.sellQuantity.placeholder = "全部";
  } else if (type === "sell") {
    if (ctx.elements.assetForm.elements.sellQuantity.value === asset.quantity) {
      ctx.elements.assetForm.elements.sellQuantity.value = "";
    }
    ctx.elements.assetForm.elements.sellQuantity.placeholder = "请输入本次减仓数量";
  }
  updateTransactionLiveSummary();
}

function isTransactionMode() {
  return isTransactionModeName(ctx.elements.assetForm.dataset.mode);
}

function isTransactionModeName(mode) {
  return mode === "transaction" || mode === "adjust";
}

export function updateAssetAdjustmentSummary(asset) {
  if (!ctx.elements.assetAdjustmentSummary) return;
  const position = ctx.calculateDisplayPortfolio([asset]).positions[0];
  ctx.elements.assetAdjustmentSummary.innerHTML = `
    <div>
      <span>当前数量</span>
      <strong>${escapeHtml(asset.quantity || "0")}</strong>
    </div>
    <div>
      <span>平均成本价</span>
      <strong>${escapeHtml(asset.costPrice || "0")} ${escapeHtml(asset.currency || "")}</strong>
    </div>
    <div>
      <span>当前价格</span>
      <strong>${escapeHtml(asset.currentPrice || asset.costPrice || "0")} ${escapeHtml(asset.currency || "")}</strong>
    </div>
    <div>
      <span>总市值</span>
      <strong>${formatDisplayCurrency(position?.marketValueCents || 0n)}</strong>
    </div>
  `;
}

export function formatHoldingDays(asset) {
  const start = ctx.normalizeSnapshotDate(asset.purchaseDate || asset.buyDate || asset.acquiredAt || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return "-";
  const end = todayIsoDate();
  const days = Math.max(0, Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000));
  return `${days} 天`;
}
