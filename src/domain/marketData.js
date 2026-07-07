import { cryptoInstruments, preciousMetalInstruments } from "./marketDataSources.js";

const dayMs = 24 * 60 * 60 * 1000;

export const marketUniverses = [
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

export const securityWhitelist = [
  { symbol: "000300", name: "沪深300指数", type: "指数", universe: "benchmark", market: "CN", currency: "CNY", source: "Tencent finance index kline" },
  { symbol: "510300", name: "沪深300ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "159915", name: "创业板ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "513180", name: "恒生科技指数ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "588000", name: "科创50ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY", aliases: ["科创50"] },
  { symbol: "512880", name: "证券ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY", aliases: ["券商ETF"] },
  { symbol: "512800", name: "银行ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "515790", name: "光伏ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY" },
  { symbol: "515030", name: "新能源车ETF", type: "ETF", universe: "etf", market: "CN", currency: "CNY", aliases: ["新能源车"] },
  { symbol: "600519", name: "贵州茅台", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["茅台"] },
  { symbol: "601318", name: "中国平安", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["平安", "平安保险"] },
  { symbol: "600036", name: "招商银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["招行"] },
  { symbol: "300750", name: "宁德时代", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["宁德", "宁王", "CATL"] },
  { symbol: "002594", name: "比亚迪", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["BYD"] },
  { symbol: "000858", name: "五粮液", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "000333", name: "美的集团", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["美的"] },
  { symbol: "000651", name: "格力电器", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["格力"] },
  { symbol: "300760", name: "迈瑞医疗", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["迈瑞"] },
  { symbol: "600030", name: "中信证券", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中信"] },
  { symbol: "300059", name: "东方财富", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["东财"] },
  { symbol: "601398", name: "工商银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["工行"] },
  { symbol: "601939", name: "建设银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["建行"] },
  { symbol: "601988", name: "中国银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中行"] },
  { symbol: "601288", name: "农业银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["农行"] },
  { symbol: "601166", name: "兴业银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "600000", name: "浦发银行", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "600900", name: "长江电力", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "601899", name: "紫金矿业", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["紫金"] },
  { symbol: "600276", name: "恒瑞医药", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["恒瑞"] },
  { symbol: "601012", name: "隆基绿能", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["隆基"] },
  { symbol: "600887", name: "伊利股份", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["伊利"] },
  { symbol: "600309", name: "万华化学", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["万华"] },
  { symbol: "000568", name: "泸州老窖", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["老窖"] },
  { symbol: "002415", name: "海康威视", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["海康"] },
  { symbol: "002475", name: "立讯精密", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["立讯"] },
  { symbol: "002714", name: "牧原股份", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["牧原"] },
  { symbol: "600941", name: "中国移动", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["移动"] },
  { symbol: "600938", name: "中国海油", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中海油"] },
  { symbol: "601857", name: "中国石油", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中石油"] },
  { symbol: "600028", name: "中国石化", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中石化"] },
  { symbol: "688256", name: "寒武纪", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["寒武纪-U", "Cambricon"] },
  { symbol: "688981", name: "中芯国际", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中芯", "SMIC"] },
  { symbol: "688041", name: "海光信息", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["海光"] },
  { symbol: "688012", name: "中微公司", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中微"] },
  { symbol: "688111", name: "金山办公", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["WPS"] },
  { symbol: "688008", name: "澜起科技", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["澜起"] },
  { symbol: "688271", name: "联影医疗", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["联影"] },
  { symbol: "688036", name: "传音控股", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["传音"] },
  { symbol: "300124", name: "汇川技术", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["汇川"] },
  { symbol: "300308", name: "中际旭创", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中际"] },
  { symbol: "300502", name: "新易盛", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "300394", name: "天孚通信", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["天孚"] },
  { symbol: "300274", name: "阳光电源", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["阳光"] },
  { symbol: "300033", name: "同花顺", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "300015", name: "爱尔眼科", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["爱尔"] },
  { symbol: "300014", name: "亿纬锂能", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["亿纬"] },
  { symbol: "002371", name: "北方华创", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["华创"] },
  { symbol: "002230", name: "科大讯飞", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["讯飞", "iFlytek"] },
  { symbol: "002352", name: "顺丰控股", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["顺丰"] },
  { symbol: "002241", name: "歌尔股份", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["歌尔"] },
  { symbol: "000063", name: "中兴通讯", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中兴", "ZTE"] },
  { symbol: "000725", name: "京东方A", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["京东方", "BOE"] },
  { symbol: "603259", name: "药明康德", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["药明"] },
  { symbol: "603288", name: "海天味业", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["海天"] },
  { symbol: "603501", name: "韦尔股份", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["韦尔"] },
  { symbol: "601888", name: "中国中免", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中免"] },
  { symbol: "601919", name: "中远海控", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["中远"] },
  { symbol: "600031", name: "三一重工", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["三一"] },
  { symbol: "600690", name: "海尔智家", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["海尔"] },
  { symbol: "600406", name: "国电南瑞", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["南瑞"] },
  { symbol: "600570", name: "恒生电子", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["恒生"] },
  { symbol: "600436", name: "片仔癀", type: "股票", universe: "cn-main", market: "CN", currency: "CNY" },
  { symbol: "600438", name: "通威股份", type: "股票", universe: "cn-main", market: "CN", currency: "CNY", aliases: ["通威"] },
  { symbol: "AAPL", name: "Apple", type: "股票", universe: "nasdaq100", market: "US", currency: "USD" },
  { symbol: "MSFT", name: "Microsoft", type: "股票", universe: "nasdaq100", market: "US", currency: "USD" },
  { symbol: "NVDA", name: "NVIDIA", type: "股票", universe: "nasdaq100", market: "US", currency: "USD" },
  { symbol: "NDX", name: "Nasdaq-100 Index", type: "指数", universe: "benchmark", market: "US", currency: "USD", source: "Nasdaq historical public API" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "ETF", universe: "etf", market: "US", currency: "USD" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", type: "ETF", universe: "etf", market: "US", currency: "USD" },
  { symbol: "GLD", name: "SPDR Gold Shares", type: "ETF", universe: "etf", market: "US", currency: "USD" },
  { symbol: "IAU", name: "iShares Gold Trust", type: "ETF", universe: "etf", market: "US", currency: "USD" },
  { symbol: "00700", name: "腾讯控股", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "09988", name: "阿里巴巴-W", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "03690", name: "美团-W", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "09868", name: "小鹏汽车-W", type: "股票", universe: "hstech", market: "HK", currency: "HKD" },
  { symbol: "01211", name: "比亚迪股份", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["比亚迪", "BYD"] },
  { symbol: "02318", name: "中国平安", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["平安"] },
  { symbol: "03968", name: "招商银行", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["招行"] },
  { symbol: "00941", name: "中国移动", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["移动"] },
  { symbol: "00883", name: "中国海洋石油", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["中海油", "中国海油"] },
  { symbol: "01398", name: "工商银行", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["工行"] },
  { symbol: "00939", name: "建设银行", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["建行"] },
  { symbol: "03988", name: "中国银行", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["中行"] },
  { symbol: "01288", name: "农业银行", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["农行"] },
  { symbol: "00388", name: "香港交易所", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["港交所", "HKEX"] },
  { symbol: "01810", name: "小米集团-W", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["小米"] },
  { symbol: "01024", name: "快手-W", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["快手"] },
  { symbol: "02015", name: "理想汽车-W", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["理想"] },
  { symbol: "09866", name: "蔚来-SW", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["蔚来", "NIO"] },
  { symbol: "09618", name: "京东集团-SW", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["京东"] },
  { symbol: "09999", name: "网易-S", type: "股票", universe: "hk-main", market: "HK", currency: "HKD", aliases: ["网易"] },
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
    key: "csi500",
    label: "中证500",
    symbol: "000905",
    name: "中证500指数",
    type: "指数",
    universe: "benchmark",
    market: "CN",
    currency: "CNY",
    meta: "指数点位 · 腾讯证券日线",
    source: "Tencent finance index kline"
  },
  {
    key: "sse50",
    label: "上证50",
    symbol: "000016",
    name: "上证50指数",
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
    key: "qqq",
    label: "QQQ",
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    type: "ETF",
    universe: "benchmark",
    market: "US",
    currency: "USD",
    meta: "纳斯达克100 ETF 代理 · Nasdaq 历史日线",
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
  },
  {
    key: "iwm",
    label: "罗素2000",
    symbol: "IWM",
    name: "iShares Russell 2000 ETF",
    type: "ETF",
    universe: "benchmark",
    market: "US",
    currency: "USD",
    meta: "IWM ETF 代理 · Nasdaq 历史日线",
    source: "Nasdaq historical public API"
  },
  {
    key: "vt",
    label: "全球股票",
    symbol: "VT",
    name: "Vanguard Total World Stock ETF",
    type: "ETF",
    universe: "benchmark",
    market: "US",
    currency: "USD",
    meta: "VT ETF 代理 · Nasdaq 历史日线",
    source: "Nasdaq historical public API"
  },
  {
    key: "gld",
    label: "黄金",
    symbol: "GLD",
    name: "SPDR Gold Shares",
    type: "ETF",
    universe: "benchmark",
    market: "US",
    currency: "USD",
    meta: "GLD ETF 代理 · Nasdaq 历史日线",
    source: "Nasdaq historical public API"
  }
];

export const defaultBenchmarkKeys = ["csi300", "sp500", "qqq"];

export const defaultBenchmarkSyncSymbols = benchmarkInstruments.map((benchmark) => benchmark.symbol);

export function selectedBenchmarkInstruments(keys = defaultBenchmarkKeys) {
  const selected = new Set((Array.isArray(keys) ? keys : defaultBenchmarkKeys).filter(Boolean));
  const matches = benchmarkInstruments.filter((benchmark) => selected.has(benchmark.key));
  return matches.length ? matches : benchmarkInstruments.filter((benchmark) => defaultBenchmarkKeys.includes(benchmark.key));
}

export function lookupSecurity(symbol) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  return securityWhitelist.find((item) => normalizeSymbol(item.symbol) === normalized) || null;
}

export function inferUniverse(asset = {}) {
  const match = lookupSecurity(asset.symbol);
  if (match) return marketUniverses.find((item) => item.key === match.universe) || null;

  if (String(asset.type || "") === "贵金属" || String(asset.market || "").toUpperCase() === "METAL") return marketUniverses.find((item) => item.key === "precious-metals");
  if (String(asset.type || "") === "数字资产" || String(asset.market || "").toUpperCase() === "WEB3") return marketUniverses.find((item) => item.key === "crypto");
  if (asset.currency === "HKD") return marketUniverses.find((item) => item.key === "hstech");
  if (asset.currency === "USD") return marketUniverses.find((item) => item.key === "nasdaq100");
  if (String(asset.type || "").includes("基金")) return marketUniverses.find((item) => item.key === "fund");
  if (String(asset.type || "").toUpperCase().includes("ETF")) return marketUniverses.find((item) => item.key === "etf");
  return marketUniverses.find((item) => item.key === "csi300");
}

export function buildDataTasks(assets = [], date = new Date()) {
  const activeAssets = assets.filter((asset) => !asset.closed);
  const byUniverse = new Map();
  for (const asset of activeAssets) {
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

export function buildHistorySeries(asset, options = {}) {
  const endDate = options.endDate || normalizeDate(asset.pricedAt || asset.updatedAt) || todayIsoDate();
  const startDate = options.startDate || addDays(endDate, -91);
  const dates = buildBusinessDates(startDate, endDate);
  const current = toFiniteNumber(asset.currentPrice, toFiniteNumber(asset.costPrice, 1));
  const cost = toFiniteNumber(asset.costPrice, current);
  const previous = toFiniteNumber(asset.previousPrice, cost);
  const totalChange = current - cost;
  const seed = hashString(`${asset.symbol || ""}${asset.name || ""}${asset.type || ""}`);

  return dates.map((date, index) => {
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
  }).map((point, index, points) => {
    if (points.length > 1 && index === points.length - 2) {
      return { ...point, close: roundPrice(previous) };
    }
    return point;
  });
}

function normalizeSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/\.(HK|US|SZ|SH)$/u, "");
}

function buildBusinessDates(startDate, endDate) {
  const dates = [];
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

function addDays(date, delta) {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + delta * dayMs).toISOString().slice(0, 10);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function roundPrice(value) {
  return Math.round(value * 10000) / 10000;
}

function hashString(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  }
  return hash / 9973;
}
