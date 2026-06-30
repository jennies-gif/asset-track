export function initializeComposeForms(forms) {
  forms.forEach((form) => {
    form.querySelector(".font-family-select")?.addEventListener("change", () => applyEditorTypography(form));
    form.querySelector(".font-size-select")?.addEventListener("change", () => applyEditorTypography(form));
    form.querySelector(".font-weight-select")?.addEventListener("change", () => applyEditorTypography(form));
    applyEditorTypography(form);
  });
}

export function toggleCompose(form, button, openLabel, closeLabel, submitLabel) {
  const isHidden = form.classList.toggle("is-hidden");
  button.textContent = isHidden ? openLabel : closeLabel;
  if (isHidden) {
    clearComposeEditState(form, submitLabel);
  } else if (!form.dataset.editingId) {
    form.reset();
    setSubmitLabel(form, submitLabel);
  }
  if (!isHidden) {
    form.querySelector("input, textarea, select")?.focus();
  }
}

export function hideCompose(form, button, openLabel) {
  form.classList.add("is-hidden");
  button.textContent = openLabel;
  clearComposeEditState(form);
}

export function showCompose(form, button, closeLabel, submitLabel) {
  form.classList.remove("is-hidden");
  button.textContent = closeLabel;
  setSubmitLabel(form, submitLabel);
  form.querySelector("input, textarea, select")?.focus();
}

export function applyEditorTypography(form) {
  const textarea = form.querySelector("textarea");
  if (!textarea) return;
  const family = form.querySelector(".font-family-select")?.value || "system";
  const size = form.querySelector(".font-size-select")?.value || "compact";
  const weight = form.querySelector(".font-weight-select")?.value || "regular";
  textarea.dataset.fontFamily = family;
  textarea.dataset.fontSize = size;
  textarea.dataset.fontWeight = weight;
}

function clearComposeEditState(form, submitLabel) {
  delete form.dataset.editingId;
  if (submitLabel) setSubmitLabel(form, submitLabel);
}

function setSubmitLabel(form, label) {
  if (!label) return;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.textContent = label;
}
