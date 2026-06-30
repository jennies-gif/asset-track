# app.js 第二阶段资产配置模块拆分

日期：2026-05-24

## 背景

第一阶段已经迁移通用常量、工具函数、Markdown 渲染和数据质量规则。本阶段继续遵循低风险原则，只迁移资产录入中相对稳定的配置和纯推断逻辑，不移动表单提交、DOM 写入、渲染主流程、卖出/清仓和状态存储。

## 本阶段迁移

### 账户类型与账户名称配置

- 原位置：`src/app.js` 中部资产录入区域
- 新位置：`src/features/assets/accountOptions.js`
- 内容：
  - `accountNamePresets`
  - `inferAccountType`
  - `accountTypeLabel`
  - `normalizeAccountTypeFormValue`
- 原因：账户大类、常见账户名称、自定义账户类型规范和账户类型推断属于资产录入配置能力，后续调整账户体系时应集中维护。

### 市场标签与市场推断

- 原位置：`src/app.js` 中部资产录入区域
- 新位置：`src/features/assets/marketOptions.js`
- 内容：
  - `inferAssetMarket`
  - `marketLabel`
- 原因：市场 code、展示名称和市场推断规则属于资产市场配置能力，后续扩展 A 股、港股、美股、基金、现金等市场时应集中维护。

### 资产代码/名称快速识别

- 原位置：`src/app.js` 中部资产录入区域
- 新位置：`src/features/assets/assetQuickMatch.js`
- 内容：
  - `findAssetQuickMatch`
  - `normalizeQuickMatchText`
  - `isManualCashMatch`
- 原因：快速识别规则依赖白名单和代码标准化，但不依赖 DOM。实际写入表单的 `applyAssetQuickMatch` 仍留在 `app.js`，避免本阶段改动交互行为。

## 未迁移内容

以下逻辑暂时保留在 `src/app.js`：

- `applyAssetQuickMatch`：直接写表单 DOM。
- `renderAssetQuickMatchOptions`：直接写 datalist DOM。
- `buildAccountOptions`、`renderAccountPicker`：依赖 `state.assets` 和 DOM。
- `setAccountTypeControl`、`selectedAccountType`、`handleAccountTypeChange`：依赖表单控件状态。
- `buildAssetFormPayload`、`buildSellAssetUpdate`：涉及保存、卖出、清仓和数据字段兼容。

## 行为影响

本阶段只移动纯逻辑并补充 `import/export`，不改变功能行为、状态字段、DOM 结构、样式或路由。

## 验证

- `node --check src/app.js`
- `node --check src/features/assets/accountOptions.js`
- `node --check src/features/assets/marketOptions.js`
- `node --check src/features/assets/assetQuickMatch.js`
- `npm test`
- `curl -I http://localhost:4173`

## 下一阶段建议

第三阶段建议拆状态与 demo 数据，但要单独谨慎执行：

- `demoState`
- `loadState`
- `persistAndRender` 中的持久化部分
- `normalizeSession`
- `normalizeLoadedAssets`
- `normalizeLoadedSnapshots`
- `normalizeSelectedAccount`
- `normalizeSettings`

该阶段会触及本地数据兼容和导入导出，需要重点手动验证 demo 重置、JSON 导入、CSV/JSON 导出、账户选择和历史数据兼容。
