# Data Recovery Spec

## Purpose

本规范定义 PromptHub 数据恢复、预升级备份、目录迁移与恢复安全边界的稳定真相源。

## Stable Requirements

### 1. Recovery Safety

- 高风险的数据恢复、目录迁移和升级路径必须优先保证数据不丢失。
- 用户文件状态会被改变的动作必须以可理解方式提示用户，而不是静默进行。

### 2. Pre-Change Safety Net

- 在高风险布局迁移或升级前，应具备保险快照、预备份或等价的可回滚手段。
- 恢复或迁移失败后，不应把用户留在半恢复或半迁移状态。

### 3. Stable Internal Sources

- 目录迁移与数据布局事实见 `spec/architecture/data-layout-v0.5.5-zh.md`。
- 历史恢复/迁移计划和事故收敛记录保存在 `spec/changes/legacy/docs-08-todo/`。

## Stable Scenarios

### Scenario: Contributor changes recovery behavior

When backup, restore, migration, or recovery behavior changes materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/data-recovery/spec.md`
- they sync durable recovery guarantees back into this stable spec after implementation

### Scenario: User encounters upgrade-risking data operations

When the app is about to perform risky data operations:

- the system should prioritize recoverability and user awareness over silent convenience
