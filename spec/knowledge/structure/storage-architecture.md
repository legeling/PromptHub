# Storage architecture

产品：Shared。此页统一路由各产品的存储设计，取代已废弃的“所有资源文件优先、SQLite 可丢弃重建”说明。

## Current authority

[Foundation requirements](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants) 是已确认的数据所有权合同：SQLite 负责结构化业务记录、关系、版本元数据和设置；文件系统负责真实包文件、附件和历史文件内容。两者不能相互复制成第二份可写真源。

Foundation 的根所有权、命令原子性、迁移和恢复验收仍有未完成工作，见其 [实施计划](../../changes/active/foundation-integrity-redesign/tasks.md) 和 [存储清单](../../changes/active/foundation-integrity-redesign/storage-inventory.md)。文档合并不代表迁移完成；不得删除旧库、旧文件或恢复材料来满足新结构。

## Product boundaries

| Product | Owner and current topic |
| --- | --- |
| Desktop / CLI | 本机根由 `packages/core/src/runtime-paths.ts` 和 runtime storage context 解析；二者复用 Core/DB，遵循 [并发与根所有权](../behavior/database-concurrency.md) |
| Web | 按认证用户隔离，服务端 auth 与业务表由服务端所有；见 [Web](../behavior/web.md) |
| Cloudflare | 使用 Worker 自身存储绑定和迁移，不把桌面目录视作 D1/R2 布局；见 [Cloudflare](../behavior/cloudflare.md) |
| Mobile | 移动端数据库、设备文件及导入导出边界见 [Mobile](../behavior/mobile.md) |

## Domain design owners

| Domain | Authoritative topic |
| --- | --- |
| Prompt、Folder、版本和关系 | [Prompt workspace](../behavior/prompt-workspace.md) |
| Skill、包文件和版本 | [Skills](../behavior/skills.md) |
| Rules 与外部文件投影 | [Rules workspace](../behavior/rules-workspace.md) |
| Plugin 与子资产 | [Plugins](../behavior/plugins.md) |
| MCP 版本、配置及投影冲突 | [MCP requirements](../../changes/active/mcp-version-history-and-projection-safety/specs/mcp/spec.md) |
| 同步、备份和恢复 | [Sync](../behavior/sync.md)、[Data recovery](../behavior/data-recovery.md) |
| 应用设置 | [Settings authority](../../changes/active/desktop-settings-authority-convergence/specs/desktop-settings/spec.md) |

各主题维护本领域当前结构、转换进度和测试证据。本页不再复制随迁移变化的目录树或各产品 schema；修改路径必须遵循 runtime path helper，修改持久化必须遵循 [存储演进规则](../../rules/storage-evolution-rules.md)。

## Retired design

[原文件优先设计](../../archive/designs/2026-10-21-file-first-storage.md) 保留旧布局、方案及当时验证记录，仅供迁移追溯；不能用于证明当前数据库可重建或当前升级已通过。恢复必须使用版本匹配的数据库和引用文件，不能把旧设计当作回滚命令。
