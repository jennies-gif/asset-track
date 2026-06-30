# 0002: React + TypeScript 并行迁移

日期：2026-04-29

## 状态

Accepted

## 背景

现有根目录原生 JS 原型已经可运行，并覆盖资产录入、持仓、归因、数据任务、笔记和社区基础流程。上线优先级要求进入 React + TypeScript 工程化重构，但一次性替换整个 `src/app.js` 会让当前可预览版本失去稳定性，也会增加回归成本。

## 决策

采用并行迁移：

- 保留当前根目录原型，继续通过 `npm start` 在 `4173` 端口预览。
- 新增 `apps/web` 作为 React + TypeScript 重构入口，通过 `npm run dev` 预览。
- 新增 `packages/domain` 作为可复用领域包，承载金融计算、归因、市场覆盖和数据任务模型。
- 后续逐步将旧 `src/domain/*.js` 的逻辑迁移到 `packages/domain`，再按 feature 拆分 UI。

## 后果

正面：

- 当前原型不被打断，用户仍可继续预览。
- 新工程可以独立 typecheck 和 build。
- 领域层先稳定，后续 API 和数据库实现能复用同一套类型和计算边界。

代价：

- 短期内会存在旧 JS 领域模块和新 TS 领域包的重复逻辑。
- 后续需要安排清理任务，将旧模块替换为 `packages/domain`。
- 需要维护两个入口的运行说明。
