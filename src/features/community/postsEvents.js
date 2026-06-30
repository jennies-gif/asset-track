import { applyEditorTypography, hideCompose, showCompose, toggleCompose } from "../../ui/composeForm.js";
import { randomId } from "../../utils/ids.js";

export function initPostsEvents(context) {
  const { elements } = context;
  elements.postForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = context.getState();
    const form = Object.fromEntries(new FormData(elements.postForm));
    const editingId = elements.postForm.dataset.editingId;

    if (editingId) {
      state.posts = state.posts.map((post) =>
        post.id === editingId
          ? {
              ...post,
              title: form.title.trim(),
              tag: form.tag.trim() || "观点",
              content: form.content.trim(),
              status: "待审核",
              updatedAt: new Date().toISOString()
            }
          : post
      );
    } else {
      state.posts = [{
        id: randomId("post"),
        title: form.title.trim(),
        tag: form.tag.trim() || "观点",
        content: form.content.trim(),
        status: "待审核",
        reports: 0,
        createdAt: new Date().toISOString()
      }, ...state.posts];
    }

    elements.postForm.reset();
    hideCompose(elements.postForm, elements.newPostButton, "发表想法");
    context.persistAndRender();
  });

  elements.newPostButton.addEventListener("click", () => {
    toggleCompose(elements.postForm, elements.newPostButton, "发表想法", "收起", "发布观点");
  });

  elements.postsList.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-body-id]");
    if (toggleButton) {
      toggleBody(toggleButton);
      return;
    }

    const editButton = event.target.closest("[data-edit-post-id]");
    if (editButton) {
      editPost(editButton.dataset.editPostId, context);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-post-id]");
    if (deleteButton) {
      const state = context.getState();
      state.posts = state.posts.filter((item) => item.id !== deleteButton.dataset.deletePostId);
      context.persistAndRender();
      return;
    }

    const button = event.target.closest("[data-report-id]");
    if (!button) return;
    const state = context.getState();
    const post = state.posts.find((item) => item.id === button.dataset.reportId);
    if (!post) return;
    post.reports += 1;
    post.status = "已举报";
    context.persistAndRender();
  });
}

function editPost(id, context) {
  const state = context.getState();
  const { elements } = context;
  const post = state.posts.find((item) => item.id === id);
  if (!post) return;

  elements.postForm.dataset.editingId = id;
  elements.postForm.elements.title.value = post.title || "";
  elements.postForm.elements.tag.value = post.tag || "";
  elements.postForm.elements.content.value = post.content || "";
  applyEditorTypography(elements.postForm);
  showCompose(elements.postForm, elements.newPostButton, "收起", "更新想法");
}

function toggleBody(button) {
  const body = document.getElementById(button.dataset.toggleBodyId);
  if (!body) return;
  const collapsed = body.classList.toggle("is-collapsed");
  button.textContent = collapsed ? "展开" : "收起";
}
