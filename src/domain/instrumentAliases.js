export const instrumentAliases = [
  { market: "US", symbol: "MU", aliases: ["美光", "美光科技", "Micron"] },
  { market: "US", symbol: "TSLA", aliases: ["特斯拉"] },
  { market: "US", symbol: "NVDA", aliases: ["英伟达", "辉达"] },
  { market: "US", symbol: "AAPL", aliases: ["苹果", "苹果公司"] },
  { market: "US", symbol: "MSFT", aliases: ["微软"] },
  { market: "US", symbol: "AMZN", aliases: ["亚马逊"] },
  { market: "US", symbol: "GOOGL", aliases: ["谷歌", "Alphabet"] },
  { market: "US", symbol: "GOOG", aliases: ["谷歌C", "Alphabet"] },
  { market: "US", symbol: "META", aliases: ["Meta", "脸书", "Facebook"] },
  { market: "US", symbol: "NFLX", aliases: ["奈飞", "网飞"] },
  { market: "US", symbol: "AMD", aliases: ["超威半导体", "超微"] },
  { market: "US", symbol: "INTC", aliases: ["英特尔"] },
  { market: "US", symbol: "COIN", aliases: ["Coinbase"] },
  { market: "US", symbol: "MSTR", aliases: ["微策略", "MicroStrategy"] },
  { market: "WEB3", symbol: "BTC", aliases: ["比特币", "大饼"] },
  { market: "WEB3", symbol: "ETH", aliases: ["以太坊", "以太"] },
  { market: "WEB3", symbol: "SOL", aliases: ["索拉纳"] },
  { market: "WEB3", symbol: "BNB", aliases: ["币安币"] },
  { market: "WEB3", symbol: "DOGE", aliases: ["Dogecoin", "狗狗币", "狗币"] },
  { market: "WEB3", symbol: "USDT", aliases: ["泰达币", "U"] },
  { market: "WEB3", symbol: "USDC", aliases: ["美元币"] }
];

export function aliasesForInstrument({ market, symbol }) {
  const normalizedMarket = String(market || "").trim().toUpperCase();
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();
  return instrumentAliases
    .filter((item) => item.market === normalizedMarket && item.symbol === normalizedSymbol)
    .flatMap((item) => item.aliases || []);
}
