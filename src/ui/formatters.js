import { formatPercent } from "../domain/calculations.js";
import { absBigInt } from "../utils/bigint.js";

let displayCurrencyGetter = () => "CNY";
let dataUnavailableLabel = "暂无数据";
let notSyncedLabel = "未同步";

export function configureFormatters({ displayCurrency, dataUnavailable, notSynced } = {}) {
  if (typeof displayCurrency === "function") displayCurrencyGetter = displayCurrency;
  if (dataUnavailable !== undefined) dataUnavailableLabel = dataUnavailable;
  if (notSynced !== undefined) notSyncedLabel = notSynced;
}

export function formatShare(basisPoints) {
  return `${(Number(basisPoints) / 100).toFixed(2)}%`;
}

export function formatDisplayCurrency(cents) {
  return formatCurrencyAmount(Number(cents) / 100, displayCurrency());
}

export function formatDisplayCurrencyParts(cents) {
  return {
    currency: displayCurrency(),
    amount: formatDecimalAmount(Number(cents) / 100)
  };
}

export function formatDisplayAmountOnly(cents) {
  return formatDecimalAmount(Number(cents) / 100);
}

export function formatSignedCurrency(cents) {
  const amount = BigInt(cents);
  const sign = amount >= 0n ? "+" : "-";
  return `${displayCurrency()} ${sign}${formatDecimalAmount(Number(absBigInt(amount)) / 100)}`;
}

export function formatSignedAmountOnly(cents) {
  const amount = BigInt(cents);
  const sign = amount >= 0n ? "+" : "-";
  return `${sign}${formatDecimalAmount(Number(absBigInt(amount)) / 100)}`;
}

export function formatTrendReturn(basisPoints) {
  return formatPercent(basisPoints);
}

export function formatCompactCurrency(cents, scaleReference = absBigInt(BigInt(cents))) {
  const value = Number(cents) / 100;
  const currency = displayCurrency();
  const reference = Number(scaleReference) / 100;
  const abs = Math.abs(value);
  if (displayCurrency() === "CNY") {
    if (reference >= 100000000) return `${currency} ${(value / 100000000).toFixed(abs >= 1000000000 ? 1 : 2)}亿`;
    if (reference >= 10000) return `${currency} ${(value / 10000).toFixed(abs >= 100000 ? 1 : 2)}万`;
  }
  if (abs >= 1000000) return `${currency} ${Math.round(value / 1000000)}M`;
  if (abs >= 1000) return `${currency} ${Math.round(value / 1000)}K`;
  return formatDisplayCurrency(cents);
}

export function formatUnitPrice(price, currency = "", emptyLabel = "-") {
  const value = String(price ?? "").trim();
  if (!value || value === "0") return emptyLabel;
  return formatCurrencyAmount(value, currency || displayCurrency(), { maximumFractionDigits: 8 });
}

export function formatCurrencyAmount(value, currency = "", options = {}) {
  const currencyCode = String(currency || "").trim().toUpperCase();
  const amount = formatDecimalAmount(value, options);
  return currencyCode ? `${currencyCode} ${amount}` : amount;
}

export function formatOptionalSignedAmount(cents) {
  if (cents === null || cents === undefined) return dataUnavailableLabel;
  return formatSignedAmountOnly(cents);
}

export function formatDateTimeMinute(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return notSyncedLabel;
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatMonthDayTimeMinute(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return notSyncedLabel;
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function performanceValueClass(value) {
  if (!hasDisplayValue(value)) return "placeholder-value";
  return toneClassForValue(value);
}

export function hasDisplayValue(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return Boolean(text) && text !== "--" && text !== dataUnavailableLabel && text !== "NaN%" && !text.includes("NaN");
}

export function toneClassForValue(value) {
  if (typeof value === "bigint") {
    if (value > 0n) return "positive";
    if (value < 0n) return "negative";
    return "";
  }
  if (typeof value === "number") {
    if (value > 0) return "positive";
    if (value < 0) return "negative";
    return "";
  }
  const text = String(value || "").trim();
  const match = text.match(/[+-]?\d[\d,]*(?:\.\d+)?/);
  if (!match) return "";
  const normalized = match[0].replaceAll(",", "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric === 0) return "";
  if (normalized.startsWith("-") || text.includes("-")) return "negative";
  if (normalized.startsWith("+") || text.includes("+")) return "positive";
  return "";
}

export function displayCurrencySymbol() {
  if (displayCurrency() === "USD") return "$";
  if (displayCurrency() === "HKD") return "HK$";
  return "¥";
}

export function displayCurrencyCode() {
  return displayCurrency();
}

function displayCurrency() {
  return displayCurrencyGetter();
}

function formatDecimalAmount(value, options = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "暂无数据";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2
  }).format(amount);
}
