# Implementation: WebDAV Skill 备份可观测性

## Status

实现和本地验证已完成，等待维护者复核。当前 change 保持 active，直到提交、发布和真实 WebDAV 验收完成。

## Implemented

- WebDAV/S3 legacy 与 incremental 上传消息和 typed details 现在报告 Skill、Skill 版本和 Skill 文件数量。
- WebDAV/S3 手动备份成功、返回失败和抛错都复用现有脱敏同步历史，reason 为 `manual`。
- 同步历史 UI 改为同时描述手动备份与自动同步，7 个 locale 增加 manual 标签。
- 非当前 `syncProvider` 的 WebDAV/S3 自动运行、启动运行和保存时同步控件禁用；手动连接、备份和恢复保持可用。
- 稳定同步规范和 #79 本地状态已同步；远端 payload、路径、加密和恢复格式未改变。

## Planned Verification

- `TEST-SYNC-SKILL-001` legacy/incremental 上传结果断言 Skill、版本、文件数量，并确认 payload 仍携带对应数据。
- `TEST-SYNC-HISTORY-001` 同步历史接受、持久化和展示 `reason=manual`；WebDAV/S3 手动成功与失败写入正确状态。
- `TEST-SYNC-SOURCE-001` inactive WebDAV/S3 自动控件禁用，手动按钮可用；active provider 自动控件恢复可用。
- 聚焦 Vitest、desktop typecheck、lint、spec gate、changed verification。

## Verification Results

- 首轮聚焦服务/组件命令暴露 16 个组件失败：历史 mock 在 `restoreAllMocks` 后丢失返回值、测试漏导入 WebDAV mock、手动按钮用例缺少完整凭据，以及双记录使旧单元素断言失效。集中修正测试夹具后，3 个组件文件 34 tests passed。
- 相关服务验证：`database-backup`、`sync-backup-core`、`sync-history`、`periodic-auto-sync`、`app-background`、`webdav`、`s3-sync` 均通过；新增同步核心用例确认 legacy/incremental payload 都包含 Skill 元数据、版本和 2 个文件。
- 聚焦覆盖命令：5 files / 57 tests passed；历史文件整体覆盖为 79.88% statements、72.95% branches，本次新增的 Skill 计数、manual reason 和 active/inactive provider 条件均有直接回归。随后补齐 WebDAV success 与 S3 thrown-failure 对称路径，组件文件 17 tests passed。
- `pnpm typecheck`：passed。
- `pnpm lint`：passed，包含 file-size gate；最终新增测试另跑 targeted ESLint passed。
- `pnpm spec:test`：首次仅因新增 change 后索引过期失败；运行 `pnpm spec:index` 后重跑 passed，15 changes traceability passed。
- `pnpm verify:changed`：29 checks 中 28 passed；唯一失败为未触及的 CLI `workspace-sync` pull 测试在并发运行时耗时 15.734 秒，超过固定 15 秒阈值。随后单独运行同一测试 4.004 秒通过。8/8 Desktop unit shards、Web、Worker、Mobile、shared/core/db 均通过。
- `git diff --check`：passed。

## Remaining Boundary

自动化测试不证明第三方 WebDAV 服务的真实写入；发布前仍需用真实服务器检查
`prompthub-backup/data.json` 中的 `skills`、`skillVersions` 和 `skillFiles`。

本轮没有运行 Electron/真实 WebDAV GUI 验收，也没有提交、推送或发布。
