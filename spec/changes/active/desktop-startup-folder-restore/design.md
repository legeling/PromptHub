# Design: 启动文件夹恢复

## DES-STARTUP-001 状态归属
- 三个新字段进 `settings.store`（persist 现有 `prompthub-settings`，partialize 保留本地偏好先例；不进 DB、不进备份 payload）。
- normalizer 抽纯函数 `normalizeStartupFolderState(partial)`，`merge` 与 setter 复用（对齐 quality.md 既有 same-version hydration 模式）。
- 单测 `settings-startup-folder.test.ts`。

## DES-STARTUP-002 记录时机
在 folder store 激活文件夹的 action（实现时按 `selectFolder` 实际命名/调用点）成功切换非 null 文件夹后写 `lastActiveFolderId`；`pinned` 模式下不改写 last。null（根/全部）不记录，保持上次值（语义：进入"全部"不算改变工作目标）。

## DES-STARTUP-003 恢复时机
App 启动序列中 folders 首次加载完成点（实现时定位现有 bootstrap/fetchFolders 完成回调；若无则在新 hook `useStartupFolderRestore` 中等待 `folders.length > 0` 的首个信号 + mode≠default 判定，执行一次选择，ref 防重入）。恢复调用与用户手动点击同一条 action 路径。

## 右键菜单
侧栏文件夹 context menu items 数组追加一项（勾选态表示当前 pinned 命中），文案走新 i18n key。

## 验证（TEST-STARTUP-*）
- TEST-STARTUP-001 normalizer 单测：非法 mode/非字符串 id/合法值透传。
- TEST-STARTUP-002 last 记录：切目录写入、null 不覆盖、pinned 不改 last。
- TEST-STARTUP-003 恢复 hook：三模式行为 + 目标缺失回落 + 只执行一次。
- TEST-STARTUP-004 右键菜单项切换 pinned。
- TEST-STARTUP-005 全量回归不破。

## 兼容
默认值分支代码路径与 0.6.1 一致；无 IPC/schema 变化。
