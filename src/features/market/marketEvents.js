export function initMarketEvents(context) {
  const { elements } = context;
  elements.syncMarketDataButton?.addEventListener("click", () => {
    context.syncLatestMarketPrices();
  });
  elements.assetTrendSelect?.addEventListener("change", context.renderAssetPriceChart);
}
