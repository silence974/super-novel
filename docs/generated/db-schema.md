# Generated DB Schema

## 目的

记录当前数据库 schema 的派生快照。本文档应由 schema 定义或迁移文件生成，不应作为手工事实源。

## 当前状态

正式 schema 尚未实现。以下为初始化阶段的目标草案。

已新增 SQLite 原型 schema：

- `spikes/sqlite-state-graph/schema.sql`
- `spikes/sqlite-state-graph/prototype.py`

原型验证结果：

- Python 标准库 `sqlite3` 可创建并写入数据库。
- 本机 FTS5 可用。
- 已验证 `confirmed` 与 `candidate` 数据隔离。
- 已验证位置冲突和道具持有冲突写入 `check_results`。
- 已验证 `vector_entries` 作为首期向量索引占位结构。
- Tauri Rust 后端已通过 `rusqlite bundled` 复现最小内存 schema 和冲突检查。
- 当前 Tauri command：`run_state_graph_spike`。
- 当前 Tauri command：`run_project_database_spike`。
- 当前 Tauri command：`run_incremental_check_spike`。
- 当前 Tauri command：`run_snapshot_restore_spike`。
- 当前 demo 本地数据库路径：`%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\project.db`。
- 当前 demo 快照路径：`%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\snapshots\demo-snapshot.project.db`。
- 已验证本地 SQLite 文件首次 seed 和二次复用。
- 已验证 SQLite savepoint 可用于预览式补丁和回滚。
- 已验证 SQLite 数据库文件复制可用于最低成本快照恢复。

## 关系数据库草案

### projects

- `id`
- `name`
- `root_path`
- `schema_version`
- `created_at`
- `updated_at`

### works

- `id`
- `project_id`
- `title`
- `description`
- `created_at`
- `updated_at`

### chapters

- `id`
- `work_id`
- `title`
- `order_index`
- `content`
- `status`
- `created_at`
- `updated_at`

### events

- `id`
- `project_id`
- `title`
- `description`
- `world_time`
- `calendar_id`
- `time_domain_id`
- `narrative_order`
- `confirmation_status`
- `created_at`
- `updated_at`

### check_results

- `id`
- `project_id`
- `severity`
- `rule_id`
- `message`
- `status`
- `created_at`
- `updated_at`

### snapshots

- `id`
- `project_id`
- `label`
- `description`
- `schema_version`
- `created_at`

## 图数据库草案

节点类型：

- `Character`
- `Location`
- `Item`
- `Skill`
- `Ability`
- `Event`
- `Chapter`
- `Organization`

边类型：

- `LOCATED_AT`
- `HOLDS`
- `KNOWS`
- `ALLY_OF`
- `ENEMY_OF`
- `PARTICIPATES_IN`
- `OCCURS_AT`
- `MENTIONED_IN`
- `CAUSES`

## 向量索引草案

集合：

- `chapter_chunks`
- `setting_entries`
- `event_descriptions`
- `entity_profiles`

字段：

- `id`
- `source_type`
- `source_id`
- `chunk_text`
- `embedding`
- `updated_at`

## 生成规则

后续实现 schema 后，本文件应由迁移或 schema 生成脚本更新。
