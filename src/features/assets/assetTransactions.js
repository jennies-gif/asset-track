import { QUANTITY_SCALE, RATE_SCALE } from "../../constants/appConstants.js";
import {
  calculateBuyPreview,
  calculateSellPreview,
  parseDecimalToScaledInt,
  scaledIntToDecimal
} from "../../domain/calculations.js";
import { formatDate } from "../../utils/date.js";
import { randomId } from "../../utils/ids.js";

let ctx = {};

export function configureAssetTransactions(context) {
  ctx = context;
}

export function buildSellAssetUpdate(existingAsset, formAsset, { closeAll }) {
  if (!existingAsset) return { error: "未找到要卖出的资产" };
  if (!hasPositiveCostBasis(formAsset.costPrice || existingAsset.costPrice)) {
    return { error: "该资产缺少成本价，补充成本后再记录卖出或清仓。" };
  }

  const sellQuantity = String(ctx.elements.assetForm.elements.sellQuantity?.value || "").trim();
  const sellPrice = String(ctx.elements.assetForm.elements.closePrice?.value || "").trim();
  const sellFees = String(ctx.elements.assetForm.elements.sellFees?.value || "0").trim() || "0";
  const sellTaxes = String(ctx.elements.assetForm.elements.sellTaxes?.value || "0").trim() || "0";
  const sellReason = String(ctx.elements.assetForm.elements.closeReason?.value || "").trim();
  const soldAt = ctx.elements.assetForm.elements.closedDate?.value
    ? `${ctx.elements.assetForm.elements.closedDate.value}T00:00:00.000Z`
    : new Date().toISOString();

  if (!sellQuantity) return { error: "卖出数量不能为空" };
  if (!sellPrice) return { error: "卖出价格不能为空" };

  try {
    const sellQuantityUnits = parseDecimalToScaledInt(sellQuantity, QUANTITY_SCALE);
    const currentQuantityUnits = parseDecimalToScaledInt(existingAsset.quantity, QUANTITY_SCALE);
    if (sellQuantityUnits <= 0n) return { error: "卖出数量必须大于 0" };
    if (sellQuantityUnits > currentQuantityUnits) return { error: "卖出数量不能超过当前持仓数量" };
    if (closeAll && sellQuantityUnits !== currentQuantityUnits) return { error: "清仓数量必须等于当前持仓数量" };

    const pnl = calculateSellPreview({
      currentQuantity: existingAsset.quantity,
      sellQuantity,
      costPrice: formAsset.costPrice || existingAsset.costPrice,
      sellPrice,
      fxRate: formAsset.fxRate || existingAsset.fxRate || "1",
      fees: sellFees,
      taxes: sellTaxes
    });
    const remainingQuantityUnits = currentQuantityUnits - sellQuantityUnits;
    const shouldClose = closeAll || remainingQuantityUnits === 0n;
    const previousRealizedPnlCents = BigInt(existingAsset.realizedPnlCents || "0");
    const previousGrossProceedsCents = BigInt(existingAsset.grossProceedsCents || "0");
    const previousCostBasisCents = BigInt(existingAsset.costBasisCents || "0");
    const previousSoldQuantityUnits = parseDecimalToScaledInt(existingAsset.soldQuantity || "0", QUANTITY_SCALE);
    const sellRecord = {
      id: randomId("sell"),
      action: shouldClose ? "清仓" : "卖出",
      quantity: sellQuantity,
      price: sellPrice,
      fees: sellFees,
      taxes: sellTaxes,
      reason: sellReason,
      soldAt,
      grossProceedsCents: String(pnl.grossProceedsCents),
      costBasisCents: String(pnl.costBasisCents),
      realizedPnlCents: String(pnl.realizedPnlCents)
    };

    return {
      asset: {
        ...existingAsset,
        ...formAsset,
        id: existingAsset.id,
        quantity: shouldClose ? sellQuantity : scaledIntToDecimal(remainingQuantityUnits, QUANTITY_SCALE),
        currentPrice: sellPrice,
        closePrice: shouldClose ? sellPrice : existingAsset.closePrice,
        closeReason: shouldClose ? sellReason : existingAsset.closeReason,
        closed: shouldClose,
        closedAt: shouldClose ? soldAt : existingAsset.closedAt,
        realizedPnlCents: String(previousRealizedPnlCents + pnl.realizedPnlCents),
        grossProceedsCents: String(previousGrossProceedsCents + pnl.grossProceedsCents),
        costBasisCents: String(previousCostBasisCents + pnl.costBasisCents),
        soldQuantity: scaledIntToDecimal(previousSoldQuantityUnits + sellQuantityUnits, QUANTITY_SCALE),
        sellRecords: [...(Array.isArray(existingAsset.sellRecords) ? existingAsset.sellRecords : []), sellRecord],
        priceStatus: "manual",
        pricedAt: soldAt.slice(0, 10),
        priceSource: formAsset.priceSource || existingAsset.priceSource || "用户录入"
      }
    };
  } catch {
    return { error: "卖出数量、价格、手续费和税费必须是有效数字" };
  }
}

export function buildAddAssetUpdate(existingAsset, formAsset) {
  if (!existingAsset) return { error: "未找到要加仓的资产" };
  if (!hasPositiveCostBasis(existingAsset.costPrice)) {
    return { error: "该资产缺少历史成本，补充成本后再计算加仓后的平均成本。" };
  }

  const addQuantity = String(ctx.elements.assetForm.elements.addQuantity?.value || "").trim();
  const addPrice = String(ctx.elements.assetForm.elements.addPrice?.value || "").trim();
  const addFees = String(ctx.elements.assetForm.elements.addFees?.value || "0").trim() || "0";
  const addReason = String(ctx.elements.assetForm.elements.addReason?.value || "").trim();
  const boughtAt = ctx.elements.assetForm.elements.addDate?.value
    ? `${ctx.elements.assetForm.elements.addDate.value}T00:00:00.000Z`
    : new Date().toISOString();

  if (!addQuantity) return { error: "加仓数量不能为空" };
  if (!addPrice) return { error: "加仓价格不能为空" };

  try {
    const addQuantityUnits = parseDecimalToScaledInt(addQuantity, QUANTITY_SCALE);
    if (addQuantityUnits <= 0n) return { error: "加仓数量必须大于 0" };
    const addPriceUnits = parseDecimalToScaledInt(addPrice, RATE_SCALE);
    if (addPriceUnits <= 0n) return { error: "加仓价格必须大于 0" };
    const buyPreview = calculateBuyPreview({
      currentQuantity: existingAsset.quantity,
      currentCostPrice: existingAsset.costPrice,
      buyQuantity: addQuantity,
      buyPrice: addPrice,
      fxRate: formAsset.fxRate || existingAsset.fxRate || "1",
      fees: addFees
    });
    const previousFeesCents = parseDecimalToScaledInt(existingAsset.fees || "0", 2);
    const addFeesCents = parseDecimalToScaledInt(addFees || "0", 2);
    const buyRecord = {
      id: randomId("buy"),
      action: "加仓",
      quantity: addQuantity,
      price: addPrice,
      fees: addFees,
      reason: addReason,
      boughtAt,
      grossCostCents: String(buyPreview.grossCostCents)
    };

    return {
      asset: {
        ...existingAsset,
        ...formAsset,
        id: existingAsset.id,
        quantity: buyPreview.totalQuantity,
        costPrice: buyPreview.averageCostPrice,
        currentPrice: addPrice,
        fees: scaledIntToDecimal(previousFeesCents + addFeesCents, 2),
        priceStatus: "manual",
        pricedAt: boughtAt.slice(0, 10),
        priceSource: formAsset.priceSource || existingAsset.priceSource || "用户录入",
        buyRecords: [...(Array.isArray(existingAsset.buyRecords) ? existingAsset.buyRecords : []), buyRecord]
      }
    };
  } catch {
    return { error: "加仓数量、价格和手续费必须是有效数字" };
  }
}

function hasPositiveCostBasis(value) {
  return Number(String(value || "0").trim()) > 0;
}

export function handlePortfolioTransactionAction(assetId, action) {
  if (!assetId) return;
  if (action === "close") {
    ctx.startCloseAsset(assetId);
    return;
  }
  if (action === "sell") {
    ctx.startSellAsset(assetId, "sell");
    return;
  }
  if (action === "buy") {
    ctx.startSellAsset(assetId, "buy");
  }
}

export function buildAssetChangeRecords() {
  return ctx.getState().assets.flatMap((asset) => {
    const rows = [];
    rows.push({
      id: `${asset.id}:initial`,
      asset,
      action: asset.transactionType || "买入",
      date: asset.purchaseDate || formatDate(asset.updatedAt),
      quantity: asset.quantity,
      changePrice: asset.costPrice,
      currentPrice: asset.currentPrice || asset.costPrice,
      valueCents: ctx.calculateDisplayPortfolio([asset]).positions[0]?.costValueCents || 0n,
      fees: asset.fees || "0"
    });
    if (Array.isArray(asset.buyRecords)) {
      for (const [index, record] of asset.buyRecords.entries()) {
        rows.push({
          id: `${asset.id}:buy:${index}`,
          asset,
          action: record.action || "加仓",
          date: formatDate(record.boughtAt),
          quantity: record.quantity,
          changePrice: record.price || asset.costPrice,
          currentPrice: asset.currentPrice || record.price || asset.costPrice,
          valueCents: ctx.convertUsdToDisplay(BigInt(record.grossCostCents || "0")),
          fees: record.fees || "0"
        });
      }
    }
    if (Array.isArray(asset.sellRecords)) {
      for (const [index, record] of asset.sellRecords.entries()) {
        rows.push({
          id: `${asset.id}:sell:${index}`,
          asset,
          action: record.action || (asset.closed && index === asset.sellRecords.length - 1 ? "清仓" : "卖出"),
          date: formatDate(record.soldAt),
          quantity: record.quantity,
          changePrice: record.price || asset.closePrice || latestSellPrice(asset),
          currentPrice: asset.currentPrice || asset.closePrice || latestSellPrice(asset),
          valueCents: ctx.convertUsdToDisplay(BigInt(record.grossProceedsCents || "0")),
          fees: record.fees || "0"
        });
      }
    }
    return rows;
  }).sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
}

export function latestSellPrice(asset) {
  const sellRecords = Array.isArray(asset.sellRecords) ? asset.sellRecords : [];
  return sellRecords.at(-1)?.price || "";
}
