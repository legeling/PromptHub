# Tasks: WebDAV Skill 备份可观测性

- [x] `T-SYNC-001` 复核 #79、截图、稳定同步/Skill 规范和当前调用链。
- [x] `T-SYNC-002` 建立 `FR -> DES -> TEST -> T` 追踪与实现前分析门禁。
- [x] `T-SYNC-003` 为上传 Skill 数量、manual 历史和 inactive provider 控件补失败优先测试。
- [x] `T-SYNC-004` 实现 typed Skill 上传摘要、manual 历史和自动控件禁用。
- [x] `T-SYNC-005` 同步 7 locale、稳定同步规范和 #79 本地状态。
- [x] `T-SYNC-006` 运行聚焦测试、typecheck、lint、spec gate 与 changed verification。
- [x] `T-SYNC-007` 记录验证边界；真实 WebDAV 服务器验收留给发布前/报告者确认。

## Traceability

- `FR-SYNC-SKILL-001 -> DES-SYNC-SKILL-001 -> TEST-SYNC-SKILL-001 -> T-SYNC-003/T-SYNC-004`
- `FR-SYNC-HISTORY-001 -> DES-SYNC-HISTORY-001 -> TEST-SYNC-HISTORY-001 -> T-SYNC-003/T-SYNC-004`
- `FR-SYNC-SOURCE-001 -> DES-SYNC-SOURCE-001 -> TEST-SYNC-SOURCE-001 -> T-SYNC-003/T-SYNC-004`

## Analyze Gate

- 无孤立高优需求；三条 FR 均有 AC、DES、TEST 和执行任务。
- 无 schema、远端路径、加密或恢复契约变化。
- 无阻塞性 `[待确认]`；现有单一在线同步源规则明确支持本设计。

## Review State

实现和本地验证已完成，等待维护者复核；在提交、发布和真实 WebDAV 验收前保持 active。
