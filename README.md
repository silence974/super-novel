# Super Novel

Super Novel 是一个本地优先的 Windows 纯文本小说写作应用。项目正文、工作草稿和不可变检查点都保存在用户选择的项目目录中；应用不需要本地 HTTP 服务，也不会把项目数据写入云端。

## 第一阶段功能

- 在空目录中创建项目，或打开已有的 Super Novel 项目。
- 创建卷和章节，并从目录树切换章节。
- 停止输入约 800ms 后自动保存工作草稿。
- 使用 `Ctrl+S` 手动创建检查点，并在持续编辑时定期创建检查点。
- 预览历史检查点，经明确确认后恢复；恢复操作自身也会留下可审计的检查点。
- 关闭项目后回到启动页，并可重新打开目录继续写作。

每个项目使用以下目录结构：

```text
project-directory/
  super-novel.toml
  .super-novel/
    project.db
```

请不要手工修改 manifest 或数据库。备份项目时，应完整复制用户选择的项目目录。

## 开发环境

需要 Windows、Rust 1.95 或更新版本、Node.js 24，以及 Tauri v2 的 Windows 构建依赖（Microsoft C++ Build Tools 和 WebView2）。

安装前端依赖：

```powershell
npm ci
```

启动桌面开发应用：

```powershell
npm run tauri dev
```

只启动浏览器前端预览：

```powershell
npm run dev
```

浏览器预览不能访问 Tauri 对话框或 Rust 后端，只适合检查界面。

## 验证

提交前运行：

```powershell
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm test -- --run
npm run typecheck
npm run build
```

Windows 安装流的人工验收步骤和最近一次结果记录在
[`docs/testing/windows-writing-core-smoke-test.md`](docs/testing/windows-writing-core-smoke-test.md)。

## 构建 Windows 安装包

```powershell
npm run tauri build -- --bundles nsis
```

构建成功后：

- Release 程序位于 `target/release/super-novel-desktop.exe`。
- 未签名 NSIS 安装包位于 `target/release/bundle/nsis/`。

安装器采用 current-user 模式，不应请求管理员权限。当前版本尚未进行代码签名，Windows 可能显示未知发布者提示；仅运行从可信源码自行构建或由可信渠道提供的安装包。

## 当前范围

第一阶段不包含 Markdown/富文本、AI 写作、云同步、多人协作、项目级分支或自动更新。数据库 schema 和项目格式仍处于首个交付切片；升级前请备份项目目录。
