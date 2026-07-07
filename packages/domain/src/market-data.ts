import type { DataTask, HistoryPoint, MarketUniverse, NormalizedAsset, Security } from "./types";

const dayMs = 24 * 60 * 60 * 1000;

const preciousMetalInstruments: Security[] = [
  { symbol: "XAU", name: "黄金", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD" },
  { symbol: "XAG", name: "白银", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD" },
  { symbol: "XPT", name: "铂金", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD" },
  { symbol: "XPD", name: "钯金", type: "贵金属", universe: "precious-metals", market: "METAL", currency: "USD" }
];

const cryptoInstruments: Security[] = [
  { symbol: "BTC", name: "Bitcoin", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD" },
  { symbol: "ETH", name: "Ethereum", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD" },
  { symbol: "SOL", name: "Solana", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD" },
  { symbol: "BNB", name: "BNB", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD" },
  { symbol: "USDT", name: "Tether", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD" },
  { symbol: "USDC", name: "USD Coin", type: "数字资产", universe: "crypto", market: "WEB3", currency: "USD" }
];

export const marketUniverses: MarketUniverse[] = [
  {
    key: "csi300",
    label: "A 股沪深 300",
    market: "CN",
    currency: "CNY",
    coverage: "沪深 300 成分股",
    source: "Tushare daily / 授权行情服务",
    updateWindow: "A 股交易日收盘后"
  },
  {
    key: "nasdaq100",
    label: "美股纳斯达克 100",
    market: "US",
    currency: "USD",
    coverage: "纳斯达克 100 成分股",
    source: "Alpha Vantage / EODHD / Polygon",
    updateWindow: "美股交易日收盘后，UTC 次日早晨"
  },
  {
    key: "hstech",
    label: "港股恒生科技",
    market: "HK",
    currency: "HKD",
    coverage: "恒生科技指数成分股",
    source: "Tushare hk_daily / 港股授权行情服务",
    updateWindow: "港股交易日收盘后"
  },
  {
    key: "etf",
    label: "ETF 白名单",
    market: "CN/US/HK",
    currency: "多币种",
    coverage: "沪深交易所 ETF、美股 ETF、港股科技相关 ETF",
    source: "Tushare fund_daily / 海外 EOD 服务",
    updateWindow: "对应交易所收盘后"
  },
  {
    key: "fund",
    label: "国内公募基金",
    market: "CN",
    currency: "CNY",
    coverage: "用户搜索或手动录入后的开放式基金",
    source: "Tushare fund_nav / 授权基金净值服务",
    updateWindow: "净值披露窗口后，次日补跑"
  },
  {
    key: "precious-metals",
    label: "贵金属",
    market: "METAL",
    currency: "USD",
    coverage: "黄金、白银、铂金、钯金",
    source: "Metals.Dev / 授权贵金属数据源",
    updateWindow: "每日参考价，按数据源披露时间更新"
  },
  {
    key: "crypto",
    label: "虚拟货币",
    market: "WEB3",
    currency: "USD",
    coverage: "BTC、ETH、SOL、BNB、USDT、USDC",
    source: "CoinGecko 聚合价格",
    updateWindow: "按需同步最新聚合价"
  }
];

export const securityWhitelist: Security[] = [
  { symbol: "000300", name: "沪深300指数", type: "指数", universe: "benchmark", market: "CN", currency: "CNY", source: "Tencent finance index kline" },
  { symbol: "510300", name: "沪深300ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "159915", name: "创业板ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "513180", name: "恒生科技指数ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "600519", name: "贵州茅台", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["茅台"] },
  { symbol: "300750", name: "宁德时代", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["宁德", "宁王", "CATL"] },
  { symbol: "002594", name: "比亚迪", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["BYD"] },
  { symbol: "688256", name: "寒武纪", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["寒武纪-U", "Cambricon"] },
  { symbol: "688981", name: "中芯国际", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中芯", "SMIC"] },
  { symbol: "688041", name: "海光信息", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["海光"] },
  { symbol: "688012", name: "中微公司", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中微"] },
  { symbol: "688111", name: "金山办公", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["WPS"] },
  { symbol: "300124", name: "汇川技术", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["汇川"] },
  { symbol: "300308", name: "中际旭创", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中际"] },
  { symbol: "300502", name: "新易盛", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "002371", name: "北方华创", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["华创"] },
  { symbol: "002230", name: "科大讯飞", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["讯飞", "iFlytek"] },
  { symbol: "000063", name: "中兴通讯", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中兴", "ZTE"] },
  { symbol: "AAPL", name: "Apple", type: "股票", universe: "nasdaq100", market: "US", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft", type: "股票", universe: "nasdaq100", market: "US", currency: "USD" },
  { symbol: "NVDA", name: "NVIDIA", type: "股票", universe: "nasdaq100", market: "US", currency: "USD" },
  { symbol: "NDX", name: "Nasdaq-100 Index", type: "指数", universe: "benchmark", market: "US", currency: "USD", source: "Nasdaq historical public API" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "ETF", universe: "etf", market: "US", currency: "USD" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", type: "ETF", universe: "etf", market: "US", currency: "USD" },
  { symbol: "00700", name: "腾讯控股", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "09988", name: "阿里巴巴-W", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "03690", name: "美团-W", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "09868", name: "小鹏汽车-W", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "000001.OF", name: "华夏成长混合", type: "基金", universe: "fund", market: "CN", currency: "CNY" },
  { symbol: "110011.OF", name: "易方达中小盘混合", type: "基金", universe: "fund", market: "CN", currency: "CNY" },
  ...preciousMetalInstruments,
  ...cryptoInstruments
];

export const benchmarkInstruments = [
  {
    key: "csi300",
    label: "沪深300",
    symbol: "000300",
    name: "沪深300指数",
    type: "指数",
    universe: "benchmark",
    market: "CN",
    currency: "CNY",
    meta: "指数点位 · 腾讯证券日线",
    source: "Tencent finance index kline"
  },
  {
    key: "sp500",
    label: "标普500",
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    type: "ETF",
    universe: "benchmark",
    market: "US",
    currency: "USD",
    meta: "SPY ETF 代理 · Nasdaq 历史日线",
    source: "Nasdaq historical public API"
  },
  {
    key: "nasdaq100",
    label: "纳斯达克100",
    symbol: "NDX",
    name: "Nasdaq-100 Index",
    type: "指数",
    universe: "benchmark",
    market: "US",
    currency: "USD",
    meta: "指数点位 · Nasdaq 历史日线",
    source: "Nasdaq historical public API"
  }
] satisfies Array<Security & { key: string; label: string; meta: string; source: string }>;

export function lookupSecurity(symbol: string | undefined): Security | null {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  return securityWhitelist.find((item) => normalizeSymbol(item.symbol) === normalized) || null;
}

export function inferUniverse(asset: Partial<NormalizedAsset>): MarketUniverse | null {
  const match = lookupSecurity(asset.symbol);
  if (match) return marketUniverses.find((item) => item.key === match.universe) || null;
  if (String(asset.type || "") === "贵金属" || String((asset as { market?: string }).market || "").toUpperCase() === "METAL") {
    return marketUniverses.find((item) => item.key === "precious-metals") || null;
  }
  if (String(asset.type || "") === "数字资产" || String((asset as { market?: string }).market || "").toUpperCase() === "WEB3") {
    return marketUniverses.find((item) => item.key === "crypto") || null;
  }
  if (asset.currency === "HKD") return marketUniverses.find((item) => item.key === "hstech") || null;
  if (asset.currency === "USD") return marketUniverses.find((item) => item.key === "nasdaq100") || null;
  if (String(asset.type || "").includes("基金")) return marketUniverses.find((item) => item.key === "fund") || null;
  if (String(asset.type || "").toUpperCase().includes("ETF")) {
    return marketUniverses.find((item) => item.key === "etf") || null;
  }
  return marketUniverses.find((item) => item.key === "csi300") || null;
}

export function buildDataTasks(assets: NormalizedAsset[], date = new Date()): DataTask[] {
  const byUniverse = new Map<string, { universe: MarketUniverse; assets: NormalizedAsset[] }>();
  for (const asset of assets.filter((item) => !item.closed)) {
    const universe = inferUniverse(asset);
    if (!universe) continue;
    const current = byUniverse.get(universe.key) || { universe, assets: [] };
    current.assets.push(asset);
    byUniverse.set(universe.key, current);
  }

  return [...byUniverse.values()].map(({ universe, assets: taskAssets }) => ({
    id: `task-${universe.key}`,
    label: universe.label,
    scope: universe.coverage,
    assetCount: taskAssets.length,
    source: universe.source,
    schedule: universe.updateWindow,
    status: taskAssets.length ? "待同步" : "无资产",
    lastRunAt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 22, 0, 0)).toISOString()
  }));
}

export function buildHistorySeries(asset: Pick<NormalizedAsset, "costPrice" | "currentPrice" | "previousPrice" | "pricedAt" | "updatedAt" | "symbol" | "name" | "type" | "priceSource">): HistoryPoint[] {
  const endDate = normalizeDate(asset.pricedAt || asset.updatedAt) || todayIsoDate();
  const startDate = addDays(endDate, -91);
  const dates = buildBusinessDates(startDate, endDate);
  const current = toFiniteNumber(asset.currentPrice, toFiniteNumber(asset.costPrice, 1));
  const cost = toFiniteNumber(asset.costPrice, current);
  const previous = toFiniteNumber(asset.previousPrice, cost);
  const totalChange = current - cost;
  const seed = hashString(`${asset.symbol || ""}${asset.name || ""}${asset.type || ""}`);

  return dates
    .map((date, index) => {
      const progress = dates.length <= 1 ? 1 : index / (dates.length - 1);
      const wave = Math.sin(progress * Math.PI * 5 + seed) * 0.012 + Math.sin(progress * Math.PI * 13 + seed) * 0.006;
      const anchor = cost + totalChange * progress;
      const value = Math.max(0.0001, anchor * (1 + wave));
      const close = index === dates.length - 1 ? current : value;
      return {
        date,
        close: roundPrice(close),
        source: asset.priceSource || inferUniverse(asset)?.source || "用户录入",
        type: String(asset.type || "").includes("基金") ? "单位净值" : "日收盘价"
      };
    })
    .map((point, index, points) => {
      if (points.length > 1 && index === points.length - 2) return { ...point, close: roundPrice(previous) };
      return point;
    });
}

function normalizeSymbol(symbol: string | undefined): string {
  return String(symbol || "").trim().toUpperCase().replace(/\.(HK|US|SZ|SH)$/u, "");
}

function buildBusinessDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!dates.length || dates.at(-1) !== endDate) dates.push(endDate);
  return dates.slice(-66);
}

function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + delta * dayMs).toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value: string | undefined): string {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function toFiniteNumber(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function roundPrice(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash / 9973;
}
