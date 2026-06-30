import {
  renderCategoryBreakdown,
  renderMarketDistribution,
  renderOverviewBreakdownDetail,
  setAllocationView,
  setOverviewBreakdown
} from "./portfolioRender.js";

export function initPortfolioEvents(context = {}) {
  const { elements, getState, persistAndRender } = context;
  document.querySelectorAll(".allocation-tab").forEach((button) => {
    button.addEventListener("click", () => {
      setAllocationView(button.dataset.allocationView || "type");
      renderCategoryBreakdown();
      renderOverviewBreakdownDetail();
    });
  });

  elements.accountList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-account-name]");
    if (!button) return;
    getState().selectedAccount = button.dataset.accountName || "all";
    persistAndRender();
  });

  elements.categoryList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-breakdown-dimension]");
    if (!button) return;
    setOverviewBreakdown({
      dimension: button.dataset.breakdownDimension,
      key: button.dataset.breakdownKey || ""
    });
    renderOverviewBreakdownDetail();
    renderCategoryBreakdown();
    renderMarketDistribution();
  });

  elements.marketDistributionList?.addEventListener("click", (event) => {
    const row = event.target.closest("[data-breakdown-dimension]");
    if (!row) return;
    setOverviewBreakdown({
      dimension: row.dataset.breakdownDimension,
      key: row.dataset.breakdownKey || ""
    });
    renderOverviewBreakdownDetail();
    renderCategoryBreakdown();
    renderMarketDistribution();
  });
}
