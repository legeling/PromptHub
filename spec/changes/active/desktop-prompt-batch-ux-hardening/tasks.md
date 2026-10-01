# Tasks: desktop-prompt-batch-ux-hardening

- [x] T1 新增 PromptBatchActionBar + usePromptBatchSelection（含 TEST-BAT-001 组件测试先行）
- [x] T2 TableView 换用共享件，复原标签入口，删除硬编码兜底（TEST-BAT-002）
- [x] T3 containers/ViewRoutes 接口补全 `onBatchTags` 消费链
- [x] T4 Gallery 复选框 + 批量条接线（TEST-BAT-003）
- [x] T5 CardRoute 列表面板批量条（TEST-BAT-004，验证以 typecheck + 全套替代）
- [x] T6 i18n 新 key 落 7 locale（prompt.selectedOfTotal、prompt.deselectPromptRow）
- [x] T7 `pnpm test` 全绿（新增用例范围）+ desktop typecheck/lint 通过；全套基线对照无新增回归

## 验证替代说明（TEST-BAT-004）
CardRoute 为 workspace 装配层（context 注入链无组件测试先例），其接线正确性由 desktop typecheck + `PromptBatchActionBar` 行为测试 + 全套回归覆盖；交互回归以基线对照实锤（main-content-inline-edit 集成用例最初暴露批量条"Cancel"同名歧义，已改名"清除选择"修复并复跑通过）。
