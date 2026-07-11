# AI 协作机制

## 本目录用途

本目录为 AI 参与产品讨论、代码执行和文档维护提供稳定入口、精简上下文、任务模板和交接规范。

## 各文件职责

- [operating-system.md](./operating-system.md)：周度协作机制和执行流程的待定骨架。
- [context.md](./context.md)：供 AI 开始工作前快速读取的当前上下文。
- [task-template.md](./task-template.md)：开发任务的范围、验收和风险模板。
- [handoff-template.md](./handoff-template.md)：任务完成或中断时的交接模板。
- [产品文档索引](../product/README.md)：产品事实、阶段状态和相关资料入口。
- [Decision Log](../decisions/README.md)：已确认的重要决定入口。

## AI 开始任务前应阅读哪些文档

1. 根目录 `AGENTS.md`。
2. 本目录的 [context.md](./context.md)。
3. [当前产品阶段](../product/current-stage.md)和与任务有关的产品文档。
4. 与任务相关的决策、数据文档、README 和代码。

## 职责分工

- 产品讨论：AI 可以整理事实、提出假设、比较方案和暴露风险；产品负责人确认目标、优先级和重大取舍。
- 代码执行：AI 按已确认的范围实施、测试并说明结果，不擅自扩大任务边界。
- 文档写入：AI 记录已确认事实和实际结果；未经确认的内容必须标记为假设或待确认。

## 重大产品决定

重大产品决定必须由用户确认。AI 不得将未经确认的建议、推断或临时方案写成最终产品决定。
