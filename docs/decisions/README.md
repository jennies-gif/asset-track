# Decision Log

## 现有决策索引

| 编号 | 标题 | 文件链接 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 0001 | 上线顺序和数据边界 | [0001-launch-sequence-and-data-boundaries.md](./0001-launch-sequence-and-data-boundaries.md) | Accepted | 文档包含显式状态。 |
| 0002 | React + TypeScript 并行迁移 | [0002-react-typescript-parallel-migration.md](./0002-react-typescript-parallel-migration.md) | Accepted | 文档包含显式状态。 |
| 0003 | app.js 第一阶段低风险模块拆分 | [0003-app-js-phase-1-modularization.md](./0003-app-js-phase-1-modularization.md) | Status Unknown — Non-authoritative | 未发现明确批准记录，不作为有效规则。 |
| 0004 | app.js 第二阶段资产配置模块拆分 | [0004-asset-options-phase-2-modularization.md](./0004-asset-options-phase-2-modularization.md) | Status Unknown — Non-authoritative | 未发现明确批准记录，不作为有效规则。 |
| 0005 | app.js 第三阶段状态模块拆分 | [0005-state-phase-3-modularization.md](./0005-state-phase-3-modularization.md) | Status Unknown — Non-authoritative | 未发现明确批准记录，不作为有效规则。 |
| 0006 | app.js 第四阶段写作表单 UI 模块拆分 | [0006-compose-form-phase-4-modularization.md](./0006-compose-form-phase-4-modularization.md) | Status Unknown — Non-authoritative | 未发现明确批准记录，不作为有效规则。 |
| 0007 | 市场资源库和行情抓取边界 | [0007-market-data-boundaries.md](./0007-market-data-boundaries.md) | Status Unknown — Non-authoritative | 未发现明确批准记录，不作为有效规则。 |
| 0008 | 当前 MVP 资产数据唯一事实来源 | [0008-current-asset-source-of-truth.md](./0008-current-asset-source-of-truth.md) | Draft | 已授权草案，尚未批准。 |
| 0009 | 公共行情价格时间语义 | [0009-market-price-time-semantics.md](./0009-market-price-time-semantics.md) | Accepted | 2026-07-13 由产品负责人批准。 |

## 状态定义

- `Proposed`：提出的方案，未批准。
- `Draft`：已授权创建，但未最终批准。
- `Accepted`：已确认生效。
- `Deprecated`：历史决策，不再适用。
- `Status Unknown`：历史记录存在，但当前状态无法确认，不作为有效规则。

## 决策记录规则

- 只有重大产品、架构、数据和安全决定才进入本目录。
- Agent 不得未经产品负责人确认创建重大产品决策。
- 新决策应说明背景、决定、原因、备选方案和重新评估条件。
- 新增、替代或废弃决策时，应同步更新本索引中的状态和备注。
