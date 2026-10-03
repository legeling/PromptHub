# Tasks: desktop-search-focus-shortcut

- [x] T1 App.tsx Ctrl/Cmd+F 兜底绑定（用户已占用该组合键时让位）
- [x] T2 TopBar handleSearch 补 select()；placeholder 快捷键提示（en/zh 等 7 locale）
- [x] T3 回归：top-bar 测试按新 placeholder 契约更新断言（29/29 全绿）

## 验证替代说明（TEST-KB-001）
App.tsx 键位兜底逻辑位于根组件内联 handler，无组件级测试 harness 先例（App 渲染链过重）；以 typecheck + 人工验证（用户环境 `pnpm electron:dev` 按 Ctrl+F 聚焦）替代，已列入交付报告"待用户实机验证"清单。
