# Design: 共享批量条与三视图接线

## 受影响文件
- 新增 `apps/desktop/src/renderer/components/prompt/PromptBatchActionBar.tsx`（纯展示 + 回调）
- 新增 `apps/desktop/src/renderer/components/prompt/usePromptBatchSelection.ts`（本地 Set 选择 hook：toggle/selectAllCurrent/clear/allCurrentSelected，从 TableView 现逻辑平移）
- 修改 `PromptTableView.tsx`（换用 hook + 共享条；删硬编码兜底）
- 修改 `PromptGalleryView.tsx`（复选框 + 本地选择 hook + 共享条；接收 batch handlers）
- 修改 `PromptViewContainers.tsx`（`PromptTableActions` 接口补 `onBatchTags`；给 Gallery 传 batch props）
- 修改 `PromptWorkspaceViewRoutes.tsx` / `PromptWorkspaceCardRoute.tsx`（gallery/card 接线；card 列表面板加共享条）

## DES-BAT-001 提取不换血
hook 与批量条逻辑从 TableView 现有实现原样平移：选中集合语义（仅当页行）、操作后 `clearSelection()` 时机、folder menu 开闭状态，均不得改动；批量条 props：`selectedCount totalCount onClear onTag(ids) onFavorite(ids, fav) onMove(ids, folderId|undefined) onDelete(ids)`，父层负责把本地集合转数组传入（与现 handler 签名一致）。

## DES-BAT-002 card 视图数据源
card 视图选择状态已在 store（`selectedIds`/`setSelectedIds`），批量条直接读 store；`selectedPromptIdSet`（derived）已存在，不新增状态。

## DES-BAT-003 gallery 本地选择
与表格一致采用组件本地 Set（不污染 store），保证视图切换即清空、行为可预期。

## 兼容与影响
- 用户输入输出不变：所有持久化走既有 actions；未选中任何项时无 UI 变化。
- 表格视图原有行为回归由组件测试守护。

## 验证（TEST-BAT-*）
- TEST-BAT-001 PromptBatchActionBar 组件测试：计数文案、各按钮回调携带正确 ids、无中文兜底残留。
- TEST-BAT-002 TableView 接线：标签按钮渲染并调用 onBatchTags(selectedIds)。
- TEST-BAT-003 Gallery：勾选/全选/清除；批量收藏/移动/删除/标签触发 handler 后清空。
- TEST-BAT-004 CardRoute：store selection 非空时批量条出现、按钮接 handlers。
- TEST-BAT-005 对抗：0 选中不渲染条；筛选变化后旧 id 不影响操作（按 handler 现状行为断言）。
- TEST-BAT-006 全量 desktop 测试回归（现有 TableView/gallery 测试不破）。
