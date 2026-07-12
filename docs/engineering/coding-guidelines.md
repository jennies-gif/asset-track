# Asset Trail Coding Guidelines

## 1. 文档目的

本文档定义 Asset Trail 项目的代码质量和实现规范。

目标是在当前种子用户试用版本快速迭代过程中，保证：

- 代码边界清晰；
- 核心逻辑可维护；
- 避免重复实现；
- 避免临时补丁持续积累；
- 支持未来架构演进。

本文档服务于：

- AI 辅助开发；
- 新功能实现；
- 代码重构判断；
- Code Review。

## 2. 核心编码原则

### 2.1 优先保持边界清晰，而不是快速堆代码

开发新功能时，优先考虑：

```text
需求
 ↓
业务模型
 ↓
业务逻辑
 ↓
数据访问
 ↓
展示
```

避免：

```text
页面需求
 ↓
直接修改页面代码
 ↓
增加临时逻辑
```

### 2.2 不为了当前问题制造长期技术债

禁止通过以下方式快速解决问题：

- 添加大量特殊判断；
- 复制已有逻辑；
- 增加临时数据结构；
- 在页面中硬编码业务规则；
- 新增无法迁移的数据格式。

如果采用临时方案，必须明确：

- 为什么暂时采用；
- 限制是什么；
- 未来如何迁移。

### 2.3 一个业务规则只能有一个可信实现

同一个业务逻辑，例如：

- 收益计算；
- 持仓计算；
- 资产标准化；
- 交易校验；

不应该存在多个版本。

禁止：

```text
页面 A 实现一次

页面 B 复制一次

React 再次实现一次
```

应该：

```text
Domain Logic
    ↓
所有模块复用
```

## 3. Temporary Implementation Rules

MVP 阶段允许使用阶段性实现，例如：

- mock 数据；
- 兼容层；
- 迁移脚本；
- 临时适配模块；
- 阶段性数据转换逻辑。

但所有临时方案必须明确：

- 为什么需要；
- 影响范围；
- 当前限制；
- 技术债；
- 后续迁移方向；
- 删除或替换触发条件。

禁止：

- 无明确职责的临时文件；
- `final`、`new`、`v2`、`fix` 等命名方式的补丁文件；
- 通过复制业务逻辑绕过已有模块边界；
- 没有退出条件的长期临时方案。

如果临时方案影响核心数据、架构边界或多个模块，需要进入 Architecture Review 或 Decision Log。

## 4. 文件职责规范

### 4.1 单一职责原则

一个文件应该有明确的主要职责。

禁止一个文件同时承担：

- 路由；
- 业务逻辑；
- 数据访问；
- UI 生成；
- 状态管理。

错误示例：

```text
server.mjs

HTTP 路由
    +
业务判断
    +
数据库操作
    +
任务调度
    +
文件存储
```

推荐方向是逐步拆分：

```text
Route
  ↓
Service
  ↓
Repository
  ↓
Database
```

### 4.2 文件命名规范

文件名应该表达职责。

推荐：

```text
assetValuation.js
marketDataService.js
portfolioCalculator.js
```

避免：

```text
utils.js
helper.js
common.js
temp.js
new.js
```

## 5. Module Boundary Rules（模块边界）

### 5.1 Feature 模块

位置：`features/`

负责：

- 用户流程；
- 页面功能；
- 功能相关组件；
- 功能状态组合。

不负责：

- 通用金融计算；
- 数据库访问；
- 通用工具。

### 5.2 Domain 模块

位置：`domain/`

负责：

- 业务模型；
- 金融计算；
- 业务规则；
- 数据校验。

Domain 不应该直接访问：

- DOM；
- API；
- `localStorage`；
- Database；
- UI 组件。

### 5.3 Service 模块

负责外部能力，例如：

- API 请求；
- `localStorage`；
- 数据同步；
- 导入导出；
- 市场数据。

Service 不应该包含大量页面展示逻辑。

### 5.4 UI 模块

负责通用视觉能力，例如：

- charts；
- badges；
- empty states；
- dialogs。

UI 组件不应该包含：

- 资产计算；
- 投资规则；
- 数据同步逻辑。

## 6. Domain Logic Rules（业务逻辑规范）

### 6.1 核心业务逻辑禁止写入 Render

Render 职责：

```text
数据
 ↓
格式化
 ↓
展示
```

Render 不应该：

- 计算收益；
- 判断风险；
- 修改业务状态；
- 执行业务流程。

错误：

```text
analysisRender.js

calculateRisk()
calculateReturn()
```

正确：

```text
domain/

calculateRisk()

analysisRender.js

展示结果
```

## 7. Frontend Coding Rules

### 7.1 页面组件职责

页面负责：

- 组织布局；
- 用户交互；
- 调用业务能力。

页面不负责：

- 核心金融计算；
- 数据模型定义；
- 复杂数据转换。

### 7.2 状态分类

所有状态必须明确属于以下类别。

#### UI State

例如：

- 弹窗状态；
- 当前 Tab；
- 展开折叠。

可以由组件内部管理。

#### Business State

例如：

- Assets；
- Accounts；
- Transactions。

必须有明确的数据结构和来源。

#### Persisted State

例如 `localStorage` 数据。

必须具备：

- schema；
- version；
- validation；
- migration 策略。

## 8. State Management Rules

### 8.1 禁止无结构持久化

禁止直接将任意对象作为长期业务方案持久化：

```js
localStorage.setItem(
  "data",
  JSON.stringify(anyObject)
);
```

必须明确：

- 数据结构；
- 版本；
- 迁移方式；
- 错误处理。

### 8.2 禁止 Silent Fallback

禁止：

```js
catch (error) {
  return demoState;
}
```

原因：真实数据错误可能被隐藏。

错误必须区分：

- 数据不存在；
- 数据损坏；
- 格式升级；
- 系统异常。

### 8.3 数据恢复优先于默认替换

发生错误时，优先：

- 保留错误信息；
- 提供恢复路径；
- 提供导入导出。

不要直接覆盖用户数据。

## 9. Data Access Rules

### 9.1 数据访问需要明确边界

禁止页面直接：

- 操作数据库；
- 操作复杂存储；
- 修改核心业务数据。

推荐：

```text
Feature
   ↓
Service
   ↓
Data Layer
```

### 9.2 API 调用统一管理

避免每个页面直接调用：

```js
fetch(...);
```

并自行处理：

- 请求；
- 错误；
- Loading；
- 重试。

长期应统一到 API Client / Service Layer。

## 10. Backend Coding Rules

### 10.1 API 入口保持轻量

API 入口负责：

- 路由；
- 参数解析；
- 调用服务；
- 返回结果。

避免在入口文件中加入：

- 大量业务规则；
- 数据处理；
- 数据库细节。

### 10.2 Database 访问隔离

Database 代码负责：

- 查询；
- 写入；
- 数据映射。

不要同时负责：

- HTTP 逻辑；
- 业务流程；
- 调度。

## 11. CSS and UI Code Rules

### 11.1 禁止继续增加覆盖型 CSS 文件

禁止新增以下类型的阶段性覆盖文件：

```text
final-polish.css
new-refinement.css
last-adjustment.css
```

原因：最终样式不应该依赖：

- 导入顺序；
- 权重竞争。

### 11.2 样式应该表达组件语义

推荐：

```css
.card-title
.primary-button
```

避免：

```css
.home-new-title
.asset-special-card
```

### 11.3 全局规范优先

以下内容应该逐步沉淀到 `design-system.md`：

- 字体；
- 颜色；
- 间距；
- 组件。

## 12. Testing Rules

### 12.1 核心业务逻辑必须可测试

优先测试：

- 金融计算；
- 数据转换；
- 校验规则；
- 状态迁移。

### 12.2 新增核心逻辑时同步考虑测试

尤其包括：

- 资产计算；
- 收益计算；
- 数据同步；
- 导入导出。

### 12.3 错误路径必须覆盖

包括：

- 数据损坏；
- 网络失败；
- 空数据；
- 格式变化。

## 13. AI Development Rules

AI 修改代码时，必须：

- 先搜索已有实现；
- 判断是否存在重复逻辑；
- 判断代码应该属于哪个模块；
- 判断是否影响已有架构；
- 判断是否需要更新 Decision Log。

禁止 AI：

- 为单个需求复制代码；
- 新增临时文件；
- 修改多个地方实现同一规则；
- 在不了解数据来源的情况下修改数据结构；
- 用 UI 层解决业务问题。

## 14. Code Review Checklist

提交修改前检查以下内容。

### 文件职责

- 是否新增巨型文件？
- 是否职责混合？

### 业务逻辑

- 是否进入正确层？
- 是否存在重复实现？

### 数据

- 数据来源是否明确？
- 是否破坏事实来源？

### 状态

- 是否影响持久化？
- 是否需要迁移？

### 错误处理

- 是否吞掉错误？
- 是否隐藏数据问题？

### 技术债

- 是否为了当前需求扩大未来成本？

## 15. Final Principle

Asset Trail 的代码质量目标：

```text
清晰边界
  +
单一职责
  +
唯一业务实现
  +
可测试逻辑
  +
可迁移数据
  +
持续演进
```

避免：

```text
快速补丁
  +
重复代码
  +
页面承载业务
  +
数据来源混乱
  +
后期大规模重构
```
