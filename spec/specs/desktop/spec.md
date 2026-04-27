# Desktop Spec

## Purpose

本规范定义 PromptHub 桌面端的稳定产品与工程边界。

## Stable Requirements

### 1. Product Role

- `apps/desktop` 是 PromptHub 的本地优先桌面应用主入口。
- 桌面端负责本地数据管理、原生 OS 集成、加密/主密码能力、数据库索引、文件系统工作区与 IPC 能力。

### 2. Process Boundary

- 原生文件系统、数据库、加密、备份恢复、平台集成等能力必须位于主进程。
- 渲染进程通过 preload 暴露的 API 与主进程通信，不直接跨边界访问主进程能力。

### 3. Stable Internal Sources

- 长期工程边界和代码结构治理见 `spec/architecture/code-structure-guidelines.md`。
- 数据布局与迁移事实见 `spec/architecture/data-layout-v0.5.5-zh.md`。
- 历史 desktop 相关演进记录保存在 `spec/changes/legacy/docs-08-todo/`。

## Stable Scenarios

### Scenario: Contributor changes desktop runtime behavior

When a contributor changes desktop runtime behavior materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/desktop/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: User needs public desktop usage information

When a user needs installation or usage help:

- the public entry remains `README.md` and localized docs under `docs/`
- internal architecture and implementation history remain in `spec/`
