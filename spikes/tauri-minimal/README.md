# Tauri Minimal Spike

## 2026-05-10 vector search addendum

- Added Tauri command: `run_vector_search_spike`.
- Added a derived SQLite `vector_entries` table in the Tauri spike schema.
- Verified a minimal local vector flow: rebuild index, preview one source-entry update inside a SQLite savepoint, query by cosine similarity, then roll back the preview update.
- The local deterministic keyword embedding is only a repeatable spike stand-in. It is not the final embedding model and does not validate production semantic recall quality.
- OpenAI embeddings, embedded vector database packaging, SQLite vector extensions, index growth, and false-positive recall risk remain open.

## 目的

验证 `Tauri v2 + Rust backend + WebView2` 是否适合作为 `super-novel` 的 Windows 桌面端基础。

该目录是隔离 spike，不是正式应用源码。

## 当前验证结果

- `npm install` 成功。
- `npm run build` 成功。
- `cargo check` 成功。
- `cargo test` 成功。
- `npm run tauri build -- --no-bundle` 成功。
- release exe 生成成功。
- 已接入 `rusqlite` 的 `bundled` 特性，在 Rust 后端用内存 SQLite 跑状态图谱验证。
- 已接入 Tauri command：`run_state_graph_spike`。
- 已接入 Tauri command：`run_project_database_spike`。
- 已接入 Tauri command：`run_incremental_check_spike`。
- 已接入 Tauri command：`run_snapshot_restore_spike`。
- 已验证本地项目数据库首次 seed 和二次复用。
- 已验证增量检查影响范围和预览式补丁回滚。
- 已验证项目数据库文件快照和恢复。
- 已将默认 greet 页面替换为状态图谱验证面板。
- `npm run tauri build` 的 MSI bundling 阶段失败，原因是下载 WiX 时连接被中止。
- `npm run tauri build -- --bundles nsis --no-sign` 的 NSIS bundling 阶段失败，原因是下载 NSIS 时超时。

## 已测体积

未接入 SQLite 前的 release 可执行文件：

```text
src-tauri/target/release/super-novel-tauri-spike.exe
约 8.58 MB
```

接入 `rusqlite bundled` 和状态图谱验证命令后的 release 可执行文件：

```text
src-tauri/target/release/super-novel-tauri-spike.exe
约 9.98 MB
```

接入本地项目数据库命令后的 release 可执行文件：

```text
src-tauri/target/release/super-novel-tauri-spike.exe
约 10.02 MB
```

接入增量检查影响范围命令后的 release 可执行文件：

```text
src-tauri/target/release/super-novel-tauri-spike.exe
约 10.05 MB
```

接入项目快照恢复命令后的 release 可执行文件：

```text
src-tauri/target/release/super-novel-tauri-spike.exe
约 10.07 MB
```

该体积仍只代表 spike，不包含正式编辑器、完整图谱、向量索引和真实 UI。

## 后端命令

### run_state_graph_spike

用途：

- 在 Rust 后端创建内存 SQLite 数据库。
- 创建最小事件、事实和检查结果 schema。
- 写入角色位置、道具持有、倒叙和候选事实样例。
- 检测两个 `error` 冲突。
- 返回前端可展示的报告。

验证内容：

- FTS5 可用性。
- `confirmed` 与 `candidate` 隔离。
- 位置链查询。
- 道具持有链查询。
- 世界内时间与叙事顺序分离。
- 检查结果写入。

### run_project_database_spike

用途：

- 在用户本地应用数据目录创建或打开 demo 项目数据库。
- 当前默认路径：

```text
%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\project.db
```

- 首次运行写入样例数据。
- 再次运行复用同一数据库。
- 每次运行会刷新 `check_results`，避免重复写入检查结果。

验证内容：

- 本地数据库目录自动创建。
- SQLite 文件可重复打开。
- 初始数据只 seed 一次。
- 检查结果可重复生成。
- 前端可展示数据库路径、是否持久化、是否本次 seed。

### run_incremental_check_spike

用途：

- 打开 demo 项目数据库。
- 计算 `fact-lin-town` 变更影响范围。
- 在 SQLite savepoint 内预览补丁。
- 补丁内容：将 `fact-lin-town.valid_to_tick` 从 `1030` 调整为 `1010`。
- 比较修复前后的相关冲突。
- 回滚 savepoint，不把补丁写入数据库。

验证内容：

- 受影响实体：角色和地点。
- 受影响事件：位置相关事件。
- 受影响章节：事件来源章节。
- 受影响事实：重叠位置事实。
- 受影响规则：`state.location.exclusive`。
- 修复前相关冲突为 1。
- 修复后相关冲突为 0。
- 全局仍保留不相关的道具持有冲突。

### run_snapshot_restore_spike

用途：

- 打开或创建 demo 项目数据库。
- 创建数据库文件快照。
- 故意破坏章节标题和一条事实。
- 验证破坏后的章节标题和冲突数量发生变化。
- 用快照覆盖项目数据库。
- 重新打开数据库并验证章节标题和冲突数量恢复。

当前快照路径：

```text
%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\snapshots\demo-snapshot.project.db
```

验证内容：

- 复制 SQLite 数据库文件可作为最低成本项目快照方案。
- 恢复后章节标题从 `DAMAGED CHAPTER` 回到 `Arrival`。
- 恢复后冲突数量从破坏后的 `1` 回到快照时的 `2`。
- 该方案目前只验证单数据库文件；多数据库组合时仍需额外一致性设计。

## 运行命令

```powershell
npm install
npm run build
cargo check --manifest-path .\src-tauri\Cargo.toml
cargo test --manifest-path .\src-tauri\Cargo.toml
npm run tauri build -- --no-bundle
```

如果 crates.io 下载超时，可以临时使用镜像运行 Cargo 命令，不建议把镜像配置写死到仓库：

```powershell
cargo --config "source.crates-io.replace-with='tuna'" --config "source.tuna.registry='sparse+https://mirrors.tuna.tsinghua.edu.cn/crates.io-index/'" check
```

## Bundler 阻塞

默认 `npm run tauri build` 会尝试生成 MSI，并下载 WiX 工具链。当前环境下载 WiX 失败：

```text
failed to bundle project `io: 你的主机中的软件中止了一个已建立的连接。 (os error 10053)`
```

改用 NSIS 后，当前环境下载 NSIS 失败：

```text
failed to bundle project `timeout: global`
```

下一步可以选择：

- 重试 MSI bundling。
- 重试 NSIS bundling。
- 预安装或缓存 WiX 工具链。
- 首期开发阶段使用 `--no-bundle` 验证 exe。

## 结论

Tauri 作为 Windows 桌面端基础可继续推进。`rusqlite bundled` 作为内嵌 SQLite 方案可继续验证；当前阻塞不是 Rust/Tauri 编译，而是安装包 bundler 外部下载。
