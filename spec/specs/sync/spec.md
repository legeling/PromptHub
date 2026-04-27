# Sync Spec

## Purpose

本规范定义 PromptHub 的稳定同步语义，包括 WebDAV、自部署 Web 作为同步/恢复目标、以及内部同步契约边界。

## Stable Requirements

### 1. Sync Contract

- 同步必须围绕可恢复的数据对象或稳定数据布局进行，而不是依赖临时 UI 状态。
- 不同同步后端可以不同，但用户可见的同步语义必须保持一致：连接验证、上传、下载、恢复、周期同步。

### 2. Desktop And Web Relationship

- 桌面端可以把自部署 Web 工作区作为备份与恢复目标。
- 面向用户的自部署说明在 `docs/web-self-hosted.md`，内部同步与布局事实在 `spec/`。

### 3. Stable Internal Sources

- Web 与数据布局演进的历史资料保存在 `spec/changes/legacy/docs-08-todo/`。
- 稳定数据布局事实见 `spec/architecture/data-layout-v0.5.5-zh.md`。

## Stable Scenarios

### Scenario: Contributor changes sync semantics

When sync semantics, backup format, or restore logic changes materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/sync/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: User needs deployment-level sync guidance

When a user asks how desktop and self-hosted web interact:

- the public operational guide remains in `docs/web-self-hosted.md`
- deeper contracts and change history remain in `spec/`
