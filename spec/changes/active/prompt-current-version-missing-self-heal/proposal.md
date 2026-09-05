# Proposal: Prompt `current_version` startup self-heal

## Phase And Status

- Phase: implement
- Status: active
- Primary requirement: `FR-PCVMISS-001`
- Problem: 首次发布 canonical storage authority 时，`validateVersionSet` 发现某个
  prompt 的 `current_version` 在 `prompt_versions` 中无对应行即抛错，
  “Failed to initialize app: Prompt resource current version is missing”，
  数据库因此无法启动（`C:\Users\90438\AppData\Roaming\PromptHub\data\prompthub.db`）。
- Delivery flow: 修复分支实现 + 单元测试 + 用户本机确认后再提交/提 PR。

## Why

Prompt 版本链不变量为 `max(prompt_versions.version) == prompts.current_version > 0`，
且该版本行必须存在。版本行被删/指针陈旧/从未写入等异常会造成 canonical storage
校验阶段硬失败并阻止整个应用启动。既有 db 迁移
（`fix_prompt_current_version_v1` / `repair_empty_prompt_version_chain_v1`）只在
迁移首次运行时执行一次，已标记的数据库后续即便数据再次不一致也不会重跑，
于是启动路径没有兜底。

## Scope

- In scope:
  - 新增幂等的 db 层修复器，逐 prompt 收敛 `current_version`：
    - 有版本行 → 收敛到 `MAX(version)`；
    - 无版本行 → 由 prompt 当前内容补一条 v1 快照并把 `current_version` 置 1；
  - canonical authority 首次发布前（`prepareSourceDatabase` 后）对源库执行该修复；
  - 仅针对真实 SQLite 镜像（非 SQLite 内容跳过），不影响 recovery/其它流程；
  - 单元测试覆盖收敛、补 v1、健康数据不触碰、幂等。
- Out of scope:
  - 修改 core `validateVersionSet` / canonical 图装配（保持纯校验 / 物化语义不变）；
  - 修改 Skill / MCP / Plugin 版本语义；
  - 不改变用户数据内容，只修正版本指针（无版本链时补一条基于当前内容的快照）。

## Exit conditions

- `FR-PCVMISS-001`：存在 prompt current_version 缺失的源库经一次 startup 后能通过
  canonical 校验并正常发布。
- `FR-PCVMISS-002`：修复幂等且只修改版本指针/补齐缺失 v1，不触碰其它 prompt 字段。
- 修复器与启动接线单测 + `pnpm typecheck` 通过；用户本机用真实坏库确认后按流程提 PR。

## Rollback

- 纯启动期、幂等的 DB 收敛，无 schema 变更；`prompts.current_version` 会被改写为
  既有版本历史，补入的 v1 基于字段原样。回退到 main 即撤销接线；重新同步版本链即可。
