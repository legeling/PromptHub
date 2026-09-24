# Sync Delta Spec

## Modified Requirements

- `FR-SYNC-SKILL-001` WebDAV/S3 远端上传必须继续携带 Skill 元数据、版本和完整文件快照，并在成功结果中报告三类实际数量。
- `FR-SYNC-HISTORY-001` 设置页同步历史必须记录手动远端备份和自动同步的成功、失败与时间；记录保持有界和脱敏。
- `FR-SYNC-SOURCE-001` 未被选为当前 `syncProvider` 的 WebDAV/S3 目标只能执行手动连接、备份和恢复；其定时、启动和保存时同步控件必须不可编辑。

## Acceptance Scenarios

- `AC-SYNC-SKILL-001` 工作区只有 Skills、没有 Prompts 时，手动增量上传成功提示不能显示成无法判断内容的零数据结果，必须明确显示 Skill、版本和文件数量。
- `AC-SYNC-HISTORY-001` 用户点击 WebDAV/S3“备份到远程”后，无论成功或失败，同步历史都出现 `manual` 记录且不包含凭据或远端地址。
- `AC-SYNC-SOURCE-001` WebDAV/S3 已启用但不是当前同步源时，手动按钮仍可用，自动运行、启动运行和保存时同步不可编辑；选为当前同步源后恢复可编辑。

## Compatibility

- `autoSyncHistory` 存储键和既有 provider/status 值保持不变。
- 旧记录不含 `manual` 仍可读取；新增记录只扩展 reason 联合类型。
- WebDAV/S3 `data.json`、manifest 和媒体路径不变。
