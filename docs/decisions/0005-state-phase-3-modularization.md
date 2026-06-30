# app.js 第三阶段状态模块拆分

日期：2026-05-24

## 背景

前两阶段已迁移通用工具、资产配置和资产推断逻辑。本阶段继续降低 `src/app.js` 的职责复杂度，只迁移状态底座相关逻辑，不改页面渲染、事件绑定、设置表单同步、语言切换、资产保存、卖出/清仓或导入导出流程。

## 本阶段迁移

### Demo 数据

- 原位置：`src/app.js` 顶部
- 新位置：`src/state/demoState.js`
- 内容：`demoState`
- 原因：Demo 数据体积较大，且属于初始状态配置，不应留在入口编排文件中。

### 状态存取

- 原位置：`src/app.js` 中部状态区
- 新位置：`src/state/storage.js`
- 内容：
  - `loadState`
  - `saveState`
- 原因：`localStorage` 读写和加载失败降级属于状态持久化能力，应与 UI 入口解耦。

### 状态归一化

- 原位置：`src/app.js` 中部状态区
- 新位置：`src/state/normalizers.js`
- 内容：
  - `normalizeSession`
  - `normalizeLoadedAssets`
  - `normalizeLoadedSnapshots`
  - `normalizeSelectedAccount`
  - `normalizeSettings`
  - `normalizeSnapshots`
- 原因：这些函数负责旧数据兼容、默认值补齐和状态字段标准化，属于状态层职责。

## 未迁移内容

以下逻辑仍留在 `src/app.js`：

- `syncSettingsForm`
- `readSettingsForm`
- `applySettings`
- `applyLanguage`
- `persistAndRender`
- `upsertCurrentSnapshot`

原因：这些函数仍直接依赖 DOM、当前展示设置、组合计算或主渲染流程。本阶段不触碰它们，避免把状态拆分和 UI 行为改动混在一起。

## 行为影响

本阶段只移动状态数据、状态存取和状态归一化函数，并补充 `import/export`。不改变本地存储 key、状态字段命名、导入导出数据结构、页面结构或样式。

## 验证

- `node --check src/app.js`
- `node --check src/state/demoState.js`
- `node --check src/state/normalizers.js`
- `node --check src/state/storage.js`
- `npm test`
- `curl -I http://localhost:4173`

## 下一阶段建议

第四阶段建议拆 UI shell，但仍需小步执行：

- `src/ui/elements.js`：集中 DOM 查询。
- `src/ui/tabs.js`：`activateTab`、`activatePortfolioView`。
- `src/ui/composeForm.js`：`toggleCompose`、`showCompose`、`hideCompose`、`applyEditorTypography`。

该阶段会触及 DOM 事件和页面显示状态，风险高于前三阶段。建议先拆 `composeForm`，因为它的状态边界相对清晰，再拆 tabs，最后拆 elements。
