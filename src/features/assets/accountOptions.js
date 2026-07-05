export function accountNamePresets() {
  return [
    { accountType: "securities", name: "华泰证券" },
    { accountType: "securities", name: "富途证券" },
    { accountType: "securities", name: "盈透证券" },
    { accountType: "securities", name: "老虎证券" },
    { accountType: "fund", name: "支付宝基金" },
    { accountType: "fund", name: "天天基金" },
    { accountType: "fund", name: "银行基金账户" },
    { accountType: "cash", name: "招商银行" },
    { accountType: "cash", name: "工商银行" },
    { accountType: "cash", name: "现金备用金" },
    { accountType: "crypto", name: "OKX" },
    { accountType: "crypto", name: "Binance" },
    { accountType: "crypto", name: "Bybit" },
    { accountType: "crypto", name: "冷钱包" },
    { accountType: "long_term", name: "长期账户" },
    { accountType: "long_term", name: "养老金账户" },
    { accountType: "watch", name: "观察组合" },
    { accountType: "other", name: "其他账户" }
  ];
}

export function savedAccountOptionsFromAssets(assets = []) {
  const accounts = new Map();
  for (const asset of assets) {
    const name = String(asset?.account || "").trim();
    if (!name) continue;
    const accountType = asset.accountType || inferAccountType(asset);
    const key = `${accountType}:${name}`;
    if (!accounts.has(key)) accounts.set(key, { name, accountType, saved: true });
  }
  return [...accounts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function mergeAccountOptions(assets = []) {
  const accounts = new Map(accountNamePresets().map((account) => [`${account.accountType}:${account.name}`, account]));
  for (const account of savedAccountOptionsFromAssets(assets)) {
    const key = `${account.accountType}:${account.name}`;
    if (!accounts.has(key)) accounts.set(key, account);
  }
  return [...accounts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function inferAccountType(asset = {}) {
  const type = String(asset.type || "");
  const account = String(asset.account || asset.name || "").toLowerCase();
  if (type === "现金" || account.includes("cash") || account.includes("备用金") || account.includes("银行")) return "cash";
  if (type === "数字资产" || account.includes("crypto") || account.includes("binance") || account.includes("钱包")) return "crypto";
  if (type === "基金" || account.includes("基金")) return "fund";
  if (account.includes("长期") || account.includes("养老") || account.includes("退休")) return "long_term";
  if (account.includes("模拟") || account.includes("观察")) return "watch";
  return "securities";
}

export function accountTypeLabel(type) {
  if (String(type || "").startsWith("custom:")) return String(type).slice("custom:".length);
  return {
    securities: "证券账户",
    fund: "基金账户",
    cash: "现金账户",
    crypto: "数字资产账户",
    long_term: "养老金/长期账户",
    watch: "模拟/观察账户",
    other: "其他"
  }[type] || "证券账户";
}

export function normalizeAccountTypeFormValue(type, customName) {
  const normalizedType = type === "brokerage" ? "securities" : type === "custom" ? "__custom__" : type;
  if (normalizedType === "__custom__") {
    const label = String(customName || "").trim();
    return label ? `custom:${label}` : "";
  }
  return String(normalizedType || "");
}
