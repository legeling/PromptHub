# Prompt Workspace Spec

## Purpose

本规范定义 PromptHub Prompt 工作区的稳定行为边界，包括 Prompt 文件化、文件夹表达、版本快照与内容真相源。

## Stable Requirements

### 1. Prompt Content Boundary

- Prompt 内容必须有稳定的持久化表示，允许后续索引、版本、导入导出和同步围绕其工作。
- 数据库存储与文件系统存储的职责应明确，避免真相源混乱。
- 当前目标以 [foundation 数据所有权约定](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants) 为准：SQLite 拥有结构化记录，文件系统拥有实际文件。下文 canonical 文件/投影说明记录尚未完成替换的历史实现，不是另一种可选业务模式；合入旧分支不得恢复 IndexedDB 业务回退或绕过 Core 的写入入口。

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
- 层级与文件夹归属的一致性为稳定边界：把 Prompt 移动到另一个 Prompt 节点下时，
  该 Prompt 及其后代所在 `folderId` 必须与目标父节点一致（移动到根层级则保持
  自身 `folderId`）；不得产生「父节点存在但因 folder 过滤而在当前文件夹视图
  不可见」的派生压平状态。权威落库实现在 `packages/db`。

### 2.3 Copy Action Contract

- Every UI action labeled "Copy Prompt" uses the same output-format pipeline.
  When a source Prompt has configured output targets, both menu and detail
  actions copy those resolved targets in stable order rather than bypassing the
  mapping.
- Variable prompts, language selection, copied feedback, and usage attribution
  follow the same flow. Usage remains attributed to the source Prompt even
  when the copied body comes from one or more mapped target Prompts.

### 2.4 Relationship Navigation And Unlinking

- Parent/child chips in the relationship panel offer an explicit unlink action.
  Unlinking moves the child to the root through the existing `movePrompt`
  operation. Both Prompts, their content, folders, descendants and semantic
  links remain intact. Errors keep the relationship visible and report failure.
- Opening a relationship from the workspace detail or detail modal reveals the
  target in the list: clear search/tag/type filters, retain the current folder
  scope when it contains the target, otherwise switch to All for public targets,
  expand target ancestors and scroll the selected row into view.
- Private targets outside the accessible current folder scope require the user
  to open/unlock their folder first. Relationship navigation and unlinking do
  not unlock folders or bypass their visibility rules.
- Folder and tag filtering still apply to normal list browsing; opening a
  relationship is the explicit action that changes the browsing filters.
- Ownership remains SQLite `parent_id`/`sort_order` through the existing Core/DB
  move contract. No storage schema, migration or additional durable state is
  introduced; reverting the UI retains valid root-level Prompts.

### 2.5 Card Browsing And Batch Selection

- 普通点击卡片或恢复上次详情只选中要浏览的 Prompt，不显示批量操作栏，也不
  勾选复选框。卡片行提供可见复选框；勾选或使用 Cmd/Ctrl、Shift 多选后才显示
  批量操作栏，明确勾选一条也可使用批量动作。
- Prompt renderer store 拥有瞬时批量选择状态；卡片复选框、选中集合与操作栏
  使用同一状态。该状态不持久化，不改变 SQLite、文件内容或已有拖拽选择集合。
- 清除选择、普通浏览、切换目录或最后一项消失后退出批量选择。批量选择仍有
  项目时，不自动恢复旧详情并覆盖选择；复选框的鼠标和键盘事件不再触发卡片
  的普通点击或标题编辑。
- 初始化先重置目录选择，再恢复有效的上次详情，避免重置覆盖恢复结果。

### 2.6 Kanban Preview And Layout

- 看板只为已挂载的可见 / overscan 卡片及展开的固定卡片加载正文，复用现有
  `usePromptDetail` 与 store 的缓存、请求合并及失效机制。不得因整个详情缓存
  更新而预取全清单；缓存淘汰后的局部重读保留已显示正文，失败显示明确重试。
- 正文标签使用当前语言的 System / User Prompt 文案，不暴露内部类型名称。
  普通卡片固定高度、预览截断、标签和动作保持可见；完整正文由详情或固定卡片
  展开提供，普通卡片不增加内嵌滚动条。
- 列数偏好按当前内容面板宽度适配，最小卡片宽度为 240 px。虚拟行测量包含
  16 px 行间距；卡片高度由同一几何配置通过 CSS 变量传入，顶部与底部留白
  纳入滚动范围。尺寸 observer 在卸载时断开。
- 普通列表与看板卡片使用颜色过渡，虚拟化重新挂载不重复播放淡入动画。列表
  复选框独立成列，标题、描述和父项提示共享另一列，避免正文对齐复选框。
- 这些状态属于 renderer 派生视图；不新增数据库、文件、IPC 或持久化缓存。
- 卡片预览 / 动作独立于看板协调器。协调器和虚拟网格保留超过 50 行的现有
  声明式组合函数，使固定卡片生命周期与滚动几何各自集中；看板动作回归及
  viewport 稳定性回归覆盖这两个边界，避免为行数拆散同一副作用的所有权。

### 3. Stable Internal Sources

- 桌面 Prompt 普通增删改、版本、关系、输出格式及文件夹写入，由 Core 的现有
  事务发布完成后才返回成功。当前 canonical runtime 的 IPC 不得再次发布同一
  graph 或全量导出旧工作区缓存；显式导入、恢复及同步命令仍负责调用现有
  `publishCanonicalGraph()`。database-catalog runtime 保持现有工作区同步边界。
  这不改变存储所有权目标、文件格式、迁移或 Core 的事务 / 恢复行为。
- Core 的当前 Prompt graph 发布保留未经改动的 Prompt bundle；新增 / 更新 / 删除
  bundle 与完整 catalog 使用现有 publication journal 原子提交并验证，失败回滚
  SQLite 与文件。首次发布及独立导出仍生成完整目录。清单 hash、完整验图与
  读取仍按当前全库合同执行，本次只减少重复读取及无关 bundle 的复制 / 写入；
  不将该优化描述为已经达成 `O(K)` 总成本或 foundation 的全部性能预算。
  `publishCanonicalPromptGraph` 保留超过 50 行的事务编排：收集、验证、准备 journal、
  发布和清理共享同一异常边界，拆开会使提交状态与回滚路径更难核对；注册 IPC
  的正常删除、未变文件保全、失败回滚与重试，以及 Core 的导出 / 重建 / journal
  回归共同覆盖该边界。
- 单个 Prompt 删除确认在请求未完成时显示 loading，禁用确认 / 取消并拒绝重复
  点击或 Enter 提交；成功后移除列表与选择并只显示一次成功提示。失败或 IPC
  返回 `false` 时保留 Prompt 和确认窗口，显示失败提示，恢复按钮以允许重试。

- 多词全文检索将各词分别转义后用 AND 组合，不要求词语相邻；操作符作为普通文本处理。
- 标签批量修改接受摘要记录，只更新标签字段；逐条复用现有持久化入口，部分失败保留已成功记录并明确报告，不能把失败当作全部成功。
- 表格和画廊继续使用当前摘要列表、按需详情缓存及虚拟化；编辑和复制必须先获取正文，不得用摘要覆盖完整内容。

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
