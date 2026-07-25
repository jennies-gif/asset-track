export function bindHomeEvents({
  root = document.querySelector(".app-main"),
  activateTab,
  editAsset,
  startQuickAsset,
  loadDemoState,
  showNoteEditor,
  applyNoteTemplate,
  syncLatestMarketPrices
}) {
  root?.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-home-action]");
    const action = actionTarget?.dataset.homeAction;
    if (!action) return;
    if (action === "add-asset") {
      activateTab("assets");
      startQuickAsset();
    }
    if (action === "load-demo") loadDemoState();
    if (action === "view-assets") activateTab("assets");
    if (action === "resolve-price") {
      activateTab("assets");
      editAsset(actionTarget.dataset.assetId);
    }
    if (action === "sync-prices") syncLatestMarketPrices();
    if (action === "write-note") {
      activateTab("notes");
      showNoteEditor();
      applyNoteTemplate("hold", { overwrite: true });
    }
  });
}
