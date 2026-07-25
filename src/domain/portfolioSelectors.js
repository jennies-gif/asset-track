import {
  calculateMoneyFromQuantity,
  calculatePortfolio,
  parseDecimalToScaledInt,
  roundDivide
} from "./calculations.js";
import { RATE_FACTOR, RATE_SCALE } from "../constants/appConstants.js";
import { normalizeSelectedAccount } from "../state/normalizers.js";

let ctx = {
  getState: () => ({ assets: [], settings: {}, selectedAccount: "all" }),
  inferAccountType: () => "other"
};

export function configurePortfolioSelectors(context = {}) {
  ctx = { ...ctx, ...context };
}

function getState() {
  return ctx.getState();
}

export function calculateDisplayPortfolio(assets) {
  const base = calculatePortfolio(assets);
  const positions = base.positions.map((position) => {
    const costValueCents = displayAssetValue(position, "costPrice");
    const previousValueCents = displayAssetValue(position, "previousPrice");
    const marketValueCents = displayAssetValue(position, "currentPrice");
    const hasCostBasis = Boolean(position.hasCostBasis);
    const unrealizedPnlCents = hasCostBasis ? marketValueCents - costValueCents : 0n;
    const returnBps = hasCostBasis && costValueCents !== 0n ? roundDivide(unrealizedPnlCents * 10000n, costValueCents) : null;
    return {
      ...position,
      hasCostBasis,
      costValueCents,
      previousValueCents,
      marketValueCents,
      unrealizedPnlCents,
      returnBps
    };
  });
  const totals = positions.reduce(
    (acc, position) => {
      acc.costValueCents += position.costValueCents;
      acc.previousValueCents += position.previousValueCents;
      acc.marketValueCents += position.marketValueCents;
      acc.unrealizedPnlCents += position.unrealizedPnlCents;
      return acc;
    },
    { costValueCents: 0n, previousValueCents: 0n, marketValueCents: 0n, unrealizedPnlCents: 0n }
  );
  totals.returnBps =
    totals.costValueCents === 0n ? null : roundDivide(totals.unrealizedPnlCents * 10000n, totals.costValueCents);
  return { positions, totals };
}

export function currentOverviewTotalCents() {
  return calculateDisplayPortfolio(overviewAssets()).totals.marketValueCents;
}

export function displayAssetValue(asset, priceField) {
  const fxRate = priceField === "previousPrice" ? asset.previousFxRate || asset.fxRate || "1" : asset.fxRate || "1";
  const localCents = calculateMoneyFromQuantity(asset.quantity, asset[priceField], "1");
  if (asset.currency === displayCurrency()) return localCents;
  if (asset.currency === "CNY" && displayCurrency() === "USD") return divideByUsdCnyRate(localCents);
  if (asset.currency === "USD" && displayCurrency() === "CNY") return multiplyByUsdCnyRate(localCents);
  if (asset.currency === "HKD" && displayCurrency() === "USD") return divideByUsdHkdRate(localCents);
  if (asset.currency === "USD" && displayCurrency() === "HKD") return multiplyByUsdHkdRate(localCents);
  if (asset.currency === "CNY" && displayCurrency() === "HKD") return multiplyByUsdHkdRate(divideByUsdCnyRate(localCents));
  if (asset.currency === "HKD" && displayCurrency() === "CNY") return multiplyByUsdCnyRate(divideByUsdHkdRate(localCents));
  const usdCents = calculateMoneyFromQuantity(asset.quantity, asset[priceField], fxRate);
  return convertUsdToDisplay(usdCents);
}

export function convertUsdToDisplay(cents) {
  if (displayCurrency() === "CNY") return multiplyByUsdCnyRate(cents);
  if (displayCurrency() === "HKD") return multiplyByUsdHkdRate(cents);
  return cents;
}

function multiplyByUsdCnyRate(cents) {
  return roundDivide(BigInt(cents) * usdCnyRateUnits(), RATE_FACTOR);
}

function divideByUsdCnyRate(cents) {
  return roundDivide(BigInt(cents) * RATE_FACTOR, usdCnyRateUnits());
}

function multiplyByUsdHkdRate(cents) {
  return roundDivide(BigInt(cents) * usdHkdRateUnits(), RATE_FACTOR);
}

function divideByUsdHkdRate(cents) {
  return roundDivide(BigInt(cents) * RATE_FACTOR, usdHkdRateUnits());
}

function usdCnyRateUnits() {
  try {
    const parsed = parseDecimalToScaledInt(getState().settings?.usdCnyRate || "6.85", RATE_SCALE);
    return parsed > 0n ? parsed : parseDecimalToScaledInt("6.85", RATE_SCALE);
  } catch {
    return parseDecimalToScaledInt("6.85", RATE_SCALE);
  }
}

function usdHkdRateUnits() {
  try {
    const parsed = parseDecimalToScaledInt(getState().settings?.usdHkdRate || "7.82", RATE_SCALE);
    return parsed > 0n ? parsed : parseDecimalToScaledInt("7.82", RATE_SCALE);
  } catch {
    return parseDecimalToScaledInt("7.82", RATE_SCALE);
  }
}

function btcUsdCents() {
  try {
    const parsed = parseDecimalToScaledInt(getState().settings?.btcUsdRate || "70000", 2);
    return parsed > 0n ? parsed : parseDecimalToScaledInt("70000", 2);
  } catch {
    return parseDecimalToScaledInt("70000", 2);
  }
}

export function usdCentsToSats(cents) {
  return roundDivide(BigInt(cents) * 100000000n, btcUsdCents());
}

export function displayCurrency() {
  const state = getState();
  if (state.settings?.displayCurrency === "USD") return "USD";
  if (state.settings?.displayCurrency === "HKD") return "HKD";
  return "CNY";
}

export function openAssets() {
  return getState().assets.filter((asset) => !asset.closed);
}

export function overviewAssets() {
  return openAssets();
}

export function selectedOpenAssets() {
  const account = selectedAccountName();
  const assets = openAssets();
  if (account === "all") return assets;
  return assets.filter((asset) => asset.account === account);
}

export function selectedAccountName() {
  const state = getState();
  state.selectedAccount = normalizeSelectedAccount(state.selectedAccount, state.assets);
  return state.selectedAccount || "all";
}

export function selectedAccountLabel() {
  const account = selectedAccountName();
  return account === "all" ? "全部账户" : account;
}

export function buildAccountSummaries() {
  const assets = openAssets();
  const accounts = new Map();
  for (const asset of assets) {
    const name = asset.account || "未命名账户";
    const current = accounts.get(name) || { name, label: name, accountType: asset.accountType || ctx.inferAccountType(asset), assets: [] };
    current.assets.push(asset);
    accounts.set(name, current);
  }

  const rows = [...accounts.values()]
    .map((account) => {
      const { totals } = calculateDisplayPortfolio(account.assets);
      return { ...account, count: account.assets.length, totals };
    })
    .sort((left, right) => {
      if (left.totals.marketValueCents === right.totals.marketValueCents) return left.label.localeCompare(right.label);
      return left.totals.marketValueCents > right.totals.marketValueCents ? -1 : 1;
    });

  const { totals } = calculateDisplayPortfolio(assets);
  return [{ name: "all", label: "全部账户", count: assets.length, totals }, ...rows];
}
