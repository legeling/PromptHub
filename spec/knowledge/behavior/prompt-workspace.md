# Prompt Workspace Spec

## Purpose

本规范定义 PromptHub Prompt 工作区的稳定行为边界，包括 Prompt 文件化、文件夹表达、版本快照与内容真相源。

## Stable Requirements

### 1. Prompt Content Boundary

- Prompt 内容必须有稳定的持久化表示，允许后续索引、版本、导入导出和同步围绕其工作。
- 数据库存储与文件系统存储的职责应明确，避免真相源混乱。

### 2. Folder And Versioning Behavior

- Prompt 文件夹结构和版本快照属于稳定产品能力。
- 文件夹表达、Prompt 元数据与版本目录的设计应支持后续导入导出、同步和恢复。
- canonical 发布前可将损坏的 `current_version` 指针收敛到实际版本链；只有
  完全没有历史行时才创建当前正文的 v1 快照。非正数历史版本必须无损重编号，
  不删除历史 ID、正文、备注和时间戳；重编号后补入真实当前正文快照，使旧历史
  不会被当前版本过滤规则隐藏；重复修复应为 no-op。
- 标签修改和版本快照写入必须在同一事务中完成，快照读取或写入失败都应回滚。
  标签必须按解析后的 JSON 元素精确匹配，不能依赖未转义的 LIKE 文本模式。
  标签目录删除接口在仍有引用时拒绝删除，并返回真实的 `{ deleted, referenced }`；
  Web 只统计当前用户有权修改的范围，不暴露其他用户的私有引用。

### 2.1 CLI Prompt Selection

- canonical 文件已成为 authority 时，Core/CLI 在首次打开可写 SQLite 前复用
  Core 的 catalog reconciliation：先恢复发布日志、验证文件并构建影子目录，
  再原子替换缺失或过期的投影。历史版本、收藏、关系及已登记的配置/运行记录
  必须保留；失败不得把空库或陈旧目录写回文件。
- 无界面启动遇到现有 SQLite 无法读取、未来 schema、无法保留的表结构、
  活跃/未知客户端或孤立数据库 sidecar 时保留现场并失败。桌面已有的损坏目录
  自动恢复策略由桌面适配器显式选择；现有打开的句柄不在原位被替换。

- CLI 的常用 Prompt 操作应支持通过 id、标题或查询词解析 Prompt，避免用户必须复制数据库 id。
- 当查询词只匹配一个 Prompt 时，CLI 可以直接执行读取、复制、使用、更新、删除或版本相关操作。
- 当查询词匹配多个 Prompt 时：
  - 交互式终端应显示编号列表并让用户选择。
  - 非交互调用必须返回冲突和候选项，不得静默选择第一个结果。

### 2.2 Prompt Hierarchy Persistence

- Prompt 的 `parentId` 与 `order` 是稳定的层级数据，必须与其他 Prompt
  元数据一起写入工作区 frontmatter，并在导入时恢复。
- 工作区导入必须在同一事务中按父节点优先恢复层级；缺失父节点或循环引用
  不得留下部分导入的数据。

### 2.3 Copy Action Contract

- Every UI action labeled "Copy Prompt" uses the same output-format pipeline.
  When a source Prompt has configured output targets, both menu and detail
  actions copy those resolved targets in stable order rather than bypassing the
  mapping.
- Variable prompts, language selection, copied feedback, and usage attribution
  follow the same flow. Usage remains attributed to the source Prompt even
  when the copied body comes from one or more mapped target Prompts.

### 3. Stable Internal Sources

- Prompt 协议设计见 `spec/knowledge/structure/prompt-protocols-zh.md`。
- 数据布局事实见 `spec/knowledge/structure/data-layout-v0.5.5-zh.md`。

## Stable Scenarios

### Scenario: Contributor changes prompt workspace behavior

When prompt file layout, metadata contract, or versioning semantics change materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/prompt-workspace/spec.md`
- they sync durable behavior back into this stable spec after implementation

### Scenario: Internal tools need prompt truth source

When another system feature relies on prompt storage semantics:

- it should treat this spec and the linked architecture docs as the current truth source
