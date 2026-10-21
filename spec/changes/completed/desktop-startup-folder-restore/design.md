# Design: 启动文件夹恢复

> Completed change history. Current requirements: [owning topic](../../../knowledge/behavior/desktop.md). Earlier proposals and designs below are retained as evidence, not current instructions.

## DES-STARTUP-001 状态归属
- 三个字段通过既有 settings preload/IPC 写入 SQLite settings；`backupGuideCollapsed` 使用同一通道。渲染层不持久化副本，重开从主进程读取。
- `normalizeStartupFolderSettings` 负责 hydration；共享 `STARTUP_FOLDER_MODES` 是模式合同真源。
- 单测 `settings-startup-folder.test.ts`。

## DES-STARTUP-002 记录时机
在 folder store 的 `selectFolder` 切换非 null 文件夹后记录 `lastActiveFolderId`，不同模式均保留最后访问位置；null（根/全部）不覆盖上次值，相同 id 不重复写入。

## DES-STARTUP-003 恢复时机
`useStartupFolderRestore` 等待 App 初始化成功及文件夹加载完成，只执行一次选择。禁止在主进程设置尚未读取时把默认模式误判为最终配置。

## 右键菜单
本次使用设置页选择目标；旧分支所列侧栏菜单未实现，不列入交付证据。

## 验证（TEST-STARTUP-*）
- TEST-STARTUP-001 normalizer 单测：非法 mode/非字符串 id/合法值透传。
- TEST-STARTUP-002 last 记录：切目录写入、null 不覆盖、相同 id 不重复写入。
- TEST-STARTUP-003 恢复 hook：三模式行为 + 目标缺失回落 + 只执行一次。
- TEST-STARTUP-004 通过 preload/IPC 写入后关闭并重开真实 SQLite，读取相同设置；非法输入不改变已有值。
- TEST-STARTUP-005 全量回归不破。

## 兼容
未设置字段时保持默认视图。新增可选 Settings 字段，复用 settings 表，无结构迁移；回退代码可保留未知 settings 行，不删除用户偏好。旧分支验证记录不代表当前主线验收。
