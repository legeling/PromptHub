# Proposal

## Why

社区贡献者 `jazzson51569` 提交了 Prompt 层级列表原型，支持拖拽和 Tab / Shift+Tab 调整提示词层级。这个交互方向符合当前产品目标：用户可以直接在列表里建立提示词之间的逻辑关系，不需要进入单独的关系编辑页。

但原始实现把层级关系直接接近“所有权树”处理，存在两个合并前必须修正的问题：

- 删除父 Prompt 会级联删除子 Prompt，容易误删用户内容。
- 移动 Prompt 缺少自引用、后代循环和老数据库迁移防护。

合并贡献者树结构后，用户继续要求补齐 Prompt 之间的关系表达。产品方向是保留拖拽作为主入口，但不能把所有关系都压成树状父子；Prompt 之间还需要关联、变体、依赖和流程顺序等逻辑关系。

## Scope

- In scope:
- 保留贡献者的拖拽树和键盘缩进交互。
- 将 `parentId/order` 语义收敛为 V1 的 `grouped_under` 逻辑分组。
- 增加 `prompt_relations` 持久表，承载 `related_to`、`variant_of`、`depends_on`、`next_step` 四类非树关系。
- 将列表中间拖拽从“直接分组”调整为就地关系选择器；选 `grouped_under` 继续走树移动，选其它关系写入 `prompt_relations`。
- 在列表项内显示已有图关系小标签，帮助用户直观看到 Prompt 之间的逻辑连接。
- 将关系纳入桌面备份导出/恢复，避免关系只存在当前 SQLite 文件中。
- 修复 list 视图重复渲染旧表格和新树列表的问题。
- 为 SQLite fresh schema、existing-user migration、IPC、IndexedDB fallback 和 DB 层移动逻辑补安全边界。
- 增加 DB 回归测试和迁移测试。

- Out of scope:
- 本轮不实现完整 Obsidian 式图谱视图。
- 本轮不做自动语义推断、批量关系挖掘或单独的复杂关系编辑页。
- 本轮不做 Prompt 内容继承、多态覆盖或自动组合执行。

## Risks

- `parentId` 作为 V1 快速落地字段，不能被后续误解为内容所有权、继承关系或删除级联。
- `prompt_relations` 与 `parentId` 是两类持久表达：前者是图关系，后者是树分组投影。后续 UI 必须继续避免把二者混为同一种数据。
- 树状 list 视图替代原 list 表格后，批量工具条能力需要后续重新接入树列表或提供单独表格模式。
- 图关系如果未纳入备份、恢复和同步，会造成用户在迁移设备时丢失关系上下文；本轮先覆盖桌面备份，远端同步/图谱视图仍可独立演进。

## Rollback Thinking

如果树状列表在桌面端出现严重交互回归，可以保留 DB 字段和迁移，临时把 list 模式切回旧表格视图；已有 `parentId` 数据只是逻辑分组，不影响 Prompt 内容本体。
