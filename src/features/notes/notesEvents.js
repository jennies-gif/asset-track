export function initNotesEvents(context) {
  const { elements } = context;

  elements.noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    context.saveNoteFromForm("published");
  });

  elements.newNoteButton.addEventListener("click", () => {
    context.showNoteEditor();
    context.applyNoteTemplate("hold", { overwrite: true });
  });

  elements.noteBackButton.addEventListener("click", context.hideNoteEditor);
  elements.noteReaderBackButton?.addEventListener("click", context.hideNoteReader);
  elements.noteReaderEditButton.addEventListener("click", () => {
    const id = elements.notesReader.dataset.noteId;
    if (id) context.editNote(id);
  });
  elements.noteReaderDeleteButton.addEventListener("click", () => {
    const id = elements.notesReader.dataset.noteId;
    if (!id) return;
    context.deleteNote(id);
    context.hideNoteReader();
    context.persistAndRender();
  });
  elements.noteSaveDraftButton.addEventListener("click", () => context.saveNoteFromForm("draft"));
  document.addEventListener("keydown", (event) => {
    if (!elements.notesEditor.classList.contains("is-hidden") && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      context.saveNoteFromForm("published");
    }
  });
  elements.notesSearch.addEventListener("input", context.renderNotes);
  elements.noteForm.elements.title.addEventListener("input", context.updateNoteCounters);
  elements.noteForm.elements.content.addEventListener("input", context.updateNoteCounters);
  elements.noteTemplateCards?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-note-template]");
    if (!card) return;
    context.applyNoteTemplate(card.dataset.noteTemplate || "blank");
  });
  elements.noteNewTagButton.addEventListener("click", () => {
    elements.noteCustomTagField.classList.remove("is-hidden");
    elements.noteForm.elements.customTag.value = "";
    elements.noteForm.elements.customTag.focus();
  });
  elements.noteForm.elements.customTag.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    context.commitCustomNoteTag();
  });
  elements.noteForm.elements.customTag.addEventListener("blur", context.commitCustomNoteTag);
  elements.noteAssetSelect?.addEventListener("change", () => {
    if (!elements.noteAssetSelect.value) context.clearNoteTransactionLink({ keepAsset: true });
  });
  elements.noteTransactionSelect.addEventListener("change", context.applySelectedNoteTransaction);
  elements.noteSuggestedTransactions?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggested-transaction]");
    if (!button) return;
    const change = context.buildRecentNoteTransactionSuggestions()
      .find((item) => context.noteTransactionLabel(item) === button.dataset.suggestedTransaction);
    if (!change) return;
    context.setNoteAssetLink(change.asset.id);
    context.setNoteTransactionLink(context.noteTransactionLabel(change));
    const template = context.reviewTemplateForChange(change);
    if (template !== "hold") context.applyNoteTemplate(template);
  });

  elements.closeReviewLater.addEventListener("click", context.hideCloseReviewPrompt);
  elements.closeReviewModal.addEventListener("click", (event) => {
    if (event.target === elements.closeReviewModal) context.hideCloseReviewPrompt();
  });
  elements.closeReviewWrite.addEventListener("click", () => {
    context.openPendingCloseReviewNote();
  });

  elements.notesList.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-body-id]");
    if (toggleButton) {
      context.toggleBody(toggleButton);
      return;
    }

    const editButton = event.target.closest("[data-edit-note-id]");
    if (editButton) {
      context.editNote(editButton.dataset.editNoteId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-note-id]");
    if (deleteButton) {
      context.deleteNote(deleteButton.dataset.deleteNoteId);
      context.persistAndRender();
      return;
    }

    const linkedChangeButton = event.target.closest("[data-open-linked-change-id]");
    if (linkedChangeButton) {
      context.openAssetChangeById(linkedChangeButton.dataset.openLinkedChangeId);
      return;
    }

    if (event.target.closest(".note-card-menu")) return;

    const card = event.target.closest("[data-open-note-id]");
    if (!card) return;
    context.showNoteReader(card.dataset.openNoteId);
  });

  elements.notesList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (event.target.closest(".note-card-menu")) return;
    const card = event.target.closest("[data-open-note-id]");
    if (!card) return;
    event.preventDefault();
    context.showNoteReader(card.dataset.openNoteId);
  });

  elements.noteReaderMeta?.addEventListener("click", (event) => {
    const linkedAssetButton = event.target.closest("[data-open-linked-asset-id]");
    if (linkedAssetButton) {
      context.openAssetById(linkedAssetButton.dataset.openLinkedAssetId);
      return;
    }

    const linkedChangeButton = event.target.closest("[data-open-linked-change-id]");
    if (!linkedChangeButton) return;
    context.openAssetChangeById(linkedChangeButton.dataset.openLinkedChangeId);
  });

  elements.noteFilterTags.addEventListener("click", (event) => {
    const button = event.target.closest("[data-note-filter]");
    if (!button) return;
    elements.noteFilterTags.querySelectorAll("[data-note-filter]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    context.renderNotes();
  });
}
