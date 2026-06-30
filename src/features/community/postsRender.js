import { escapeHtml } from "../../utils/dom.js";
import { renderMarkdown } from "../notes/markdown.js";

let ctx = {};

export function configurePostsRender(context) {
  ctx = context;
}

export function renderPosts() {
  const state = ctx.getState();
  const { elements } = ctx;
  if (!state.posts.length) {
    elements.postsList.innerHTML = `<p class="empty-state">还没有想法。点击右上角“发表想法”开始发布。</p>`;
    return;
  }

  elements.postsList.innerHTML = state.posts
    .map((post) => {
      return `
        <article class="list-item">
          <div>
            <h3>${escapeHtml(post.title)}</h3>
            <div class="note-body is-collapsed" id="post-body-${post.id}">${renderMarkdown(post.content)}</div>
            <button class="text-button" data-toggle-body-id="post-body-${post.id}" type="button">展开</button>
            <small>${escapeHtml(post.tag)} · ${escapeHtml(post.status)} · 举报 ${post.reports}</small>
          </div>
          <div class="item-actions">
            <button class="secondary-button" data-edit-post-id="${post.id}" type="button">编辑</button>
            <button class="secondary-button" data-report-id="${post.id}" type="button">举报</button>
            <button class="danger-button" data-delete-post-id="${post.id}" type="button">删除</button>
          </div>
        </article>
      `;
    })
    .join("");
}
