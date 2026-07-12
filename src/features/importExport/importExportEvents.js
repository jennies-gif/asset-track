import {
  applyPendingImport,
  applyPendingRecovery,
  cancelPendingRecovery,
  cancelPendingImport,
  downloadCorruptedStorage,
  exportCsvBackup,
  exportJsonBackup,
  importJsonBackup,
  selectRecoveryBackup
} from "./importExportService.js";

export function initImportExportEvents(elements) {
  const closeBackupMenuWhenOutside = (event) => {
    if (elements.backupMenu?.open && !elements.backupMenu.contains(event.target)) {
      elements.backupMenu.removeAttribute("open");
    }
  };

  document.addEventListener("click", closeBackupMenuWhenOutside);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.backupMenu?.open) {
      elements.backupMenu.removeAttribute("open");
      elements.backupMenu.querySelector("summary")?.focus();
    }
  });
  elements.exportJsonButton?.addEventListener("click", exportJsonBackup);
  elements.exportCsvButton?.addEventListener("click", exportCsvBackup);
  elements.importForm?.addEventListener("submit", importJsonBackup);
  elements.importCancel?.addEventListener("click", cancelPendingImport);
  elements.importContinue?.addEventListener("click", applyPendingImport);
  elements.recoveryFile?.addEventListener("change", selectRecoveryBackup);
  elements.recoveryCancel?.addEventListener("click", cancelPendingRecovery);
  elements.recoveryConfirm?.addEventListener("click", applyPendingRecovery);
  elements.downloadCorruptedButton?.addEventListener("click", downloadCorruptedStorage);
  elements.importConfirmModal?.addEventListener("click", (event) => {
    if (event.target === elements.importConfirmModal) cancelPendingImport();
  });
}
