# Proposal: 批量选择体验加固（断线复原 + 视图覆盖 + 反馈卫生）

## Change Key
`desktop-prompt-batch-ux-hardening`（v0.6.2 / E1+E2，体验类，含一个功能断线修复）

## Why
1. **回归断线（实锤）**：v0.6.0 提交的表格视图批量栏「标签」入口（`openQuickTagForIds` 接线，commit 0b29f1db）在升级重放至上游 0.5.9 容器结构时丢失——现在 `getPromptTableActions` 仍传 `onBatchTags`，但 `PromptViewContainers` 的 `PromptTableActions` 接口与 `PromptTableView` 都不再消费该字段，按钮静默消失。CHANGELOG 宣称的能力与现状不符。
2. **覆盖缺口**：card 默认视图已有 store 级多选（Ctrl/Shift），但没有任何批量操作条；gallery 视图无多选、无批量条。
3. **展示卫生**：表格批量条存在 `t('prompt.selected', ...) || '已选择 X 项'` 硬编码中文兜底（违反 no-hardcoded-Chinese 红线），且选中反馈缺少总数分母与清除入口的明确性。

## Scope
renderer 表现层：共享批量条组件 + 三视图接线 + 断线复原。不新增 store action（收藏/移动/删除/标签 action 全部复用），不改持久化语义与用户输入输出。

## Non-goals
- kanban/graph 视图批量、右键菜单结构改动、跨页全选语义变更。

## Risks & Rollback
- TableView 行为回归风险：通过"提取共享组件但保持原 handler 调用序列与清空时机完全一致"控制；组件测试锁行为。
- 回滚：还原 4~6 个 renderer 文件即可，无数据面影响。

## Traceability
FR-BAT-001..006 → DES-BAT-001..003 → TEST-BAT-001..006
