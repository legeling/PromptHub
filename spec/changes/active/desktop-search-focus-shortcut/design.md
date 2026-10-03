# Design: Ctrl+F 兜底绑定

## DES-KB-001
App.tsx 现有 `handleKeyDown`（local shortcuts）循环内未命中时追加判定：`(isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f'` → preventDefault + dispatch `shortcut:search`。TopBar handleSearch 已 focus；补 `select()`（实现位置：TopBar 488 行附近 handler）。

## placeholder
新 i18n key `header.searchPlaceholderShortcut`（含 {{key}} 插值，key 由平台判断传 ⌘F/Ctrl+F）；仅当 searchQuery 为空时使用该 placeholder（保持现有"有值显示计数/清除"行为不变）。

## 验证（TEST-KB-*）
- TEST-KB-001 键盘事件测试：dispatch Ctrl+F keydown → `shortcut:search` 事件被派发 + preventDefault。
- TEST-KB-002 TopBar placeholder 含快捷键提示（en 断言）。
