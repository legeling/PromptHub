# Proposal: WebDAV Skill 备份可观测性

## 背景

GitHub #79 报告 Skills 无法同步到 WebDAV。当前 `0.6.0-beta.2` 的统一备份
payload 已包含 Skill 元数据、版本和文件树，但 WebDAV/S3 上传结果只显示 Prompt
与媒体数量；手动“备份到远程”也不会写入设置页的同步记录。同时，非当前在线
同步源仍允许配置定时、启动和保存时同步，造成“已配置但不会运行”的状态。

## 目标

- 让 WebDAV/S3 上传结果明确报告 Skill、Skill 版本和 Skill 文件数量。
- 让手动远程备份成功和失败进入同一份有界、脱敏的同步历史。
- 非当前在线同步源保留手动备份/恢复，但禁用不会生效的自动同步配置。
- 保持现有 WebDAV/S3 payload、路径、加密和恢复语义不变。

## 非目标

- 不引入逐 Skill 远端对象或新的同步协议。
- 不改变 last-writer-wins 快照语义。
- 不自动关闭 GitHub #79；发布并取得真实远端验收后再关闭。

## 风险与回滚

- 历史记录继续使用兼容字段 `autoSyncHistory`，只扩展 `reason=manual`，旧记录无需迁移。
- UI 回滚只需恢复文案和 disabled 条件；远端备份格式没有变化。
- Skill 内容读取失败仍保持 fail closed，不得以零 Skill 成功掩盖读取错误。

