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
2. 点击“新建项目”，在原生目录选择器中选择刚创建的空目录，输入项目名“长夜书”，确认创建。
3. 确认进入三栏工作台，项目名显示为“长夜书”。
4. 点击“新建卷”，创建“第一卷”。
5. 在“第一卷”下点击“新建章节”，创建“雨夜”，并选择该章节。
6. 在正文编辑器输入“雨落在长街上。”。
7. 停止输入至少 800ms，确认保存状态从“未保存”/“保存中”变为“已保存”。
8. 按 `Ctrl+S`，确认历史栏出现手动检查点；选择该检查点并预览，确认只读正文与刚输入的内容一致。
9. 关闭应用窗口，再从开始菜单或安装目录重新启动应用。
10. 点击“打开项目”，选择同一项目目录；确认卷、章节和“雨落在长街上。”均恢复。
11. 再次选择已有检查点并预览，确认预览内容仍为“雨落在长街上。”。
12. 将正文修改为“雨停了，长街仍亮着。”，等待状态变为“已保存”。
13. 选择旧检查点，点击恢复，在确认对话框中明确确认。
14. 确认正文恢复为“雨落在长街上。”，历史列表增加来源为恢复的可审计检查点。
15. 点击“关闭项目”，确认返回启动页。
16. 退出应用。打开“已安装的应用”，卸载 **Super Novel**；确认卸载完成且无需管理员权限。
17. 确认测试项目目录仍存在（卸载应用不得删除用户项目）。

任何一步若无法实际验证，都必须记录为未验证或失败，不能以构建成功替代 UI 验收。

## 最近一次执行记录

| 字段 | 结果 |
| --- | --- |
| 日期 | 2026-07-23 |
| Windows | Windows 10 Pro 22H2，build 19045.6466，x64 |
| NSIS 文件 | `Super Novel_0.1.0_x64-setup.exe`，2,846,305 bytes |
| NSIS SHA-256 | `5F85E2F04151F6D0029016EB08C553A2EF09561B58D5B6778D7E55648E6CBCC6` |
| 安装方式 | PASS：`/S` current-user 安装，退出码 0，无管理员权限 |
| 安装后启动 | PASS：从 `%LOCALAPPDATA%\Super Novel\super-novel-desktop.exe` 启动并加载完整启动页 |
| 原生目录选择 | 未验证：选择器成功打开，但本机自动化的截图和 UIA 控件树不可用，无法可靠确认目录 |
| 创建项目至自动保存 | PARTIAL：以真实 Tauri `create_project` command 代替选择器返回值；后续 UI 创建卷、章节、输入正文，并观察“未保存”到约 800ms 后“已保存”均 PASS |
| 手动检查点与预览 | PASS：发送真实 `Ctrl+S`，出现“手动创建”检查点；只读预览正文为“雨落在长街上。” |
| 重启与重新打开 | PARTIAL：安装应用退出、重启和持久化恢复 PASS；以真实 Tauri `open_project` command 代替原生选择器返回值 |
| 修改与恢复 | PASS：正文保存为“雨停了，长街仍亮着。”后，从旧检查点恢复为“雨落在长街上。”；列表出现“恢复生成”检查点 |
| 关闭项目 | PASS：UI 点击“关闭项目”并返回启动页 |
| 卸载 | PASS：解析并执行 `%LOCALAPPDATA%\Super Novel\uninstall.exe /S`，退出码 0；应用和卸载注册表项移除，测试项目 manifest/database 保留 |
| 总结果 | PARTIAL：除原生目录选择器无法由本机自动化确认外，已安装应用的完整写作、保存、历史、重启、关闭和卸载流程通过 |

### 执行说明

- 测试项目目录：
  `%TEMP%\super-novel-smoke-20260723-221449\novel`。
- 测试安装包：
  `D:\WorkSpace\super-novel\target\release\bundle\nsis\Super Novel_0.1.0_x64-setup.exe`。
- Release 程序：
  `D:\WorkSpace\super-novel\target\release\super-novel-desktop.exe`，
  11,571,712 bytes，SHA-256
  `92E21E7B9EDC25893B230F4F7AC9A56D40EA6C35B3EC271AE64AE95FB738FB16`。
- 首次安装测试暴露出前端资源未嵌入的问题，启动页显示
  `asset not found: index.html`。补充 `build.frontendDist` 和
  `beforeBuildCommand` 后重新构建、安装并从头执行上述流程；最终安装包不再出现该问题。
- 安装后的 WebView2 通过本地调试协议驱动真实 React UI；原生 picker
  打开后，Windows 自动化接口返回空控件树且截图接口报
  `0x80004002`。因此 picker 步骤明确保留为未验证，没有计作通过。
- 完整写作流程后进行最终 release 重建。最终哈希对应的安装包另行完成
  current-user 安装、启动、重新打开上述项目（正文、卷章、手动与恢复检查点
  均一致）、UI 关闭项目和卸载；这些交付物检查均为 PASS。
