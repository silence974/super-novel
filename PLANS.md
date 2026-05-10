# PLANS.md

## 目的

定义项目执行计划的组织方式、状态流转和验收规则。

## 计划目录

- 当前计划：`docs/exec-plans/active/`
- 已完成计划：`docs/exec-plans/completed/`
- 技术债跟踪：`docs/exec-plans/tech-debt-tracker.md`

## 计划状态

- `draft`：计划草稿，尚未承诺执行。
- `active`：正在执行。
- `blocked`：被外部问题阻塞。
- `review`：实现完成，等待验证。
- `completed`：已完成并归档。
- `cancelled`：取消但保留原因。

## 当前优先计划

- `docs/exec-plans/active/initial-architecture-and-data-spike.md`

## 计划文档必须包含

- 背景。
- 目标。
- 范围。
- 不做事项。
- 任务清单。
- 验收标准。
- 风险。
- 退出条件。
- 更新记录。

## 计划协作规则

- active plan 只描述当前执行工作，不承载长期架构解释。
- 长期架构解释进入 `ARCHITECTURE.md` 或 `docs/design-docs/*.md`。
- 完成计划必须移动到 `docs/exec-plans/completed/`。
- 发现结构性妥协必须同步记录到 `docs/exec-plans/tech-debt-tracker.md`。
