# Backend Architecture

## 目的

定义 `super-novel` 后端的模块边界、依赖方向、数据流、事务规则和首期实现顺序。本文是后端架构事实源；版本管理细节以 [Database Version Management](database-version-management.md) 为准。

## 已确认的技术路线

- 桌面宿主：Tauri v2。
- 后端实现语言：Rust。
- Windows 渲染宿主：WebView2；前端只通过 Tauri command/event 与后端通信。
- 主要持久化：应用内嵌 SQLite，每个作品工程拥有独立项目数据库。
- 运行方式：本地进程内调用，不启动 localhost HTTP 服务。
- Git 不是核心依赖；数据库独立提供版本、分支、快照和恢复能力。
- 首期以单人、单机、单个活动项目为目标，不设计多人实时协作。

## 后端设计原则

### 领域核心不依赖桌面框架

小说领域规则、版本管理、智能分析和正式化流程不能直接依赖 Tauri。Tauri command 只负责参数转换、任务调度、进度事件和错误映射。

### 确定性能力优先

保存、版本、时间排序、状态推导、图查询、字数统计和明确约束检查由 Rust 与数据库实现。能由确定性代码完成的工作不交给模型或 Agent。

### 正式数据只有一条写入通道

正式正文、正式事实、事件、关系和世界规则只能经过应用服务的正式化用例写入。AI Provider、Agent、分析器和 Tauri command 都不能直接修改正式领域表。

### AI 输出始终是候选结果

模型生成正文进入草稿层；模型提取的事实、事件、关系和修复内容进入候选层。用户确认后，应用服务才可以在事务中将其提升为正式数据。

### 派生数据可重建

全文索引、向量索引、当前状态投影、图查询缓存和分析结果索引不是事实源。任何项目版本恢复或分支切换后，它们都可以从目标提交的正式数据重新生成。

### 长任务不占用数据库写事务

模型调用、全文分析和大范围图查询不能在 SQLite 写事务中执行。长任务先读取并冻结输入版本，计算完成后再用短事务提交候选结果或正式变更。

## 总体分层

```text
Tauri Command / Event Adapter
            |
            v
Application Use Cases + Workflow Engine
            |
            v
Domain Model + Deterministic Domain Services
            |
            v
Repository / Provider / Clock / Hashing Ports
            |
            v
SQLite | Model Provider | File System Adapters
```

依赖只能从上层指向下层抽象：

- Domain 不依赖 Application、SQLite、Tauri 或模型 SDK。
- Application 依赖 Domain 和端口接口，不依赖具体适配器。
- SQLite、模型和 Tauri 是外部适配器。
- 适配器之间不得直接调用并绕过 Application。

## 建议的 Rust workspace 边界

目标结构：

```text
crates/
  novel-domain/          领域实体、值对象、状态迁移与规则
  novel-application/     用例、工作流、端口和权限边界
  novel-storage-sqlite/  schema、迁移、repository 和事务实现
  novel-analysis/        确定性检查、影响范围与分析编排
  novel-ai/              上下文构建、Provider Adapter、候选结果解析
  novel-backend/         对上层暴露的组合入口和 ProjectSession
src-tauri/               Tauri command/event 薄适配层
```

首期可以先在 `novel-backend` crate 内按模块保持相同边界，等接口稳定后再拆 crate；不得因为暂时单 crate 就允许跨层直接访问数据库。

## 项目目录与打开流程

建议项目目录：

```text
project-directory/
  super-novel.toml
  .super-novel/
    project.db
    backups/
  assets/
  exports/
```

`super-novel.toml` 只保存项目标识、显示名称和兼容性元数据，不保存正文、正式事实或密钥。

打开项目：

```text
用户选择目录
  -> 读取并校验 super-novel.toml
  -> 获取项目级写锁
  -> 定位 .super-novel/project.db
  -> 检查数据库完整性和 schema 版本
  -> 必要时先备份再迁移
  -> 读取活动分支及其 head commit
  -> 校验正式对象和快照哈希
  -> 检查未完成任务与草稿恢复信息
  -> 创建 ProjectSession
```

首期同一应用实例只允许一个活动 `ProjectSession`。切换项目前必须完成或取消当前写事务，并处理尚未确认的草稿。

## 核心领域模块

### Planning

负责全书大纲、卷纲、章节大纲和场景细纲。计划内容不是正式事实，但启用后的大纲是正文分析的重要约束来源。

核心对象：

- `OutlineDocument`
- `OutlineNode`
- `OutlineConstraint`
- `OutlineBinding`
- `OutlineDeviation`

正文与启用的大纲发生明确冲突时产生 `error`；正式事实仍然是世界状态推导的唯一依据。详细规则以 [Outline And Detailed Planning](outline-and-detailed-planning.md) 为准。

### Manuscript

负责用户可见的小说结构和正文生命周期。

核心对象：

- `Project`
- `Work`
- `Volume`
- `Chapter`
- `Scene`
- `ContentBlock`
- `DraftRevision`
- `CanonicalRevision`
- `SourceAnchor`

规则：

- `ContentBlock` 是最小编辑和确认单位，必须具有稳定 ID。
- `Scene` 维护有序文本块和场景语义信息。
- `Chapter` 保存可以完整恢复的正式快照。
- 正式正文不可原地覆盖；重新编辑必须产生新的草稿和正式版本。
- `SourceAnchor` 使用对象 ID、revision 和局部范围定位证据，不能只保存全章字符偏移。

### Story State

负责结构化的故事事实、知识边界和时序状态。

核心对象：

- `Entity`
- `Character`
- `Location`
- `Item`
- `Faction`
- `WorldRule`
- `Event`
- `Fact`
- `Relationship`
- `StateTransition`
- `KnowledgeState`
- `Foreshadowing`

规则：

- 正文不是正式事实。
- 正式状态变化必须能追溯到已确认事件或用户明确确认的事实。
- 角色位置、物品持有、伤势、关系和知识状态采用带时间范围的变化记录，不能只覆盖“当前值”。
- 世界内时间、叙事顺序和时间域分别存储。
- 角色所知事实与读者所知信息分别建模，避免信息越权。
- 每个事实和事件必须具有来源、确认状态和版本归属。

### Versioning

负责数据库内建的版本、分支、快照、恢复和探索性改动。

核心对象：

- `ObjectRevision`
- `ProjectCommit`
- `CommitChange`
- `ProjectBranch`
- `ProjectSnapshot`

正式正文与正式故事状态必须在同一项目提交中保持一致。探索快照分支、逻辑 squash、恢复规则和 Git 边界由 [Database Version Management](database-version-management.md) 定义。

### Analysis

负责从待确认正文或正式提交中发现冲突、缺失信息和可改进问题。

分析分为：

- 确定性分析：时间冲突、互斥地点、重复物品持有、死亡后出现、状态迁移非法、明确世界规则违反。
- 语义分析：人物动机、对白知识越权、世界观语义冲突、称呼变化、伏笔遗漏、结构和文风问题。

核心对象：

- `AnalysisRun`
- `AnalysisIssue`
- `EvidenceRef`
- `SuggestedAction`
- `AffectedScope`

`AnalysisIssue` 至少包含：

- `severity`：`error`、`warning`、`notice`
- `category`
- `message`
- `evidence_refs`
- `affected_objects`
- `source_anchors`
- `suggested_actions`
- `input_commit_id`
- `input_draft_revision_ids`
- `status`

分析结果必须给出证据。当前正式提交或输入草稿发生变化后，旧结果应标记为过期。

### Candidate And Confirmation

负责候选信息与用户决策。

核心对象：

- `CandidateFact`
- `CandidateEvent`
- `CandidateRelationship`
- `CandidatePatch`
- `ConfirmationSession`
- `UserDecision`

确认状态：

```text
candidate -> confirmed | rejected | superseded
```

`error` 级问题需要用户显式确认或修正；`warning` 和 `notice` 不阻断创作。用户明确保留冲突时，确认决定和原因必须进入版本记录。

## 正文正式化工作流

详细版本提交步骤由版本管理文档定义，后端应用层负责组织以下阶段：

```text
保存 DraftRevision
  -> 创建 ConfirmationSession
  -> 冻结输入草稿与当前 commit
  -> 执行预分析
  -> 返回问题和候选事实
  -> 等待 UserDecision
  -> 校验输入版本未过期
  -> 在单个 SQLite 事务中创建正式对象版本和 ProjectCommit
  -> 更新领域表和分支 head
  -> 提交事务
  -> 异步重建受影响的派生索引
```

如果确认期间草稿或分支 head 已变化，必须返回版本冲突，不能用旧分析结果覆盖新内容。

## 图谱与查询策略

第一阶段使用 SQLite 中明确的实体、事件、事实和关系表，不引入独立图数据库。

- 一跳和多跳关系查询使用索引、递归 CTE 和受限遍历。
- 图查询必须限制关系类型、最大深度和访问节点数。
- 正式关系和事实表是事实源。
- 图查询缓存是可重建投影。
- 若真实长篇压力测试证明 SQLite 无法满足查询需求，再通过 repository port 替换或增加图适配器。

向量召回只能帮助寻找相关文本，不能证明事实存在，也不能替代关系和时间状态查询。

## Agent 与模型边界

Agent 位于应用层外侧，是受控用例的调用者和工作流助手，不是数据库所有者。

第一阶段逻辑能力：

- `Planner`：澄清意图、规划剧情、章节和场景。
- `Writer`：根据受控上下文生成草稿或局部改写。
- `Reviewer`：结合规则结果检查连续性、结构、人物和文风。

Agent 可以：

- 查询经过裁剪的故事上下文。
- 创建草稿和候选方案。
- 发起分析。
- 生成候选事实和候选补丁。
- 解释冲突及影响范围。

Agent 不可以：

- 直接修改正式正文和正式领域表。
- 确认候选事实。
- 自动应用修复补丁。
- 静默创建、切换或删除分支。
- 覆盖或删除历史版本。

模型 Provider 通过端口抽象，业务层不依赖具体 SDK。上下文构建器按固定层、全局层、当前状态层、局部层和检索层组装最小必要上下文。

## 后台任务模型

长时间分析、模型调用、索引重建和快照创建使用持久化任务记录。

```text
queued -> running -> awaiting_user -> completed
                 `-> failed
queued/running/awaiting_user -> cancelled
```

核心对象：

- `TaskRun`
- `TaskStep`
- `TaskInputSnapshot`
- `TaskArtifact`
- `TaskFailure`

任务要求：

- 每次执行具有稳定 `task_id` 和幂等键。
- 输入必须绑定项目、分支、commit 和草稿 revision。
- 支持取消、进度上报和应用重启后的状态恢复。
- 重试不得重复创建正式提交。
- 等待用户确认时不持有数据库事务和文件锁。

## SQLite 事务与并发

- SQLite 必须启用 foreign keys。
- 正式化、版本提交、分支 head 更新和用户决定使用单一短写事务。
- 同一项目只允许一个正式写入序列，避免多个 Tauri command 竞争写事务。
- 读取与长计算基于冻结的 commit/revision，不读取不断变化的“最新状态”。
- Rust 中的阻塞数据库操作不能占用 Tauri async runtime；通过专用数据库执行器或 blocking worker 运行。
- 使用 WAL 时，备份和快照必须采用 SQLite 支持的一致性机制，不能在数据库打开时随意复制单个 `.db` 文件。
- 所有迁移必须有显式 schema version，并在迁移前创建可恢复备份。

## Tauri 边界

Tauri 层只暴露面向用例的命令，不暴露通用 SQL、repository 或内部表结构。

建议首期 command：

```text
create_project
open_project
close_project
get_project_overview
save_draft
get_draft
start_confirmation
submit_confirmation_decision
run_analysis
list_analysis_issues
create_exploration_branch
switch_branch
compare_branches
restore_version
list_version_history
cancel_task
```

命令返回序列化 DTO 和稳定错误码。内部错误、SQL、模型响应原文和密钥不得直接暴露给前端。

进度、任务完成和需要用户确认等状态通过 Tauri event 推送；正式状态仍以重新查询 application use case 为准，event 本身不是事实源。

## 错误模型

后端错误至少区分：

- `validation_error`
- `not_found`
- `revision_conflict`
- `stale_analysis`
- `project_locked`
- `migration_required`
- `integrity_error`
- `provider_error`
- `task_cancelled`
- `internal_error`

错误响应包含稳定 code、面向用户的 message、可选 details 和 correlation id。不得把包含 API key、完整模型上下文或本地敏感路径的调试信息返回前端或写入普通日志。

## 安全与数据边界

- API key 不保存在项目数据库、正文、任务 payload 或日志中。
- 发送给外部模型的上下文必须经过最小化裁剪，并让用户知道数据会离开本机。
- 模型响应先作为不可执行 artifact 保存和解析。
- 项目导入、恢复和模型结构化输出都必须经过 schema 校验。
- 不允许模型生成任意 SQL、文件路径或系统命令并直接执行。
- 项目数据库、备份和导出默认留在用户选择的项目目录中。

## 测试策略

### Domain unit tests

- 文本和事实状态转换。
- 时间与状态约束。
- 用户确认权限。
- 分支和恢复语义。
- 版本冲突检测。

### SQLite integration tests

- schema、约束和迁移。
- 正文与世界状态的原子提交。
- 崩溃或事务失败不产生部分状态。
- 快照、探索分支和恢复。
- 索引删除后可以重建。

### Workflow tests

- 使用 fake Provider 验证 Planner、Writer 和 Reviewer 工作流。
- 输入版本变化后拒绝旧结果。
- 任务取消、失败、重试和幂等。
- AI 候选结果不能绕过用户确认。

### Reliability tests

- 应用异常退出后的草稿恢复。
- 数据库锁和重复打开。
- 迁移前备份与失败回滚。
- 长篇项目的版本、快照、图查询和增量检查压力测试。

## 后端优先实现顺序

### Phase 1：可靠写作内核

- 项目创建与打开。
- 卷、章节、场景和稳定文本块。
- 草稿自动保存。
- 用户确认与正式正文。
- 数据库内建 revision、commit、snapshot、branch 和恢复。

### Phase 2：正式故事状态

- 角色、地点、物品、世界规则和关系。
- 事件、事实、来源定位和确认状态。
- 时间状态推导与角色知识边界。
- SQLite 图查询。

### Phase 3：智能分析

- 影响范围计算。
- 确定性冲突规则。
- 证据化分析结果。
- 正式化前预检查和增量检查。

### Phase 4：模型与 Agent 助手

- Provider Adapter。
- 上下文构建与裁剪。
- Planner、Writer、Reviewer。
- 候选事实提取、语义检查和候选修复补丁。

### Phase 5：Tauri 集成

- 将已验证用例暴露为 commands/events。
- 项目会话、后台任务和取消。
- 再进入前端工作台实现。

## Open Questions

- 项目锁采用文件锁还是数据库租约，需要 Windows 异常退出测试。
- SQLite 连接执行器采用专用线程还是 blocking worker，需要性能 spike。
- 正式提交时是否一次确认正文和全部候选事实，或允许拆成连续提交，需要结合交互原型确认。
- 时间域、知识状态和伏笔的首期最小 schema 仍需单独详细设计。
- 外部模型调用的流式 artifact、重试和费用统计需要 Provider 设计补充。
