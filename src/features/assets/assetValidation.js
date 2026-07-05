import { QUANTITY_SCALE, RATE_SCALE } from "../../constants/appConstants.js";
import { parseDecimalToScaledInt } from "../../domain/calculations.js";

let ctx = {};

export function configureAssetValidation(context) {
  ctx = context;
}

export function validateAssetFormByMode(existingAsset) {
  const form = ctx.elements.assetForm;
  const mode = form.dataset.mode || "create";
  const isTransaction = mode === "transaction" || mode === "adjust";
  let firstError = "";
  const requiredFields = isTransaction ? [] : ["name", "type", "account", "currency", "quantity"];
  for (const fieldName of requiredFields) {
    const field = form.elements[fieldName];
    if (!String(field?.value || "").trim()) {
      setFieldError(fieldName, "必填字段，请补充后保存。");
      firstError ||= "请补充必填字段。";
    }
  }

  const dateField = isTransaction
    ? form.elements[(form.elements.adjustmentType?.value || "buy") === "buy" ? "addDate" : "closedDate"]
    : form.elements.purchaseDate;
  if (isTransaction && dateField && !String(dateField.value || "").trim()) {
    setFieldError(dateField.name, "请选择交易日期。");
    firstError ||= "请选择交易日期。";
  }
  if (dateField && dateField.value && !/^\d{4}-\d{2}-\d{2}$/.test(dateField.value)) {
    setFieldError(dateField.name, "日期格式无效。");
    firstError ||= "请检查日期。";
  }

  if (isTransaction) {
    const type = form.elements.adjustmentType?.value || "buy";
    if (type === "buy") {
      firstError ||= validatePositiveDecimalField("addQuantity", "买入数量必须大于 0。");
      firstError ||= validatePositiveDecimalField("addPrice", "买入单价必须大于 0。");
    } else {
      firstError ||= validatePositiveDecimalField("sellQuantity", "卖出数量必须大于 0。");
      firstError ||= validatePositiveDecimalField("closePrice", type === "close" ? "清仓价格必须大于 0。" : "卖出单价必须大于 0。");
      try {
        const sellQuantity = parseDecimalToScaledInt(form.elements.sellQuantity?.value || "0", QUANTITY_SCALE);
        const holdingQuantity = parseDecimalToScaledInt(existingAsset?.quantity || "0", QUANTITY_SCALE);
        if (sellQuantity > holdingQuantity) {
          setFieldError("sellQuantity", "卖出数量不能超过当前持仓。");
          firstError ||= "卖出数量不能超过当前持仓。";
        }
      } catch {
        setFieldError("sellQuantity", "请输入有效数量。");
        firstError ||= "卖出数量必须是有效数字。";
      }
    }
    return firstError;
  }

  firstError ||= validatePositiveDecimalField("quantity", "持有数量必须大于 0。");
  if (String(form.elements.costPrice?.value || "").trim()) {
    firstError ||= validatePositiveDecimalField("costPrice", "成本价必须大于 0。");
  }
  if (String(form.elements.previousPrice?.value || "").trim()) {
    firstError ||= validatePositiveDecimalField("previousPrice", "期初价必须大于 0。");
  }
  if (String(form.elements.currentPrice?.value || "").trim()) {
    firstError ||= validatePositiveDecimalField("currentPrice", "当前价格必须大于 0。");
  }
  firstError ||= validatePositiveDecimalField("fxRate", "币种或汇率缺失会导致估值不完整。");
  if (String(form.elements.previousFxRate?.value || "").trim()) {
    firstError ||= validatePositiveDecimalField("previousFxRate", "期初汇率必须大于 0。");
  }
  for (const [fieldName, message] of [
    ["fees", "费用不能为负数。"],
    ["taxes", "税费不能为负数。"],
    ["dividends", "分红不能为负数。"],
    ["interest", "利息不能为负数。"]
  ]) {
    firstError ||= validateNonNegativeDecimalField(fieldName, message);
  }
  return firstError;
}

export function validatePositiveDecimalField(fieldName, message) {
  const value = String(ctx.elements.assetForm.elements[fieldName]?.value || "").trim();
  if (!value) {
    setFieldError(fieldName, message);
    return message;
  }
  try {
    if (parseDecimalToScaledInt(value, fieldName.includes("Price") || fieldName.includes("Rate") ? RATE_SCALE : QUANTITY_SCALE) <= 0n) {
      setFieldError(fieldName, message);
      return message;
    }
  } catch {
    setFieldError(fieldName, "请输入有效数字。");
    return "金额、数量和汇率必须是有效数字。";
  }
  return "";
}

export function validateNonNegativeDecimalField(fieldName, message) {
  const value = String(ctx.elements.assetForm.elements[fieldName]?.value || "").trim();
  if (!value) return "";
  try {
    if (parseDecimalToScaledInt(value, fieldName.includes("Rate") ? RATE_SCALE : QUANTITY_SCALE) < 0n) {
      setFieldError(fieldName, message);
      return message;
    }
  } catch {
    setFieldError(fieldName, "请输入有效数字。");
    return "金额、数量和汇率必须是有效数字。";
  }
  return "";
}

export function clearAssetFieldErrors() {
  ctx.elements.assetForm.querySelectorAll(".field-error").forEach((node) => node.remove());
  ctx.elements.assetForm.querySelectorAll(".field-invalid").forEach((node) => node.classList.remove("field-invalid"));
  ctx.elements.assetError.textContent = "";
}

export function setFieldError(fieldName, message) {
  const field = ctx.elements.assetForm.elements[fieldName];
  const label = field?.closest("label");
  if (!field || !label || label.querySelector(".field-error")) return;
  field.classList.add("field-invalid");
  const error = document.createElement("small");
  error.className = "field-error";
  error.textContent = message;
  label.append(error);
}

export function setTransactionFieldError(message) {
  if (message.includes("数量")) setFieldError(message.includes("加仓") ? "addQuantity" : "sellQuantity", message);
  if (message.includes("价格") || message.includes("单价")) setFieldError(message.includes("加仓") ? "addPrice" : "closePrice", message);
}

export function humanizeAssetError(error) {
  const fieldLabels = {
    name: "资产名称",
    account: "账户名称",
    quantity: "持有数量/份额",
    costPrice: "平均成本价",
    previousPrice: "期初价",
    currentPrice: "当前价格/最新净值",
    fxRate: "当前汇率到 USD",
    previousFxRate: "期初汇率",
    type: "资产类型",
    currency: "币种"
  };
  return Object.entries(fieldLabels).reduce((message, [field, label]) => message.replace(field, label), error);
}
