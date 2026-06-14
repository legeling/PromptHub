# Proposal

## Why

社区贡献者 `jazzson51569` 提交了 Prompt 层级列表原型，支持拖拽和 Tab / Shift+Tab 调整提示词层级。这个交互方向符合当前产品目标：用户可以直接在列表里建立提示词之间的逻辑关系，不需要进入单独的关系编辑页。

但原始实现把层级关系直接接近“所有权树”处理，存在两个合并前必须修正的问题：

- 删除父 Prompt 会级联删除子 Prompt，容易误删用户内容。
- 移动 Prompt 缺少自引用、后代循环和老数据库迁移防护。

## Scope

- In scope:
- 保留贡献者的拖拽树和键盘缩进交互。
- 将 `parentId/order` 语义收敛为 V1 的 `grouped_under` 逻辑分组。
- 修复 list 视图重复渲染旧表格和新树列表的问题。
- 为 SQLite fresh schema、existing-user migration、IPC、IndexedDB fallback 和 DB 层移动逻辑补安全边界。
- 增加 DB 回归测试和迁移测试。

- Out of scope:
- 本轮不实现完整 Obsidian 式图谱视图。
- 本轮不实现 `variant_of`、`depends_on`、`next_step`、`related_to` 的独立关系表和专门 UI。
- 本轮不做 Prompt 内容继承、多态覆盖或自动组合执行。

## Risks

- `parentId` 作为 V1 快速落地字段，不能被后续误解为内容所有权、继承关系或删除级联。
- 树状 list 视图替代原 list 表格后，批量工具条能力需要后续重新接入树列表或提供单独表格模式。
- 后续若引入图谱关系表，需要明确 `parentId` 是兼容投影还是迁移到 `prompt_relations` 的派生字段。

## Rollback Thinking

如果树状列表在桌面端出现严重交互回归，可以保留 DB 字段和迁移，临时把 list 模式切回旧表格视图；已有 `parentId` 数据只是逻辑分组，不影响 Prompt 内容本体。
