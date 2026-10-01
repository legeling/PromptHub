# Spec Delta: 启动文件夹恢复（desktop-ui 域）

## 新增的需求

### FR-STARTUP-001 三种启动模式
settings 新增 `startupFolderMode: 'default' | 'last' | 'pinned'`（默认 `'default'`）与 `pinnedFolderId: string | null`、`lastActiveFolderId: string | null`。
- `default`：与现版本行为完全一致。
- `last`：每次用户切换激活文件夹时记录；冷启动完成后自动进入该文件夹。
- `pinned`：固定进入 `pinnedFolderId` 对应文件夹。

### FR-STARTUP-002 设置入口
- 设置页常规项中提供三选一下拉（或等价控件，跟随该页现有控件风格）。
- 侧栏文件夹右键菜单新增「启动时打开此文件夹 / 取消启动文件夹」切换项，直接设置 pinned 模式与 id。

### FR-STARTUP-003 恢复语义
启动恢复发生在文件夹树加载完成之后、以现有文件夹选择 action 触发（与手动点击同一行为路径：解锁状态、prompt 列表刷新语义全部复用）。目标不存在时回落默认且不抛出错误。

### FR-STARTUP-004 坏值防护（hydration 边界）
同版本 localStorage 快照中的非法 mode/非字符串 id 在 zustand `merge` 时归一：mode 回 `default`，id 回 `null`。与仓库既有 same-version hydration 规范一致。

### FR-STARTUP-005 恢复结果可见反馈（v0.6.3 X5 追加）
启动文件夹恢复动作需可感知：
- 恢复成功进入目标文件夹 → 轻量 info toast"已进入启动文件夹「X」"（1.5s 内列表刷新前不打断操作）。
- 目标文件夹已不存在而回落默认 → warning toast"启动文件夹已不存在，已回到默认视图"，并将失效的 pinned 配置在设置页可见（目标下拉显示"（已失效）"态，用户可重选）。
- `default` 模式无任何提示（保持零打扰）。
- toast 文案走 i18n × 7；反馈层不改变选择路径与持久化语义。
