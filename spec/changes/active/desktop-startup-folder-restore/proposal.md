# Proposal: 启动进入指定/上次文件夹

## Change Key
`desktop-startup-folder-restore`（v0.6.2 / E3，体验类，响应 GitHub #74）

## Why
#74（open，用户主动请求）：每次冷启动都回到默认视图，深文件夹工作流需要每天重复导航。用户诉求是"能在文件夹上设置启动位置"。

## Scope
renderer settings store + folder 选择链路 + 侧栏文件夹右键菜单。纯 UI 偏好，新增字段仅存 localStorage settings（不建表、不进备份语义、不改 IPC）。

## Non-goals
- 不记忆搜索词/筛选标签/滚动位置；不做多窗口场景。

## 兼容与回滚
- 默认 `startupFolderMode: 'default'`，与 0.6.1 行为逐位一致；关闭开关即回到原行为。
- 目标文件夹被删除时静默回落默认视图（不报错、不清配置，下次进入已存在文件夹时自然更新）。
- 回滚：删除新增字段读写点即可；persist migration 无需版本升级（同版本 merge normalizer 兜底坏值）。

## Traceability
FR-STARTUP-001..004 → DES-STARTUP-001..003 → TEST-STARTUP-001..005
