# Prompt Workspace Spec

## Purpose

本规范定义 PromptHub Prompt 工作区的稳定行为边界，包括 Prompt 文件化、文件夹表达、版本快照与内容真相源。

## Stable Requirements

### 1. Prompt Content Boundary

- #225：创建 Prompt 及修改正文时，`systemPrompt`、`userPrompt` 至少一个
  必须包含非空白文本；标题的现有必填规则不变。两者各自保存，纯系统提示词的
  `userPrompt` 使用空字符串，不补入占位内容。英文版本不替代主内容的校验。
- 内容判断由 shared 纯函数定义，DB 在普通创建和正文更新写入前执行同一校验；
  部分更新先合并已有字段，元数据更新不要求重新提交正文。桌面按钮、提示、Web
  / Cloudflare Worker、移动端 repository / 表单和 CLI 遵循同一合同。历史快照 /
  备份恢复保留原始字段，不追溯删除空正文记录。
- SQLite 仍拥有结构化记录及版本，文件布局、字段类型和 IPC/HTTP DTO 不变；
  `userPrompt` 仍是字符串，允许 `""`，不引入 schema 迁移或双写。拒绝正文更新
  不得改变当前记录、版本链或文件。回退应用不丢失数据，但旧版表单可能无法编辑
  纯系统提示词。桌面新建、编辑、详情行内编辑、CLI、自部署 Web、Cloudflare
  Worker 与移动端表单 / repository 的实现和聚焦回归已完成。真实 GUI、模型调用
  和发布验收另行进行。
- 校验的时间成本为 O(两段正文长度)，不新增数据库查询、网络请求或持久化状态。
  连续保存/失败保全/重开的集成用例允许超过 50 行：同一用例保留完整前后状态，
  避免拆成依赖执行顺序的测试；覆盖入口与替换边界在下方验收记录列出。

- Prompt 内容必须有稳定的持久化表示，允许后续索引、版本、导入导出和同步围绕其工作。
- 数据库存储与文件系统存储的职责应明确，避免真相源混乱。
- Prompt DB 在创建、更新、版本备注及直接恢复写入前，统一拒绝含 null byte
  的直接绑定文本字段，错误指出字段而不回显正文；拒绝不得改变当前记录或历史。
  JSON 编码的数组/对象由序列化保留字符，不做正文截断或静默清洗。已有被截断
  的内容无法自动恢复，应使用完整历史或备份；此校验不引入 schema 迁移。
- 当前目标以 [foundation 数据所有权约定](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants) 为准：SQLite 拥有结构化记录，文件系统拥有实际文件。下文 canonical 文件/投影说明记录尚未完成替换的历史实现，不是另一种可选业务模式；合入旧分支不得恢复 IndexedDB 业务回退或绕过 Core 的写入入口。

### 2. Folder And Versioning Behavior

- Prompt 文件夹结构和版本快照属于稳定产品能力。
- 工作区 `.trash` 保存删除/改名产生的恢复文件，属于内部恢复目录，不参与
  活跃 Prompt graph 清单、计数或发布。读取器必须验证根 `.trash` 是真实目录，
  拒绝符号链接或同名普通文件；忽略内容不意味着删除恢复文件或放宽活跃记录校验。
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
- 批量移动到根目录通过现有更新合同显式提交 `folderId: null`；`undefined`
  表示不更新归属。renderer 服务必须保留两者差异，普通字段修改不得移出文件夹。

### 2.3 Copy Action Contract

- Every UI action labeled "Copy Prompt" uses the same output-format pipeline.
  When a source Prompt has configured output targets, both menu and detail
  actions copy those resolved targets in stable order rather than bypassing the
  mapping.
- Variable prompts, language selection, copied feedback, and usage attribution
  follow the same flow. Usage remains attributed to the source Prompt even
  when the copied body comes from one or more mapped target Prompts.
- The public `prompt.copy` entry treats variable names and values literally.
  Dollar sequences such as `$&` and `$$` must survive unchanged; using a
  variable does not change the stored template and still records source usage.
- Standalone CLI `prompt copy --var name=value` follows the same literal
  substitution contract, including regex metacharacters in names. It preserves
  variable processing order, the saved template and version history, and records
  one source usage per successful copy.

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

- 未进入批量选择时，点击卡片或恢复上次详情只选中要浏览的 Prompt，不显示批量操作栏，也不
  勾选复选框。卡片行提供可见复选框；勾选或使用 Cmd/Ctrl、Shift 多选后才显示
  批量操作栏，明确勾选一条也可使用批量动作。
- Prompt renderer store 拥有瞬时批量选择状态；卡片复选框、选中集合与操作栏
  使用同一状态。该状态不持久化，不改变 SQLite、文件内容或已有拖拽选择集合。
- 批量选择已开启时，点击卡片正文（包括 Enter/Space 键盘激活）切换该卡片的勾选状态，
  保留其他已选项目，不走打开详情的浏览路径。该规则适用于默认卡片与画廊卡片；
  Cmd/Ctrl 保留切换勾选语义，Shift 保留追加选择且不取消已勾选项。
- 清除选择、切换目录或最后一项取消勾选/消失后退出批量选择；退出后点击卡片恢复
  普通浏览。批量选择仍有
  项目时，不自动恢复旧详情并覆盖选择；复选框的鼠标和键盘事件不再触发卡片
  的普通点击或标题编辑。
- 初始化先重置目录选择，再恢复有效的上次详情，避免重置覆盖恢复结果。
- 批量入口按视图适配：默认卡片窄列表保持单行，点击“已选择 N 项”展开全选/反选，
  右侧仅保留批量操作菜单与取消；画廊保留已选/总量与轻量全选、反选文字控件，
  标签、收藏、移动、删除合并到“批量操作”菜单；表格复用列设置所在工具行，
  保留表头全选复选框，不新增第二排批量栏。删除项在动作菜单中用危险色区分。
- 默认卡片与画廊的全选/反选作用于当前筛选/目录全部结果（包括未滚动到或收起的
  匹配子项），表格作用于当前页。全选只增加勾选；反选切换范围内每项的勾选，
  保留其他页/范围已有选择，不解除私密文件夹访问限制。菜单支持键盘方向键、
  Escape 关闭与触发按钮焦点恢复；移动目录在同一菜单内选择，可返回动作清单。
  三个视图复用同一选择集合算法，时间和空间成本均为 O(已选项数 + 当前范围项数)，
  不读取详情或发起网络请求，不增加持久化状态。

选择语义验证（2026-10-12，视图布局适配前）：卡片点击回归在隔离的修复前代码中命中 8 项失败，确认普通点击
会替换选择或打开详情。包含全选/反选补充的以下 7 个文件共 77 项经定向复测通过，
覆盖勾选/修饰键进入、再次点击取消、键盘激活、清除后恢复浏览、过滤范围与跨页保留
选择。首次范围测试有一项错误期待退出批量选择后兼容浏览集合仍为空，已按现有详情
恢复合同改为核对批量状态、操作栏和复选框，并复测对应文件 16/16 通过。Desktop
源码/测试类型检查、定向 ESLint 和七语言新键检查通过。组件使用真实 renderer store，IPC 为测试替身；
未执行实际 Electron 窗口点击验收，本次请求未授权 GUI 控制。

视图布局适配验证（2026-10-12）：以下 7 个文件共 78 项通过，覆盖窄列表菜单入口、
全选/反选、标签/收藏/删除参数、根目录与指定目录移动、菜单返回、键盘导航、
Escape/外部点击关闭，以及表格批量入口与列设置共用工具行。首次验证中的列设置
名称与测试语言类型错误已修正，受影响 2 个文件 29/29 复测通过。Desktop 源码/测试
类型检查、定向 ESLint、七语言键检查和规范检查通过。实际 Electron 窗口视觉与
点击验收未执行；现有开发服务提供更新后的模块。

批量选择控件、动作菜单与菜单交互分别在 PromptBatchActionBar/PromptBatchMenu 内维护。
动作 JSX 保持连续以直观呈现目录选择和回调参数；选择控件、动作与菜单渲染函数
超过 50 行时仅保留同一局部 JSX，状态、键盘导航和副作用已分离；菜单、参数和
可访问名称由 `prompt-batch-action-bar.test.tsx` 覆盖。

```sh
pnpm --dir apps/desktop exec vitest run --project unit tests/unit/components/main-content-batch-selection.test.tsx tests/unit/components/prompt-batch-action-bar.test.tsx tests/unit/components/prompt-gallery-view.test.tsx tests/unit/components/main-content-selection-restore.test.tsx tests/unit/components/prompt-table-view.test.tsx tests/unit/components/prompt-list-view.test.tsx tests/unit/components/main-content-inline-edit.test.tsx --minWorkers=1 --maxWorkers=1
```

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

### 2.7 Prompt Type And List Layout

- “全部 / 文本 / 绘图”筛选与列表布局独立。在 card、gallery、kanban、list
  布局中切换类型，必须保留当前布局；布局按钮也不改变当前类型。
- 类型入口仍清除文件夹范围并返回主页，保留搜索词与标签筛选。从 graph 或
  generation 专用工作区点击类型入口时，仍返回 card 提示词列表。
- 继续使用 Prompt renderer store 的 `promptTypeFilter` 与 `viewMode`，不新增
  持久化字段或按类型保存的布局副本。
- 回归入口：`apps/desktop/tests/unit/components/sidebar-prompt-view-mode.test.tsx`。
  通过真实 Sidebar、PromptListHeader 和 renderer stores 检查展开 / 折叠侧栏、
  四种布局连续切换类型、设置页返回与专用工作区退出；不替代 Electron GUI 验收。
- 验证（2026-10-10）：`pnpm --dir apps/desktop exec vitest run --project unit
  tests/unit/components/sidebar-prompt-view-mode.test.tsx
  tests/unit/components/sidebar-skills.test.tsx
  tests/unit/components/sidebar-mcp-shell-tags.test.tsx` 共 36 通过、6 失败；新增
  15 项全部通过，失败均为 `sidebar-skills.test.tsx` 的 Skills 导航 / 商店切换
  场景，未修改其实现或预期。`pnpm --dir apps/desktop typecheck:tests` 与本次
  controller / 回归文件的定向 ESLint 通过。未执行 Electron GUI 或发布验收。

### 2.8 Prompt Table Presentation

- 改造范围仅限列表内部：标题 / 正文 / 操作列、绘图缩略图、行样式与列设置。
  应用导航、左侧类型筛选、文件夹 / 标签面板、顶部工具栏和其他视图保持原样。
  不增加“提示词库”页面标题、主列表分类分组或右侧详情栏，不修改全局主题。
- 表格默认显示选择框、标题、用户提示词、操作。AI 响应、变量数、使用次数为
  可选列，不再默认占据正文空间。现有 `prompthub-table-config` 中明确保存的
  可见性与可调整列宽继续生效；重置列设置采用新的默认布局，不迁移业务数据。
- 绘图提示词在标题单元格中显示 48px 预览图，取摘要 `images` 的第一项；没有
  图片时显示中性占位图标。缩略图打开既有图片预览，标题打开提示词详情，正文
  最多两行。预览支持 Escape 关闭、Tab 焦点约束与关闭后返回触发按钮。
- 图片继续通过现有本地图片协议加载；正文仍仅预取当前页未缓存的详情，不增加
  全库正文读取、远程图片请求或新的持久化副本。渲染与原有分页规模相同。
- `PromptTableView` 保留现有超过 50 行的声明式列 / 行组合，缩略图预览拆为独立
  组件；共享工具栏保持原样，列设置仍由表格内部持有。
- 回归覆盖默认列、显式偏好与重置、缩略图预览、无图占位、原有表格交互，以及
  独立 Electron profile 中的类型 / 布局切换、真实本地图片加载与列设置重载。
  验收入口：`tests/e2e/prompt-table-design.spec.ts`，图片仅用仓库图标作为隔离
  测试夹具，不向用户数据写入设计稿示例。
- 验证（2026-10-10，范围纠正后）：43 项受影响的组件回归、定向 ESLint、桌面
  构建和 1 项隔离 Electron 流程通过。流程覆盖类型筛选保持表格、本地图片预览、
  列设置与重载、主题切换、1100px 窗口；无捕获的 renderer 异常或 console error。
  导航轨道、左侧筛选、共享工具栏、视图容器、全局 CSS 与 Tailwind 配置均恢复
  到任务前内容，相关文件无本次 diff。此前未受恢复影响的默认列 / 图片预览
  回归及测试类型检查已通过；未执行发布包或全仓库验收。
- 视觉证据：`output/playwright/prompt-table-design/light.png`（1650×954 CSS px，
  截图使用 CSS 像素）、`table-detail.png`、`dark.png`、`compact.png`。页面外围以
  原有样式为准，设计稿仅用于列表；不再以整页设计稿作为验收目标。测试窗口与
  profile 已关闭 / 清理。深色侧栏的既有外观不在本次修复范围。

### 2.9 Relationship Graph Theme

- 图谱画布与空态复用全局 `--background`，缩放控件复用 popover/border/foreground
  主题 token，不能另外定义中性黑灰背景。Canvas 绘制通过 `prompt-graph-theme.ts`
  在主题模式、色相或饱和度变化时解析全局 CSS token，不复制浅色/深色配色表。
- 普通节点使用冷色 muted-foreground，连接节点与邻居使用 accent-foreground，
  选中节点、选中环和活动连线使用 primary；文字使用 foreground，文字描边与画布同色。
  非邻居仍按现有交互降低透明度，正常连线的透明度提高以保持关系可辨识。
- 配色解析为固定数量的 CSS 读取，不增加图数据遍历、持久化状态、网络请求或观察器；
  节点布局、选择、缩放和私密文件夹可见范围沿用现有合同。

验证（2026-10-12）：图谱数据/控件 9 项与主题集成 4 项通过；主题测试读取实际
全局 CSS，覆盖浅色/深色底色、节点色、运行期模式切换与自定义主题色联动。Desktop
源码/测试类型检查、定向 ESLint 和规范检查通过。Canvas 运输由测试替身替换，
不构成实际 Canvas 视觉验收；现有开发服务已提供新配色模块，未执行 Electron GUI 控制。

### 2.10 Relationship Graph Motion

- 图谱使用 renderer 的 `motionPreference` 与 `prompt-graph-motion.ts` 的唯一模拟配置。
  标准模式先执行有界预布局，容器尺寸和物理力在首屏绘制前准备，避免先显示初始
  分布再突然调整。从空列表加载出 Prompt 时重新测量新挂载的画布容器，避免沿用
  默认尺寸。主题、选择和 hover 不重建图数据或重启布局。
- 标准与减少动画模式在每次节点拖拽开始时恢复已冷却的物理模拟，拖动期间沿用
  图谱引擎的低强度牵引；同一拖拽不逐次恢复最高强度。松手后恢复一次有界收敛，
  相邻节点应实际响应，计算完成后停止。关闭动画时仍允许直接拖动节点，但不唤醒
  其他节点的物理动画。只拖动空白画布仍是视口平移，不重新布局节点。
- 修复不修改 Prompt、关系、坐标持久化、SQLite 或 IPC；图坐标和拖拽标志均为
  当前图谱实例的临时状态，切换离开视图后释放。
- 回归：`apps/desktop/tests/unit/components/prompt-graph-motion.test.tsx` 通过真实
  `PromptGraphView` 回调连接当前安装的 canvas force engine，覆盖冷却后拖拽、
  松手、重复手势、关闭动画、初始布局、时间上限及 118 节点测量。Canvas 绘制和
  原生鼠标事件运输由测试边界替换；不将此证据等同于 Electron 实际拖拽验收。
- 复杂度：节点准备为 O(V + E)，沿用引擎的空间索引进行斥力和碰撞计算；新增
  拖拽标志为 O(1)，同一手势不重复唤醒。标准预布局最多 24 tick，松手后最多
  30 tick / 750 ms；没有新增网络、存储写入或常驻模拟。

验证（2026-10-12）：图谱数据/控件 9 项、主题集成 4 项、真实引擎回归 7 项通过；
未受后续布局修复影响的激活视图隔离 7 项也通过。Desktop 源码/测试类型检查、
定向 ESLint、生产构建和 governance 范围的 quick 门禁 3/3 通过。118 节点样本
的最新测量为预布局约 15 ms、拖拽收敛计算约 9 ms / 25 tick；这是本机无 Canvas
绘制的计算证据，不推断其他设备的渲染帧率。首次真实引擎测试因 jsdom 与 Node
对象类型环境冲突未执行，构建步骤隔离到受控 Node 子进程后全部通过。

隔离的源码变异关闭拖拽唤醒、恢复标准模式零预布局及旧尺寸测量生命周期，
针对初始突跳、标准/减少模式冷却后拖拽、118 节点拖拽及空态加载尺寸共命中
5 项业务断言失败（退出码 1），验证后临时配置已清理，未改写共享工作区源码。
GUI 验收未执行，当前请求未授权
控制用户窗口；未执行发行包、跨平台或完整 release 门禁，未提交或推送。

```sh
pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-graph-motion.test.tsx tests/unit/components/prompt-graph-view.test.tsx tests/unit/components/prompt-graph-theme.test.tsx tests/unit/components/prompt-active-view-isolation.test.tsx --run --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop typecheck:tests
pnpm --filter @prompthub/desktop build
```

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

## #225 Local Verification (2026-10-13)

新增 28 项 #225 回归，相关范围共 254 项通过：Core 51、Web 26、CLI 18、
桌面 unit 121 / integration 1、移动端 27、Cloudflare Worker 10。
核心断言覆盖纯系统 / 纯用户 / 两者有内容，
全空及 Unicode 空白拒绝、部分更新、失败前后记录与版本链相同，以及关闭重开。
Web 还覆盖纯系统 Prompt / version 的 direct insert 与 graph restore。

- `packages/core/tests/prompt-content.test.ts`：真实 SQLite、当前 schema、创建与
  合并更新；空内容拒绝不产生记录或版本。已有历史空正文可修改元数据。
- `apps/web/src/routes/prompt-content.test.ts`：真实 app 初始化、鉴权、HTTP route、
  SQLite 与磁盘重开；无监听端口或远端服务替换。
- `apps/cli/tests/prompt-content.test.ts`：公开 `runCli`、inline / file 参数、实际
  初始化、SQLite 与关闭重开；未执行发行版二进制。
- `apps/desktop/tests/integration/prompt-content.test.ts`：实际 preload API、已注册
  IPC、存储与发布、重开；只替换 Electron 运输层与 native home，不证明真实窗口。
- 桌面 create/edit modal、MainContent 行内编辑与 `detail-inline-content.test.tsx`
  使用 jsdom / mock store 验证表单局部合同。英文版本删除按合并后的主正文判断；
  AI rewrite 用模拟协议响应验证纯系统草稿更新与保存，不证明真实供应商调用。
- 移动端 storage 回归通过公开 repository 保存、拒绝全空更新并重开真实磁盘
  SQLite；只替换 Expo 驱动为 Node SQLite，不证明原生屏幕或设备运行。
- Worker 回归通过本地 workerd、D1 / R2、鉴权 HTTP、版本和进程重启验证；
  全空返回 422 `VALIDATION_ERROR`，拒绝更新保留当前正文和版本；未部署远端。

可从仓库根重跑本次回归：

```sh
pnpm --filter @prompthub/core exec vitest run tests/prompt-content.test.ts --minWorkers 1 --maxWorkers 1
pnpm --filter @prompthub/web exec vitest run src/routes/prompt-content.test.ts --minWorkers 1 --maxWorkers 1
pnpm --filter @prompthub/cli exec vitest run tests/prompt-content.test.ts --minWorkers 1 --maxWorkers 1
pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/create-prompt-modal.test.tsx tests/unit/components/edit-prompt-modal.test.tsx tests/unit/components/main-content-inline-edit.test.tsx tests/unit/components/detail-inline-content.test.tsx tests/integration/prompt-content.test.ts --minWorkers 1 --maxWorkers 1 -t 225
pnpm --filter @prompthub/mobile exec vitest run src/storage/release-acceptance-desktop-release-mobile-storage.test.ts src/features/prompts/data/promptRepository.test.ts src/i18n/release-acceptance-desktop-release-mobile-locales.test.ts --minWorkers 1 --maxWorkers 1
pnpm --filter @prompthub/web-cloudflare exec vitest run src/prompt-content.test.ts src/release-acceptance-cross-surface-storage.test.ts --minWorkers 1 --maxWorkers 1
```

Shared / DB / Core / CLI / Desktop / Web / Mobile / Worker 源码类型检查、Desktop 测试类型检查、
新增 Core 测试独立严格类型检查、触及文件 ESLint、新文件及定向格式检查通过。
桌面 IPC 集成首次因夹具 import 顺序失败，修正后单独复测通过；Web 测试 helper
首次返回类型错误，改为 async 后类型检查与该文件 5 项复测通过。原断言未削弱。

隔离副本将 shared 内容判断改回 user-only，9 项中命中 3 项业务失败；另一次
移除写入前的拒绝，命中 4 项空内容 / 部分更新断言失败；均退出 1。隔离执行器
最初的 bin 链接和 alias 初始化失败不计为变异证据。临时副本与任务进程已清理，
未改写共享源码制造失败。

全仓 `pnpm lint:file-size` 未通过：并行 MCP 改动中的
`packages/shared/utils/mcp-config.ts` 为 1528 行，超过现行 1500 行门禁；本次文件
未超限，未修改该 MCP 工作。仅将 #225 叠加到 HEAD 的隔离提交快照中，254 项
相关测试、八个包源码类型检查、Desktop 测试类型检查、新增 Core 测试严格类型
检查、定向 ESLint / 格式检查及全仓文件行数门禁均通过；复用已安装依赖，未下载
或混入其他问题的实现。Worker 使用自身 ESLint 配置，测试夹具 `useRuntime` 不
属于 React Hook。未运行真实 GUI（未获控制授权）、真实模型 / 图片
生成、跨平台或完整 release 门禁；提交边界仅包含 #225。提交使用 `Closes #225`，
关联及关闭边界见 [issue 规则](../../rules/issue-management-rules.md#github-issue-状态规则)；
本地提交未推送，远端关闭待提交进入默认分支后确认，发布验收状态不因此改变。

## Current Verification Gap (2026-10-12)

The PA-01 delete-then-edit regression in `release-acceptance-prompts-ai-workflow.test.ts` stops at the expected recovery inventory: deleting a Prompt produces no bytes under the workspace trash path checked by the test. The recovery-location contract and deletion publication need reconciliation before this scenario can pass; subsequent edit/reopen assertions in that case were not reached. The test remains failing.
