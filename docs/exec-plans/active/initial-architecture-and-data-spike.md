# Initial Architecture And Data Spike

## 状态

active

## 背景

项目需要在 Windows 本地桌面端中同时支持作品内容管理、复杂图查询、强约束时空状态机、向量检索、版本回滚和 OpenAI API 调用。当前必须先验证技术组合是否能在单人本地应用中无感部署。

## 目标

- 验证桌面技术栈。
- 验证数据层组合。
- 验证时间状态机核心模型。
- 验证向量检索集成方式。
- 形成可执行的首期实现方案。

## 范围

包含：

- Tauri v2 打包 spike。
- SQLite 内容库 spike。
- 图查询方案 spike。
- 向量检索方案 spike。
- 项目快照策略 spike。
- OpenAI Provider Adapter 原型。

不包含：

- 完整 UI 视觉设计。
- 完整正文编辑器实现。
- 多人协作。
- PDF 或 EPUB 导出。

## 任务清单

1. `[done]` 创建最小 Tauri Windows 应用并测量安装体积。
2. `[done]` 验证 SQLite 存储章节、事件、检查结果和快照。
3. `[in-progress]` 对比嵌入式图数据库与 SQLite 自建图模型。
4. `[partial]` 验证角色位置链、道具持有链和关系路径查询。
5. `[pending]` 验证向量索引写入、更新和语义查询。
6. `[partial]` 设计并验证时间域和时间流速映射样例。
7. `[pending]` 实现 OpenAI Provider Adapter 最小接口草案。
8. `[partial]` 验证项目快照和恢复策略。
9. `[done]` 更新 `docs/design-docs/technology-decisions.md`。
10. `[done]` 更新 `docs/generated/db-schema.md`。

## 当前验证记录

### 2026-05-08 工具链检查

- Node 可用。
- npm 可用。
- Python 3.12 可用。
- 已通过 rustup 安装 Rust stable MSVC 工具链。
- `rustc 1.95.0` 可用。
- `cargo 1.95.0` 已通过完整路径验证；当前 shell 的 `PATH` 不一定包含 `cargo`。
- Rust 工具链路径：`%USERPROFILE%\.cargo\bin`。
- sqlite3 CLI 不可用，但 Python 标准库 `sqlite3` 可用。

### 2026-05-08 Tauri 最小桌面原型

新增原型：

- `spikes/tauri-minimal/README.md`
- `spikes/tauri-minimal/package.json`
- `spikes/tauri-minimal/src-tauri/Cargo.toml`
- `spikes/tauri-minimal/src-tauri/tauri.conf.json`

运行结果：

- `npm install` 成功。
- `npm run build` 成功。
- `cargo check` 成功。
- `npm run tauri build -- --no-bundle` 成功。
- release exe 路径：`spikes/tauri-minimal/src-tauri/target/release/super-novel-tauri-spike.exe`
- release exe 体积：约 8.58 MB。
- MSI bundling 失败：下载 WiX 时连接被中止。
- NSIS bundling 失败：下载 NSIS 时超时。

当前结论：

- Tauri v2 编译链可用。
- 最小 exe 体积符合“安装包体积优先”的方向。
- 正式 installer 仍需解决 WiX/NSIS 工具链下载、缓存或预安装问题。

### 2026-05-09 Tauri 接入 SQLite 状态图谱

变更范围：

- `spikes/tauri-minimal/src-tauri/Cargo.toml`
- `spikes/tauri-minimal/src-tauri/src/lib.rs`
- `spikes/tauri-minimal/src/main.ts`
- `spikes/tauri-minimal/src/styles.css`
- `spikes/tauri-minimal/index.html`

运行结果：

- 添加 `rusqlite 0.39.0`，启用 `bundled`。
- 新增 Tauri command：`run_state_graph_spike`。
- 前端可触发后端内存 SQLite 状态图谱验证。
- `cargo fmt` 成功。
- `cargo test` 成功。
- `npm run build` 成功。
- `npm run tauri build -- --no-bundle` 成功。
- 接入 SQLite 后 release exe 体积：约 9.98 MB。

当前结论：

- Rust/Tauri 后端可以直接承载本地 SQLite 状态图谱逻辑。
- `rusqlite bundled` 对最小 exe 增量约 1.4 MB，当前可接受。
- 这支持“用户不感知外部依赖”的产品约束。

### 2026-05-09 Tauri 接入本地项目数据库文件

变更范围：

- `spikes/tauri-minimal/src-tauri/src/lib.rs`
- `spikes/tauri-minimal/src/main.ts`
- `spikes/tauri-minimal/src/styles.css`
- `spikes/tauri-minimal/index.html`
- `spikes/tauri-minimal/README.md`

运行结果：

- 新增 Tauri command：`run_project_database_spike`。
- 默认 demo 数据库路径：`%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\project.db`。
- 首次运行会创建目录、创建 SQLite 文件并 seed 样例数据。
- 二次运行会复用已有项目数据库。
- 每次运行刷新 `check_results`，避免重复检查结果。
- 新增单元测试验证首次 seed 和二次复用。
- `cargo test` 成功，2 个测试通过。
- `npm run build` 成功。
- `npm run tauri build -- --no-bundle` 成功。
- 接入本地项目数据库命令后 release exe 体积：约 10.02 MB。

当前结论：

- 本地项目数据库文件方案成立。
- 使用 `%LOCALAPPDATA%` 作为 spike 默认路径合理，但正式产品应改为用户选择的作品工程目录。
- 后续优先级应转向向量检索、OpenAI Provider Adapter、复杂关系路径查询和多数据库快照一致性，而不是继续堆 UI。

### 2026-05-09 增量检查影响范围原型

变更范围：

- `spikes/tauri-minimal/src-tauri/src/lib.rs`
- `spikes/tauri-minimal/src/main.ts`
- `spikes/tauri-minimal/src/styles.css`
- `spikes/tauri-minimal/index.html`
- `spikes/tauri-minimal/README.md`

运行结果：

- 新增 Tauri command：`run_incremental_check_spike`。
- 命令打开 demo 项目数据库。
- 命令计算 `fact-lin-town` 的影响范围。
- 影响范围包含实体、事件、章节、事实和规则。
- 命令在 SQLite savepoint 内预览补丁。
- 预览补丁将 `fact-lin-town.valid_to_tick` 从 `1030` 调整到 `1010`。
- 修复前相关位置冲突：1 个。
- 修复后相关位置冲突：0 个。
- 剩余全局冲突：1 个，来自不相关的道具持有冲突。
- 命令执行后回滚 savepoint，不持久化补丁。
- 前端新增“运行增量检查预览”按钮和影响范围展示面板。
- `cargo test` 成功，3 个测试通过。
- `npm run build` 成功。
- `npm run tauri build -- --no-bundle` 成功。
- 接入增量检查命令后 release exe 体积：约 10.05 MB。

当前结论：

- 增量检查可以先以服务层影响范围计算实现，不需要马上引入专用图数据库。
- 预览式补丁适合一键修复授权流程：先计算和展示，再由用户确认是否应用。
- 后续需要把当前硬编码事实变更扩展为通用变更事件模型。

### 2026-05-09 项目快照与恢复原型

变更范围：

- `spikes/tauri-minimal/src-tauri/src/lib.rs`
- `spikes/tauri-minimal/src/main.ts`
- `spikes/tauri-minimal/src/styles.css`
- `spikes/tauri-minimal/index.html`
- `spikes/tauri-minimal/README.md`

运行结果：

- 新增 Tauri command：`run_snapshot_restore_spike`。
- 命令创建 SQLite 项目数据库文件快照。
- 当前快照路径：`%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\snapshots\demo-snapshot.project.db`。
- 命令故意破坏章节标题和一条事实。
- 破坏后章节标题从 `Arrival` 变为 `DAMAGED CHAPTER`。
- 破坏后冲突数量从 `2` 变为 `1`。
- 命令用快照覆盖数据库文件。
- 恢复后章节标题回到 `Arrival`。
- 恢复后冲突数量回到 `2`。
- `cargo test` 成功，4 个测试通过。
- `npm run build` 成功。
- `npm run tauri build -- --no-bundle` 成功。
- 接入快照恢复命令后 release exe 体积：约 10.07 MB。

当前结论：

- 单 SQLite 数据库文件可以通过文件复制实现最低成本项目快照。
- 恢复前必须关闭或释放数据库连接，并确保写入落盘。
- 正式产品如果采用多数据库组合，必须设计跨数据库一致性快照。

### 2026-05-08 SQLite 状态图谱原型

新增原型：

- `spikes/sqlite-state-graph/README.md`
- `spikes/sqlite-state-graph/schema.sql`
- `spikes/sqlite-state-graph/prototype.py`

运行结果：

- 成功创建本地 SQLite 数据库。
- FTS5 可用。
- 成功写入 Project、Chapter、Event、Entity、Fact、Graph Edge、Check Result、Snapshot、Vector Entry 的最小结构。
- 成功查询角色位置链。
- 成功查询道具持有链。
- 成功展示倒叙：叙事顺序晚于世界内时间。
- 成功产生两个 `error` 级冲突。
- 成功验证 `candidate` fact 不进入 confirmed 检查链。

当前结论：

- SQLite 可以承担内容库、检查结果、快照、FTS 和图模型回退方案。
- 专用图数据库仍需验证，尤其是复杂路径查询、Windows 打包和多数据库快照一致性。
- 时间域和不同流速目前只完成 schema 表达，尚未完成换算算法验证。

## 当前可复跑验证命令

在 `spikes/tauri-minimal` 下：

- `npm run build`
- `$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"; npm run tauri build -- --no-bundle`

在 `spikes/tauri-minimal/src-tauri` 下：

- `& "$env:USERPROFILE\.cargo\bin\cargo.exe" test`
- `& "$env:USERPROFILE\.cargo\bin\cargo.exe" fmt --check`

备注：

- 使用完整 `cargo.exe` 路径是为了规避当前 shell 的 `PATH` 不一定包含 Rust 工具链的问题。
- Tauri CLI 会通过 `PATH` 调用 `cargo metadata`，因此复跑 `npm run tauri build -- --no-bundle` 前需要先把 `%USERPROFILE%\.cargo\bin` 注入当前 shell 的 `PATH`。
- 当前 `--no-bundle` 可生成 exe；正式 installer bundling 仍受 WiX/NSIS 下载或缓存问题影响。

## 验收标准

- 能在 Windows 本地启动最小应用。
- 用户不需要手动安装数据库服务。
- 能保存章节正文和事件。
- 能执行至少三个图查询样例。
- 能执行一次向量语义检索样例。
- 能触发一次状态机冲突检查样例。
- 能创建并恢复一次作品快照样例。
- 技术选型结论记录到文档。

## 风险

- 嵌入式图数据库打包复杂。
- 向量库安装体积过大。
- 多数据库快照一致性复杂。
- Tauri 与数据库 native dependency 集成成本偏高。
- 安装包 bundler 依赖 GitHub 下载 WiX/NSIS，在当前网络环境下失败。

## 退出条件

当技术栈、数据层组合和状态机最小模型都有明确通过或回退结论时，本计划可以归档。

当前尚未满足退出条件：向量检索、OpenAI Provider Adapter、复杂关系路径查询、通用变更模型、专用图数据库打包和多数据库快照一致性仍未验证。
