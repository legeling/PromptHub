# Proposal: Ctrl+F 直达全局搜索

## Change Key
`desktop-search-focus-shortcut`（v0.6.3 / X4，体验）

## Why
搜索框在 TopBar 但无固定键盘直达：`shortcut:search` 事件链已存在（App.tsx:336 localShortcuts 匹配 + TopBar:492 聚焦监听），但依赖用户在快捷键设置里为 "search" 配了组合键；默认无 Ctrl+F 约定，placeholder 也无快捷键提示。已核实 Ctrl+F 未被占用（全 renderer 零命中）。

## Scope
① App.tsx local shortcut 循环匹配后追加固定兜底：Ctrl/Cmd+F → dispatch `shortcut:search`（不占用 shortcutModes 用户配置位，不冲突时生效）；② TopBar 搜索 placeholder 追加快捷键提示（mac 显示 ⌘F / 其他 Ctrl+F）；③ 聚焦时输入框 ring 视觉增强（若现有样式无）。

## Non-goals
不改 shortcut 设置系统、不加新全局注册（Electron globalShortcut 不动）。

## Risks
输入框内按 Ctrl+F 本无浏览器默认行为（Electron 已禁菜单 accelerator 时例外——本地 keydown 先 preventDefault 即安全）。回滚删两处。

## Traceability
FR-KB-001..002 → DES-KB-001 → TEST-KB-001..002
