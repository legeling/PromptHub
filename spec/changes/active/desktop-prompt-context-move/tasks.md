# Tasks

- [x] 明确 issue #140 范围
- [x] 完成 delta spec
- [x] 实施右键菜单移动入口与右侧文件夹子菜单
- [x] 补充右键菜单的“折叠全部提示词”与“移动到节点”入口
- [x] 完成测试与 lint 验证
- [x] 更新 implementation.md
- [x] 同步稳定 specs / architecture / docs（`spec/knowledge/behavior/prompt-workspace.md` 与 `web.md` 已回写父子同 folder 不变量）

## 2026-10 跨文件夹层级压平修复

- [x] 用户真实数据取证：打包版 `parent_id` 全 NULL + 99 个工作区 `.md` `parentId: null`，排除拖拽/IPC/db 链路
- [x] E2E 独立 profile 驱动安装版 exe：`window.api.prompt.move` 返回 true、SQLite/回读正常，锁定文件夹过滤导致 flatten 压平
- [x] 设计冲突澄清并经用户确认：移动即换文件夹（含子树级联）、移动到根保留自身 folder、右键候选限当前可见
- [x] `packages/db` `PromptDB.movePrompt` 失败用例先行 + `syncPromptSubtreeFolder` 实现
- [x] 桌面 renderer IndexedDB 回退 `reorderPromptTree` 镜像 folder 级联 + 回退路径测试
- [x] web/CLI 复用 `@prompthub/db` 同原语确认
- [x] `pnpm lint`、`pnpm --filter @prompthub/db typecheck`、`pnpm --filter @prompthub/desktop typecheck` 通过
- [x] 全量桌面测试基线对照：失败文件集合与基线一致、零新增回归
- [x] 用修复后的构建产物在打包 exe 同款驱动下端到端复验“移动后子树换 folder + 视图缩进”：PASS-CORE / PASS-CASCADE+WORKSPACE-FRONTMATTER / PASS-ROOT-KEEPS-FOLDER（`log/diag/e2e-verify-profile`：真实 DB 副本 + `out/main/index.js` + Playwright 驱动 Electron 触发真实 DragEvent）

## 2026-10-02 安装实测二轮（拖拽 🚫 + 自动收起）

- [x] `T-003` 原生 Playwright `dragTo` 复现：全局 `dragover` 最终把 `dropEffect` 改成 `copy`、不派发 `drop`
- [x] `T-003` 测试先行：`backup-drop-restore-layer.test.tsx`（内部 MIME 透明；非备份 Files 仍拦导航；备份 zip 接管）
- [x] `T-003` `BackupDropRestoreLayer` 仅在有文件 payload 时接管 enter/over/leave/drop
- [x] `T-004` 纯函数 `prompt-tree-collapse` + `usePromptTreeAutoCollapse`，tree bindings 接入选中祖先链手风琴
- [x] `T-004` 纯函数测试 5 例；重建后原生 Electron：drop parentId 正确；点击兄弟后子项自动隐藏 PASS
- [x] `T-001`~`T-004` `pnpm lint` / desktop typecheck / 全量基线 106 failed / 30 文件集合无本次回归
- [x] `T-001`~`T-004` 回写 proposal/spec/design/desktop stable §14 + implementation

## 2026-10-03 三轮：点击自动展开（`FR-004` / `DES-004` / `TEST-004` / `T-004`）

- [x] 契约扩展：选中/重复选中节点展开自身与祖先，其他带子节点分支收起
- [x] `prompt-tree-collapse` 先移除选中路径 collapsed，再收起其他父子分支；7 纯函数测试通过
- [x] prompt store 新增非持久化 `selectionRevision`：`selectPrompt(id)` 每次递增；`setSelectedIds([id])` 单 ID 递增；多 ID/取消选择不变；5 store 测试通过
- [x] `usePromptTreeAutoCollapse` effect 由 `selectedPromptId + selectionRevision` 驱动，workspace store binding 透传 revision
- [x] `pnpm lint`、desktop typecheck：0 error
- [x] 用户安装包实机验证通过；自动化探针启动被中断，记录为人工验证而非命令证据
