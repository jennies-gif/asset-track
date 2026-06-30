import {
  CENT_SCALE,
  RATE_SCALE,
  calculateMoneyFromQuantity,
  parseDecimalToScaledInt,
  roundDivide
} from "./money";
import type { AssetInput, Attribution, NormalizedAsset, Portfolio, PortfolioTotals, Position } from "./types";

export function normalizeAsset(formAsset: AssetInput): NormalizedAsset {
  return {
    id: formAsset.id || cryptoRandomId(),
    name: String(formAsset.name || "").trim(),
    symbol: String(formAsset.symbol || "").trim().toUpperCase(),
    type: String(formAsset.type || "其他").trim(),
    account: String(formAsset.account || "").trim(),
    currency: String(formAsset.currency || "USD").trim(),
    quantity: String(formAsset.quantity || "0").trim(),
    costPrice: String(formAsset.costPrice || "0").trim(),
    previousPrice: String(formAsset.previousPrice || "0").trim(),
    currentPrice: String(formAsset.currentPrice || "0").trim(),
    fxRate: String(formAsset.fxRate || "1").trim(),
    previousFxRate: String(formAsset.previousFxRate || formAsset.fxRate || "1").trim(),
    contribution: String(formAsset.contribution || "0").trim(),
    dividends: String(formAsset.dividends || "0").trim(),
    interest: String(formAsset.interest || "0").trim(),
    fees: String(formAsset.fees || "0").trim(),
    taxes: String(formAsset.taxes || "0").trim(),
    manualAdjustment: String(formAsset.manualAdjustment || "0").trim(),
    purchaseDate: String(formAsset.purchaseDate || "").trim(),
    transactionType: String(formAsset.transactionType || "买入").trim(),
    priceSource: String(formAsset.priceSource || "用户录入").trim(),
    pricedAt: String(formAsset.pricedAt || "").trim(),
    attachmentName: String(formAsset.attachmentName || "").trim(),
    buyReason: String(formAsset.buyReason || "").trim(),
    upsideReasons: String(formAsset.upsideReasons || "").trim(),
    downsideReasons: String(formAsset.downsideReasons || "").trim(),
    updatedAt: formAsset.updatedAt || new Date().toISOString(),
    closed: formAsset.closed
  };
}

export function validateAsset(asset: NormalizedAsset | AssetInput): string {
  const required = ["name", "account", "quantity", "costPrice", "previousPrice", "currentPrice", "fxRate"];
  for (const field of required) {
    const value = asset[field as keyof AssetInput];
    if (!String(value ?? "").trim()) return `${field} 不能为空`;
  }

  try {
    const quantity = parseDecimalToScaledInt(asset.quantity, 6);
    const fxRate = parseDecimalToScaledInt(asset.fxRate || "1", RATE_SCALE);
    const previousFxRate = parseDecimalToScaledInt(asset.previousFxRate || asset.fxRate || "1", RATE_SCALE);
    parseDecimalToScaledInt(asset.costPrice, CENT_SCALE);
    parseDecimalToScaledInt(asset.previousPrice, CENT_SCALE);
    parseDecimalToScaledInt(asset.currentPrice, CENT_SCALE);
    parseDecimalToScaledInt(asset.contribution || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.dividends || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.interest || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.fees || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.taxes || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.manualAdjustment || "0", CENT_SCALE);

    if (quantity <= 0n) return "数量必须大于 0";
    if (fxRate <= 0n) return "汇率必须大于 0";
    if (previousFxRate <= 0n) return "期初汇率必须大于 0";
  } catch {
    return "金额、数量和汇率必须是有效数字";
  }

  return "";
}

export function calculatePosition(asset: NormalizedAsset): Position {
  const costValueCents = calculateMoneyFromQuantity(asset.quantity, asset.costPrice, asset.fxRate);
  const previousValueCents = calculateMoneyFromQuantity(asset.quantity, asset.previousPrice, asset.previousFxRate);
  const marketValueCents = calculateMoneyFromQuantity(asset.quantity, asset.currentPrice, asset.fxRate);
  const contributionCents = parseDecimalToScaledInt(asset.contribution, CENT_SCALE);
  const dividendsCents = parseDecimalToScaledInt(asset.dividends, CENT_SCALE);
  const interestCents = parseDecimalToScaledInt(asset.interest, CENT_SCALE);
  const feesCents = parseDecimalToScaledInt(asset.fees, CENT_SCALE);
  const taxesCents = parseDecimalToScaledInt(asset.taxes, CENT_SCALE);
  const manualAdjustmentCents = parseDecimalToScaledInt(asset.manualAdjustment, CENT_SCALE);
  const unrealizedPnlCents = marketValueCents - costValueCents;
  const returnBps = costValueCents === 0n ? 0n : roundDivide(unrealizedPnlCents * 10000n, costValueCents);

  return {
    ...asset,
    costValueCents,
    previousValueCents,
    marketValueCents,
    contributionCents,
    dividendsCents,
    interestCents,
    feesCents,
    taxesCents,
    manualAdjustmentCents,
    unrealizedPnlCents,
    returnBps
  };
}

export function calculatePortfolio(assets: NormalizedAsset[]): Portfolio {
  const positions = assets.map(calculatePosition);
  const totals = positions.reduce<PortfolioTotals>(
    (acc, position) => {
      acc.costValueCents += position.costValueCents;
      acc.previousValueCents += position.previousValueCents;
      acc.marketValueCents += position.marketValueCents;
      acc.contributionCents += position.contributionCents;
      acc.dividendsCents += position.dividendsCents;
      acc.interestCents += position.interestCents;
      acc.feesCents += position.feesCents;
      acc.taxesCents += position.taxesCents;
      acc.manualAdjustmentCents += position.manualAdjustmentCents;
      acc.unrealizedPnlCents += position.unrealizedPnlCents;
      return acc;
    },
    {
      costValueCents: 0n,
      previousValueCents: 0n,
      marketValueCents: 0n,
      contributionCents: 0n,
      dividendsCents: 0n,
      interestCents: 0n,
      feesCents: 0n,
      taxesCents: 0n,
      manualAdjustmentCents: 0n,
      unrealizedPnlCents: 0n,
      returnBps: 0n
    }
  );
  totals.returnBps =
    totals.costValueCents === 0n ? 0n : roundDivide(totals.unrealizedPnlCents * 10000n, totals.costValueCents);
  return { positions, totals };
}

export function calculateAttribution(assets: NormalizedAsset[]): Attribution {
  const { positions, totals } = calculatePortfolio(assets);
  const priceChangeCents = positions.reduce((sum, position) => {
    const previousValueAtCurrentPrice = calculateMoneyFromQuantity(
      position.quantity,
      position.currentPrice,
      position.previousFxRate
    );
    return sum + (previousValueAtCurrentPrice - position.previousValueCents);
  }, 0n);
  const fxChangeCents = positions.reduce((sum, position) => {
    const previousValueAtCurrentPrice = calculateMoneyFromQuantity(
      position.quantity,
      position.currentPrice,
      position.previousFxRate
    );
    return sum + (position.marketValueCents - previousValueAtCurrentPrice);
  }, 0n);
  const valueChangeCents = totals.marketValueCents - totals.previousValueCents;
  const incomeCents = totals.dividendsCents + totals.interestCents;
  const feesImpactCents = -totals.feesCents;
  const taxImpactCents = -totals.taxesCents;
  const unexplainedCents =
    valueChangeCents -
    totals.contributionCents -
    priceChangeCents -
    fxChangeCents -
    incomeCents -
    feesImpactCents -
    taxImpactCents -
    totals.manualAdjustmentCents;

  return {
    startValueCents: totals.previousValueCents,
    endValueCents: totals.marketValueCents,
    valueChangeCents,
    items: [
      { key: "contribution", label: "净投入/提现", amountCents: totals.contributionCents },
      { key: "price", label: "价格变动", amountCents: priceChangeCents },
      { key: "fx", label: "汇率变动", amountCents: fxChangeCents },
      { key: "income", label: "分红/利息", amountCents: incomeCents },
      { key: "fees", label: "手续费", amountCents: feesImpactCents },
      { key: "taxes", label: "税费", amountCents: taxImpactCents },
      { key: "manual", label: "手动调整", amountCents: totals.manualAdjustmentCents },
      { key: "unexplained", label: "未解释差异", amountCents: unexplainedCents }
    ]
  };
}

function cryptoRandomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
