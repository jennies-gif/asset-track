export function bindHomeEvents({ root = document.querySelector(".app-main"), activateTab, startQuickAsset, loadDemoState, showNoteEditor, applyNoteTemplate }) {
  root?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-home-action]")?.dataset.homeAction;
    if (!action) return;
    if (action === "add-asset") {
      activateTab("assets");
      startQuickAsset();
    }
    if (action === "load-demo") loadDemoState();
    if (action === "view-assets") activateTab("assets");
    if (action === "write-note") {
      activateTab("notes");
      showNoteEditor();
      applyNoteTemplate("hold", { overwrite: true });
    }
  });
}
