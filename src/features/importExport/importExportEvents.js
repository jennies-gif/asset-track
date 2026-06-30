import {
  applyPendingImport,
  cancelPendingImport,
  exportCsvBackup,
  exportJsonBackup,
  importJsonBackup
} from "./importExportService.js";

export function initImportExportEvents(elements) {
  elements.exportJsonButton?.addEventListener("click", exportJsonBackup);
  elements.exportCsvButton?.addEventListener("click", exportCsvBackup);
  elements.importForm?.addEventListener("submit", importJsonBackup);
  elements.importCancel?.addEventListener("click", cancelPendingImport);
  elements.importContinue?.addEventListener("click", applyPendingImport);
  elements.importConfirmModal?.addEventListener("click", (event) => {
    if (event.target === elements.importConfirmModal) cancelPendingImport();
  });
}
