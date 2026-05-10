# Design Docs Index

## 目的

本目录存放细化设计文档。顶层文档负责主题总览和治理约束，`docs/design-docs/` 负责细节说明和技术取舍。

## 文档清单

- `core-beliefs.md`：长期稳定设计原则。
- `agent-orchestration.md`：人工掌控式 Agent 编排。
- `conflict-checking.md`：手动检查、增量检查和分级冲突。
- `data-model.md`：领域数据模型。
- `time-state-machine.md`：架空历法、多时间域和状态机。
- `technology-decisions.md`：技术选型和决策记录。

## 阅读顺序

1. `core-beliefs.md`
2. `data-model.md`
3. `time-state-machine.md`
4. `conflict-checking.md`
5. `agent-orchestration.md`
6. `technology-decisions.md`

## 更新规则

- 新增设计文档时必须更新本索引。
- 设计文档状态变化时必须更新本索引。
- 被废弃的设计文档不要删除，应标记为 deprecated 并说明替代文档。
