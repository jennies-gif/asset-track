import { defaultAssetFxRate } from "./assetFormPayload.js";
import { clearAssetFieldErrors } from "./assetValidation.js";
import {
  applyAssetQuickMatch,
  applyCashAssetFormMode,
  applyExistingAccountType,
  editAsset,
  handleAccountTypeChange,
  requestHideAssetFormPanel,
  startCloseAsset,
  startQuickAsset,
  startSellAsset,
  submitAssetForm,
  syncAdjustmentMode,
  updateAssetLiveSummary,
  updateTransactionLiveSummary
} from "./assetForm.js";
import { buildAssetChangeRecords, handlePortfolioTransactionAction } from "./assetTransactions.js";

export function initAssetEvents(ctx) {
  const { elements } = ctx;

  elements.assetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAssetForm();
  });

  elements.assetForm.elements.currency?.addEventListener("change", () => {
    const nextRate = defaultAssetFxRate(elements.assetForm.elements.currency.value);
    if (elements.assetForm.elements.fxRate) elements.assetForm.elements.fxRate.value = nextRate;
    if (elements.assetForm.elements.previousFxRate) elements.assetForm.elements.previousFxRate.value = nextRate;
    updateAssetLiveSummary();
    updateTransactionLiveSummary();
  });

  elements.assetForm.addEventListener("input", () => {
    clearAssetFieldErrors();
    updateAssetLiveSummary();
    updateTransactionLiveSummary();
  });
  elements.assetForm.elements.name?.addEventListener("change", () => {
    applyAssetQuickMatch();
    updateAssetLiveSummary();
  });
  elements.assetForm.elements.symbol?.addEventListener("change", () => {
    applyAssetQuickMatch();
    updateAssetLiveSummary();
  });
  elements.assetForm.elements.type?.addEventListener("change", () => {
    applyCashAssetFormMode();
    updateAssetLiveSummary();
  });
  elements.assetForm.elements.account?.addEventListener("change", applyExistingAccountType);
  elements.assetForm.elements.accountType?.addEventListener("change", handleAccountTypeChange);
  elements.assetForm.elements.accountTypeCustom?.addEventListener("change", handleAccountTypeChange);
  document.querySelectorAll('input[name="adjustmentType"]').forEach((input) => {
    input.addEventListener("change", syncAdjustmentMode);
  });
  elements.openAssetFormButton?.addEventListener("click", () => {
    startQuickAsset();
  });
  elements.closeAssetFormButton?.addEventListener("click", requestHideAssetFormPanel);
  elements.assetForm.querySelector("[data-cancel-asset-form]")?.addEventListener("click", requestHideAssetFormPanel);

  elements.portfolioAccountFilter?.addEventListener("change", () => {
    ctx.setPortfolioFilter({ ...ctx.getPortfolioFilter(), account: elements.portfolioAccountFilter.value });
    ctx.renderPortfolio();
  });

  elements.portfolioTypeFilter?.addEventListener("change", () => {
    ctx.setPortfolioFilter({ ...ctx.getPortfolioFilter(), type: elements.portfolioTypeFilter.value });
    ctx.renderPortfolio();
  });

  elements.portfolioStatusFilter?.addEventListener("change", () => {
    ctx.setPortfolioFilter({ ...ctx.getPortfolioFilter(), status: elements.portfolioStatusFilter.value });
    ctx.renderPortfolio();
  });

  elements.portfolioRows.addEventListener("click", (event) => {
    const transactionButton = event.target.closest("[data-transaction-action]");
    if (transactionButton) {
      handlePortfolioTransactionAction(transactionButton.dataset.assetId, transactionButton.dataset.transactionAction);
      return;
    }

    const sellButton = event.target.closest("[data-sell-asset-id]");
    if (sellButton) {
      startSellAsset(sellButton.dataset.sellAssetId);
      return;
    }

    const closeButton = event.target.closest("[data-close-asset-id]");
    if (closeButton) {
      startCloseAsset(closeButton.dataset.closeAssetId);
      return;
    }

    const editButton = event.target.closest("[data-edit-asset-id]");
    if (!editButton) return;
    editAsset(editButton.dataset.editAssetId);
  });

  elements.historyRows?.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-review-asset-id]");
    if (openButton) {
      ctx.openReviewNoteForAsset(openButton.dataset.openReviewAssetId);
      return;
    }
    const writeButton = event.target.closest("[data-write-review-asset-id]");
    if (!writeButton) return;
    const asset = ctx.getState().assets.find((item) => item.id === writeButton.dataset.writeReviewAssetId);
    if (asset) ctx.openCloseReviewNote(asset, "close");
  });

  elements.assetChangeRows?.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-change-note-id]");
    if (openButton) {
      ctx.openNoteById(openButton.dataset.openChangeNoteId);
      return;
    }

    const writeButton = event.target.closest("[data-write-change-note-id]");
    if (!writeButton) return;
    const change = buildAssetChangeRecords().find((item) => item.id === writeButton.dataset.writeChangeNoteId);
    if (change) ctx.openChangeReviewNote(change);
  });
}
