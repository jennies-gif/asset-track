# app.js 第四阶段写作表单 UI 模块拆分

日期：2026-05-24

## 背景

前三阶段已拆出通用工具、资产配置和状态底座。本阶段开始拆 UI shell，但只选择边界最清晰的写作表单逻辑，避免同时改动 Tab、DOM 元素管理、业务保存流程或页面渲染。

## 本阶段迁移

### 写作表单通用行为

- 原位置：`src/app.js` 底部 UI 工具函数区，以及初始化区域的 `.compose-form` 字体监听绑定
- 新位置：`src/ui/composeForm.js`
- 内容：
  - `initializeComposeForms`
  - `toggleCompose`
  - `hideCompose`
  - `showCompose`
  - `applyEditorTypography`
- 原因：这些函数只负责复盘/社区写作表单的展开、收起、按钮文案、编辑状态和编辑器字体，不应留在入口编排文件中。

## 未迁移内容

以下逻辑仍留在 `src/app.js`：

- 笔记保存事件
- 社区帖子保存事件
- `editNote`
- `editPost`
- 清仓后打开复盘笔记的业务流程

原因：这些函数涉及业务状态读写、笔记内容预填和清仓复盘链路。本阶段只拆 UI 表单行为，不混拆业务动作。

## 行为影响

本阶段只移动写作表单 UI 辅助逻辑，不改变表单字段、按钮文案、展开/收起行为、编辑器字体行为或保存流程。

## 验证

- `node --check src/app.js`
- `node --check src/ui/composeForm.js`
- `npm test`
- `curl -I http://localhost:4173`

## 下一阶段建议

继续 UI shell 拆分时，建议按以下顺序：

1. `src/ui/tabs.js`：迁移 `activateTab`、`activatePortfolioView`。
2. `src/ui/elements.js`：迁移 DOM 查询对象 `elements`。

其中 `tabs.js` 风险低于 `elements.js`，因为 DOM 查询对象被全文件广泛使用，最后再拆更稳。
