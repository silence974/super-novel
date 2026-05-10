# Agent Orchestration

## 目的

定义人工掌控式 AI Agent 编排，确保 AI 能辅助生成、抽取、检查和修复，但不能绕过用户确认。

## 编排原则

- 用户手动触发每一步。
- 每个 Agent 有明确输入、输出和影响范围。
- AI 输出默认是候选。
- 写入正式事实库前必须确认。
- 修复必须生成补丁并由用户授权。
- Provider 可替换，业务逻辑不绑定 OpenAI SDK。

## Agent 类型

### Outline Agent

职责：

- 根据用户需求生成作品大纲。
- 根据世界观和已有事件生成分章大纲。
- 输出不得直接覆盖用户内容。

### Writing Agent

职责：

- 生成正文。
- 润色正文。
- 重写正文。
- 根据指定章节、事件和设定上下文工作。

### Fact Extraction Agent

职责：

- 从正文、大纲或设定文本中抽取候选事实。
- 标注来源文本范围。
- 标注涉及实体和关系。
- 等待用户确认。

### Conflict Check Agent

职责：

- 解释检查结果。
- 辅助生成检查摘要。
- 不替代确定性检查服务。

### Repair Patch Agent

职责：

- 根据冲突生成修复补丁。
- 按类型拆分补丁。
- 说明风险和影响范围。

## Provider Adapter

首期实现：OpenAI API。

接口建议：

- `generate_outline(input)`
- `generate_chapter_plan(input)`
- `generate_text(input)`
- `rewrite_text(input)`
- `extract_candidate_facts(input)`
- `generate_repair_patch(input)`
- `embed_text(input)`

## 上下文策略

- 不默认发送整个作品。
- 按任务裁剪章节、事件、设定和图谱摘要。
- 向用户展示大致上下文范围。
- 模型响应必须保留任务 ID 和来源引用。

## 失败处理

- API 调用失败：保留用户输入，不产生状态变更。
- 解析失败：保留原始响应为候选草稿，不入库。
- 候选事实冲突：进入检查结果，不自动修复。
- 补丁应用失败：回滚本次补丁并提示重新检查。
