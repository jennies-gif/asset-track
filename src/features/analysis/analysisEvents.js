import {
  analysisAssetsForFilter,
  analysisPresetBounds
} from "./analysisFilters.js";

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
    const nextFilter = {
      ...getAnalysisFilter(),
      account: elements.analysisAccountFilter.value || "all",
      market: "all"
    };
    setAnalysisFilter(withRecordBoundsForScope(nextFilter));
    renderAttribution();
  });

  elements.analysisMarketFilter?.addEventListener("change", () => {
    const nextFilter = {
      ...getAnalysisFilter(),
      market: elements.analysisMarketFilter.value || "all"
    };
    setAnalysisFilter(withRecordBoundsForScope(nextFilter));
    renderAttribution();
  });

  document.querySelectorAll("[data-analysis-range-value]").forEach((button) => {
    button.addEventListener("click", () => {
      const range = button.dataset.analysisRangeValue || "ytd";
      const current = getAnalysisFilter();
      setAnalysisFilter(range === "custom"
        ? { ...current, range }
        : {
            ...current,
            range,
            ...analysisPresetBounds(
              range,
              current.endDate,
              analysisAssetsForFilter(current)
            )
          });
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

  function withRecordBoundsForScope(filter) {
    if (filter.range !== "all") return filter;
    return {
      ...filter,
      ...analysisPresetBounds(
        "all",
        filter.endDate,
        analysisAssetsForFilter(filter)
      )
    };
  }
}
