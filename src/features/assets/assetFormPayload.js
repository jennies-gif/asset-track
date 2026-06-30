import { normalizeAccountTypeFormValue, inferAccountType } from "./accountOptions.js";
import { inferAssetMarket } from "./marketOptions.js";
import { todayIsoDate } from "../../utils/date.js";

let ctx = {};

export function configureAssetFormPayload(context) {
  ctx = context;
}

export function buildAssetFormPayload(existingAsset) {
  const form = Object.fromEntries(new FormData(ctx.elements.assetForm));
  const isCash = form.type === "现金";
  if (isCash) {
    form.market = "CASH";
    form.accountType = form.accountType || "cash";
    form.costPrice = "1";
    form.previousPrice = "1";
    form.currentPrice = "1";
    form.priceSource = form.priceSource || "用户录入";
    form.pricedAt = form.pricedAt || todayIsoDate();
  }
  form.market = form.market || existingAsset?.market || inferAssetMarket(form);
  form.accountType = normalizeAccountTypeFormValue(form.accountType, form.accountTypeCustom) || existingAsset?.accountType || inferAccountType(form);
  for (const transientField of [
    "accountTypeCustom",
    "adjustmentType",
    "addQuantity",
    "addPrice",
    "addDate",
    "addFees",
    "addReason",
    "sellQuantity",
    "closedDate",
    "closePrice",
    "sellFees",
    "sellTaxes",
    "closeReason"
  ]) {
    delete form[transientField];
  }
  const fxRate = form.fxRate || existingAsset?.fxRate || defaultAssetFxRate(form.currency);
  const hasManualPrice = String(form.currentPrice || "").trim() !== "";
  const hasExistingPrice = Boolean(existingAsset?.currentPrice && existingAsset?.priceStatus !== "pending");
  const priceStatus = hasManualPrice ? "manual" : hasExistingPrice ? existingAsset.priceStatus || "manual" : "pending";
  return {
    ...form,
    currentPrice: form.currentPrice || existingAsset?.currentPrice || form.costPrice || "0",
    previousPrice: form.previousPrice || existingAsset?.previousPrice || form.costPrice || form.currentPrice || "0",
    priceStatus,
    fxRate,
    previousFxRate: form.previousFxRate || existingAsset?.previousFxRate || fxRate,
    contribution: form.contribution || existingAsset?.contribution || "0",
    dividends: form.dividends || existingAsset?.dividends || "0",
    interest: form.interest || existingAsset?.interest || "0",
    fees: form.fees || existingAsset?.fees || "0",
    taxes: form.taxes || existingAsset?.taxes || "0",
    manualAdjustment: form.manualAdjustment || existingAsset?.manualAdjustment || "0",
    pricedAt: form.pricedAt || (hasManualPrice ? todayIsoDate() : existingAsset?.pricedAt || ""),
    priceSource: form.priceSource || (hasManualPrice ? "用户录入" : existingAsset?.priceSource || "")
  };
}

export function defaultAssetFxRate(currency) {
  if (currency === "CNY") {
    const usdCny = Number(ctx.getState().settings?.usdCnyRate || "6.85");
    return (1 / (Number.isFinite(usdCny) && usdCny > 0 ? usdCny : 6.85)).toFixed(4);
  }
  if (currency === "HKD") return "0.1280";
  return "1";
}
