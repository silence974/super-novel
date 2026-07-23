# Windows writing core smoke test

本文用于验收已安装的 Super Novel Windows 应用。测试必须针对 NSIS 安装后的程序完成，而不是浏览器预览或开发服务器。

## 前置条件

1. 记录 Windows 版本、日期和待测 NSIS 文件名。
2. 在当前用户可写位置创建一个全新的空目录，例如
   `%TEMP%\super-novel-smoke\<timestamp>\novel`。
3. 确认目录中不存在 `super-novel.toml` 或 `.super-novel`。
4. 使用 current-user 模式安装。安装和卸载均不得请求管理员权限。

## 完整 UI 流程

1. 启动安装后的 **Super Novel**。
2. 在“项目名称”中输入“长夜书”，点击“选择目录并创建”，再在原生目录选择器中选择刚创建的空目录。
3. 确认进入三栏工作台，项目名显示为“长夜书”。
4. 点击“新建卷”，创建“第一卷”。
5. 在“第一卷”下点击“新建章节”，创建“雨夜”，并选择该章节。
6. 在正文编辑器输入“雨落在长街上。”。
7. 停止输入至少 800ms，确认保存状态从“未保存”/“保存中”变为“已保存”。
8. 按 `Ctrl+S`，确认历史栏出现手动检查点；选择该检查点并预览，确认只读正文与刚输入的内容一致。
9. 关闭应用窗口，再从开始菜单或安装目录重新启动应用。
10. 点击“打开已有项目”，选择同一项目目录；确认卷、章节和“雨落在长街上。”均恢复。
11. 再次选择已有检查点并预览，确认预览内容仍为“雨落在长街上。”。
12. 将正文修改为“雨停了，长街仍亮着。”，等待状态变为“已保存”。
13. 选择旧检查点，点击恢复，在确认对话框中明确确认。
14. 确认正文恢复为“雨落在长街上。”，历史列表增加来源为恢复的可审计检查点。
15. 点击“关闭项目”，确认返回启动页。
16. 退出应用。打开“已安装的应用”，卸载 **Super Novel**；确认卸载完成且无需管理员权限。
17. 确认测试项目目录仍存在（卸载应用不得删除用户项目）。

任何一步若无法实际验证，都必须记录为未验证或失败，不能以构建成功替代 UI 验收。

### 扩展回归路径

最终交付包还必须覆盖：

1. 在 800ms 自动保存防抖结束前输入正文并立即触发原生窗口关闭；重启后正文不得丢失，历史中应有 `project_close` 检查点。
2. 创建并切换多个章节；重启后应自动恢复最后打开的章节。
3. 创建一个空的第二卷，再使用该卷的“新建章节”按钮创建首章；章节必须归属第二卷并自动选中。
4. 在启动页检查最近项目的显示、直接打开和移除；移除记录不得删除项目目录。

## 最近一次执行记录

| 字段 | 结果 |
| --- | --- |
| 日期 | 2026-07-23 |
| Windows | Windows 10 Pro 22H2，build 19045.6466，x64 |
| 测试 HEAD | `abb15c20026dc36fbe1662c0d58da49c4b093230` |
| NSIS 文件 | `Super Novel_0.1.0_x64-setup.exe`，2,843,574 bytes |
| NSIS SHA-256 | `7EA9B419476ADA29D766C3806AAA6564E46C0565B5A97121D1271FC16CE7F892` |
| 安装方式 | PASS：`/S` current-user 静默安装，退出码 0，无管理员权限；图形安装向导未单独执行 |
| 安装后启动 | PASS：从 `%LOCALAPPDATA%\Super Novel\super-novel-desktop.exe` 启动并加载完整启动页 |
| 原生目录选择 | 未验证：本机 Windows 捕获/UIA 对 picker 仍不可用；创建项目以安装版 WebView 中的 typed Tauri `create_project` fallback 完成，未计作 picker PASS |
| 创建/打开基本流程 | PARTIAL：typed Tauri fallback 创建项目成功；启动页“最近项目”按钮真实 UI 打开同一项目成功。原生 picker 创建/打开未自动化 |
| 防抖内原生关闭 | PASS（等价原生关闭手势）：正文状态仍为“未保存”时，在输入后 0ms 发送 OS `Alt+F4`，触发 Tauri `CloseRequested`；进程安全退出。未使用鼠标点击标题栏 X |
| 关窗后恢复 | PASS：重启后从最近项目打开，自动恢复“关窗前立即输入，不能丢。”、修订 1；历史包含 `project_close` 和 `chapter_switch` |
| 多章与 last-opened | PASS：在“开篇”“转折”“归途”间切换，关闭前最终选择“归途”；重开后编辑器自动恢复“归途”，workspace 的 `lastOpenedChapterId` 与其 ID 一致 |
| 空第二卷首章 | PASS：先创建空“第二卷”，再通过“在第二卷中新建章节”按钮创建“归途”；该章位于第二卷并自动选中 |
| 最近项目 | PARTIAL：因创建流程使用 fallback，先直接写入一条同格式 localStorage fixture；随后真实 UI 显示、点击打开、更新时间和点击移除均 PASS，移除后项目 manifest/database 仍保留 |
| 关闭项目 | PASS：真实 UI 点击“关闭项目”返回启动页 |
| 卸载 | PASS：解析并执行 `%LOCALAPPDATA%\Super Novel\uninstall.exe /S`，退出码 0；应用和卸载注册表项移除，测试项目 manifest/database 保留 |
| 总结果 | PARTIAL：最终安装包的快速关窗、草稿/检查点恢复、多章恢复、空卷首章、最近项目 UI 和卸载均通过；原生 picker、鼠标点击标题栏 X、图形安装向导未自动化 |

### 执行说明

- 测试项目目录：
  `%TEMP%\super-novel-final-smoke-20260723-234614\novel`。
- 测试安装包：
  `D:\WorkSpace\super-novel\target\release\bundle\nsis\Super Novel_0.1.0_x64-setup.exe`。
- Release 程序：
  `D:\WorkSpace\super-novel\target\release\super-novel-desktop.exe`，
  11,558,912 bytes，SHA-256
  `1B3D4DCB0950641D4DD409E0308584053CB0D0AC26BDBF8B6D15C9807F49A53E`。
- 安装版 WebView2 通过本地调试协议驱动真实 React UI；卷章创建、章节
  切换、输入、最近项目打开/移除和应用内关闭均是真实 UI 事件。
- 原生 picker 仍受本机 `0x80004002` 捕获错误和空 UIA 控件树限制。
  创建项目使用安装版 Tauri command fallback；最近项目 fixture 也因该
  fallback 不会经过 `rememberProject` 而直接写入 localStorage。两者均明确
  标为 PARTIAL。
- 快速关窗使用 OS `Alt+F4`，它触发与标题栏 X 相同的 Tauri
  `CloseRequested` 处理链，但不宣称实际点击了 X。输入事件时间与关闭手势
  发出时间相同（0ms 间隔），页面当时显示“未保存”；重开后的正文和
  `project_close` 检查点证明安全关闭链完成。
