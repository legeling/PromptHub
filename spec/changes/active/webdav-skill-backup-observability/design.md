# Design: WebDAV Skill 备份可观测性

## 调用链与根因

`DataSettings -> useDataSyncController -> backup-orchestrator -> webdav/s3 -> sync-backup-core -> exportDatabase`

- `exportDatabase()` 已通过 `collectSkillData()` 收集 `skills`、`skillVersions` 和 `skillFiles`。
- `buildIncrementalCoreData()` 已把这些字段写入远端 `data.json`。
- 根因一：`SyncResult.message/details` 只统计 Prompt 与媒体，遗漏已经上传的 Skill 数据。
- 根因二：手动 handler 只显示 toast，不调用同步历史记录服务。
- 根因三：调度器要求 `syncProvider` 匹配，但设置控件只检查 provider 是否启用。

## Design Mapping

- `DES-SYNC-SKILL-001` 在 `sync-backup-core` 从同一 `DatabaseBackup` 计算 Skill、版本、文件数量，供 legacy/incremental 成功消息和 typed details 使用；不重复读取文件。
- `DES-SYNC-HISTORY-001` 扩展既有 `AutoSyncReason` 为 `manual`，复用同一个脱敏、20 条上限和 JSONL 追加逻辑；手动 WebDAV/S3 handler 在返回结果或抛错时记录结果。
- `DES-SYNC-SOURCE-001` WebDAV/S3 自动控件的 disabled 条件同时要求 provider enabled 与当前 `syncProvider` 匹配；手动按钮不增加该限制。

## 复杂度与资源

- Skill 文件计数对已在内存中的 `skillFiles` 做一次 O(n) 汇总，不新增网络、磁盘或常驻状态。
- 每次手动操作新增一次已有 settings 写入和一次有界 JSONL 追加；无重试、无新进程和端口。
- 控件禁用是纯 UI 派生状态，O(1)。

## 安全与兼容

- 历史服务继续清除 URL/邮箱并限制 500 字符，不记录配置或 payload。
- 不把 Skill 内容写入 toast/history，只写数量。
- 远端格式不变，因此旧客户端仍可读取现有备份。

