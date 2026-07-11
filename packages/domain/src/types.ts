export type Currency = "CNY" | "USD" | "HKD" | "EUR" | "BTC";

export type AssetType = "股票" | "ETF" | "基金" | "债券" | "现金" | "数字资产" | "贵金属" | "其他";

export type TransactionType =
  | "买入"
  | "卖出"
  | "转入"
  | "转出"
  | "分红"
  | "利息"
  | "手动调整";

export interface AssetInput {
  id?: string;
  name: string;
  symbol?: string;
  type?: AssetType | string;
  account: string;
  currency?: Currency | string;
  quantity: string;
  costPrice: string;
  previousPrice: string;
  currentPrice: string;
  fxRate?: string;
  previousFxRate?: string;
  contribution?: string;
  dividends?: string;
  interest?: string;
  fees?: string;
  taxes?: string;
  manualAdjustment?: string;
  purchaseDate?: string;
  transactionType?: TransactionType | string;
  priceSource?: string;
  pricedAt?: string;
  attachmentName?: string;
  buyReason?: string;
  upsideReasons?: string;
  downsideReasons?: string;
  updatedAt?: string;
  closed?: boolean;
}

export interface NormalizedAsset extends Required<Omit<AssetInput, "id" | "closed">> {
  id: string;
  closed?: boolean;
}

export interface Position extends NormalizedAsset {
  costValueCents: bigint;
  previousValueCents: bigint;
  marketValueCents: bigint;
  contributionCents: bigint;
  dividendsCents: bigint;
  interestCents: bigint;
  feesCents: bigint;
  taxesCents: bigint;
  manualAdjustmentCents: bigint;
  unrealizedPnlCents: bigint;
  returnBps: bigint;
}

export interface PortfolioTotals {
  costValueCents: bigint;
  previousValueCents: bigint;
  marketValueCents: bigint;
  contributionCents: bigint;
  dividendsCents: bigint;
  interestCents: bigint;
  feesCents: bigint;
  taxesCents: bigint;
  manualAdjustmentCents: bigint;
  unrealizedPnlCents: bigint;
  returnBps: bigint;
}

export interface Portfolio {
  positions: Position[];
  totals: PortfolioTotals;
}

export interface AttributionItem {
  key: "contribution" | "price" | "fx" | "income" | "fees" | "taxes" | "manual" | "unexplained";
  label: string;
  amountCents: bigint;
}

export interface Attribution {
  startValueCents: bigint;
  endValueCents: bigint;
  valueChangeCents: bigint;
  items: AttributionItem[];
}

export interface MarketUniverse {
  key: string;
  label: string;
  market: string;
  currency: string;
  coverage: string;
  source: string;
  updateWindow: string;
}

export interface Security {
  symbol: string;
  name: string;
  type: string;
  universe: string;
  market: string;
  currency: Currency | string;
  aliases?: string[];
  source?: string;
}

export interface DataTask {
  id: string;
  label: string;
  scope: string;
  assetCount: number;
  source: string;
  schedule: string;
  status: string;
  lastRunAt: string;
}

export interface HistoryPoint {
  date: string;
  close: number;
  source: string;
  type: string;
}
