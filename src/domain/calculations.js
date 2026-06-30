const CENT_SCALE = 2;
const QUANTITY_SCALE = 6;
const RATE_SCALE = 4;
const QUANTITY_FACTOR = 10n ** BigInt(QUANTITY_SCALE);
const RATE_FACTOR = 10n ** BigInt(RATE_SCALE);

export function parseDecimalToScaledInt(value, scale) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid decimal: ${raw}`);
  }

  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  const nextDigit = fraction[scale] ? Number(fraction[scale]) : 0;
  let result = BigInt(whole || "0") * 10n ** BigInt(scale) + BigInt(padded || "0");

  if (nextDigit >= 5) {
    result += 1n;
  }

  return negative ? -result : result;
}

export function scaledIntToDecimal(value, scale) {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const factor = 10n ** BigInt(scale);
  const whole = absolute / factor;
  const fraction = String(absolute % factor).padStart(scale, "0");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${trimmedFraction ? `.${trimmedFraction}` : ""}`;
}

export function formatCurrency(cents, currency = "USD") {
  const amount = Number(cents) / 100;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatPercent(basisPoints) {
  const value = Number(basisPoints) / 100;
  if (!Number.isFinite(value)) return "暂无数据";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function roundDivide(numerator, denominator) {
  const half = denominator / 2n;
  if (numerator >= 0n) {
    return (numerator + half) / denominator;
  }
  return (numerator - half) / denominator;
}

export function calculateMoneyFromQuantity(quantity, priceCents, fxRate = "1") {
  const quantityUnits = parseDecimalToScaledInt(quantity, QUANTITY_SCALE);
  const priceMinor = parseDecimalToScaledInt(priceCents, CENT_SCALE);
  const rateUnits = parseDecimalToScaledInt(fxRate, RATE_SCALE);
  return roundDivide(quantityUnits * priceMinor * rateUnits, QUANTITY_FACTOR * RATE_FACTOR);
}

export function calculateRealizedPnl({
  quantity,
  costPrice,
  sellPrice,
  fxRate = "1",
  fees = "0",
  taxes = "0"
}) {
  const grossProceedsCents = calculateMoneyFromQuantity(quantity, sellPrice, fxRate);
  const costBasisCents = calculateMoneyFromQuantity(quantity, costPrice, fxRate);
  const feesCents = parseDecimalToScaledInt(fees || "0", CENT_SCALE);
  const taxesCents = parseDecimalToScaledInt(taxes || "0", CENT_SCALE);
  const realizedPnlCents = grossProceedsCents - costBasisCents - feesCents - taxesCents;

  return {
    grossProceedsCents,
    costBasisCents,
    feesCents,
    taxesCents,
    realizedPnlCents
  };
}

export function calculateBuyPreview({
  currentQuantity,
  currentCostPrice,
  buyQuantity,
  buyPrice,
  fxRate = "1",
  fees = "0"
}) {
  const currentQuantityUnits = parseDecimalToScaledInt(currentQuantity || "0", QUANTITY_SCALE);
  const buyQuantityUnits = parseDecimalToScaledInt(buyQuantity, QUANTITY_SCALE);
  const currentCostUnits = parseDecimalToScaledInt(currentCostPrice || "0", RATE_SCALE);
  const buyPriceUnits = parseDecimalToScaledInt(buyPrice, RATE_SCALE);
  const totalQuantityUnits = currentQuantityUnits + buyQuantityUnits;
  const feesCents = parseDecimalToScaledInt(fees || "0", CENT_SCALE);

  if (buyQuantityUnits <= 0n) throw new Error("Buy quantity must be positive");
  if (buyPriceUnits <= 0n) throw new Error("Buy price must be positive");
  if (totalQuantityUnits <= 0n) throw new Error("Total quantity must be positive");

  const averageCostUnits = roundDivide(
    currentQuantityUnits * currentCostUnits + buyQuantityUnits * buyPriceUnits,
    totalQuantityUnits
  );
  const grossCostCents = calculateMoneyFromQuantity(buyQuantity, buyPrice, fxRate);
  const totalCostCents = calculateMoneyFromQuantity(
    scaledIntToDecimal(totalQuantityUnits, QUANTITY_SCALE),
    scaledIntToDecimal(averageCostUnits, RATE_SCALE),
    fxRate
  );

  return {
    grossCostCents,
    feesCents,
    totalQuantity: scaledIntToDecimal(totalQuantityUnits, QUANTITY_SCALE),
    averageCostPrice: scaledIntToDecimal(averageCostUnits, RATE_SCALE),
    totalCostCents: totalCostCents + feesCents
  };
}

export function calculateSellPreview({
  currentQuantity,
  costPrice,
  sellQuantity,
  sellPrice,
  fxRate = "1",
  fees = "0",
  taxes = "0"
}) {
  const currentQuantityUnits = parseDecimalToScaledInt(currentQuantity || "0", QUANTITY_SCALE);
  const sellQuantityUnits = parseDecimalToScaledInt(sellQuantity, QUANTITY_SCALE);
  const sellPriceUnits = parseDecimalToScaledInt(sellPrice, RATE_SCALE);

  if (sellQuantityUnits <= 0n) throw new Error("Sell quantity must be positive");
  if (sellQuantityUnits > currentQuantityUnits) throw new Error("Sell quantity exceeds holding");
  if (sellPriceUnits <= 0n) throw new Error("Sell price must be positive");

  const pnl = calculateRealizedPnl({ quantity: sellQuantity, costPrice, sellPrice, fxRate, fees, taxes });
  const remainingQuantityUnits = currentQuantityUnits - sellQuantityUnits;
  const remainingCostCents = calculateMoneyFromQuantity(
    scaledIntToDecimal(remainingQuantityUnits, QUANTITY_SCALE),
    costPrice,
    fxRate
  );

  return {
    ...pnl,
    remainingQuantity: scaledIntToDecimal(remainingQuantityUnits, QUANTITY_SCALE),
    remainingCostCents
  };
}

export function normalizeAsset(formAsset) {
  return {
    id: formAsset.id || cryptoRandomId(),
    name: String(formAsset.name || "").trim(),
    symbol: String(formAsset.symbol || "").trim().toUpperCase(),
    type: String(formAsset.type || "其他").trim(),
    market: String(formAsset.market || "").trim(),
    account: String(formAsset.account || "").trim(),
    accountType: String(formAsset.accountType || "securities").trim(),
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
    updatedAt: formAsset.updatedAt || new Date().toISOString()
  };
}

export function validateAsset(asset) {
  const required = ["name", "account", "quantity", "costPrice", "previousPrice", "currentPrice", "fxRate"];
  for (const field of required) {
    if (!String(asset[field] ?? "").trim()) {
      return `${field} 不能为空`;
    }
  }

  try {
    const quantity = parseDecimalToScaledInt(asset.quantity, QUANTITY_SCALE);
    const fxRate = parseDecimalToScaledInt(asset.fxRate, RATE_SCALE);
    parseDecimalToScaledInt(asset.costPrice, CENT_SCALE);
    parseDecimalToScaledInt(asset.previousPrice, CENT_SCALE);
    parseDecimalToScaledInt(asset.currentPrice, CENT_SCALE);
    parseDecimalToScaledInt(asset.previousFxRate || asset.fxRate || "1", RATE_SCALE);
    parseDecimalToScaledInt(asset.contribution || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.dividends || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.interest || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.fees || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.taxes || "0", CENT_SCALE);
    parseDecimalToScaledInt(asset.manualAdjustment || "0", CENT_SCALE);

    if (quantity <= 0n) return "数量必须大于 0";
    if (fxRate <= 0n) return "汇率必须大于 0";
    if (parseDecimalToScaledInt(asset.previousFxRate || asset.fxRate || "1", RATE_SCALE) <= 0n) {
      return "期初汇率必须大于 0";
    }
  } catch {
    return "金额、数量和汇率必须是有效数字";
  }

  return "";
}

export function calculatePosition(asset) {
  const costValueCents = calculateMoneyFromQuantity(asset.quantity, asset.costPrice, asset.fxRate);
  const previousValueCents = calculateMoneyFromQuantity(
    asset.quantity,
    asset.previousPrice,
    asset.previousFxRate || asset.fxRate
  );
  const marketValueCents = calculateMoneyFromQuantity(asset.quantity, asset.currentPrice, asset.fxRate);
  const contributionCents = parseDecimalToScaledInt(asset.contribution || "0", CENT_SCALE);
  const dividendsCents = parseDecimalToScaledInt(asset.dividends || "0", CENT_SCALE);
  const interestCents = parseDecimalToScaledInt(asset.interest || "0", CENT_SCALE);
  const feesCents = parseDecimalToScaledInt(asset.fees || "0", CENT_SCALE);
  const taxesCents = parseDecimalToScaledInt(asset.taxes || "0", CENT_SCALE);
  const manualAdjustmentCents = parseDecimalToScaledInt(asset.manualAdjustment || "0", CENT_SCALE);
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

export function calculatePortfolio(assets) {
  const positions = assets.map(calculatePosition);
  const totals = positions.reduce(
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
      unrealizedPnlCents: 0n
    }
  );

  totals.returnBps =
    totals.costValueCents === 0n ? 0n : roundDivide(totals.unrealizedPnlCents * 10000n, totals.costValueCents);

  return { positions, totals };
}

export function calculateCategoryBreakdown(assets) {
  const { positions, totals } = calculatePortfolio(assets);
  const byType = new Map();

  for (const position of positions) {
    const type = position.type || "其他";
    const current = byType.get(type) || {
      type,
      count: 0,
      marketValueCents: 0n,
      unrealizedPnlCents: 0n
    };
    current.count += 1;
    current.marketValueCents += position.marketValueCents;
    current.unrealizedPnlCents += position.unrealizedPnlCents;
    byType.set(type, current);
  }

  return [...byType.values()]
    .map((item) => ({
      ...item,
      weightBps:
        totals.marketValueCents === 0n ? 0n : roundDivide(item.marketValueCents * 10000n, totals.marketValueCents)
    }))
    .sort((left, right) => {
      if (left.marketValueCents === right.marketValueCents) return left.type.localeCompare(right.type);
      return left.marketValueCents > right.marketValueCents ? -1 : 1;
    });
}

export function calculateAttribution(assets) {
  const { positions, totals } = calculatePortfolio(assets);
  const priceChangeCents = positions.reduce((sum, position) => {
    const previousFxRate = position.previousFxRate || position.fxRate || "1";
    const previousValueAtCurrentPrice = calculateMoneyFromQuantity(position.quantity, position.currentPrice, previousFxRate);
    return sum + (previousValueAtCurrentPrice - position.previousValueCents);
  }, 0n);
  const fxChangeCents = positions.reduce((sum, position) => {
    const previousFxRate = position.previousFxRate || position.fxRate || "1";
    const previousValueAtCurrentPrice = calculateMoneyFromQuantity(position.quantity, position.currentPrice, previousFxRate);
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

function cryptoRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
