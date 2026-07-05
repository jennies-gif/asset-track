export function initAnalysisEvents({
  elements,
  getAnalysisFilter,
  setAnalysisFilter,
  getAnalysisReturnMetric,
  setAnalysisReturnMetric,
  getSelectedBenchmarkKeys,
  setSelectedBenchmarkKeys,
  renderAttribution,
  handleInlineCurrencyChange,
  loadBenchmarkPerformance
}) {
  elements.analysisAccountFilter?.addEventListener("change", () => {
    setAnalysisFilter({
      ...getAnalysisFilter(),
      account: elements.analysisAccountFilter.value || "all",
      assetId: "all"
    });
    renderAttribution();
  });

  elements.analysisAssetFilter?.addEventListener("change", () => {
    setAnalysisFilter({
      ...getAnalysisFilter(),
      assetId: elements.analysisAssetFilter.value || "all"
    });
    renderAttribution();
  });

  elements.analysisStart?.addEventListener("change", () => {
    setAnalysisFilter({ ...getAnalysisFilter(), startDate: elements.analysisStart.value });
    renderAttribution();
  });

  elements.analysisEnd?.addEventListener("change", () => {
    setAnalysisFilter({ ...getAnalysisFilter(), endDate: elements.analysisEnd.value });
    renderAttribution();
  });

  document.querySelectorAll("[data-analysis-return-metric]").forEach((button) => {
    button.addEventListener("click", () => {
      setAnalysisReturnMetric(button.dataset.analysisReturnMetric || "mwr");
      renderAttribution();
    });
  });

  elements.analysisBenchmarkSelector?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const checked = [...elements.analysisBenchmarkSelector.querySelectorAll("input:checked")].map((input) => input.value);
    const nextKeys = checked.length ? checked : getSelectedBenchmarkKeys();
    setSelectedBenchmarkKeys(nextKeys);
    renderAttribution();
    loadBenchmarkPerformance({ force: true });
  });

  elements.attributionMetrics?.addEventListener("change", handleInlineCurrencyChange);

  getAnalysisReturnMetric();
}
