# Windows 可靠写作内核设计

## 1. 背景

`super-novel` 已确定采用 Tauri v2、Rust、WebView2 和 SQLite 构建本地优先的
Windows 桌面应用。仓库已有后端架构文档，以及一份尚未提交、当前不能通过编译的
`novel-backend` 原型。该原型覆盖项目初始化、卷、章节、正文修订和恢复，但尚未形成
可运行的桌面应用。

完整 Phase 1 还包括场景、稳定文本块、正式正文、项目级 commit、snapshot 和 branch。
本设计聚焦 Phase 1 的第一个可交付垂直切片：先提供可靠、可安装、可日常使用的纯文本
写作闭环，再在后续切片中扩展完整版本模型。

## 2. 目标

首个交付版本必须允许 Windows 用户：

1. 在用户选择的目录中创建小说项目。
2. 打开已有项目目录并恢复上次自动保存的内容。
3. 创建卷和章节，并通过左侧目录切换章节。
4. 在纯文本编辑器中写作，停止输入约 800ms 后自动保存工作草稿。
5. 手动或定期创建不可变历史检查点。
6. 预览并恢复历史检查点，且保留可审计的恢复记录。
7. 清楚看到未保存、保存中、已保存和保存失败状态。
8. 构建为可运行的 Windows 桌面应用和 NSIS 安装包。

## 3. 非目标

本切片不实现：

- Markdown 或富文本编辑。
- 场景和稳定文本块。
- 正式正文确认流程。
- 项目级 commit、snapshot、branch 和分支比较。
- 角色、地点、物品、事件、事实、关系和世界规则。
- AI Provider、Planner、Writer 或 Reviewer。
- 云同步、多人协作、自动更新和代码签名。
- localhost HTTP 服务、独立图数据库或向量数据库。

## 4. 技术方案

采用模块化单体：

```text
React + TypeScript 界面
  -> 类型化 Tauri commands
  -> 桌面会话与项目路径管理
  -> Rust 应用用例
  -> SQLite 仓储
  -> 用户所选项目目录
```

### 4.1 技术栈

- 桌面壳：Tauri v2。
- Windows 渲染：WebView2。
- 前端：React、TypeScript、Vite。
- 后端：Rust 2024 edition，最低 Rust 1.95。
- 存储：应用内嵌 SQLite，启用 foreign keys 和 WAL。
- 前端测试：Vitest 和 React Testing Library。
- 后端测试：Rust 单元测试和 SQLite 集成测试。
- Windows 交付：Tauri NSIS bundle。

### 4.2 模块职责

`crates/novel-backend` 不依赖 Tauri，负责：

- 项目、卷、章节、工作草稿和历史检查点的领域模型。
- 标题、正文、修订号和检查点规则。
- SQLite schema、迁移、事务和仓储。
- 自动保存、创建检查点、恢复检查点和冲突检测用例。

`src-tauri` 负责：

- 当前窗口唯一的活动项目会话。
- 项目目录和 manifest 的创建、打开与校验。
- Tauri command 的参数转换和错误映射。
- 将阻塞数据库操作放到阻塞工作线程执行。

`src` 负责：

- 启动页、三栏写作工作台、历史预览和确认对话框。
- 当前章节编辑缓冲区和 800ms 防抖。
- 保存状态、错误提示和键盘快捷键。
- 调用稳定的 Tauri commands，不读取 SQLite 或任意本地文件。

首版不立即拆分多个 Rust crate。内部模块保持领域、应用、存储和桌面适配边界，接口稳定后
再决定是否拆分。

## 5. 项目目录

每个项目使用用户选择的独立目录：

```text
project-directory/
  super-novel.toml
  .super-novel/
    project.db
```

`super-novel.toml` 仅保存：

- 文件格式版本。
- 稳定项目 ID。
- 显示名称。

正文、修订和内部状态只保存在 `.super-novel/project.db`。manifest 和数据库均不得保存
API key。

创建项目时：

1. 校验目标目录可访问，且不会覆盖其他 Super Novel 项目。
2. 创建临时 manifest 和数据库。
3. 完成 schema 初始化和完整性校验。
4. 原子移动为正式文件。
5. 仅在全部步骤成功后建立活动会话。

打开项目时：

1. 读取并校验 `super-novel.toml`。
2. 校验项目 ID、数据库存在性、schema version 和数据库完整性。
3. 启用 foreign keys 和 WAL。
4. 加载项目概要、卷章树及最后打开章节。
5. 建立活动会话。

同一应用窗口只允许一个活动项目。关闭或切换项目前必须完成当前草稿刷新；刷新失败时保留
当前项目和编辑缓冲区，不静默切换。

## 6. 数据模型

首版使用以下核心表：

### `projects`

- `id`
- `name`
- `created_at_ms`
- `updated_at_ms`
- `schema_version`
- `last_opened_chapter_id`

### `works`

- `id`
- `project_id`
- `title`
- `created_at_ms`
- `updated_at_ms`

首版每个项目只有一个 `work`。

### `volumes`

- `id`
- `work_id`
- `title`
- `position`
- `created_at_ms`
- `updated_at_ms`

### `chapters`

- `id`
- `work_id`
- `volume_id`，允许为空。
- `title`
- `status`
- `position`
- `non_whitespace_char_count`
- `created_at_ms`
- `updated_at_ms`

### `chapter_drafts`

- `chapter_id`
- `content`
- `edit_revision`
- `checkpointed_edit_revision`
- `updated_at_ms`

每章只有一份工作草稿。`edit_revision` 每次成功自动保存后递增。
`checkpointed_edit_revision` 标识最近已经进入检查点的工作草稿修订。

### `chapter_checkpoints`

- `id`
- `chapter_id`
- `source`：`manual`、`periodic`、`chapter_switch`、`project_close` 或 `restore`。
- `source_edit_revision`
- `restored_from_checkpoint_id`，仅恢复检查点时有值。
- `content`
- `non_whitespace_char_count`
- `created_at_ms`

检查点不可原地修改。恢复旧检查点会更新工作草稿并追加来源为 `restore` 的新检查点。

所有 SQLite 整数采用可验证的有符号 64 位范围。Rust DTO 可以向前端暴露非负修订号，但
进入或离开 SQLite 时必须执行显式的范围转换，不能直接要求 `rusqlite` 读写 `u64`。

## 7. 自动保存和历史语义

### 7.1 自动保存

1. 用户修改正文后，前端状态变为“未保存”。
2. 停止输入 800ms 后调用 `save_working_draft`。
3. 请求包含章节 ID、前端已知的 `expected_edit_revision` 和完整纯文本正文。
4. 后端在短事务中比较修订号、更新草稿、字数和时间，再返回新的 `edit_revision`。
5. 前端只在响应内容仍对应当前编辑缓冲区时显示“已保存”；若用户已继续输入，则保持
   “未保存”并安排下一次保存。

同一章节同时最多有一个进行中的保存请求。后续输入会合并到下一次请求，不并发写入。

### 7.2 检查点

下列情况尝试创建检查点：

- 用户按 `Ctrl+S`。
- 连续编辑期间距离上次检查点达到 5 分钟。
- 用户切换章节。
- 用户关闭或切换项目。

创建检查点前必须先保存最新工作草稿。若 `edit_revision` 等于
`checkpointed_edit_revision`，后端不创建重复检查点，并返回已有最新检查点概要。

### 7.3 恢复

1. 用户在右侧历史栏选择检查点。
2. 应用显示只读正文、时间、来源和字数。
3. 用户明确确认恢复。
4. 请求携带当前 `expected_edit_revision`。
5. 后端将旧内容复制到工作草稿，递增 `edit_revision`，并追加 `restore` 检查点。
6. 前端使用返回的正文和修订号刷新编辑器。

历史内容永不被覆盖或删除。

## 8. Tauri 命令

命令面向应用用例，不暴露通用 SQL、仓储对象或内部表结构。

```text
create_project(directory, name) -> WorkspaceDto
open_project(directory) -> WorkspaceDto
close_project() -> ()
get_workspace() -> WorkspaceDto

create_volume(title) -> VolumeDto
create_chapter(volume_id?, title) -> ChapterDto
get_chapter(chapter_id) -> ChapterDto

save_working_draft(chapter_id, expected_edit_revision, content)
  -> SavedDraftDto
create_checkpoint(chapter_id, expected_edit_revision, source)
  -> CheckpointDto
list_checkpoints(chapter_id) -> CheckpointSummaryDto[]
get_checkpoint(checkpoint_id) -> CheckpointDto
restore_checkpoint(chapter_id, checkpoint_id, expected_edit_revision)
  -> RestoredDraftDto
```

`WorkspaceDto` 一次返回项目概要、卷章树和最后打开章节 ID，避免前端了解内部连接关系。
所有 DTO 使用 camelCase JSON 字段和稳定字符串枚举。

## 9. 界面设计

### 9.1 启动页

- “新建项目”选择目录并输入项目名。
- “打开项目”选择包含 `super-novel.toml` 的目录。
- 显示少量最近项目；失效路径可以从列表移除，不删除项目数据。

### 9.2 三栏写作工作台

- 顶栏：应用名、当前项目/卷、保存状态和“创建版本”按钮。
- 左栏：卷章树、新建卷、新建章节。
- 中栏：卷章位置、章节标题、纯文本编辑器、字数和当前修订号。
- 右栏：当前工作草稿和历史检查点；允许收起。

正文编辑区优先占用剩余空间。首版不加入格式工具栏、AI 面板、仪表盘或装饰性卡片。

### 9.3 错误和确认

- 保存失败时正文保持可编辑，显示可重试提示。
- 版本冲突时保留本地缓冲区，不自动覆盖或合并；用户可以重新加载磁盘版本，或复制本地
  内容后自行处理。
- 恢复检查点必须先预览，再通过明确确认执行。
- 项目打开失败返回启动页并显示面向用户的错误，不暴露 SQLite 原始错误或完整敏感路径。

## 10. 错误模型

后端返回稳定错误对象：

```text
code
message
details?
correlationId
```

首版错误码：

- `validation_error`
- `not_found`
- `revision_conflict`
- `invalid_project`
- `project_locked`
- `migration_required`
- `integrity_error`
- `internal_error`

`details` 只包含前端处理所需的结构化值，例如预期修订号和当前修订号。数据库语句、SQLite
原始错误、完整本地敏感路径和将来的 Provider 密钥不得返回前端。

## 11. 测试与验证

### 11.1 Rust 单元测试

- 空标题、首尾空白和 200 字符标题上限。
- 非空白字符统计。
- 修订号范围转换。
- 检查点去重和来源规则。
- 旧 `expected_edit_revision` 被拒绝。

### 11.2 SQLite 集成测试

- 创建项目、关闭后重新打开并恢复完整卷章树。
- 自动保存只更新工作草稿，不产生历史检查点。
- 手动、定期、切换章节和关闭项目检查点。
- 未变化的草稿不生成重复检查点。
- 恢复产生新工作修订和可审计检查点。
- 事务失败不留下部分 manifest、项目、章节、草稿或检查点。
- foreign keys、schema version 和完整性检查生效。

### 11.3 Tauri 适配测试

- command DTO 序列化格式。
- 未打开项目时返回稳定错误。
- 一个窗口只保持一个活动会话。
- 切换项目前刷新失败时不丢失原会话。
- 内部错误正确映射为安全的前端错误对象。

### 11.4 React 测试

- 启动页创建和打开流程。
- 卷章选择与章节内容加载。
- 800ms 防抖和单一进行中保存请求。
- 保存响应落后于新输入时不错误显示“已保存”。
- 手动创建检查点和 5 分钟周期检查点。
- 历史预览、恢复确认和恢复后状态刷新。
- 修订冲突与普通保存失败提示。

### 11.5 最终交付验证

- `cargo test --workspace` 全部通过。
- 前端单元与组件测试全部通过。
- TypeScript 类型检查和 Vite 生产构建通过。
- Tauri debug 应用完成创建项目、重开项目、写作、自动保存、检查点和恢复冒烟测试。
- Tauri NSIS bundle 成功生成并可在 Windows 上安装、启动和卸载。

## 12. 验收标准

首个垂直切片完成时：

1. 新用户可以只通过图形界面完成项目创建到正文恢复的完整流程。
2. 应用异常关闭后，已成功自动保存的正文可以恢复。
3. 旧修订写入不会覆盖新正文。
4. 自动保存不会为每次输入创建历史版本。
5. 检查点可预览、恢复且不会破坏旧历史。
6. 所有项目正文和历史只存于用户选择的项目目录。
7. 后端、适配层和前端测试通过。
8. 仓库能够生成可安装的 Windows NSIS 包。

## 13. 后续切片

本切片完成后，Phase 1 按以下顺序继续：

1. 场景和稳定文本块。
2. 用户确认与正式正文。
3. 项目级 revision、commit 和 snapshot。
4. exploration branch、比较和恢复。

这些后续能力必须复用本切片的稳定 ID、事务边界、冲突检测和不可变历史原则，但不提前
进入当前实现范围。
