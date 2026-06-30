export function getMarketElements() {
  return {
    benchmarkRows: document.querySelector("#benchmark-rows"),
    benchmarkEmpty: document.querySelector("#benchmark-empty"),
    syncMarketDataButton: document.querySelector("#sync-market-data-button"),
    marketSyncResult: document.querySelector("#market-sync-result"),
    assetTrendSelect: document.querySelector("#asset-trend-select"),
    assetPriceChart: document.querySelector("#asset-price-chart")
  };
}
