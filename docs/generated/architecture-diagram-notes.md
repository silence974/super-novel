# Architecture Diagram Notes

## 目的

记录生成架构图的使用方式、图中模块解释和文字版校准。

## 图片位置

- `docs/generated/architecture-diagram.png`

## 事实源

架构图是辅助表达。若图中文字或边界与文档冲突，以 `ARCHITECTURE.md` 为准。

## 图中主要层级

- Windows 桌面端 / 作品控制台 / 分栏工作台。
- Agent 编排层。
- 核心领域服务。
- 本地数据层。
- OpenAI API Adapter。

## 已知限制

AI 生成图片可能存在局部文字不够精确的问题。后续正式产品文档中建议使用 Mermaid、Excalidraw 或代码生成图重绘。
