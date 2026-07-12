export function getImportExportElements() {
  return {
    backupMenu: document.querySelector("#backup-menu"),
    exportJsonButton: document.querySelector("#export-json-button"),
    exportCsvButton: document.querySelector("#export-csv-button"),
    importForm: document.querySelector("#import-form"),
    importJson: document.querySelector("#import-json"),
    importError: document.querySelector("#import-error"),
    importStatus: document.querySelector("#import-status"),
    importConfirmModal: document.querySelector("#import-confirm-modal"),
    importPreview: document.querySelector("#import-preview"),
    importCancel: document.querySelector("#import-cancel"),
    importContinue: document.querySelector("#import-continue"),
    recoveryModal: document.querySelector("#storage-recovery-modal"),
    recoveryMessage: document.querySelector("#storage-recovery-message"),
    recoveryFile: document.querySelector("#storage-recovery-file"),
    recoveryPreview: document.querySelector("#storage-recovery-preview"),
    recoveryError: document.querySelector("#storage-recovery-error"),
    recoveryStatus: document.querySelector("#storage-recovery-status"),
    recoveryCancel: document.querySelector("#storage-recovery-cancel"),
    recoveryConfirm: document.querySelector("#storage-recovery-confirm"),
    downloadCorruptedButton: document.querySelector("#download-corrupted-storage")
  };
}
