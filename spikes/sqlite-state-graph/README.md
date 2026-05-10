# SQLite State Graph Spike

## 目的

验证在没有外部数据库服务的情况下，能否用 SQLite 原型表达小说项目中的事件级状态、图关系、候选事实、冲突检查和版本快照基础结构。

这个 spike 不代表最终数据库选型。它用于回答两个问题：

- 如果专用嵌入式图数据库打包复杂，`SQLite + 节点边表 + 领域服务` 是否能作为回退方案。
- 强约束状态机的最小数据形态是否能支持增量检查和冲突定位。

## 当前验证范围

- Project、Chapter、Event、Entity、Fact、Graph Edge、Check Result、Snapshot 的最小 schema。
- `confirmed` 与 `candidate` 数据隔离。
- 角色同一时间出现在两个互斥地点的 `error` 检查。
- 同一道具同一时间被两个角色持有的 `error` 检查。
- 世界内时间与叙事顺序分离。
- FTS5 可用性探测。

## 运行方式

```powershell
python .\spikes\sqlite-state-graph\prototype.py
```

默认会创建临时输出：

```text
spikes/sqlite-state-graph/out/state_graph_spike.db
```

该输出目录已被 `.gitignore` 忽略。

## 验收口径

运行成功时，脚本应输出：

- 数据库路径。
- FTS5 是否可用。
- 位置链查询结果。
- 道具持有链查询结果。
- 倒叙样例。
- 冲突检查结果。
- 候选事实数量。

## 结论记录位置

- 技术决策：`docs/design-docs/technology-decisions.md`
- 执行计划：`docs/exec-plans/active/initial-architecture-and-data-spike.md`
- schema 派生说明：`docs/generated/db-schema.md`

