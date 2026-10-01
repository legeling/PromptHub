# Design: 空态共享组件

## DES-EMPTY-001
新增 `components/prompt/PromptListEmptyState.tsx`：无 props 自取 store（searchQuery/filterTags/selectedFolderId + 三个复位 setter + 事件 dispatch），内部判定 hasFilters 分支渲染两态；图标 + 文案 + 单按钮，风格对齐现有空态（muted 图标 + 主按钮 variant=primary）。

## 接入
- `PromptWorkspaceCardRoute.tsx` 33 行区、`PromptTableView.tsx` 851、`PromptGalleryView.tsx` 203：替换为 `<PromptListEmptyState />`。
- kanban 保留原文案（记录）。

## 兼容
筛选 setter 均为既有；事件为既有 `requestQuickAddPrompt`（app-command-events.ts）。

## 验证（TEST-EMPTY-*）
- TEST-EMPTY-001 组件测试：有筛选态文案+按钮点击后三 store 复位断言。
- TEST-EMPTY-002 空库态：dispatch 事件被监听（vi 断言 window 事件）。
- TEST-EMPTY-003 三视图既有测试不破（table/gallery 空态用例更新如有）。
