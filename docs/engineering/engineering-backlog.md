# Engineering Backlog

本文件不记录所有 Bug，只记录已识别、完成当前阻断性判断，但暂不执行的工程问题。

## P0 - Release Blockers

| 问题 | 原因 | 状态 |
| --- | --- | --- |
| 数据损坏回退 Demo | 资产可信风险 | Doing |
| 私人数据传输边界 | 隐私风险 | Doing |

---

## P1 - Post Launch Stability

| 问题 | 原因 | 触发条件 | 状态 |
| --- | --- | --- | --- |
| localStorage schema / version / migration | 长期维护与用户数据兼容风险 | 上线后首次修改已持久化数据结构前 | Todo |
| Domain 重复统一 | 双入口业务规则不一致风险 | React 接管真实功能前 | Todo |
| API server 拆分 | API 扩展后的维护风险 | API 复杂度明显增加前 | Todo |

---

## P2 - Future Architecture

| 问题 | 触发条件 |
| --- | --- |
| Transaction Ledger | 需要复杂投资分析时 |
| React 全面迁移 | 多人或规模化开发时 |
| Cloud Sync | 用户同步需求验证且私人数据边界获确认后 |

## 新问题进入流程

当 Codex 审计发现新的工程问题（例如 schema 漂移）时，不直接开始修改。

1. 先判断问题是否阻断当前上线。
   - 如果影响上线，进入 `P0 - Release Blockers`。
   - 如果属于长期风险，根据影响阶段进入 P1 或 P2，并写明触发条件。
2. 将判断结果写入本文件。

进入 Backlog 不代表已批准实施。后续只有在触发条件成立、进入当前周期范围或获得产品负责人确认后，才转为执行任务。
