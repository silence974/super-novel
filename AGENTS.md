# AGENTS.md

本文件是 `super-novel` 项目的总导航 map。它只定义项目地图、文档入口、阅读顺序、协作规则和更新约定，不展开架构、数据模型、UI 或安全细节。

## 项目一句话定义

`super-novel` 是一个面向个人作者的 Windows 本地小说编写助手，以作品控制台和分栏工作台为入口，通过知识图谱、强约束时空状态机、向量检索和人工掌控式 AI Agent，帮助作者稳定管理世界观、事件、章节、正文和设定一致性。

## 项目地图

- 产品定位与取舍：`PRODUCT_SENSE.md`
- 系统架构总览：`ARCHITECTURE.md`
- 领域与状态机设计：`DESIGN.md`
- 前端与交互约束：`FRONTEND.md`
- 执行计划入口：`PLANS.md`
- 质量门槛：`QUALITY_SCORE.md`
- 本地可靠性：`RELIABILITY.md`
- 安全与 AI 数据边界：`SECURITY.md`
- 详细设计索引：`docs/design-docs/index.md`
- 产品规格索引：`docs/product-specs/index.md`
- 当前执行计划：`docs/exec-plans/active/initial-architecture-and-data-spike.md`
- 技术债跟踪：`docs/exec-plans/tech-debt-tracker.md`
- 数据库 schema 派生文档：`docs/generated/db-schema.md`

## 推荐阅读顺序

1. 先读 `AGENTS.md`，确认项目地图和协作规则。
2. 再读 `PRODUCT_SENSE.md`，理解用户、目标和非目标。
3. 再读 `docs/design-docs/core-beliefs.md`，确认长期稳定原则。
4. 做架构或技术工作前读 `ARCHITECTURE.md` 和 `docs/design-docs/technology-decisions.md`。
5. 做领域、图谱、状态机、检查规则前读 `DESIGN.md`、`docs/design-docs/data-model.md`、`docs/design-docs/time-state-machine.md`、`docs/design-docs/conflict-checking.md`。
6. 做 UI 或交互前读 `FRONTEND.md` 和 `docs/product-specs/project-console-and-workbench.md`。
7. 做 AI 能力前读 `docs/design-docs/agent-orchestration.md` 和 `docs/product-specs/ai-assisted-writing-and-review.md`。
8. 做数据迁移、快照、回滚前读 `RELIABILITY.md` 和 `docs/generated/db-schema.md`。
9. 做 API key、日志、模型调用前读 `SECURITY.md`。
10. 执行具体任务前读 `PLANS.md` 和当前 active plan。

## 事实源优先级

- 产品事实源：`PRODUCT_SENSE.md`、`docs/product-specs/*.md`
- 架构事实源：`ARCHITECTURE.md`
- 领域事实源：`DESIGN.md`、`docs/design-docs/data-model.md`、`docs/design-docs/time-state-machine.md`
- 稳定原则事实源：`docs/design-docs/core-beliefs.md`
- 计划事实源：`PLANS.md`、`docs/exec-plans/active/*.md`
- 安全事实源：`SECURITY.md`
- 可靠性事实源：`RELIABILITY.md`
- 派生事实快照：`docs/generated/*.md`

当文档冲突时，以更高事实源为准，并在低层文档记录修正。

## 协作规则

- 不要把 AI 候选结果当作正式事实。任何设定、事件、关系、状态入库前都需要用户确认。
- 不要在多个文档重复定义同一规则。需要复用时使用链接引用事实源。
- 不要在 `AGENTS.md` 展开具体架构和 schema。
- 文档中的不确定内容必须标记为 `Assumption:` 或 `Open Question:`。
- 已确认的 `Open Question` 必须迁移到对应事实源文档。
- 临时技术判断进入 `docs/design-docs/technology-decisions.md`。
- 结构性妥协进入 `docs/exec-plans/tech-debt-tracker.md`。
- 生成文档或代码前，先确认当前任务对应的事实源。

## 更新约定

- 新增核心模块时，更新 `ARCHITECTURE.md` 和相关 product spec。
- 修改领域模型时，更新 `DESIGN.md`、`docs/design-docs/data-model.md` 和 `docs/generated/db-schema.md`。
- 修改时间或状态规则时，更新 `docs/design-docs/time-state-machine.md` 和 `docs/design-docs/conflict-checking.md`。
- 修改 AI 工作流时，更新 `docs/design-docs/agent-orchestration.md`、`SECURITY.md` 和相关 product spec。
- 修改计划状态时，更新 `PLANS.md` 和对应 `docs/exec-plans/active/*.md`。
