# Implementation

## Shipped

- 为 Prompt 右键菜单新增“移动到...”入口。
- 将“移动到...”实现为右键菜单右侧二级子菜单，固定高度并支持滚动。
- 子菜单展示文件夹自身 icon，并保留层级缩进信息。
- 子菜单增加 hover 容错窗口与桥接热区，避免鼠标从左侧菜单移向右侧子菜单时断触消失。
- 后续微调子菜单桥接热区的位置，避免可见菜单盒子反向压住左侧主菜单边缘。
- 支持将 Prompt 移出当前文件夹。
- 为 `MainContent` 新增 issue #140 集成测试，并为 Vitest 补充 `@tanstack/react-virtual` stub alias。
- 调整 Gallery 视图虚拟滚动区域的上下留白，恢复与其他视图一致的呼吸感。
- 将 Gallery 上下留白落到外层滚动 spacer 的真实 padding / box-sizing 上，避免只改内部位移导致视觉上仍贴边。
- 补充 Prompt 右键菜单“折叠全部提示词”入口，折叠当前可见提示词树中所有带子节点的 Prompt。
- 补充 Prompt 右键菜单“移动到节点”二级子菜单，支持移动到根节点或其它 Prompt 节点，并排除自身与后代节点。
- 将卡片列表与表格视图的 Prompt 折叠状态提升到 `MainContent`，使右键菜单可以统一控制当前提示词树折叠状态。

## Verification

- `pnpm vitest --run tests/integration/components/main-content-context-move.integration.test.tsx`
- `pnpm vitest --run tests/unit/components/context-menu.test.tsx tests/unit/components/prompt-gallery-view.test.tsx tests/integration/components/main-content-context-move.integration.test.tsx`
- `pnpm lint`
- `pnpm --dir apps/desktop test:run tests/integration/components/main-content-context-move.integration.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`

## Synced Docs

- `spec/knowledge/behavior/prompt-workspace.md`：2.2 新增层级与 folder 归属一致性稳定边界。
- `spec/knowledge/behavior/web.md`：§9 新增「movePrompt 子树换 folder、move-to-root 保留 folder」约束。
- `spec/knowledge/behavior/desktop.md`：§14 全局备份 DnD 只接管文件拖放 + Prompt 树选中手风琴契约。

## Shipped（2026-10 folder-consistency 补丁轮）

- `packages/db/src/prompt.ts`：`movePrompt` 写入 `parent_id/sort_order` 后新增 `syncPromptSubtreeFolder`——以栈遍历子树并将 `folder_id` 统一为父 prompt 的 `folder.id`；`newParentId=null` 不动 `folder_id`。同一事务内完成。
- `apps/desktop/src/renderer/services/database.ts`：IndexedDB 回退路径新增 `applyParentFolderToPromptSubtree` 并在 `movePrompt(...,targetParent!=null)` 时调用，与 SQLite 语义对齐。
- 测试先行：`tests/unit/main/prompt-db.test.ts` +3 用例（子树换 folder / 父无 folder 则 null 传播 / 移到根保 folder）；`tests/unit/services/database.test.ts` 回退 +2 用例。
- `pnpm --filter @prompthub/db typecheck`、`pnpm --filter @prompthub/desktop typecheck`：0 错误。
- `pnpm lint`（file-size + eslint）：通过。
- 桌面全量：失败文件集合与基线一致（基线独有 `rules-workspace` 抖动 1 条、零新增回归）；失败文件 30/30。本次新增 5 条用例全部通过。
- 真实环境端到端（修复后 `out/main` 构建产物 + 用户真实数据副本 E2E profile + Playwright 驱动 Electron 的真实 DOM `DragEvent`）：
  - PASS-CORE：跨文件夹 drop 后 `child_parentId=parent`、`child_folderId===parent_folderId`、store 深度≥1、卡片 `padding-left=16px`；
  - PASS-CASCADE+WORKSPACE-FRONTMATTER：孙节点 `folder_id` 与 DB/`.md` frontmatter 均跟随父链；
  - PASS-ROOT-KEEPS-FOLDER：移到根后 `parentId=null` 但 `folderId` 不变。
  - 工作区文件：中文 folder 名 slug 可能同目录名复用，旧文件被合法覆写、无重复 `.trash` 残留。

## Shipped（2026-10-02 二轮：原生拖拽 + 手风琴）

- `BackupDropRestoreLayer.tsx`：全局备份拖放层新增 `hasFilePayload` 门控。无文件的内部 Prompt MIME 拖拽不 `preventDefault`、不改 `dropEffect`、不吞 `drop`；携带非备份文件仍拦浏览器导航但不导入；命中备份扩展名才进入导入预览。
- `prompt-tree-collapse.ts`：`getPromptAncestorPathIds` + `applyPromptTreeAutoCollapseOnSelect`；null 选中返回同一 `Set` 引用。
- `usePromptTreeAutoCollapse.ts`：仅在 selected prompt 变化时，用 refs 读取最新 prompts/collapsed 再 setState；普通列表刷新不反复强制折叠。
- `usePromptWorkspaceInteractionBindings.tsx`：tree bindings 接入手风琴（list/table/card 共用 controlled collapse state）。
- 测试：`backup-drop-restore-layer.test.tsx`（3）、`prompt-tree-collapse.test.ts`（5）。

## Verification（二轮）

- 定向 87 passed：`prompt-db` / IndexedDB 回退 / backup DnD 层 / prompt-tree-collapse。
- `pnpm lint` + desktop typecheck：0 errors；file-size pass。
- 全量桌面：106 failed tests / 30 failed files；失败集均为既有环境敏感文件（skill/tray/updater/data-path 等），本次新测无一进入失败集；相对上轮 30/106 集合无新增。
- 原生 Electron 真实 DnD：`dragover` 保持 `move` → **`drop` 事件出现** → `child_parentId === target.parentId`（`log/diag/native-final.log`）。
- 原生 Electron 手风琴：选中父时子可见；点击兄弟 B 后 `_accordion_child_*` 从 DOM 消失（`log/diag/accordion.log`）。

## Shipped（2026-10-03 三轮：手风琴自动展开，`T-004`）

- `prompt-tree-collapse.ts`：选中路径（自身 + 祖先）从 collapsed 集合移除，其他带子节点分支加入 collapsed；取消选择保持原 Set 引用。
- `prompt.store.ts`：新增非持久化 `selectionRevision`。`selectPrompt(id)` 每次选择同一 ID也递增；`setSelectedIds([id])` 递增；多 ID 或清除选择保持不变。partialize 不写盘，刷新不会重放旧选择。
- `usePromptTreeAutoCollapse.ts`：effect deps 为 `selectedPromptId + selectionRevision`，通过 refs 读取最新 prompts/collapsed，避免普通列表刷新误折叠。
- `usePromptWorkspaceStoreBindings.ts` / `usePromptWorkspaceInteractionBindings.tsx`：透传 revision 到 tree bindings，覆盖 card/table/list controlled collapse state。
- 测试：`prompt-tree-collapse.test.ts` 7；`prompt-save-sync.test.ts` 5（选择 revision）。定向两组 12/12；desktop typecheck、root lint：0 error。
- 用户按安装包实机确认：点击折叠过的父分支会自动展开；点击其他 Prompt 会收起其他分支。另一次自动化 Electron 探针启动被中断，未把该探针记为命令证据。

## Follow-ups

- 若后续需要批量与单条操作统一，可把当前文件夹弹层提取为共享组件，供右键菜单和表格批量移动共用。
- 画廊/看板未接入层级拖拽；若用户未来在 gallery/kanban 也要拖成子节点，另立 change。
- 历史跨文件夹脏数据如需 repair，另开独立 change。
