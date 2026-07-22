# Outline And Detailed Planning

## 目的

定义全书大纲、卷纲、章节大纲和场景细纲的数据模型、版本规则、正文绑定方式及冲突检查语义。大纲表达创作意图，不是故事世界的事实来源。

## 已确认的核心边界

- 大纲和细纲不参与正式事实推导。
- 大纲中计划发生的事件不能自动成为正式 `Event`。
- 大纲中描述的人物变化不能自动修改人物状态。
- AI 生成的大纲默认是候选内容，用户启用后才成为检查依据。
- 正文或正式事实与当前启用的大纲发生明确冲突时，必须产生 `error`。
- 大纲冲突不强制禁止创作；用户可以修改正文、修改大纲或显式确认偏离。
- 大纲、细纲和偏离决定必须参与数据库内建版本管理，并随分支、快照和恢复保持一致。

## 三种数据层

```text
Planning Layer
  全书大纲、卷纲、章节目标、场景细纲、计划伏笔

Narrative Layer
  用户确认的正式正文

Fact Layer
  用户确认的事实、事件、关系和世界状态
```

三层可以互相检查和引用，但不能互相冒充：

- 大纲说明“作者计划如何写”。
- 正文说明“作品如何叙述”。
- 正式事实说明“故事世界中确认发生了什么”。

例如“大纲计划凶手是父亲”不会让“父亲是凶手”自动成为正式事实；只有正文落地并经过用户确认后，相关候选事件和事实才能进入正式事实层。

## 大纲层级

使用统一的树形 `OutlineNode` 表达不同粒度，避免全书大纲、章节大纲和场景细纲形成互不一致的独立数据结构。

```text
StoryOutline
  |- StoryArc / VolumeOutline
  |    |- ChapterOutline
  |    |    |- SceneOutline
  |    |    `- SceneOutline
  |    `- ChapterOutline
  `- StoryArc / VolumeOutline
```

### StoryOutline

全书级计划，主要表达：

- 故事 premise。
- 核心冲突。
- 主题与情绪方向。
- 主角总体目标。
- 故事阶段和主要转折。
- 高潮和结局方向。
- 主要人物弧光。
- 全局伏笔布置与回收计划。

### VolumeOutline / StoryArc

卷或故事阶段计划，主要表达：

- 阶段目标。
- 阶段主要冲突。
- 起始与结束状态。
- 核心转折。
- 主要参与角色。
- 本阶段需要推进或回收的线索。

### ChapterOutline

章节级计划，至少支持：

- 章节目标。
- 本章必须推进的情节。
- 主要冲突。
- 人物变化。
- 新增或揭示的信息。
- 必须隐藏的信息。
- 伏笔布置、强化或回收。
- 章节结束状态。
- 章节结尾钩子。
- 目标叙事视角、基调和节奏。

### SceneOutline

场景细纲是首期最细的计划单位，至少支持：

- 场景目标。
- 参与人物。
- 时间和地点意图。
- 视角人物。
- 冲突来源。
- 各角色策略。
- 场景转折。
- 计划发生的行为或事件。
- 本场景需要揭示的信息。
- 本场景禁止透露的信息。
- 人物、关系和物品的计划变化。
- 场景结束状态。
- 与下一场景的衔接。

## 核心领域实体

### OutlineDocument

建议字段：

- `id`
- `project_id`
- `work_id`
- `title`
- `status`
- `active_revision_id`
- `created_at`
- `updated_at`

### OutlineNode

建议字段：

- `id`
- `outline_document_id`
- `parent_node_id`
- `node_type`：`story`、`arc`、`volume`、`chapter`、`scene`
- `title`
- `summary`
- `position`
- `target_object_type`
- `target_object_id`
- `status`
- `created_at`
- `updated_at`

`target_object_id` 可以绑定现有卷、章节或场景。尚未创建正文结构时可以为空，后续通过 `OutlineBinding` 建立绑定。

### OutlineConstraint

大纲中的可检查要求必须结构化为约束，不能只依靠整段自然语言进行模糊比较。

建议字段：

- `id`
- `outline_node_id`
- `constraint_type`
- `strength`
- `subject_ref`
- `object_ref`
- `expected_value`
- `description`
- `position`
- `status`

首期约束类型：

- `must_include`：必须出现的情节、人物、地点、物品或信息。
- `must_not_include`：禁止出现或禁止提前透露的内容。
- `planned_outcome`：场景或章节应达到的结果。
- `planned_state_change`：计划发生的人物、关系或物品状态变化。
- `knowledge_reveal`：指定角色或读者应在此处获知的信息。
- `knowledge_withhold`：指定信息在此处必须继续隐藏。
- `point_of_view`：叙事视角约束。
- `sequence`：计划情节的先后关系。
- `tone`：基调和情绪方向。
- `pacing`：节奏目标。
- `foreshadowing_action`：伏笔的布置、强化、误导、回收或废弃计划。

### OutlineBinding

用于把计划节点绑定到正文结构：

- `outline_node_id`
- `target_type`：`volume`、`chapter`、`scene`、`content_block`
- `target_id`
- `binding_role`
- `created_at`

绑定只表达计划适用范围，不代表计划内容已经在正文中实现。

### OutlineDeviation

记录用户有意保留的大纲偏离：

- `id`
- `outline_constraint_id`
- `analysis_issue_id`
- `project_commit_id`
- `decision`：`keep_text`、`update_outline_later`、`intentional_misdirection`
- `reason`
- `created_at`

偏离记录不是永久忽略规则。正文、大纲或目标范围发生新版本变化后，检查器应重新判断该偏离是否仍然适用。

## 状态模型

### OutlineDocument / OutlineNode 状态

```text
draft -> active -> fulfilled | deviated | superseded | archived
```

- `draft`：正在编辑，不作为强制检查依据。
- `active`：用户已启用，作为正文分析和冲突检查依据。
- `fulfilled`：目标范围的正式正文已经满足计划。
- `deviated`：用户确认正文有意偏离计划。
- `superseded`：被新的大纲版本取代。
- `archived`：不再参与当前分支创作。

只有 `active` 状态的节点和约束参与当前检查。AI 不得自行把草稿大纲切换为 `active`。

### OutlineConstraint 强度

```text
required | preferred | advisory
```

- `required`：直接违反或在目标范围完成后仍缺失，产生 `error`。
- `preferred`：明显偏离产生 `warning`。
- `advisory`：仅产生 `notice`。

用户要求的大纲核心情节、禁止泄露、计划结局和关键状态变化默认使用 `required`。风格、节奏等主观目标默认使用 `preferred`，除非用户明确提升为 `required`。

## 大纲版本规则

- 大纲和细纲是可版本化的项目内容，但不是正式事实。
- `OutlineDocument`、`OutlineNode`、`OutlineConstraint` 和 `OutlineBinding` 使用不可变 `ObjectRevision`。
- 启用新大纲版本时，旧版本标记为 `superseded`，不能原地覆盖历史。
- 大纲变化应创建 `ProjectCommit`，但不会直接触发正式故事状态迁移。
- 大纲属于分支状态；探索快照分支包含来源分支当前启用的大纲版本。
- 在探索分支修改大纲不会影响来源分支。
- 恢复项目版本时，正文、正式事实和当时启用的大纲版本必须一起恢复。
- 大纲变化会使依赖旧大纲版本的分析结果过期。

## 检查输入与范围

大纲检查以冻结输入执行：

```text
待确认 DraftRevision 或 CanonicalRevision
  + 当前分支 active OutlineRevision
  + 当前分支 Confirmed Story State
  + OutlineBinding 目标范围
  -> Outline Analysis Run
```

分析结果必须绑定：

- `input_commit_id`
- `input_text_revision_ids`
- `input_outline_revision_id`
- `target_outline_node_ids`
- `analysis_rule_version`

任一输入发生变化后，旧检查结果标记为过期。

检查范围遵循目标层级：

- 场景确认时，检查绑定的 `SceneOutline` 和相关上层必要约束。
- 章节确认时，检查 `ChapterOutline`、全部场景细纲和相关卷级约束。
- 卷完成时，检查 `VolumeOutline` 或 `StoryArc`。
- 全书检查时，检查 `StoryOutline` 和所有仍未完成的关键计划。

不能因为某个计划安排在未来章节，就在当前章节报告“未完成”。只有目标范围已经结束或正文明确产生相反结果时，才形成缺失或冲突。

## 大纲冲突类型

### Direct Contradiction

正文明确产生与 `required` 计划相反的结果。

示例：细纲要求“林舟没有拿到钥匙”，正文却确认林舟已取得钥匙。

结果：`error`。

### Required Beat Missing

目标场景或章节已经完成，但必须出现的情节、人物、信息或状态变化没有发生。

结果：`error`。

在目标范围尚未完成时只记录待检查状态，不提前报错。

### Forbidden Reveal

正文提前透露了细纲要求继续隐藏的信息，或让不应知情的角色获知该信息。

结果：`error`，并同时触发角色知识边界检查。

### Sequence Conflict

正文中的关键事件顺序与大纲的 `required` 顺序相反。

结果：`error`。

### Planned State Mismatch

章节或场景结束后的正式人物、关系、物品或地点状态与计划结果不同。

- `required`：`error`
- `preferred`：`warning`

### Structure / Tone / Pacing Deviation

章节作用、结构、基调或节奏与偏好目标不符。

- 默认：`warning`
- 用户明确设为 `required`：`error`

### Unbound Outline

活动大纲节点没有绑定对应正文范围，或者正文场景没有细纲绑定。

结果：`notice`；若用户把完整细纲设为必需，则为 `warning`。

## 检查实现

### 确定性检查

Rust 规则引擎负责：

- 节点与正文目标绑定。
- 必须人物、地点和实体引用是否存在。
- 明确事件顺序。
- 计划状态与正式状态投影比较。
- 角色知识揭示时间。
- 必须/禁止约束的结构化匹配。
- 目标范围结束后的完成度检查。

### 语义检查

模型辅助分析负责：

- 自然语言大纲与正文语义是否矛盾。
- 情节目标是否真正实现，而非只出现相同关键词。
- 人物动机和弧光是否偏离计划。
- 基调、节奏和场景作用是否符合细纲。
- 伏笔是否以计划的方式布置或回收。

模型只能生成候选 `AnalysisIssue`。后端必须校验引用范围、输入版本和输出 schema，不能让模型直接改变大纲状态或正式正文。

## 分析结果

大纲冲突复用后端统一的 `AnalysisIssue`，并增加：

- `category = outline_conflict`
- `outline_node_id`
- `outline_constraint_id`
- `outline_evidence`
- `text_evidence`
- `expected_plan`
- `observed_narrative`

每个错误必须同时展示大纲依据和正文证据，例如：

```text
问题：正文提前揭示了凶手身份。

大纲依据：
第八章细纲 / knowledge_withhold：本章结束前不得让林舟知道父亲是凶手。

正文证据：
场景 3 / ContentBlock B17：林舟直接质问父亲为何杀害医生。

建议：
1. 将质问改为怀疑但尚未确认；
2. 调整第八章细纲，允许此处提前揭示；
3. 标记为有意误导或不可靠叙述。
```

## 用户处理大纲冲突

用户面对 `error` 可以：

1. 修改正文并重新检查。
2. 修改或取代大纲，再重新检查。
3. 将对应约束从 `required` 调整为 `preferred`。
4. 显式确认偏离并填写可选原因。

用户确认偏离后可以继续正式化正文，但 `UserDecision`、`OutlineDeviation` 和对应问题必须进入同一个 `ProjectCommit`。

系统不能因为正文偏离大纲就自动重写正文，也不能为了迁就正文静默修改大纲。

## 与正式事实检查的关系

同一段正文可能同时产生不同类型的问题：

```text
正文与大纲不一致       -> outline_conflict
正文与正式事实不一致   -> fact_conflict
正文内部前后不一致     -> narrative_conflict
正文违反世界规则       -> world_rule_conflict
```

这些问题必须分别报告，不能用“大纲冲突”覆盖事实冲突。

当大纲与正式事实本身冲突时：

- 报告 `outline_fact_conflict`。
- 正式事实继续作为状态推导依据。
- 大纲不能覆盖正式事实。
- 用户可以修改大纲，或通过正式变更流程取代原事实。

## Agent 边界

Planner 可以生成和修改候选大纲、把自然语言计划拆成结构化约束、解释大纲冲突并提出替代方案。

Writer 只能基于已选择的大纲版本生成草稿，不能把计划内容直接写入正式事实。

Reviewer 可以检查正文与大纲是否一致，但输出仍是候选问题和建议。

任何 Agent 都不能：

- 自动启用大纲。
- 自动降低约束强度。
- 静默确认大纲偏离。
- 因为大纲存在而创建正式事件或状态变化。

## 首期实现范围

- 统一的树形 `OutlineDocument` 和 `OutlineNode`。
- 全书、卷、章节和场景四级计划。
- 大纲节点与卷、章节、场景绑定。
- `required`、`preferred`、`advisory` 三种约束强度。
- 必须包含、禁止包含、计划结果、信息揭示/隐藏和视角约束。
- 大纲版本、分支、快照和恢复。
- 正式化前的大纲冲突检查。
- 证据化 `error`、`warning` 和 `notice`。
- 用户显式确认偏离。

## Open Questions

- 自然语言大纲自动拆解为结构化约束的质量需要模型 spike。
- 大纲完成度是自动推断、用户标记还是混合机制，需要交互验证。
- 章节和场景重排后，计划事件顺序的稳定标识需要详细 schema 设计。
- 同一个正文场景是否允许绑定多个互补细纲节点，需要真实创作流程验证。

