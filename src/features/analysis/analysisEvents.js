import { analysisPresetBounds } from "./analysisFilters.js";

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

  document.querySelectorAll("[data-analysis-range-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const range = button.dataset.analysisRangeValue || "ytd";
      const current = getAnalysisFilter();
      setAnalysisFilter(range === "custom"
        ? { ...current, range }
        : { ...current, range, ...analysisPresetBounds(range, current.endDate) });
      renderAttribution();
    });
  });

  elements.analysisStart?.addEventListener("change", () => {
    setAnalysisFilter({ ...getAnalysisFilter(), range: "custom", startDate: elements.analysisStart.value });
    renderAttribution();
  });

  elements.analysisEnd?.addEventListener("change", () => {
    setAnalysisFilter({ ...getAnalysisFilter(), range: "custom", endDate: elements.analysisEnd.value });
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
