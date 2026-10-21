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
- 历史 Markdown 工作区只作为一次性迁移输入，不恢复运行期双写。旧字段缺失、
  来源冲突、版本槽位和已删除记录重现的处理，由
  [数据恢复规范](data-recovery.md#prompt-workspace-upgrade-recovery-2026-10-19)
  定义；普通版本导入仍严格拒绝冲突，只有明确审阅的启动恢复可以替换冲突槽位。
- Prompt DB 在创建、更新、版本备注及直接恢复写入前，统一拒绝含 null byte
  的直接绑定文本字段，错误指出字段而不回显正文；拒绝不得改变当前记录或历史。
  JSON 编码的数组/对象由序列化保留字符，不做正文截断或静默清洗。已有被截断
  的内容无法自动恢复，应使用完整历史或备份；此校验不引入 schema 迁移。
- 当前目标以 [foundation 数据所有权约定](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants) 为准：SQLite 拥有结构化记录，文件系统拥有实际文件。下文 canonical 文件/投影说明记录尚未完成替换的历史实现，不是另一种可选业务模式；合入旧分支不得恢复 IndexedDB 业务回退或绕过 Core 的写入入口。

### 2. Folder And Versioning Behavior

- 桌面 Prompt 详情面板及详情弹窗的时间表示创建时间，读取 SQLite 记录的
  `createdAt`；收藏/取消收藏、编辑、移动目录、标签及版本恢复等后续操作不得
  改变此处时间。`updatedAt` 继续用于修改记录、排序和同步，不作为详情创建时间。
  复用现有字段及“创建时间”翻译，不改变 schema 或存量数据。
- Prompt 文件夹结构和版本快照属于稳定产品能力。
- 直接导入版本时，同一身份和版本号只接受规范内容完全相同的幂等重试；冲突不得
  静默忽略或报告提交的正文已经保存。新行写入和读回校验处于同一事务，外层恢复
  可以在任何版本冲突时整体回滚。显式空字符串与缺失值分别保留。
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

创建时间显示验证（2026-10-17）：`pnpm --dir apps/desktop exec vitest run
--project unit tests/unit/components/prompt-detail-metadata.test.tsx
tests/unit/components/prompt-detail-modal.test.tsx --minWorkers=1 --maxWorkers=1`
共 14 项通过。组件输入覆盖创建/更新时间不同及收藏、正文、目录、标签变化后的
显示，不证明 IPC/数据库写入。`pnpm --dir apps/desktop typecheck:tests`、定向
ESLint 与 `pnpm --dir apps/desktop build` 通过。`pnpm --dir apps/desktop exec
playwright test tests/e2e/prompt-lifecycle.spec.ts` 在 `firstWindow()` 等待窗口
30 秒后超时，未到达收藏、编辑、恢复版本和重启后的时间断言；真实 Electron
操作验收仍未完成，未执行全量发布门禁。

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

测试面板变量输入（2026-10-17）：按 Prompt ID 复用 `prompt-variable-cache`，
打开时按历史输入、模板默认值、空值顺序恢复；每次编辑立即记忆，不要求先执行测试。
单模型与多模型共用当前变量，发送前替换系统和用户提示词，模板本身不被修改。
缓存沿用现有 localStorage `prompt_vars_<id>` 的版本、30 天有效期及大小限制，
与复制变量入口共享，无新表或迁移；缓存失效时回退默认值，写入失败提示且保留当前输入。
不同 Prompt 隔离；关闭面板、刷新和应用重启后仍可恢复有效缓存。
验证：27 项面板/缓存单测、构建、测试 TypeScript 和定向 ESLint 通过；真实 Electron
验证输入后不执行测试直接关抽屉、重开、重启恢复，再由单模型及双模型 HTTP 请求确认
变量已替换且 `$&` 等字面值保留。缓存写入故障由组件测试覆盖。

- Every UI action labeled "Copy Prompt" uses the same output-format pipeline.
  When a source Prompt has configured output targets, both menu and detail
  actions copy those resolved targets in stable order rather than bypassing the
  mapping.
- Variable prompts, language selection, copied feedback, and usage attribution
  follow the same flow. Usage remains attributed to the source Prompt even
  when the copied body comes from one or more mapped target Prompts.
- Variable input delegates filled text to the workspace when a copy callback
  is supplied. It does not write intermediate queue items to the clipboard;
  the workspace writes the completed output once. Cancellation leaves the
  previous clipboard and source usage unchanged. Without a callback, the
  standalone variable dialog owns its single clipboard write.
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

- 默认正常浏览，四种列表布局均隐藏勾选框；工具栏提供明确的“多选”文字入口。
  点击入口后显示勾选框、已选数量及全选/反选/取消操作，初始选中数为 0，不能把
  当前浏览的详情自动纳入批量范围。0 项时不可执行收藏、移动、标签或删除。
  默认卡片仍支持 Cmd/Ctrl、Shift 快捷进入多选；明确勾选一条也可使用批量动作。
- Prompt renderer store 拥有瞬时批量选择状态；卡片复选框、选中集合与操作栏
  使用同一状态。该状态不持久化，不改变 SQLite、文件内容或已有拖拽选择集合。
- 批量选择已开启时，点击卡片正文（包括 Enter/Space 键盘激活）切换该卡片的勾选状态，
  保留其他已选项目，不走打开详情的浏览路径。该规则适用于默认卡片与画廊卡片；
  Cmd/Ctrl 保留切换勾选语义，Shift 保留追加选择且不取消已勾选项。
- 点击取消、切换目录/布局或已选记录全部消失后退出批量选择；手动取消最后一项勾选
  后保留多选模式，允许继续选择。刷新/重启不恢复瞬时多选模式。退出后点击卡片恢复
  普通浏览。多选模式下，即使为 0 项也不自动恢复旧详情并覆盖选择；复选框的鼠标和键盘事件不再触发卡片
  的普通点击或标题编辑。
- 初始化先重置目录选择，再恢复有效的上次详情，避免重置覆盖恢复结果。
- 多选模式直接展示批量收藏、移动、标签、删除四个纯图标按钮，不藏在省略号或
  “批量操作”二级菜单中；0 项时按钮仍可见但禁用。图标统一为 16px、点击区域
  32px，使用本地化悬停说明和 ARIA 名称，不常驻动作文字。数量/选择控制、动作与
  取消排列为紧凑一行，空间不足时允许换行。默认卡片点击
  “已选择 N 项”展开全选/反选；画廊/看板保留已选/总量及全选、反选文字控件。
  表格复用列设置所在工具区及表头全选框；删除使用危险色，并保留原有确认流程。
- 默认卡片与画廊的全选/反选作用于当前筛选/目录全部结果（包括未滚动到或收起的
  匹配子项），表格作用于当前页。全选只增加勾选；反选切换范围内每项的勾选，
  保留其他页/范围已有选择，不解除私密文件夹访问限制。菜单支持键盘方向键、
  Escape 关闭与触发按钮焦点恢复；点击“批量移动”直接展开目标目录菜单。
  看板包含固定和未固定卡片，使用与画廊相同的选择工具栏；全选作用于当前全部结果。
  四个视图复用 renderer store 的模式/选中集合和同一选择集合算法，时间和空间成本均为 O(已选项数 + 当前范围项数)，
  不读取详情或发起网络请求，不增加持久化状态。

详情区操作图标统一为 16px，顶部纯图标按钮使用 32px 点击区域及一致间距；与底部
14px 操作文字及 16px 图标保持比例。AI 改写入口使用 Lucide Bot 图标，详情弹窗同步使用。
本轮修改归属 `apps/desktop` renderer，不改变 SQLite、IPC 或持久化格式，无迁移。

详情工作区以 2026-10-17 最新确认的上下分区为准：白色主题面板内按
参考图片、标签、来源、备注、系统提示词、用户提示词顺序呈现；所有宽度均使用
图标及类型标题在上、内容在下的布局，取消左右标签列及纵向分隔。保留细横向
分隔，来源/备注为空时省略。原文/Markdown 按钮位于标题行右侧，不能挤占正文
或编辑框宽度。提示词按内容自然增长，保留 Markdown、原文切换与行内编辑；
双击编辑时标题、描述、系统提示词、用户提示词四个输入框统一使用直角矩形、
相同主题边框及内侧聚焦描边，不附加阴影；横向内边距统一为 16px，正文纵向
内边距为 12px，使用白色主题表面，
保留可见聚焦边框。长词/链接不得撑破面板。图片采用 88px 正方形缩略图，
保留原图比例与预览入口。详情弹窗继续采用已有统一卡片样式，避免扩大本次布局范围。
行内编辑的用户提示词至少 320px 高，系统提示词空白时保持 80px；两者随内容自动
增高，最大为视口高度的 70%，超过后内部滚动，并允许手动纵向拉高。
自动高度由原生 field-sizing 根据当前草稿和可用宽度计算，不存储单独的高度状态；
底部保存/取消继续固定可用。该约定仅用于右侧行内编辑，不改变弹窗并排编辑区。
行内高度验收（2026-10-17）：`main-content-inline-edit.test.tsx` 的 18 项组件测试
通过；`prompt-detail-surfaces.spec.ts` 的真实 Electron 流程通过，新增短文本最低
高度、35 行正文自动增高及视口上限、超长内容内部溢出和纵向 resize 样式断言。
原有浅色/深色、保存读回、窄窗口流程保持通过；长正文截图保存在任务临时目录
`inline-height-e2e/`。构建、定向 ESLint 和差异空白检查通过。未运行全量发布门禁。
输入框一致性验收：同一 Electron 用例新增四个输入框的 0px 圆角、16px 左内边距
和逐项聚焦边框颜色一致性断言，浅色/深色流程均通过；构建、定向 ESLint 和差异
空白检查通过。截图位于任务临时目录 `unified-input-e2e/`。
重要内容标题保留图标加文字：来源 Globe、备注 StickyNote、系统提示词 Settings2、
用户提示词 MessageSquare；原文/Markdown 使用 CodeXml/BookOpen，均为 14px 图标。
改造范围仅为右侧提示词详情区。中间列表卡片保持原样：圆角卡片、选中时主色
背景与白色文字、原有拖拽标记；不采用概念图中的浅色选中条或类型前缀图标。
多选、拖拽、层级、搜索高亮保持既有行为。深色及壁纸复用主题变量。
所有权为 apps/desktop renderer；没有新存储、状态、IPC 或迁移。

上下分区验收（2026-10-17）：19 项行内编辑组件测试通过，桌面构建、测试类型
检查及定向 ESLint 通过。`prompt-detail-surfaces.spec.ts` 在真实隔离 Electron 中
验证标题在内容上方、切换动作不占正文宽度、直角编辑框及 16px 横向内边距，
并覆盖原文切换、保存后读回、浅色/深色、画廊详情弹窗和 1100×760 窗口的长链接
换行。截图已检查，保存在
`C:/Users/lingxiaotian/AppData/Local/Temp/prompthub-prompt-batch-20261017/stacked-detail-e2e/`。
本次未验证真实模型请求、全部语言排版、壁纸视觉或发布包。

左右对齐布局历史验收（2026-10-17，已被上述上下分区要求取代）：
- 24 项组件回归通过，覆盖列表层级、多选、选择恢复和元数据；桌面构建、测试
  类型检查及触及文件 ESLint 通过。`prompt-detail-surfaces.spec.ts` 的真实 Electron
  流程通过：两种主题、原文切换、行内保存并读回、画廊弹窗，以及 1100×760
  窗口中的长链接换行。该连续流程保留在一个测试中，超过 50 行。
- 额外隔离 Electron 检查通过真实图片 IPC 保存三张参考图，打开预览并用 Escape
  关闭；图片框 88×88px、框内图片 86×86px，无捕获的 renderer pageerror。
  示例内容和图片仅写入测试 profile，检查后已删除，不写入用户资料。
- 视觉来源为用户选择的 `codex-clipboard-d7c47f07-ee1c-46c5-b5dd-b12e3bebb76c.png`
  （1604×981）；实现为 `compact-reference-state.png`，1604×982 CSS px，DPR 2，
  截图按 CSS 像素归一。完整对照 `compact-comparison.png`、详情对照
  `compact-comparison-detail.png` 与主题/窄栏截图位于
  `C:/Users/lingxiaotian/AppData/Local/Temp/prompthub-prompt-batch-20261017/`。
- 对照已检查字体层级、行间距与对齐、白色/深色主题 token、原图比例和字段文案。
  首轮发现标签翻译键未解析、列表圆角偏大和缩略图边框挤压；已修复并重新捕获
  对照。标签使用 14px，窄栏正文与切换动作分行；未发现阻塞本次布局的视觉问题。
- 与概念图的保留差异：使用现有应用字号和可调整栏宽；保留文件夹选择器、精确
  创建时间、关系/输出格式入口与标签移除功能；图标沿用 Lucide，未复制彩色 emoji
  或增加无行为的省略号。测试文件夹/日期和列表数量由隔离夹具决定。
  本次不证明壁纸视觉、全部语言排版、发布包或全量 release 门禁。

范围纠正（2026-10-17）：中间列表的样式修改已撤回，右侧详情布局保留。
上述截图中的列表属于撤回前状态，不作为列表样式验收依据。
恢复后卡片布局与多选两组组件回归共 19 项通过，开发窗口已收到热更新。

编辑及测试入口（2026-10-17）：编辑 Prompt 的并排输入/预览共用外框，内部输入
容器使用直角，聚焦描边在容器内侧显示；独立输入框和外层弹窗的圆角不变。
并排编辑区使用统一的受限高度（系统 200px、用户 280px，最多视口高度的 60%），
左右均显示同高标题栏，正文区域顶边及底边对齐。输入组件填满左栏；长文本和
Markdown 预览在各自栏内滚动，不由预览撑高外框或在编辑框下留下空白。
短文本及空内容保留相同高度；展开弹窗和深色主题遵守同一约定。此为 renderer
布局修正，不新增状态或持久化。本条修复前的实现仅约束输入最小高度，预览可无限
撑高且输入包装层不拉伸；既有短文本验收未覆盖该缺口。
等高修复验收：`pnpm --dir apps/desktop exec vitest run --project unit
tests/unit/components/textarea.test.tsx tests/unit/components/edit-prompt-modal.test.tsx
--minWorkers=1 --maxWorkers=1`，17 项通过；`pnpm --dir apps/desktop exec playwright
test tests/e2e/prompt-editor-alignment.spec.ts`，1 项真实 Electron 流程通过，覆盖
长文本两栏独立滚动、几何顶底对齐、弹窗展开/还原、深色窄窗口、空/短内容及保存读回。
该用例保留连续编辑状态和窗口变化，超过 50 行。切换测试主题会重新加载应用，
测试必须重新打开编辑器，不能继续操作旧弹窗；初次用例因此超时，修正后通过。
构建、定向 ESLint、差异空白检查通过；测试类型检查被无关的
`appearance-settings-workflow.test.tsx` 八处不支持的 `exact` 参数阻塞。
截图位于任务临时目录 `alignment-final-e2e/`，已检查浅色/深色效果。
未运行全量发布门禁，也未更改用户数据或并行的外观设置测试。
详情正文不再放置重复的“多模型对比”卡片，单模型及多模型测试统一从底部
“测试”打开既有测试面板，在面板内切换模式。沿用当前模型配置和测试状态，
不修改模型请求、持久化或 IPC。

AI 测试流式约定（2026-10-17）：Prompt 单模型测试和多模型对比默认请求 SSE，
不依赖模型配置中旧的 stream=false，也不改写持久化设置。原先依赖该开关的实现已修正。
桌面 renderer 的 AI 请求服务负责流式解析与兼容回退，Electron IPC 负责原样传输。
服务端成功返回完整 JSON 时直接消费同一次响应；仅 400/422/501 且明确表示不支持 stream/SSE，
并且尚未输出增量时，允许一次非流式回退。鉴权、限流、网络故障、普通参数错误、流中断不得重放。
沿用现有原生 Anthropic 非流式适配边界；OpenAI 兼容端点（含兼容协议的 Claude）优先 SSE。
设置页轻量连接测试继续非流式。无新增表、迁移、IPC channel 或历史格式变化。
回归覆盖真实 Electron 首段提前可见、多模型并发增量、回退仅保存一条历史，以及 JSON 直返和错误分支。
流式解析抽到 `ai-chat-stream.ts`，请求编排沿用 `ai.ts` 的单一兼容重试循环；
已有长编排函数保留请求体上下文，每类兼容回退最多一次，由传输与工作台回归覆盖。
2026-10-17 验收：相关 74 项单元/组件测试通过；3 项既有历史 Electron E2E 与
1 项流式 Electron E2E 通过。受控 HTTP 服务暂停结束事件时，单模型首段、双模型各自首段
已在界面可见；随后结束响应并验证完整结果。明确拒绝 stream 后请求序列为 true→false，
历史只增加一条，详情读回正确；直接 JSON 响应由历史 E2E 覆盖。
构建、应用与测试 TypeScript、定向 ESLint 通过。E2E 曾修正隐藏当前结果与历史结果的
定位歧义，另一次测试在打开抽屉前出现元素脱离 DOM，重跑通过。未调用真实供应商。
验收输出保存在 OS 临时目录 `prompthub-ai-streaming-20261017/`。

AI 测试抽屉布局（2026-10-17 最新确认，已实施）：保留贴右全高抽屉。
文本测试顶部使用三个并列 Tab：AI 测试、多模型对比、测试历史。历史从原先常驻侧栏改为独立页，
默认打开当前测试；历史 Tab 内始终使用左侧记录列表、右侧只读详情，进入时默认选中最新记录。
手动选择后刷新保留仍存在的选择；删除需确认，成功后选中剩余最新记录，失败保留原记录和错误提示。
首次无记录或删除最后一条后，右侧显示尚未测试的空状态。列表与详情独立滚动，窄窗口仍保留双栏。
左侧记录使用紧凑两行：首行测试类型图标与时间，第二行模型与成功数量；类型提供悬停及无障碍名称，
长模型名截断并可悬停查看，减少纵向留白，标准字号下单条不超过 64 CSS px。
紧凑行验收：4 项历史组件回归与真实 Electron 的 `comparison and independent history tabs`
用例通过，宽窗口与 950×700 窗口实际行高均不超过 64 CSS px，浅色/深色截图已检查。
运行命令：`pnpm --dir apps/desktop exec playwright test tests/e2e/prompt-test-history.spec.ts -g "comparison and independent"`。
构建及定向 ESLint 通过；截图在 OS 临时目录 `prompthub-history-compact-20261017/e2e/`。
本次要求替代先前列表/详情整页切换约定；复用已有 SQLite 和删除 IPC，不变更存储格式。
2026-10-17 双栏历史验收：`prompt-test-history-layout.test.tsx` 4 项组件用例通过，
覆盖默认最新、列表常驻、选择/刷新、取消/确认删除、删除失败保留响应及无记录状态；
已有 `ai-test-workbench.test.tsx` 20 项通过。组件层替换 history IPC，持久化由真实 Electron 补验。
`pnpm --dir apps/desktop exec playwright test tests/e2e/prompt-test-history.spec.ts`
3 项通过，覆盖双栏坐标、单模型/对比记录、复制、删除后重新选中、全部删除后重启仍为空、
浅色/深色及 950×700 窗口、运行中切换历史返回。使用隔离 profile、本地 HTTP 服务及真实 SQLite，
未请求真实供应商。截图已检查，输出位于 OS 临时目录 `prompthub-history-split-20261017/e2e/`。
构建、应用及测试 TypeScript、定向 ESLint、差异空白检查通过；未运行全量 release harness。
新增组件测试首轮缺少 ToastProvider，测试类型检查发现不支持的 `exact` 选项；补齐 fixture 并修正后通过。
切换 Tab 保留当前测试输入、结果和运行状态；进入历史不停止请求，返回测试不重复执行。
单模型和多模型页使用完整抽屉宽度，固定底部执行栏；历史页不显示当前测试配置或执行按钮。
历史只读，不直接重放附件。状态属于 renderer，不新增 SQLite、IPC 或持久化配置。
只有实际收到非空白思考内容时才显示“思考过程”折叠区域。未收到思考内容时，
运行中使用单个 Spinner 与“生成中…”普通状态，不显示思考标题、折叠箭头或空内容边线；
即使正文已开始流式返回，也保持该规则，单模型和多模型一致。完成后移除普通生成状态。
有思考内容时使用紧凑标题行和单个 Spinner，不叠加脑图标与多个转圈，完成后可展开查看。
Spinner 遵循统一动画偏好：应用 standard 覆盖系统减少动态效果，
off 和未显式选择 standard 的系统减少动态效果仍可静止，并保留状态文字。
2026-10-17 无思考内容状态验收：33 项相关组件测试通过，包含空白内容、从生成状态切换到
实际思考内容及完成停止。2 项真实 Electron E2E 通过，覆盖无思考正文流式输出、双模型并发、
生成状态旋转、切换历史返回及完成移除。历史导航用例首轮在打开抽屉后查找执行按钮超时，
重跑通过。构建、应用 TypeScript、定向 ESLint 通过；复用已有七语言 `prompt.generating`。
截图与测试输出保存在 OS 临时目录 `prompthub-thinking-status-20261017/`。
验证覆盖真实 Electron Tab 切换、历史读取/删除、运行中切换返回、旋转变换、完成停止、
窄窗口底部按钮、键盘导航；组件验证异步状态和折叠行为。

2026-10-17 独立历史 Tab 与加载状态验收：32 项组件测试通过（工作台 20、思考区域 8、Spinner 4），
3 项真实 Electron E2E 通过。包含单模型/对比历史重启读回、复制/删除、独立 Tab 导航、
历史详情全宽、运行中切换返回、窄窗口固定按钮，以及系统 reduced-motion + 应用 standard 下
通过连续采样 CSS transform 确认 Spinner 持续旋转；请求结束后空思考指示移除。
浅色加载/历史列表/历史详情与深色窄窗口截图已检查，证据保存在 OS 临时目录
`prompthub-ai-history-tabs-20261017/e2e/`。构建、应用和测试 TypeScript、定向 ESLint 通过。
测试使用隔离 profile 与本地受控 HTTP 模型，未发起真实供应商请求。没有修改数据持久化契约。
以下为先前侧栏方案的历史验收记录，布局以本段及上面的最新约定为准。

2026-10-17 抽屉布局验收：20 项工作台组件测试及 2 项真实 Electron E2E 通过，覆盖
当前结果与历史切换、历史持久化重启读回、复制/删除、三模型并排响应、历史栏收起、
输入折叠、950×700 窗口固定按钮、焦点循环和 Esc 关闭。Electron 使用隔离 profile 与本地
HTTP 模型服务；未调用真实供应商。浅色历史、深色当前结果与窄窗口截图已对照确认设计复核。
构建、应用 TypeScript、定向 ESLint 通过；全量测试 TypeScript 仍被无关
`mcp-shared-targets.test.tsx` 的 `McpServerConfig.displayName` 缺失阻断。
截图、对照图与设计验收报告保存在 OS 任务临时目录 `prompthub-ai-drawer-20261017/`。
抽屉布局、响应列、历史 UI 与加载状态分别归属 `AiTestDrawer`、`AiTestResults`、
`PromptTestHistory`、`usePromptTestHistory`，使用现有 SQLite/IPC 契约。
这些组件保留完整声明式 JSX，单个渲染函数可超过 50 行；可变状态与请求流程独立，
由上述组件回归及真实 Electron 连续流程覆盖。

AI 测试历史（2026-10-17）：文本 Prompt 的单模型及多模型测试新增独立历史入口。
单模型与多模型对比共用文本、JSON 模式、JSON Schema 输出格式选择；对比的每个模型
接收相同格式，历史保存实际格式及 Schema 快照。无效 Schema 在发起请求前提示并阻止测试。
耗时在实时对比及历史详情统一换算为秒（保留两位小数），内部及 SQLite 继续以毫秒存储，
无需数据迁移，旧历史同样按毫秒换算显示。
2026-10-17 验证：输出格式/耗时相关 35 项组件及服务测试通过，桌面构建、应用及测试
TypeScript、定向 ESLint 通过。真实 Electron 配合本地 HTTP 服务验证两模型分别收到
文本、JSON 模式和 Schema 请求参数、无效 Schema 不发送请求，以及历史格式快照和秒数显示。
每次完成或失败保存一条运行快照，包括 Prompt ID/版本、变量替换后的系统/用户正文、
输出格式、附件名称（不保存附件二进制）、模型/供应商、响应、公开思考内容、耗时和
成功/失败状态。多模型结果属于同一次运行。关闭面板不阻止已发出请求的结果入库，
但关闭应用前尚未结束的请求不保证记录。历史只读回看和复制，不覆盖当前 Prompt；
可单条删除，按时间倒序分页，每页 50 条，不自动清理。旧的最后响应不能推断完整
运行信息，不伪造为历史；功能上线前的测试不会补录。生图历史仍由生图工作台负责。

所有权：SQLite `prompt_test_runs` 为唯一权威；DB 包负责存取，Core 校验并构造快照，
desktop IPC/preload 提供 add/list/get/delete，renderer 负责运行完成后提交和历史 UI。
表使用 Prompt 外键 ON DELETE CASCADE，主键运行 ID，按 Prompt/时间索引，摘要及
详细快照为 JSON；不存模型密钥、API URL 或完整模型配置。新增 CREATE IF NOT EXISTS
迁移与新装 schema 一致，初始化事务失败回滚；无旧数据转换。完整 SQLite 备份包含
该表，现有 Prompt JSON 导出/同步不包含本机测试记录；回退旧应用保留附加表。
存储失败单独提示，不能把成功测试改成失败或丢弃屏幕响应。输入需验证大小、模式、
字段和空字节；最多 32 个模型结果、2 MiB 单条 JSON。验证覆盖真实 SQLite 重开、
迁移幂等、分页隔离/删除、异常输入及真实 Electron 的测试→历史→重开→复制/删除。
历史 UI 的列表/详情保持在独立的 `PromptTestHistory` 组件，避免继续堆入测试面板。
该组件的声明式 JSX、SQLite 迁移重开用例及历史 E2E 连续操作超过 50 行，便于审查同一用户流程；
存储与校验逻辑拆分在 DB/Core，不放入组件。

2026-10-17 测试历史验收：`packages/core/tests/prompt-test-history.test.ts`
真实文件 SQLite 迁移、重开、分页及跨 Prompt 隔离/删除通过；
`ai-test-workbench.test.tsx` 19 项组件测试通过，包含关闭后完成请求仍提交历史、
历史存储失败仍展示成功响应。桌面构建、应用及测试 TypeScript 检查、定向 ESLint 通过。
`prompt-test-history.spec.ts` 使用本地 HTTP 模型服务与真实 Electron/IPC/SQLite，
覆盖单模型成功、对比部分失败、应用重启后读取、复制响应和删除记录；未验证真实
供应商可用性。截图与日志在 OS 任务临时目录 `prompthub-prompt-batch-20261017/history-*`。
Windows 的 Playwright 截图曾超时；改用 Electron capturePage 并等待重绘后验收通过。

既有编辑器入口验收：编辑器与测试工作台 28 项组件测试、构建、测试类型检查及定向 ESLint 通过。
`prompt-editor-test-entry.spec.ts` 在真实隔离 Electron 中覆盖输入/预览、保存读回、
无重复对比入口、底部测试面板切换与两模型选择；未发起真实供应商请求。
首次 E2E 定位到标签管理的 Edit 按钮，改为 Edit Prompt 后流程通过；不计为产品
失败证据。该测试将编辑与测试入口串为一个连续流程，超过 50 行。
截图保存在任务临时目录的 `editor-entry-e2e/`，开发窗口已收到热更新。

此前逐字段圆角表面约定被本次工作区布局取代；下列记录为原样式的历史验证。
2026-10-17 表面样式验收：`pnpm --dir apps/desktop exec playwright test
tests/e2e/prompt-detail-surfaces.spec.ts --workers=1` 通过。真实 Electron 隔离
profile 覆盖浅色/深色、详情与画廊弹窗的来源/备注/正文表面一致性，以及原文切换；
两种主题截图已检查。类型检查、定向 ESLint、构建通过；未执行壁纸视觉验收或
全量发布门禁。该端到端用例保留主题与视图切换的连续流程，允许超过 50 行。
2026-10-17 实施：已加入显式多选入口；四种布局共享瞬时 store 状态，退出后隐藏
复选框。空集合禁用进入按钮；多选期间结果变为空时保留可用的取消入口。详情顶部
四个动作已统一尺寸，AI 改写入口已替换为 Bot，窄列表工具栏可换行而不溢出。

本地验收：卡片 17、画廊 11、表格 17、批量栏与 AI 入口、看板及视图/详情恢复等
相关组件/store 回归通过；测试逐步升级为使用真实 renderer store，仍以 mock IPC
隔离组件边界。源码与测试类型检查、定向 ESLint、桌面构建通过。测试类型检查首次
被并行的 generation-workbench-runner fixture 缺字段阻塞，最终全量复测已通过。
`prompt-selection-mode.spec.ts` 的真实 Electron 隔离 profile 流程通过：四种布局默认无
勾选框、显式进入、选中/取消最后一项、退出、切目录、刷新恢复浏览；表格批量收藏
通过公开 API 读回真实持久化结果；AI 图标点击打开改写弹窗，实测顶部四图标均为
16×16 CSS px，浅/深色截图已检查。未调用远端模型，也未运行完整 release harness。
该 E2E 已接入 `test:e2e:smoke:built`；正常无窗口模式不截图，设置
`PROMPTHUB_E2E_HEADED=1` 可采集 `test-results` 下的视觉证据。
该场景在同一隔离 profile 内连续检查四布局、刷新及详情操作，保留超过 50 行的
场景编排以验证共享状态不会串扰；截图、点击和写后读回都使用实际应用入口。

同日批量动作补充：四项动作直接显示纯图标，原省略号菜单已移除；移动图标直接
打开目录选择，悬停说明与 ARIA 名称沿用七语言键。用户确认取消常驻动作文字，
默认卡片多选工具栏实测保持单行，四动作点击区域均为 32×32 CSS px。
相关五个组件文件 61 项回归通过；加入纯图标与悬停名称验收后，批量栏 12 项复测
通过。最终构建、定向 ESLint/Prettier 通过，两个隔离 Electron 场景通过并检查截图。
新增场景连续对两条勾选项收藏、移动、加标签，公开 API 读回持久化结果；取消删除
保留两条勾选，确认删除只移除这两条，未选第三条刷新后仍存在。该场景超过 50 行
以保留同一选择集合贯穿四种动作的可读验收顺序。未运行完整 release harness。

```sh
pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/main-content-batch-selection.test.tsx tests/unit/components/prompt-gallery-view.test.tsx tests/unit/components/prompt-table-view.test.tsx tests/unit/components/prompt-batch-action-bar.test.tsx tests/unit/components/prompt-quick-rewrite-trigger.test.tsx tests/unit/components/prompt-kanban-view.test.tsx tests/unit/components/prompt-kanban-stability.test.tsx tests/unit/components/prompt-list-header.test.tsx tests/unit/components/main-content-selection-restore.test.tsx tests/unit/components/prompt-active-view-isolation.test.tsx tests/unit/stores/prompt-view-preference.test.ts --minWorkers 1 --maxWorkers 1
pnpm --filter @prompthub/desktop build
pnpm --filter @prompthub/desktop exec playwright test tests/e2e/prompt-selection-mode.spec.ts --workers=1
pnpm --filter @prompthub/desktop typecheck
pnpm --filter @prompthub/desktop typecheck:tests
```

以下 10-12 记录为旧版本验证。

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

**当前要求（2026-10-17）：用户手动选择的 Prompt 列表布局持续有效，普通导航、
筛选和内容操作不得自动改写。状态：已修复，聚焦回归与 5 项 Electron 验收通过；2026-10-17 用户再次确认
切换文件夹会重置为卡片后，修复范围覆盖以下集合导航和持久化边界。**

#### 范围与状态所有权

- 右上角四个布局按钮对应 card（卡片列表与右侧详情）、gallery（画廊）、
  kanban（看板）、list（表格）。布局是当前桌面 profile 内整个 Prompt 模块共享的
  用户偏好，不按文件夹、收藏、类型或单条 Prompt 分别记忆。用户在 B 文件夹改选
  表格后，回到 A 也继续使用表格。
- “全部 / 文本 / 绘图”、文件夹、收藏、搜索和标签决定内容范围；布局决定如何
  展示结果。两者独立，布局按钮不得改变内容范围或排序。类型入口继续清除文件夹
  范围并返回主页，保留搜索词与标签筛选；其他筛选/选择规则沿用各自现有合同。
- graph（关系图谱）和 generation（生图工作台）是用户主动进入的专用页面，
  不属于四种列表布局；进入它们不得覆盖上次列表布局。从专用页面点击类型、
  文件夹、收藏或标签返回集合时，恢复上次列表布局，不再固定回 card。仅在图谱
  内选中节点或打开详情时保持图谱，不把详情操作解释为返回集合。
- 本条仅约束 Prompt 布局；Skills、MCP、Rules 的视图偏好及版本历史弹窗的
  详情/差异模式属于各自模块，不共享或覆盖 Prompt 布局。切到这些模块再返回
  Prompt 时，保留 Prompt 的布局偏好。

#### 操作条件与预期

下表均以用户已手动选择 gallery、kanban 或 list 为前提；card 也执行同一规则。

| 条件 / 操作 | 布局结果及边界 |
| --- | --- |
| 点击右上角其他布局按钮 | 唯一普通布局变更入口，立即切换并保存新选择；重复点击当前布局保持原值 |
| A → B → A 文件夹、父子目录、再次点击当前目录 | 始终保留最近手动布局，不因目标目录的类型、数量或历史访问记录改写 |
| 私密目录解锁成功 / 失败 / 取消 | 成功仅进入目录；失败或取消保留原范围；三者均不改变布局，不绕过权限 |
| 进入收藏、取消收藏导致最后一项消失、返回普通目录 | 保留布局；空集合显示该布局的空状态 |
| 全部 / 文本 / 绘图筛选，含折叠侧栏入口 | 保留布局，布局按钮选中状态与实际容器一致；纯文本或无封面也可继续画廊 |
| 添加、取消、单选/多选标签，以及标签弹层清空、空状态清除筛选 | 只更新筛选，不重置布局；展开与折叠侧栏行为一致 |
| 搜索、清空搜索、排序、翻页，结果为零或加载失败 | 保留布局；展示对应加载、空、错误/重试状态，不用切回卡片掩盖状态 |
| 打开/切换 Prompt，详情弹窗打开/关闭，编辑保存/取消、版本恢复 | 保留布局；详情仍按该布局原有面板或弹窗方式打开 |
| 新建、复制、收藏、置顶、标签修改、移动、删除及批量操作 | 成功、失败及重试均不写布局偏好；记录消失可按原合同清除选择 |
| 关系导航跨目录或清除筛选以显示目标 | 允许改变显示范围和选中项，不改变当前列表布局；私密目标访问合同不变 |
| 进入图谱/生图工作台后从集合入口返回，包括两者之间连续切换 | 恢复进入前最后手动选定的列表布局；专用页面内部动作不改该偏好 |
| 设置页、其他模块返回，侧栏折叠，窗口缩放和主题/语言切换 | 保留布局；响应式只调整可见尺寸/列数，不更改布局和用户保存的尺寸/列数偏好 |
| 刷新、关闭重开、启动目录 default/last/pinned，含目录失效 | 恢复有效布局偏好；目录回落只影响范围，“默认视图”不得被解释为重置布局 |
| 首次使用或旧持久化值缺失/非法 | 没有可恢复的有效布局时才使用 card；有效用户选择不得被默认值或迟到恢复覆盖 |

画廊 S/M/L、看板列数沿用各自现有持久化偏好；离开布局再返回不得重置。
本次不增加按目录偏好、设备间同步或自动按 Prompt 类型选择布局的能力。

#### 原因与修改边界

修复前的入口审查与对应改动：

- `apps/desktop/src/renderer/components/layout/useSidebarPromptController.tsx`：
  `openPromptFolder` 原先无条件写 card，影响普通文件夹和收藏；私密目录解锁成功也
  通过 `SidebarOverlays.tsx` 调用它。`handlePromptTagClick` 原先同样强制写 card。
  这三个导航入口现统一调用 store 的 `returnToListView`，普通布局保持不变，
  从 graph/generation 退出则恢复最近列表布局。
- `apps/desktop/src/renderer/components/layout/SidebarPromptPanel.tsx` 的
  `SidebarPromptTagPopover` 清空动作原先另有直接写 card，现复用同一返回列表动作。
- `apps/desktop/src/renderer/stores/prompt.store.ts` 将六种页面混存于 `viewMode`，
  原 setter 只替换该字段；Zustand persist 的 `prompt-store` 保存它。现补充
  `lastListViewMode` 保存列表偏好，并归一化旧数据；会话内的 `viewModeRevision`
  不持久化，用来阻止重复恢复覆盖新选择。
- `PromptListHeader.tsx` 是手动四布局选择入口；`PromptWorkspaceContent.tsx` 与
  `PromptViewContainers.tsx` 消费同一 `viewMode`。实现时必须保持按钮与容器同源，
  不在侧栏、详情或每个视图内保存另一份偏好。
- `useStartupFolderRestore.ts` 当前直接选择目录，不写布局；
  `usePromptWorkspaceTreeActions.ts` 的关系定位只改范围、筛选和选择。保留这些
  边界，并覆盖其与状态恢复/列表重新加载的组合，避免引入新的布局重置。

实现：由 Prompt renderer store 拥有“当前页面”和“最近手动列表布局”两个
不同语义的状态，沿用现有 `viewMode` 并增补一个仅允许四布局值的
`lastListViewMode`，在同一次 store 更新中维护。手动列表选择同时更新两者；
进入专用页面只更新当前页面；返回集合从同一 store 恢复布局。新增字段用于
记住离开列表后的用户偏好，不存入 Prompt 业务记录或按目录复制。

持久化复用当前 `prompt-store` UI 偏好路径，不新增 SQLite 表、IPC 或业务文件。
旧数据升级时，合法的四布局 `viewMode` 优先作为当前及最近布局；若旧值是
graph/generation 且无有效最近布局，则保留当前专用页面并以 card 作为首次返回
集合的默认值。非法最近布局应归一化；二者均无有效值才采用 card 默认布局。
这是旧数据缺少历史选择的兼容回退，不允许推断一个不存在的旧偏好。旧版本回退
仍可读取原 `viewMode`，新增字段不影响 Prompt 内容；旧版本不会提供新的保留保证。
偏好恢复只能在初始化时应用，不能在导航或数据加载完成后重新覆盖用户的新选择。
存储写入失败时保留本会话选择并按现有错误渠道报告，不能宣称已保存或回退布局；
无有效持久化记录时无法保证下次重启恢复。

#### 验收记录（2026-10-17）

- `apps/desktop/tests/unit/components/sidebar-prompt-view-mode.test.tsx`：22 项
  通过。真实 Sidebar、PromptListHeader 和 store 覆盖四布局与类型、折叠侧栏、
  设置返回、文件夹往返、收藏、标签与清空及专用页面退出后的布局。私密目录
  使用解锁弹窗替身验证成功/取消后的导航，未验收密码认证；断言按钮
  `aria-pressed`、目录范围和标签结果。
- `prompt-list-header.test.tsx`、`prompt-active-view-isolation.test.tsx` 和
  `main-content-selection-restore.test.tsx`（同一 components 测试目录）共 18 项
  基线通过。`sidebar-skills.test.tsx` 中 `ordinary prompt collections` 用例已改为
  恢复最近布局并定向通过，其他 20 项未在该次命令中运行。
- `apps/desktop/tests/unit/stores/prompt-view-preference.test.ts`：12 项通过，
  执行真实 store/persist 和内存 Storage，重新加载模块检查恢复；覆盖合法/缺失/
  非法旧配置、专用页面往返、尺寸保留、重复恢复、写入失败、损坏 JSON 及后续
  重新选择。数据库和远端同步不属于该层，使用替身且未调用。
- `prompt-read-consistency.test.ts`（stores 目录）、
  `tests/unit/hooks/use-startup-folder-restore.test.ts` 和
  `tests/unit/e2e/electron-launch-options.test.ts` 分别 10、9、4 项通过。
- `apps/desktop/tests/e2e/prompt-view-preference.spec.ts`：Windows 真实 Electron
  四布局共 4 项通过。实际点击目录、收藏、标签、图谱/生图入口及返回、刷新和
  关闭重开；同时断言当前布局按钮、真实容器可见、其他容器未挂载及 Prompt 可见。
  `prompt-view-edit-restore.spec.ts`：1 项通过，画廊中两个文件夹往返（含空目录）、
  打开详情、编辑正文并读回真实存储、关闭重开及 pinned 启动目录恢复后仍为画廊。
  使用隔离 profile、测试种子和凭据替身，无真实用户数据或外部服务。连续导航与
  关闭重开的测试函数保留同一 profile 的完整生命周期，可超过 50 行。
- 首轮组件失败是文件夹拖拽容器与选择按钮同名，后续按原生按钮定位；类型检查中
  移除了误用于 Testing Library 的 Playwright `exact` 参数。Electron 先因隔离
  APPDATA/LOCALAPPDATA 目录不存在而在窗口创建前失败，修复共享 E2E helper
  建目录后可启动；生图工作台返回的测试补上实际展开侧栏步骤。以上修正后复测通过。
- 定向 ESLint、构建及一次 Desktop 源码/测试类型检查通过。最后一次全工作区
  `typecheck:tests` 被本次范围外、同时新增的通知代码阻塞：
  `application-notification.ipc.ts` 缺少 `notifications.json`，settings store
  缺少 `setNotificationPreferences`，shared notifications 的 `module` 为 unknown。
  不把较早通过结果作为当前整个工作区类型检查通过；未执行全量发布门禁。
- 两个新 Electron 文件已接入 `test:e2e:smoke:built`，`test:e2e:smoke` 复用该
  入口，根级 release harness 的现有 desktop E2E 检查会选中它们。
  `pnpm --dir apps/desktop test:e2e:smoke:built --list` 确认 11 项中包含本次
  5 项；此清单检查不代表其余 6 项已运行。

重跑入口（仓库根目录；均进入 package 常用 Vitest / Playwright 发现范围）：

```sh
pnpm --dir apps/desktop exec vitest run --project unit tests/unit/components/sidebar-prompt-view-mode.test.tsx tests/unit/stores/prompt-view-preference.test.ts tests/unit/components/prompt-list-header.test.tsx tests/unit/components/prompt-active-view-isolation.test.tsx tests/unit/components/main-content-selection-restore.test.tsx --minWorkers=1 --maxWorkers=1
pnpm --dir apps/desktop exec vitest run --project unit tests/unit/stores/prompt-read-consistency.test.ts tests/unit/hooks/use-startup-folder-restore.test.ts tests/unit/e2e/electron-launch-options.test.ts --minWorkers=1 --maxWorkers=1
pnpm --dir apps/desktop exec vitest run --project unit tests/unit/components/sidebar-skills.test.tsx -t 'ordinary prompt collections' --minWorkers=1 --maxWorkers=1
pnpm --dir apps/desktop exec playwright test tests/e2e/prompt-view-preference.spec.ts --max-failures=1 --output=test-results/prompt-layout-verified
pnpm --dir apps/desktop exec playwright test tests/e2e/prompt-view-edit-restore.spec.ts --output=test-results/prompt-layout-edit
```

历史验证（2026-10-10，仅原类型筛选合同，不代表上述扩展已验收）：
  `pnpm --dir apps/desktop exec vitest run --project unit
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

### 2.11 Desktop empty states and tag management

- 卡片、表格和画廊的空列表复用相同筛选归因：存在搜索、标签或目录筛选时，清除操作同时重置这三个源；无筛选且库为空时，新建操作进入既有创建入口。不能把筛选无结果误报成丢失数据，也不改变当前布局。
- 标签管理支持用量升降序和名称排序，默认按用量降序，搜索与排序共存。Prompt 标签的“查看”动作关闭弹窗并使用该标签筛选，当前标签显示筛选中；Skill 标签用量及候选仍由 Skill 域所有。
- 批量选择与操作只服从本页 2.5 节的当前合同。旧 change 中的常驻文字栏、二级批量菜单和各视图独立 Set 方案已被替代，不得重新复制到实现。

### 2.12 Tokenized Prompt search

共享 DB 搜索将非空查询拆成独立字词，以经过转义的 FTS5 字面值进行 AND 匹配；词不必相邻。空白或无有效词的输入等同无关键词过滤，操作符与引号不能成为 SQL/FTS 指令。其余标签、目录及排序语义不变，不新增 schema 或第二套搜索索引。现有回归为 `prompt-fts-query.test.ts` 与 `prompt-db.test.ts`。

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
- 数据布局事实见 `spec/knowledge/structure/storage-architecture.md`。

## Stable Scenarios

### Scenario: Contributor changes prompt workspace behavior

When prompt file layout, metadata contract, or versioning semantics change materially:

- they update this owning topic when requirements change and mark implementation gaps
- they retain an activity plan only when needed under the documentation routing rule

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

## Historical orphan history recovery (2026-10-16)

Historical Markdown migration retains version files whose parent is absent from
both SQLite and all historical current-Prompt locations in the verified recovery
copy. It does not synthesize a parent or insert orphan SQL rows. The complete file
inventory is copied before retirement in the same recoverable publication; failure
restores the sources, and later startup does not replay archived deletions. Version
owners are resolved only after both historical workspace locations are merged.

## Current Verification Gap (2026-10-12)

The PA-01 delete-then-edit regression in `release-acceptance-prompts-ai-workflow.test.ts` stops at the expected recovery inventory: deleting a Prompt produces no bytes under the workspace trash path checked by the test. The recovery-location contract and deletion publication need reconciliation before this scenario can pass; subsequent edit/reopen assertions in that case were not reached. The test remains failing.
