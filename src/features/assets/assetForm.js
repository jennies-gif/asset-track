import { calculateBuyPreview, calculateMoneyFromQuantity, calculateSellPreview, formatPercent, normalizeAsset, roundDivide, validateAsset } from "../../domain/calculations.js";
import { escapeHtml } from "../../utils/dom.js";
import { todayIsoDate } from "../../utils/date.js";
import { formatDisplayCurrency, formatSignedAmountOnly } from "../../ui/formatters.js";
import { accountTypeLabel, inferAccountType, normalizeAccountTypeFormValue, savedAccountOptionsFromAssets } from "./accountOptions.js";
import { assetQuickMatchOptions, findAssetQuickMatch, findAssetQuickMatches, isManualCashMatch, normalizeQuickMatchText } from "./assetQuickMatch.js";
import { inferAssetMarket, marketLabel } from "./marketOptions.js";
import { buildAssetFormPayload, defaultAssetFxRate } from "./assetFormPayload.js";
import { buildAddAssetUpdate, buildSellAssetUpdate } from "./assetTransactions.js";
import { clearAssetFieldErrors, humanizeAssetError, setTransactionFieldError, validateAssetFormByMode } from "./assetValidation.js";
import { ensureAssetMarketHistory } from "../market/marketService.js";

let ctx = {};
let assetMatchCandidates = [];
let suppressNextMatchPanel = false;
let draftMarketLookupTimer = 0;
let draftMarketLookupRequest = 0;
let draftMarketLookupQuery = "";
let assetMatchSearchRequest = 0;

export function configureAssetForm(context) {
  ctx = context;
}

export function startQuickAsset() {
  resetAssetFormMode("create");
  ctx.elements.assetForm.reset();
  syncAccountPickerToName("");
  setDefaultAssetFormValues();
  syncOptionalEntryPanels();
  applyCashAssetFormMode();
  updateAssetMatchPanel();
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
  syncOptionalEntryPanels();
  applyCashAssetFormMode();
  updateAssetMatchPanel();
  updateAssetLiveSummary();
  ctx.elements.assetError.textContent = "";
  hideAssetFormPanel();
  ctx.persistAndRender();
  ctx.activateTab("assets");
  const shouldEnsureHistory = !activeAssetId || Boolean(editingId && (
    existingAsset?.symbol !== asset.symbol || existingAsset?.purchaseDate !== asset.purchaseDate
  ));
  if (shouldEnsureHistory) void ensureAssetMarketHistory(asset);
  if (closeReviewAsset) ctx.showCloseReviewPrompt(closeReviewAsset, reviewPromptType);
}

export function setDefaultAssetFormValues() {
  delete ctx.elements.assetForm.dataset.autoDraftPrice;
  delete ctx.elements.assetForm.dataset.autoDraftCurrentPrice;
  delete ctx.elements.assetForm.dataset.autoDraftPriceQuery;
  resetDraftPriceStatus();
  if (ctx.elements.assetForm.elements.quantity) ctx.elements.assetForm.elements.quantity.value = "";
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
  if (ctx.elements.assetForm.elements.assetRegistryId) ctx.elements.assetForm.elements.assetRegistryId.value = "";
  if (ctx.elements.assetForm.elements.assetMatchStatus) ctx.elements.assetForm.elements.assetMatchStatus.value = "unmatched";
  if (ctx.elements.assetForm.elements.marketDataSupported) ctx.elements.assetForm.elements.marketDataSupported.value = "false";
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
  if (quantity && (costPrice || currentPrice)) {
    try {
      const market = calculateMoneyFromQuantity(quantity, currentPrice, fxRate);
      if (costPrice) {
        const cost = calculateMoneyFromQuantity(quantity, costPrice, fxRate);
        rows = [
          ["初始成本", formatDisplayCurrency(ctx.convertUsdToDisplay(cost))],
          ["当前估值", formatDisplayCurrency(ctx.convertUsdToDisplay(market))],
          ["浮动收益", formatSignedAmountOnly(ctx.convertUsdToDisplay(market - cost))]
        ];
      } else {
        rows = [
          ["初始成本", "成本缺失"],
          ["当前估值", formatDisplayCurrency(ctx.convertUsdToDisplay(market))],
          ["浮动收益", "暂无法计算"]
        ];
      }
    } catch {
      rows[0][1] = "待检查输入";
    }
  }
  ctx.elements.assetLiveSummary.innerHTML = `
    ${rows.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    <p>${assetLiveSummaryHint(costPrice, ctx.elements.assetForm.elements.currentPrice?.value, currency)}</p>
  `;
}

function assetLiveSummaryHint(costPrice, currentPrice, currency) {
  if (String(currentPrice || "").trim()) return `按当前价格估值，币种：${escapeHtml(currency)}`;
  if (costPrice) return "不填当前价格时，将暂按成本价估值。";
  return "成本价和当前价格都可后续补充；缺成本时收益和归因暂无法计算。";
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
  datalist.innerHTML = assetQuickMatchOptions()
    .map((item) => {
      const label = [item.name, item.symbol, marketLabel(item.market), item.type, item.currency].filter(Boolean).join(" · ");
      return `<option value="${escapeHtml(item.symbol)}">${escapeHtml(label)}</option><option value="${escapeHtml(item.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

export function updateAssetMatchPanel() {
  const panel = ctx.elements.assetMatchPanel;
  const form = ctx.elements.assetForm;
  if (!panel || !form || isTransactionMode()) return;
  if (suppressNextMatchPanel) {
    suppressNextMatchPanel = false;
    hideAssetMatchPanel();
    return;
  }
  const query = assetSearchQuery();
  moveAssetMatchPanelToActiveField();
  assetMatchCandidates = query ? findAssetQuickMatches(query, 5) : [];
  if (!query) {
    panel.classList.add("is-hidden");
    panel.innerHTML = "";
    setAssetMatchHiddenFields(null, "unmatched");
    return;
  }
  if (!assetMatchCandidates.length) {
    setAssetMatchHiddenFields(null, "uncovered");
    panel.classList.remove("is-hidden");
    panel.innerHTML = renderAssetMatchEmpty(Boolean(ctx.marketApiBaseUrl));
    queueRemoteAssetSearch(query);
    return;
  }
  assetMatchSearchRequest += 1;
  const exact = assetMatchCandidates.find((item) => isExactAssetMatch(item, query));
  setAssetMatchHiddenFields(exact || null, exact ? "matched" : "possible");
  panel.classList.remove("is-hidden");
  panel.innerHTML = `
    <div class="asset-match-title">
      <strong>已匹配资产</strong>
    </div>
    <div class="asset-match-list">
      ${assetMatchCandidates.map((item, index) => renderAssetMatchOption(item, index, exact?.id === item.id)).join("")}
    </div>
  `;
}

function renderAssetMatchEmpty(isSearchingRemote = false) {
  return `
    <div class="asset-match-empty">
      <strong>${isSearchingRemote ? "正在查询资产库" : "未搜到对应资产"}</strong>
      <span>${isSearchingRemote ? "本地只保留常用资产，完整资源库由行情 API 查询。" : "保存后将作为手动管理资产，价格、来源和估值需要自行维护。"}</span>
    </div>
  `;
}

function queueRemoteAssetSearch(query) {
  if (!ctx.marketApiBaseUrl || !query || query.length < 2) return;
  const requestId = ++assetMatchSearchRequest;
  fetch(`${ctx.marketApiBaseUrl}/api/instruments/search?query=${encodeURIComponent(query)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`资产库查询返回 ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      if (requestId !== assetMatchSearchRequest || assetSearchQuery() !== query) return;
      const remoteMatches = Array.isArray(payload?.instruments) ? payload.instruments.slice(0, 5) : [];
      if (!remoteMatches.length) {
        renderRemoteAssetSearchEmpty();
        return;
      }
      assetMatchCandidates = remoteMatches;
      renderAssetMatchCandidates(query);
    })
    .catch(() => {
      if (requestId !== assetMatchSearchRequest || assetSearchQuery() !== query) return;
      renderRemoteAssetSearchEmpty();
    });
}

function renderRemoteAssetSearchEmpty() {
  const panel = ctx.elements.assetMatchPanel;
  if (!panel || panel.classList.contains("is-hidden")) return;
  setAssetMatchHiddenFields(null, "uncovered");
  panel.innerHTML = renderAssetMatchEmpty(false);
}

function renderAssetMatchCandidates(query) {
  const panel = ctx.elements.assetMatchPanel;
  if (!panel) return;
  const exact = assetMatchCandidates.find((item) => isExactAssetMatch(item, query));
  setAssetMatchHiddenFields(exact || null, exact ? "matched" : "possible");
  panel.classList.remove("is-hidden");
  panel.innerHTML = `
    <div class="asset-match-title">
      <strong>已匹配资产</strong>
    </div>
    <div class="asset-match-list">
      ${assetMatchCandidates.map((item, index) => renderAssetMatchOption(item, index, exact?.id === item.id)).join("")}
    </div>
  `;
}

export function applyAssetQuickMatch() {
  const form = ctx.elements.assetForm;
  const query = String(form.elements.symbol?.value || form.elements.name?.value || "").trim();
  const match = findAssetQuickMatch(query);
  if (!match) {
    setAssetMatchHiddenFields(null, query ? "uncovered" : "unmatched");
    updateAssetMatchPanel();
    return;
  }
  selectAssetMatch(match, query);
}

export function queueDraftMarketLookup() {
  const form = ctx.elements.assetForm;
  if (!form || isTransactionMode()) return;
  const query = String(form.elements.symbol?.value || form.elements.name?.value || "").trim();
  clearTimeout(draftMarketLookupTimer);
  if (!query || query.length < 2 || form.elements.type?.value === "现金") return;
  draftMarketLookupTimer = setTimeout(() => {
    lookupDraftMarketPrice(query);
  }, 700);
}

export function selectAssetMatchByIndex(index, options = {}) {
  const match = assetMatchCandidates[Number(index)];
  if (!match) return;
  selectAssetMatch(match, assetSearchQuery(), { forceName: true });
  suppressNextMatchPanel = true;
  if (options.delayHide) setTimeout(hideAssetMatchPanel, 120);
  else hideAssetMatchPanel();
  updateAssetLiveSummary();
}

function selectAssetMatch(match, query, options = {}) {
  const form = ctx.elements.assetForm;
  if (form.elements.name && (!form.elements.name.value.trim() || normalizeQuickMatchText(form.elements.name.value) === normalizeQuickMatchText(query))) {
    form.elements.name.value = match.name;
  }
  if (options.forceName && form.elements.name) form.elements.name.value = match.name;
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
  setAssetMatchHiddenFields(match, "matched");
  applyCashAssetFormMode();
  if (!options.skipLookup) queueDraftMarketLookup();
}

async function lookupDraftMarketPrice(query) {
  const form = ctx.elements.assetForm;
  if (!ctx.marketApiBaseUrl || !form || isTransactionMode()) return;
  const requestId = ++draftMarketLookupRequest;
  draftMarketLookupQuery = query;
  setDraftPriceStatus("loading", "正在查询行情...");
  try {
    const response = await fetch(`${ctx.marketApiBaseUrl}/api/instruments/lookup?query=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(await readDraftLookupError(response));
    const payload = await response.json();
    if (requestId !== draftMarketLookupRequest || draftMarketLookupQuery !== query) return;
    applyDraftLookupPayload(payload, query);
  } catch (error) {
    if (requestId !== draftMarketLookupRequest) return;
    setDraftPriceStatus("error", error instanceof Error ? error.message : "行情查询失败");
  }
}

async function readDraftLookupError(response) {
  try {
    const payload = await response.clone().json();
    return payload?.message || `行情 API 返回 ${response.status}`;
  } catch {
    return `行情 API 返回 ${response.status}`;
  }
}

function applyDraftLookupPayload(payload, query) {
  const form = ctx.elements.assetForm;
  const instrument = payload?.instrument;
  const price = payload?.price;
  if (instrument) {
    selectAssetMatch(instrument, query, { skipLookup: true });
  }
  if (!price?.currentPrice) {
    setDraftPriceStatus(payload?.status === "not_found" ? "missing" : "warning", payload?.message || "未找到可用行情，请手动填写当前价格和买入价格。");
    return;
  }
  const currentPriceField = form.elements.currentPrice;
  const previousPriceField = form.elements.previousPrice;
  const previousAutoCurrentPrice = form.dataset.autoDraftCurrentPrice || "";
  const nextPrice = String(price.currentPrice || "").trim();
  const canFillCurrentPrice = !currentPriceField?.value.trim() || currentPriceField.value.trim() === previousAutoCurrentPrice;
  const didFillCurrentPrice = canFillCurrentPrice && currentPriceField;
  if (didFillCurrentPrice) currentPriceField.value = nextPrice;
  if (previousPriceField && !previousPriceField.value.trim() && price.previousPrice) previousPriceField.value = price.previousPrice;
  form.dataset.autoDraftCurrentPrice = nextPrice;
  form.dataset.autoDraftPriceQuery = query;
  if (didFillCurrentPrice) {
    if (form.elements.priceSource) form.elements.priceSource.value = price.priceSource || "";
    if (form.elements.pricedAt) form.elements.pricedAt.value = price.pricedAt || "";
    if (form.elements.priceStatus) form.elements.priceStatus.value = "synced";
    if (form.elements.priceKind) form.elements.priceKind.value = price.priceKind || "";
    if (form.elements.priceAt) form.elements.priceAt.value = price.priceAt || "";
    if (form.elements.marketTimezone) form.elements.marketTimezone.value = price.marketTimezone || "";
    if (form.elements.sourceFetchedAt) form.elements.sourceFetchedAt.value = price.sourceFetchedAt || "";
  }
  setDraftPriceStatus("synced", "已带入最新公共行情；买入日期和买入价格仅保存在当前浏览器，请手动填写买入价格。");
  updateAssetLiveSummary();
}

function setDraftPriceStatus(status, message) {
  const form = ctx.elements.assetForm;
  const help = form?.querySelector("[data-price-fallback]");
  if (!help) return;
  help.dataset.lookupStatus = status;
  help.textContent = message || "成本价可后续补充；缺成本时收益和归因会标记为暂无法计算。";
}

function resetDraftPriceStatus() {
  const help = ctx.elements.assetForm?.querySelector("[data-price-fallback]");
  if (!help) return;
  delete help.dataset.lookupStatus;
  help.textContent = "成本价可后续补充；缺成本时收益和归因会标记为暂无法计算。";
}

function assetSearchQuery() {
  const form = ctx.elements.assetForm;
  const active = document.activeElement;
  if (active === form.elements.symbol) return String(form.elements.symbol?.value || "").trim();
  if (active === form.elements.name) return String(form.elements.name?.value || "").trim();
  return String(form.elements.name?.value || form.elements.symbol?.value || "").trim();
}

function moveAssetMatchPanelToActiveField() {
  const panel = ctx.elements.assetMatchPanel;
  const form = ctx.elements.assetForm;
  const target = document.activeElement === form.elements.symbol ? ctx.elements.assetSymbolField : ctx.elements.assetNameField;
  if (panel && target && panel.parentElement !== target) target.append(panel);
}

function hideAssetMatchPanel() {
  if (!ctx.elements.assetMatchPanel) return;
  ctx.elements.assetMatchPanel.classList.add("is-hidden");
  ctx.elements.assetMatchPanel.innerHTML = "";
  assetMatchCandidates = [];
}

function setAssetMatchHiddenFields(match, status) {
  const form = ctx.elements.assetForm;
  if (form.elements.assetRegistryId) form.elements.assetRegistryId.value = match?.id || "";
  if (form.elements.assetMatchStatus) form.elements.assetMatchStatus.value = status;
  if (form.elements.marketDataSupported) form.elements.marketDataSupported.value = String(Boolean(match?.marketDataSupported));
}

function isExactAssetMatch(item, query) {
  const normalized = normalizeQuickMatchText(query);
  return [item.symbol, item.name, ...(item.aliases || [])].some((value) => normalizeQuickMatchText(value) === normalized);
}

function renderAssetMatchOption(item, index, selected) {
  const meta = [item.symbol, marketLabel(item.market), item.type, item.currency].filter(Boolean).join(" · ");
  const supportLabel = item.marketDataSupported ? "支持行情" : "手动价格";
  return `
    <button class="asset-match-option ${selected ? "is-selected" : ""}" type="button" data-asset-match-index="${index}">
      <span>
        <strong>${escapeHtml(item.name)}</strong>
        <small>${escapeHtml(meta)}</small>
      </span>
      <em>${escapeHtml(supportLabel)}</em>
    </button>
  `;
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

  setFieldLabel(quantityField, isCash ? "现金金额" : "股数");
  if (quantityField) quantityField.placeholder = isCash ? "例如：50000" : "请输入股数";
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

export function syncOptionalEntryPanels() {
  ctx.elements.assetForm?.querySelectorAll("[data-optional-toggle]").forEach((toggle) => {
    const panel = ctx.elements.assetForm.querySelector(`[data-optional-panel="${toggle.dataset.optionalToggle}"]`);
    const isEnabled = Boolean(toggle.checked);
    panel?.classList.toggle("is-hidden", !isEnabled);
    panel?.querySelectorAll("input, select, textarea").forEach((field) => {
      if (!isEnabled) resetOptionalFieldValue(field);
      field.disabled = !isEnabled;
    });
  });
}

function resetOptionalFieldValue(field) {
  if (field.name === "fees" || field.name === "taxes") field.value = "0";
  if (field.name === "fxRate" || field.name === "previousFxRate") {
    field.value = defaultAssetFxRate(ctx.elements.assetForm.elements.currency?.value || "USD");
  }
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
  const options = buildAccountOptions().sort((left, right) => {
    if (left.accountType === type && right.accountType !== type) return -1;
    if (left.accountType !== type && right.accountType === type) return 1;
    return left.name.localeCompare(right.name);
  });
  ctx.elements.accountNameOptions.innerHTML = options
    .map((account) => {
      const label = account.accountType === type
        ? accountTypeLabel(account.accountType)
        : `${accountTypeLabel(account.accountType)} · 已录入账户`;
      return `<option value="${escapeHtml(account.name)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

export function buildAccountOptions() {
  return savedAccountOptionsFromAssets(ctx.getState().assets);
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
  setOptionalEntryPanelsFromValues(asset);
  ctx.activateTab("assets");
  showAssetFormPanel("编辑资产", "更新关键持仓信息；如需记录新的买入、卖出或清仓，请从持仓行进入“记录交易”。");
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
  const ignoredValues = new Set(["0", "1", "买入", "securities", "unmatched", "false"]);
  return Object.entries(form).some(([key, value]) => {
    if (["assetRegistryId", "assetMatchStatus", "marketDataSupported"].includes(key)) return !ignoredValues.has(String(value || "").trim());
    if (["adjustmentType", "fxRate", "previousFxRate", "contribution", "dividends", "interest", "fees", "taxes", "manualAdjustment", "transactionType", "accountType"].includes(key)) {
      return !ignoredValues.has(String(value || "").trim());
    }
    return String(value || "").trim() !== "";
  });
}

function fillAssetForm(asset) {
  delete ctx.elements.assetForm.dataset.autoDraftPrice;
  delete ctx.elements.assetForm.dataset.autoDraftPriceQuery;
  resetDraftPriceStatus();
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
    "assetRegistryId",
    "assetMatchStatus",
    "marketDataSupported",
    "priceSource",
    "pricedAt",
    "priceStatus",
    "priceKind",
    "priceAt",
    "marketTimezone",
    "sourceFetchedAt",
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
  updateAssetMatchPanel();
}

export function resetAssetFormMode(mode = "create") {
  clearTimeout(draftMarketLookupTimer);
  draftMarketLookupQuery = "";
  delete ctx.elements.assetForm.dataset.autoDraftPrice;
  delete ctx.elements.assetForm.dataset.autoDraftCurrentPrice;
  delete ctx.elements.assetForm.dataset.autoDraftPriceQuery;
  delete ctx.elements.assetForm.dataset.editingId;
  delete ctx.elements.assetForm.dataset.closingId;
  delete ctx.elements.assetForm.dataset.sellingId;
  ctx.elements.assetForm.dataset.mode = mode;
  delete ctx.elements.assetForm.dataset.adjustmentType;
  ctx.elements.closeFields.classList.add("is-hidden");
  ctx.elements.transactionLiveSummary?.classList.add("is-hidden");
  if (ctx.elements.closeConfirmNote) ctx.elements.closeConfirmNote.classList.add("is-hidden");
  if (ctx.elements.accountPicker) ctx.elements.accountPicker.value = "";
  if (ctx.elements.assetMatchPanel) {
    ctx.elements.assetMatchPanel.classList.add("is-hidden");
    ctx.elements.assetMatchPanel.innerHTML = "";
  }
  assetMatchCandidates = [];
  if (ctx.elements.assetForm.elements.accountTypeCustom) ctx.elements.assetForm.elements.accountTypeCustom.value = "";
  updateCustomAccountTypeVisibility();
  resetOptionalEntryPanels();
  applyCashAssetFormMode();
  if (ctx.elements.assetForm.elements.adjustmentType) ctx.elements.assetForm.elements.adjustmentType.value = "buy";
  ctx.elements.assetSubmitButton.textContent = mode === "edit" ? "更新资产" : isTransactionModeName(mode) ? "确认买入" : "保存资产";
}

function resetOptionalEntryPanels() {
  ctx.elements.assetForm?.querySelectorAll("[data-optional-toggle]").forEach((toggle) => {
    toggle.checked = false;
  });
  syncOptionalEntryPanels();
}

function setOptionalEntryPanelsFromValues(asset) {
  const form = ctx.elements.assetForm;
  const hasCosts = hasNonZeroValue(asset.fees) || hasNonZeroValue(asset.taxes);
  const defaultFx = defaultAssetFxRate(asset.currency);
  const hasFx = hasNonDefaultValue(asset.fxRate, defaultFx) || hasNonDefaultValue(asset.previousFxRate, asset.fxRate || defaultFx);
  const feesToggle = form.querySelector('[data-optional-toggle="fees"]');
  const fxToggle = form.querySelector('[data-optional-toggle="fx"]');
  if (feesToggle) feesToggle.checked = hasCosts;
  if (fxToggle) fxToggle.checked = hasFx;
  syncOptionalEntryPanels();
}

function hasNonZeroValue(value) {
  const normalized = String(value || "").trim();
  return normalized !== "" && normalized !== "0" && normalized !== "0.0" && normalized !== "0.00";
}

function hasNonDefaultValue(value, defaultValue) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return normalized !== String(defaultValue || "").trim();
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
      <strong>${escapeHtml(asset.costPrice && asset.costPrice !== "0" ? asset.costPrice : "未填写")} ${escapeHtml(asset.costPrice && asset.costPrice !== "0" ? asset.currency || "" : "")}</strong>
    </div>
    <div>
      <span>当前价格</span>
      <strong>${escapeHtml((asset.currentPrice && asset.currentPrice !== "0" ? asset.currentPrice : asset.costPrice && asset.costPrice !== "0" ? asset.costPrice : "待补价格"))} ${escapeHtml(asset.currency || "")}</strong>
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
