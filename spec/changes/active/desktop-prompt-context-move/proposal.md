# Proposal

## Why

补齐 Prompt 右键菜单中的“移动到...”能力，让用户在卡片、列表、画廊、看板等入口下都能快速把单条 Prompt 移动到任意文件夹，无需切换到批量工具栏或依赖拖拽。

2026-10 第一轮：实际使用中发现 `移动到节点` 虽然能写入 `parentId`，但 `folderId` 不随父节点变动。文件夹视图按 `folderId` 过滤时，跨文件夹的父节点被过滤掉，`flattenPromptTree` 找不到父引用，子节点被当作根节点平铺（用户感知为"移动没生效/没层级"）。本 change 增加"移动即同步父文件夹归属（含子树级联）"的语义，消除层级与文件夹两个组织维度的冲突。

2026-10 第二轮（安装实测反馈）：folder 归属修复后，右键可移入子节点，但**拖拽到其它 Prompt 仍显示 no-drop 🚫**。根因为 `BackupDropRestoreLayer` 的全局 `dragover` 不分拖拽类型，把 `dropEffect` 改成 `copy`，与 Prompt 内部 `effectAllowed=move` 冲突，Chromium 不接受 drop。新增约束：全局备份层只接管携带文件的拖放；应用内部 MIME/文本拖拽必须透明。另一项交互：选中或重复选中 Prompt 时采用手风琴——展开其自身与祖先路径、收起其他有子节点的分支，避免必须逐项手动展开/收起。

## Scope

- In scope:
- 为 Prompt 右键菜单新增“移动到...”入口。
- 点击后列出当前全部文件夹，并支持移出当前文件夹。
- 复用现有 Prompt 更新逻辑完成文件夹迁移。
- 移动到 Prompt 节点时，被移动 Prompt 及其整个后代的 `folderId` 同步为目标父节点的 `folderId`。
- 移动到根节点（清空 `parentId`）时保留自身 `folderId`。
- `packages/db` `PromptDB.movePrompt` 与桌面端 IndexedDB 回退保持一致实现。
- 修复全局 `BackupDropRestoreLayer`：只有携带文件（Files / file items / files）的拖放才接管；应用内部 Prompt MIME 拖拽不改写 `dropEffect`、不吞 drop。
- 列表/卡片树选择采用手风琴：选中或重复选中某 Prompt 时展开其自身与祖先分支，并收起其他有子节点的分支；取消选择不改变折叠状态。
- Out of scope:
- 批量移动交互重做。
- 文件夹管理能力扩展。
- 历史遗留的跨文件夹父子脏数据一次性回填迁移（当前用户库实测 `parentId` 全空，无此类数据；如未来需要可另立 repair change）。

## Risks

- 右键菜单后续弹层若处理不好，可能在点击外部或切换目标时关闭时序异常。
- 移动到跨文件夹父节点会把子树移出原文件夹，改变备份、WebDAV/自建同步与文件夹筛选的可见集合；需与工作区文件迁移清理链路核对（已核对：导出按 `folderId` 重写路径并回收旧路径副本）。
- 旧的“任意 Prompt 都可作为目标父节点”预期收敛为“当前视图可见的节点可作为目标父节点”，与拖拽可用范围保持一致。

## Rollback Thinking

- 若右键菜单后的弹层交互不稳定，可回退为单独模态方案，同时保留数据层移动逻辑。
- 若“移动即换文件夹”造成同步侧不可预期，可回退为保留 `folderId` 的旧语义；但文件夹视图的层级压平问题会复现，需配套改 `filter`/派生视图。

## Requirements

- `FR-001`：任意 Prompt 视图的右键菜单可把单条 Prompt 移动到目标文件夹（含移出当前文件夹）。
- `FR-002`：移动到 Prompt 节点时，子树 `folderId` 与目标父节点一致；移动到根节点保留自身 `folderId`。
- `FR-003`：Prompt 卡片之间的内部层级拖拽不能被窗口级备份文件拖放层改写为 `copy`，且 `drop` 必须正常触发。
- `FR-004`：Prompt 树选择遵循手风琴：选中/重复选中节点时展开其自身与祖先路径，收起其他有子节点的分支；取消选中保持折叠状态。
