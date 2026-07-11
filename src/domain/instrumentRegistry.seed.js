import { aliasesForInstrument } from "./instrumentAliases.js";
import { securityWhitelist } from "./marketData.js";

export const instrumentRegistryGeneratedAt = "";

export const instrumentRegistrySummary = {
  count: securityWhitelist.length,
  generatedAt: "",
  byMarket: {},
  byType: {},
  bySource: {
    "Asset Trail core whitelist": securityWhitelist.length
  },
  minimumTarget: 0
};

export const instrumentRegistrySeed = securityWhitelist.map((item) => ({
  id: [item.market, item.type, item.symbol].filter(Boolean).join(":"),
  name: item.name,
  symbol: item.symbol,
  market: item.market,
  exchange: item.exchange || "",
  type: item.type,
  currency: item.currency,
  aliases: [item.symbol, item.name, ...(item.aliases || []), ...aliasesForInstrument(item)].filter(Boolean),
  status: "active",
  universe: item.universe || "",
  marketDataSupported: true,
  dataSource: item.source || "Asset Trail core whitelist",
  sourceUpdatedAt: "",
  updatedAt: ""
}));
