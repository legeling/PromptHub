# Design

## Root Cause

- Prompt 的右键菜单已有查看、编辑、复制、收藏、置顶、AI 测试、历史、删除等操作，但缺少移动入口。
- 项目中已有 `updatePrompt(id, { folderId })` 和表格视图批量移动下拉，说明数据层和文件夹列表都已具备，只是单条 Prompt 的上下文操作缺失。

## Approach

- 在 `MainContent` 的 Prompt 右键菜单中新增“移动到...”菜单项。
- 菜单项点击后关闭右键菜单，并打开一个轻量的文件夹选择弹层。
- 文件夹弹层列出“移出文件夹”以及全部文件夹，使用缩进表示层级。
- 选中目标后调用 `updatePrompt(prompt.id, { folderId })`，并展示成功 toast。

## Tradeoffs

- 采用单独轻量弹层比给 `ContextMenu` 增加二级菜单更简单稳定，但会多一次点击。

## 2026-10 folder-consistency addendum

### Conflict analysis

- 层级维度 `parentId` 与文件夹维度 `folderId` 是两个正交的组织关系。旧实现中 `movePrompt` 只改 `parent_id/sort_order`，不改 `folder_id`。
- 文件夹视图先经过 `filterVisiblePrompts`（按 `folderId` 过滤），再交给 `flattenPromptTree`；父节点不在同一 `folderId` 时 `promptById.has(parentId)` 为 false，`getVisibleParentId` 把子节点视为根，于是“移动成功 → 层级仍然平铺”。
- 实测取证：用户运行库当时未留存 `parent_id`（旧行为下跨文件夹移动即便落库也不会正常展开）；用同一份真实数据在隔离 E2E 副本 + 修复前 exe 复现：`prompt.move` IPC/SQLite/工作区落盘均成功，但按 `folderId` 过滤的视图里父节点被剔除后子节点会重新当根平铺——瓶颈在派生视图压平，不在 handler 或 DB。画廊/看板未接入层级拖拽，不在本路径。

### Decision (user-confirmed)

- 移动即换文件夹：把被移动子树的归属同步到目标父节点 `folderId`；移动到根节点保留自身 `folderId`。
- 右键“移动到节点”候选沿用 `visiblePrompts`（当前视图可见集），与拖拽可触达范围一致，不新增“选了看不到效果”的跨视图目标。
- 不做历史脏数据自动回填迁移；修复只管未来行为（当前用户库无跨 folder 父子存量）。

### Ownership & implementation surface

- 数据原语在 `packages/db`：`PromptDB.movePrompt` 新增 `syncPromptSubtreeFolder`，在同一事务内递归收集子树并 `UPDATE folder_id`；父为 null 时直接跳过。
- 所有调用方共用该原语：桌面 IPC handler 直接 `db.movePrompt`；`apps/web` `prompt.service.move` 同样调用 `@prompthub/db`；CLI 无第二套实现。
- 桌面渲染层 IndexedDB 兜底（`services/database.ts movePrompt`）镜像新语义，保证无 `window.api` 的旧浏览器/回退路径一致。
- 文件工作区无需另改：`promptFrontmatter/parsePromptFile` 已持久化 `folderId/parentId/order`；`syncPromptWorkspaceFromDatabase` 按 `folderId` 重算目标目录并回收旧路径副本，`pruneEmptyDirs` 清理残留空目录。

### Tradeoffs

- 代价：一次“换父”等于连带子树搬家，原文件夹里的 descendants 会从该文件夹消失；这是把“父子必须共同可见”固化为不变量，换取 UI 不再出现“移了却没层级”。
- 未选的方案：文件夹视图把“父在别处”的子也穿透显示（需改 `filterVisiblePrompts`/派生，复杂度高且 folder 归属歧义更大）。

## 2026-10 drag guard + selection accordion addendum

### No-drop 🚫

- 原生 `dragover`/冒泡探针发现全局 `BackupDropRestoreLayer.document("dragover")` 无条件 `preventDefault() + dropEffect="copy"`；Prompt 卡片 source 的 `effectAllowed="move"`，两者交集为空，Chromium 显示不可放并跳过 `drop`。
- React 合成事件先执行，但浏览器最终可放性读取同次事件链结束后的 `dropEffect`，故组件自身的 move 修复被全局层覆盖。
- 修复：备份层仅在 `files.length>0`、`items` 含 file、或 `types` 含 `Files` 时接管。内部 MIME/文本 Prompt 拖拽完全透明。携带非备份文件仍 preventDefault 以阻止窗口导航丢档，但不启动导入预览。

### Accordion selection

- 树折叠状态与选中关系需同时提供两个动作：展开被选中 Prompt 自身与其祖先链，并收起所有其他带子节点分支。用户重复点击已选中的被折叠节点仍应展开，因此仅依赖 `selectedId` 变化不够。
- 非持久化 `selectionRevision` 作为显式单 Prompt 选择信号（含同一 ID 重复选择）；多 ID 选择与取消选择不会增加 revision、不触发手风琴。
- tree bindings 用 refs 读最新 prompts/collapsed state，`selectionRevision + selectedPromptId` 作为 effect deps；普通 prompts/折叠状态变化不会额外重算，避免意外折叠用户手工状态。
- `applyPromptTreeAutoCollapseOnSelect` 先从 collapsed 集合移除选中祖先路径，再把其余带子节点分支加入；null selection 返回原 Set 引用。
- 拖拽后 `movePromptToNode` 会显式 expand 目标父；随后若用户点击目标分支内节点，祖先链仍保留。

### Ownership

- 全局 DnD 契约落在 `BackupDropRestoreLayer`；手风琴树状态落在 `usePromptTreeAutoCollapse` + `prompt-tree-collapse`，不侵入数据层。

## Traceability mapping

| Requirement | Design decision | Verification | Task |
| --- | --- | --- | --- |
| `FR-001` 单条右键移动 | `DES-001` 右键菜单移动入口和文件夹选择弹层，复用 `updatePrompt({ folderId })` | `TEST-001` context-move integration / folder select | `T-001` |
| `FR-002` 父子 folder 一致 | `DES-002` `packages/db.movePrompt` 同事务递归 `syncPromptSubtreeFolder`；根移动保留 folder；IndexedDB fallback 镜像 | `TEST-002` prompt-db + IndexedDB fallback tests；真实数据 E2E | `T-002` |
| `FR-003` 拖拽不被全局备份层拦截 | `DES-003` 备份层只接收携带 file payload 的事件；内部 MIME drag 不 preventDefault、不改 dropEffect、不消费 drop | `TEST-003` layer unit + packaged Playwright native drag | `T-003` |
| `FR-004` 树手风琴展开/收起 | `DES-004` `prompt-tree-collapse` + `selectionRevision` + workspace hook ref | `TEST-004` collapse/store tests + packaged real UI | `T-004` |
