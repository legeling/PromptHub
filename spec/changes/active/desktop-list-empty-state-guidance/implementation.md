# Implementation: desktop-list-empty-state-guidance

## 实际落地
- 新增 `components/prompt/PromptListEmptyState.tsx`：自取 store 判定（searchQuery/filterTags/selectedFolderId），两态渲染——筛选态"没有符合当前筛选的 Prompt"+〔清除筛选〕（一次复位三源）；空库态"还没有 Prompt"+〔新建 Prompt〕（dispatch 既有 `shortcut:newPrompt` 事件，与顶栏新建同路径）。
- 接入：CardRoute `PromptWorkspaceEmptyList`、TableView 空态块、GalleryView 空态分支（顺带删 Gallery 硬编码中文 fallback 与未用图标 import）。
- kanban/graph 未接入（spec 记录为后续候选）。

## 验证
- `prompt-list-empty-state.test.tsx` 3 用例（三源复位断言、事件派发断言、仅文件夹筛选归因）。
- 三视图既有测试 27 全绿；全套 3266 passed，失败文件集与 0.6.2 基线一致（零回归）。
- i18n：4 新键 × 7 locale（脚本核验 28 键全量覆盖通过）。
