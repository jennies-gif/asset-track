import { normalizeAsset } from "../domain/calculations.js";
import { inferAccountType } from "../features/assets/accountOptions.js";
import { inferAssetMarket } from "../features/assets/marketOptions.js";
import { normalizeSnapshotDate } from "../utils/date.js";
import { demoState } from "./demoState.js";

export function normalizeSession(session = {}) {
  if (!session?.signedIn) return { signedIn: false, email: "", name: "", signedInAt: "" };
  return {
    signedIn: true,
    userId: String(session.userId || "").trim(),
    email: String(session.email || "").trim(),
    name: String(session.name || "本地用户").trim(),
    authProvider: String(session.authProvider || "local").trim(),
    signedInAt: session.signedInAt || new Date().toISOString()
  };
}

export function normalizeLoadedAssets(assets) {
  if (!Array.isArray(assets)) return { assets: [], useDemoSnapshots: false };
  const isLegacyDemo =
    assets.length > 0 &&
    assets.every((asset) => String(asset.id || "").startsWith("demo-")) &&
    (assets.some((asset) => ["demo-csi300", "demo-nasdaq", "demo-bond"].includes(asset.id)) ||
      assets.every((asset) => !asset.purchaseDate));
  const normalizedAssets = assets.map((asset) => ({
    ...asset,
    account: asset.account === "卫星账户" || asset.account === "加密货币" ? "加密货币账户" : asset.account,
    market: asset.market || inferAssetMarket(asset),
    accountType: asset.accountType || inferAccountType(asset)
  }));
  return {
    assets: isLegacyDemo ? structuredClone(demoState.assets) : normalizedAssets,
    useDemoSnapshots: isLegacyDemo
  };
}

export function normalizeLoadedSnapshots(snapshots) {
  return Array.isArray(snapshots) ? normalizeSnapshots(snapshots) : [];
}

export function normalizeSelectedAccount(account, assets = []) {
  const value = String(account || "all");
  const normalizedValue = value === "卫星账户" || value === "加密货币" ? "加密货币账户" : value;
  if (normalizedValue === "all") return "all";
  return assets.some((asset) => !asset.closed && asset.account === normalizedValue) ? normalizedValue : "all";
}

export function normalizeSettings(settings = {}) {
  const displayCurrency = ["CNY", "USD", "HKD"].includes(settings.displayCurrency) ? settings.displayCurrency : "CNY";
  return {
    displayCurrency,
    usdCnyRate: String(settings.usdCnyRate || "6.85"),
    btcUsdRate: String(settings.btcUsdRate || "70000"),
    usdHkdRate: String(settings.usdHkdRate || "7.82"),
    language: settings.language === "en" ? "en" : "zh",
    font: ["system", "serif", "mono", "rounded"].includes(settings.font) ? settings.font : "rounded",
    theme: settings.theme === "dark" ? "dark" : "light"
  };
}

export function normalizeSnapshots(snapshots) {
  return (Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot) => ({
      date: normalizeSnapshotDate(snapshot.date),
      valueCents: String(snapshot.valueCents || "0")
    }))
    .filter((snapshot) => /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeIncomingAssets(assets) {
  return assets.map((asset) => normalizeAsset(asset));
}
