# PromptHub Knowledge Structure

`spec/knowledge/structure/` 对齐最新 `spec-init` 的 knowledge/structure 边界，用于沉淀 PromptHub 长期稳定的模块边界、系统结构、集成关系和数据边界。

## 系统结构

PromptHub 当前是一个多入口单仓库：

- `apps/desktop`：Electron 桌面应用
- `apps/web`：自部署 Web 版本
- `apps/cli`：CLI
- `packages/*`：共享核心能力、数据库层、共享类型与常量

## 桌面端结构

桌面端采用标准 Electron 分层：

- main process：原生文件系统、数据库、加密、IPC、平台分发、同步底层能力
- preload：安全桥接 API
- renderer：React UI、状态管理、页面交互、用户流程

## 长期真相源分层

PromptHub 当前把长期稳定真相拆成几层：

- `spec/workflow/*`：项目级推进入口
- `spec/knowledge/context/`：稳定背景与边界
- `spec/knowledge/structure/`：长期架构约束与设计说明
- `spec/knowledge/behavior/`：长期逻辑语义与行为规则
- `spec/knowledge/reference/`：固定资产、平台矩阵、canonical 文件约定

## 文档结构映射

按最新 `spec-init` 路由：

- `workflow/*`：当前推进中的项目交付面
- `knowledge/*`：长期稳定真相
- `changes/*`：单次变更工作区及生命周期
- `records/*`：issues / releases / adr / archive / rules

PromptHub 当前采用 topology 路由到 `spec/`，而不是默认的 `docs/`。

## 共享与边界原则

- [Skill / MCP / Plugin 公共资源架构](resource-library-architecture.md)：统一契约、领域多态、修改范围与验收；当前待实施。

- `packages/*` 承担跨 desktop / web / cli 共享的核心能力与类型
- desktop 和 web 可以共享语义，但不能混淆运行时边界
- main process 负责文件系统、数据库、加密和平台集成
- renderer / web route 层应尽量薄，把复杂流程下沉到 service / orchestrator

## 主要映射来源

- `spec/knowledge/structure/code-structure-guidelines.md`
- `spec/knowledge/behavior/desktop.md`
- `spec/knowledge/behavior/web.md`
- `spec/workflow/02-design/README.md`
