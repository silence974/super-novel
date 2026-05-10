# Technology Decisions

## 目的

记录技术选型、候选方案、验证结论和回退策略。

## 决策状态说明

- `proposed`：建议方案，尚未验证。
- `spiking`：正在验证。
- `accepted`：已接受。
- `rejected`：已拒绝。
- `superseded`：被新决策替代。

## TD-001 桌面技术栈

状态：`spiking`（最小 Tauri/Rust/SQLite/exe 链路已验证，正在继续验证分发与多数据层边界；installer bundling 仍未解决，暂不 accepted）

首选：`Tauri v2 + Rust backend + WebView2`

原因：

- Windows 原生体验较好。
- 安装包体积优于 Electron。
- Rust 后端适合托管本地数据库、索引和文件导出。
- 前端技术栈利于构建复杂分栏工作台。

备选：`.NET/WinUI`

风险：

- Tauri 与多数据库绑定的打包复杂度需要验证。
- WebView2 依赖策略需要验证。

本地验证记录：

- 2026-05-08：已通过官方 rustup 安装 stable MSVC Rust 工具链。
- 2026-05-08：`rustc 1.95.0`、`cargo 1.95.0` 验证可用。
- 2026-05-08：已新增 `spikes/tauri-minimal/`，使用 `create-tauri-app` 创建 Tauri v2 + vanilla-ts 最小应用。
- 2026-05-08：`npm install` 成功。
- 2026-05-08：`npm run build` 成功，前端产物 gzip 后约 0.59 KB JS、0.65 KB CSS。
- 2026-05-08：`cargo check` 成功，首次编译约 12 分钟。
- 2026-05-08：`npm run tauri build -- --no-bundle` 成功，release exe 约 8.58 MB。
- 2026-05-08：MSI bundling 下载 WiX 失败，错误为连接中止。
- 2026-05-08：NSIS bundling 下载 NSIS 失败，错误为全局超时。
- 2026-05-09：已将 SQLite state-graph spike 接入 Tauri Rust 后端命令 `run_state_graph_spike`。
- 2026-05-09：已添加 `rusqlite 0.39.0`，启用 `bundled` 特性，避免用户额外安装 SQLite。
- 2026-05-09：`cargo test` 通过，验证返回 2 个冲突、1 个候选事实、FTS5 可用。
- 2026-05-09：接入 `rusqlite bundled` 后 release exe 约 9.98 MB。
- 2026-05-09：新增 `run_project_database_spike`，可在 `%LOCALAPPDATA%\super-novel-tauri-spike\projects\demo-work\project.db` 创建或打开本地项目数据库。
- 2026-05-09：新增持久化测试，验证首次 seed、二次复用、检查结果刷新。
- 2026-05-09：接入本地项目数据库命令后 release exe 约 10.02 MB。
- 2026-05-09：新增 `run_incremental_check_spike`，验证增量检查影响范围和预览式补丁回滚。
- 2026-05-09：增量检查测试通过，验证修复前相关冲突 1 个、修复后相关冲突 0 个、全局仍剩不相关冲突 1 个。
- 2026-05-09：接入增量检查命令后 release exe 约 10.05 MB。
- 2026-05-09：新增 `run_snapshot_restore_spike`，验证 SQLite 项目数据库文件快照和恢复。
- 2026-05-09：快照恢复测试通过，验证章节标题和冲突数量可恢复到快照状态。
- 2026-05-09：接入快照恢复命令后 release exe 约 10.07 MB。
- 2026-05-10：使用 rustup 管理的 stable MSVC 工具链复跑验证，`rustc 1.95.0`、`cargo 1.95.0` 可用。
- 2026-05-10：`cargo test` 通过，4 个测试全过。
- 2026-05-10：`cargo fmt --check` 通过。
- 2026-05-10：确保 `cargo` 在 `PATH` 后，`npm run tauri build -- --no-bundle` 通过，release exe 约 10.32 MiB。

当前结论：

- TD-001 已不再是纯 `proposed`：当前已有可复跑的 Tauri/Rust/SQLite/exe spike 结果支撑继续推进。
- Tauri v2 作为 Windows 桌面端基础可继续推进。
- Rust 后端可以承载本地 SQLite 状态图谱服务。
- `rusqlite bundled` 对最小 exe 体积增加约 1.4 MB，当前可接受。
- 本地项目数据库文件方案可继续推进；后续需要把 demo 路径替换为用户选择的作品工程路径。
- 增量检查可先用“变更事实 -> 影响范围 -> 规则子集 -> 预览补丁 -> 回滚/应用”的服务层流程实现。
- 单 SQLite 数据库文件可以用文件复制实现最低成本快照；多数据库组合时必须重新验证一致性。
- 当前阻塞不是 Rust/Tauri 编译链，而是安装包 bundler 外部二进制下载。
- 首期开发阶段可在注入 Rust 工具链路径后使用 `--no-bundle` 验证 exe；正式分发前需要解决 WiX/NSIS 工具链缓存或预安装。
- Rust 工具链本机路径不是项目事实；复跑验证时只要求 rustup 管理的 stable MSVC 工具链可用，且 `cargo` 能被 Tauri CLI 从 `PATH` 解析到。

## TD-002 数据层组合

状态：`spiking`

建议：

- `SQLite` 负责项目元数据、章节正文、快照、检查结果和 FTS。
- 嵌入式图数据库或图查询服务负责复杂图查询。
- 嵌入式向量库负责语义检索。

风险：

- 多数据库快照一致性。
- 图数据库 Windows 打包体积。
- 向量库索引重建成本。

本地验证记录：

- 2026-05-08：已新增 `spikes/sqlite-state-graph/`，用 uv 管理的 Python 环境和标准库 `sqlite3` 验证 SQLite 原型 schema。
- 验证结果：可创建 Project、Chapter、Event、Entity、Fact、Graph Edge、Check Result、Snapshot、Vector Entry 的最小结构。
- 验证结果：uv 管理的 Python 环境中，标准库 `sqlite3` 支持 FTS5。
- 2026-05-09：Tauri Rust 后端已用 `rusqlite bundled` 复现内存 SQLite 状态图谱验证。
- 2026-05-09：Tauri 前端已可通过 `invoke("run_state_graph_spike")` 获取状态图谱报告。
- 2026-05-09：Tauri 前端已可通过 `invoke("run_project_database_spike")` 创建或打开本地项目数据库。
- 2026-05-09：Tauri 前端已可通过 `invoke("run_incremental_check_spike")` 获取影响范围和补丁预览结果。
- 2026-05-09：Tauri 前端已可通过 `invoke("run_snapshot_restore_spike")` 验证项目快照与恢复。
- 结论：SQLite 可作为作品内容、检查结果、快照和回退图模型的首个验证基座。

## TD-003 图查询实现

状态：`spiking`

候选：

- 嵌入式图数据库。
- `SQLite` 自建节点边表 + 图查询服务。
- 应用内图索引缓存。

验收标准：

- 可查询角色某时间点位置。
- 可查询道具持有链。
- 可查询关系变化路径。
- 可在本地应用中无感部署。

本地验证记录：

- 2026-05-08：`spikes/sqlite-state-graph/prototype.py` 已验证节点边表和事实表的最小模型。
- 已验证查询：角色位置链、道具持有链、世界内时间与叙事顺序分离。
- 已验证检查：同一角色重叠地点冲突、同一道具重叠持有者冲突。
- 已验证隔离：`candidate` fact 不进入 confirmed 检查链。
- 已验证流程：最小增量影响范围流程已在 `spikes/tauri-minimal` 中通过“变更事实 -> 影响范围 -> 规则子集 -> 预览补丁 -> 回滚”验证。
- 该验证只覆盖最小影响范围闭环，不代表复杂关系路径查询或通用变更模型已经完成。
- 尚未验证：复杂关系路径查询、通用变更模型、专用嵌入式图数据库打包。

## TD-004 向量检索

状态：`spiking`

候选：

- 嵌入式向量库。
- SQLite 扩展或轻量向量索引。
- OpenAI embedding API + 本地索引。

约束：

- 向量结果不是正式事实源。
- 索引必须可重建。

本地验证记录：

- 2026-05-10：`spikes/tauri-minimal` 新增 Tauri command `run_vector_search_spike`。
- 2026-05-10：已在 SQLite 中创建 `vector_entries` 派生索引表，写入章节、事件、实体和 confirmed fact 的最小向量条目。
- 2026-05-10：已用本地 deterministic keyword embedding 验证索引重建、savepoint 内单条 source 更新预览和余弦相似度查询。
- 2026-05-10：`cargo test` 通过，新增测试覆盖向量条目写入、更新和查询；`npm run build` 通过，前端验证台可触发向量检索 spike。
- 2026-05-10：`npm run tauri build -- --no-bundle` 通过，接入向量检索命令后 release exe 约 10.43 MiB。

当前结论：

- 最小“写入 -> 更新预览 -> 查询”向量索引流程已验证，可作为首期回退方案的形状参考。
- 当前 embedding 只是可复刻的本地 spike 实现，不代表正式语义召回质量。
- OpenAI embedding API、嵌入式向量库、SQLite 向量扩展、索引体积增长和召回误命中风险仍未验证。

## TD-005 AI Provider

状态：`proposed`

首期：OpenAI API。

要求：

- 通过 Provider Adapter 调用。
- 支持 `api_key` 配置。
- 不把 OpenAI SDK 调用散落到业务层。

## 参考资料

- `docs/references/openai-api-llms.txt`
- `docs/references/windows-desktop-stack-llms.txt`
- `docs/references/embedded-graph-db-llms.txt`
- `docs/references/vector-search-llms.txt`
