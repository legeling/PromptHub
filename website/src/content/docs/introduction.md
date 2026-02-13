---
title: 项目概览
---

# PromptHub

开源免费的 AI Prompt 与 Skill 管理工具。管理你的 Prompt 和 SKILL.md 技能，一键安装到 Claude Code、Cursor、Windsurf、Codex 等 12+ 主流 AI 编程工具。

## 核心特性

### 🧩 Skill 技能管理（v0.4.0 新增）

内建 20+ 精选 AI 代理技能，支持一键安装到 12+ 平台。本地扫描发现已有 SKILL.md，支持 Symlink/复制模式、AI 翻译、标签筛选。

### 本地优先

所有数据存储在本地 SQLite 数据库，无需联网即可使用。你的提示词永远不会被上传到任何服务器。

### 专业编辑

支持 Markdown 语法高亮的专业编辑器，内置变量模板系统，让 Prompt 像函数一样可复用。

### 版本控制

每次保存自动创建版本快照，支持版本对比（Diff）和一键回滚，像管理代码一样管理你的 Prompt。

### 多模型测试

一键对比国内外主流大语言模型的回复质量，快速找到最佳 Prompt。

### 即时搜索

基于 SQLite FTS5 的全文搜索，支持按标题、内容、标签毫秒级定位任意 Prompt。

### 灵活导出

支持导出为 JSON、YAML、CSV 格式，轻松集成到你的工作流或代码库中。

## 界面预览

![主界面](/imgs/1-index.png)

## 技术栈

- **运行时**: Electron 33
- **前端**: React 18 + TypeScript
- **样式**: Tailwind CSS
- **数据库**: SQLite (better-sqlite3)
- **状态管理**: Zustand

## 系统要求

| 平台    | 最低版本                 |
| ------- | ------------------------ |
| macOS   | 10.15 Catalina           |
| Windows | Windows 10               |
| Linux   | Ubuntu 18.04 / Debian 10 |

## 开源协议

PromptHub 采用 [AGPL-3.0](https://github.com/legeling/PromptHub/blob/main/LICENSE) 开源协议。

## 参与贡献

我们欢迎任何形式的贡献：

- 🐛 [报告 Bug](https://github.com/legeling/PromptHub/issues/new?template=bug_report.md)
- 💡 [提交功能建议](https://github.com/legeling/PromptHub/issues/new?template=feature_request.md)
- 🔧 [提交 Pull Request](https://github.com/legeling/PromptHub/pulls)
- 🌍 帮助翻译

## 下一步

- [快速开始](/docs/quick-start) - 5 分钟上手指南
- [核心功能](/docs/features) - 详细功能介绍
- [更新日志](/docs/changelog) - 查看最新变更
