export function getImportExportElements() {
  return {
    exportJsonButton: document.querySelector("#export-json-button"),
    exportCsvButton: document.querySelector("#export-csv-button"),
    importForm: document.querySelector("#import-form"),
    importJson: document.querySelector("#import-json"),
    importError: document.querySelector("#import-error"),
    importStatus: document.querySelector("#import-status"),
    importConfirmModal: document.querySelector("#import-confirm-modal"),
    importPreview: document.querySelector("#import-preview"),
    importCancel: document.querySelector("#import-cancel"),
    importContinue: document.querySelector("#import-continue")
  };
}
