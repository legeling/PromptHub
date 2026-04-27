# Web Spec

## Purpose

本规范定义 PromptHub Web / self-hosted 方向的稳定产品与工程边界。

## Stable Requirements

### 1. Product Role

- `apps/web` 的目标是可自部署网页版 PromptHub，而不只是纯 API helper。
- Web 版本应支持浏览器访问、认证、核心 Prompt/Folder/Skill 管理，以及作为 desktop 的同步目标。

### 2. Documentation Ownership

- 面向部署者的公开说明放在 `docs/web-self-hosted.md`。
- 更细的内部设计、布局迁移、REST API 规划与实施任务放在 `spec/`。

### 3. Stable Internal Sources

- Web 的架构与数据布局参考 `spec/architecture/data-layout-v0.5.5-zh.md`。
- Web 的长期实施规划与布局迁移历史保存在 `spec/changes/legacy/docs-08-todo/`。

## Stable Scenarios

### Scenario: Contributor updates web architecture

When a contributor changes web data layout, sync semantics, or deployment model:

- they update an active change under `spec/changes/active/`
- they encode behavioral delta in `specs/web/spec.md` inside that change
- they sync long-lived truth back into `spec/specs/web/spec.md` and `spec/architecture/`

### Scenario: User wants self-hosting help

When a user needs deployment instructions:

- the public entry remains `docs/web-self-hosted.md`
- internal planning and migration detail stays in `spec/`
