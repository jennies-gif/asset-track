# app.js 第一阶段低风险模块拆分

日期：2026-05-24

## 背景

`src/app.js` 已超过 2600 行，入口编排、事件绑定、页面渲染、工具函数和纯数据规则混在一起，后续定位和修改成本较高。本阶段只迁移稳定的常量与纯函数，不改变状态结构、事件流程、DOM 结构、样式或业务行为。

## 本阶段迁移

### 应用常量

- 原位置：`src/app.js` 顶部
- 新位置：`src/constants/appConstants.js`
- 内容：`storageKey`、数量/汇率精度、图表颜色、demo 趋势日期
- 原因：常量不应散落在入口文件中，后续调整配置时可以集中查找。

### 日期工具

- 原位置：`src/app.js` 底部工具函数区
- 新位置：`src/utils/date.js`
- 内容：`formatDate`、`normalizeSnapshotDate`、`todayIsoDate`、`addMonths`、`formatShortDate`
- 原因：日期格式化和日期区间计算是通用能力，与页面事件和渲染细节无关。

### DOM 安全工具

- 原位置：`src/app.js` 底部工具函数区
- 新位置：`src/utils/dom.js`
- 内容：`escapeHtml`
- 原因：HTML 转义是通用安全工具，被多个视图渲染函数复用。

### ID 工具

- 原位置：`src/app.js` 底部工具函数区
- 新位置：`src/utils/ids.js`
- 内容：`randomId`
- 原因：ID 生成与具体业务模块无关，后续资产、笔记、卖出记录都可以复用。

### CSV 工具

- 原位置：`src/app.js` 底部工具函数区
- 新位置：`src/utils/csv.js`
- 内容：`csvCell`
- 原因：CSV 转义属于导出工具能力，先独立出来，后续可并入数据备份模块。

### BigInt 工具

- 原位置：`src/app.js` 底部工具函数区
- 新位置：`src/utils/bigint.js`
- 内容：`absBigInt`
- 原因：金额和趋势展示里需要 BigInt 辅助函数，与 UI 入口无关。

### Markdown 渲染

- 原位置：`src/app.js` 底部工具函数区
- 新位置：`src/features/notes/markdown.js`
- 内容：`renderNoteContent`、`renderMarkdown`
- 原因：Markdown 渲染只属于复盘/社区内容展示，不应该留在全局入口文件。

### 资产数据质量规则

- 原位置：`src/app.js` 中部资产/数据模块附近
- 新位置：`src/features/assets/dataQuality.js`
- 内容：`buildAssetDataIssues`
- 原因：数据质量规则是纯业务规则，被数据清单和持仓状态复用，适合独立维护。

## 行为影响

本阶段只移动代码并补充 `import/export`，不改变功能行为、字段名、页面结构、样式或路由。

## 验证

- `node --check src/app.js`
- `node --check` 新增模块
- `npm test`

## 下一阶段建议

下一阶段建议拆资产相关的稳定配置函数：

- `accountNamePresets`
- `accountTypeLabel`
- `inferAccountType`
- `marketLabel`
- `inferAssetMarket`

这些函数仍然相对纯，但与资产录入体验强相关，建议作为第二阶段单独 review。
