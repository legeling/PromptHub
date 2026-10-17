# Desktop Spec

## Purpose

本规范定义 PromptHub 桌面端的稳定产品与工程边界。

## Stable Requirements

### 1. Product Role

- `apps/desktop` 是 PromptHub 的本地优先桌面应用主入口。
- 桌面端负责本地数据管理、原生 OS 集成、加密/主密码能力、数据库索引、文件系统工作区与 IPC 能力。

### 2. Process Boundary

- 原生文件系统、数据库、加密、备份恢复、平台集成等能力必须位于主进程。
- 渲染进程通过 preload 暴露的 API 与主进程通信，不直接跨边界访问主进程能力。

### 2.1 Standalone CLI Boundary

- 桌面应用不再把 Electron 主进程作为 CLI runtime；旧 `PromptHub ... --cli` 调用必须在
  updater、数据库初始化、workspace migration 和窗口创建之前退出，并提示安装独立 CLI。
- CLI 设置页检测到 userData `bin/` 下旧版 Desktop wrapper 时，只能有界读取并识别该
  普通文件，不能执行它做版本探测。只有 pnpm/npm 安装独立 CLI 成功后，才可再次确认并
  删除完全匹配的旧 wrapper；安装失败或文件已被替换时必须保留。

### 2.2 Desktop Application Shell

- 首批资源事件覆盖 Skills 批量分发/卸载、MCP 目标部署、插件部署和插件来源更新检测；不把普通编辑/收藏变更当作后台任务。已有失败详情会保留；事件的受校验 `inAppHandled` 标志避免再叠加通用应用内提醒。关闭提醒不隐藏操作自身的失败诊断。同步提醒使用现有同步历史完成入口，不新增后台同步调度。
- 2026-10-17 验证：Desktop `typecheck` / `typecheck:tests` 通过；新增通知模块 ESLint 与七语言键完整性检查通过。通知策略、IPC/反馈、独立设置菜单、复制反馈、AI 测试、生成批次完成/部分失败/取消、同步历史、通知点击模块路由、Skills/MCP 部署与插件来源检查的定向测试通过；Core `tests/settings-sqlite.test.ts` 7 项通过（含偏好重开和本机回执隔离）。手动保存偏好两项回归通过。扩大运行 `edit-prompt-modal.test.tsx` 时另有一项旧断言失败：仍要求当前工作区已移除的 `prompt.contentRequired` 提示文案；禁用保存行为仍满足原断言，该既有 UI 变更未在通知任务中回退。未执行 GUI/E2E、真实通知或安装包验收。
- 2026-10-17 通知策略补充验收：七语言菜单统一命名；七类别 × 六种配置组合通过真实临时 SQLite、preload API、已注册 IPC 和通知策略验证（42 种组合，OS transport 使用替身）。覆盖关闭/应用内/系统、前台抑制、系统总开关、声音与点击目标。实际 renderer 设置动作与任务同轮触发的 SQLite 回归通过，保存失败阻止按旧策略发送。插件部署成功、部分成功与刷新失败事件回归通过；相关 13 文件 111 项通过，邻接反馈/路由/部署/身份单元测试 56 项、Core SQLite 设置 7 项、手动保存开关 2 项通过。Desktop 两项类型检查、新增/修改通知模块 ESLint 与七语言键完整性检查通过；不包含真实 Windows 通知投递或外观验收。
- 本轮不增加通知中心、第三方应用版本检测或任务调度，不承诺 renderer 任务在退出后继续运行。点击系统通知恢复 PromptHub 并打开所属模块/更新或数据设置；Prompt 测试结果保留在现有测试界面，关闭该界面后的结果不重建。GUI 由用户验证，自动化不得触发真实系统通知。

- “通知策略”是独立设置菜单，按应用本身、同步与备份、Prompt 测试与生成、资源管理四组组织。应用更新、同步成功、同步异常、Prompt 测试、图片生成、资源操作、资源来源更新分别选择关闭、仅应用内、允许系统通知；系统通道共用启用、仅非前台、声音三个偏好；不提供发送测试通知按钮或独立预览接口。复制与手动保存只控制应用内成功提示，不能发送系统通知；自动保存保持原有状态反馈。
- 通知策略由主进程执行，renderer 只提交受校验的类别、结果、稳定事件 ID 和有限模块目标，不传入 Prompt 正文、错误原文或凭据。主进程读取 SQLite 偏好，在真实可见且聚焦的窗口判定前台；系统发送失败记录诊断并退回应用内，不改变业务操作结果。更新只报告真实 available/downloaded 事件；测试失败和多模型部分失败不能误报全部成功，取消/失效的测试不通知。批量生成与资源操作按批次汇总。
- 偏好在现有 settings 表新增 `notificationPreferences` JSON（`onlyWhenAway`、`sound`、七类别 `delivery`），沿用现有 Core 设置持久化、备份和恢复，无新表。缺字段采用完整默认值，旧 `enableNotifications` 继续控制系统总开关，旧复制/保存开关改为其文案所指的应用内反馈。主进程以本机专用 `notificationUpdateReceipts` 设置记录最近已提醒更新 ID（有界），不进入 renderer 设置同步；普通任务采用进程内有界去重及异常冷却。无数据迁移写入或历史业务数据改写；旧版本忽略新设置，删除通知专用设置可恢复默认。
- 通知发布前必须等待 renderer 已排队的设置持久化，避免刚关闭类别仍按旧策略发送；保存失败不得继续按旧设置发送。插件批量部署部分成功或部署后列表刷新失败均发布 attention 结果，保留原失败详情。设置写入等待逻辑独立于 store，通知发布与现有同步共用同一持久化屏障，避免循环依赖。发送前未等待设置和插件刷新失败遗漏事件的实现缺口已修复。
- 设置页复用现有设置行与 Select；声明式 JSX 组件及既有测试/部署编排的长函数保持完整用户流程，允许超过 50 行，新增通知决策、校验和传输仍独立封装。验证覆盖设置选择、真实 SQLite 设置重开、IPC 分发、测试完成/过期结果、批次生成和失败冷却；系统外观、点击与 OS 权限仍需用户实机验收。
- 全局 Toast 通过 body portal 呈现，层级必须高于确认弹窗、编辑弹窗及其遮罩（当前 Toast 100001，确认弹窗 99999）。弹窗打开或操作失败后仍能读取和关闭提示，不被背景模糊覆盖；错误/警告使用 alert，其他反馈使用 status。`toast.test.tsx` 检查 portal、相对层级和弹窗保留，实际绘制遮挡不由 jsdom 断言证明。

- Windows 系统通知在开发与安装环境中均显示 PromptHub 名称和应用图标。主进程在创建窗口前设置 AppUserModelID；安装版沿用安装器的 `com.prompthub.app`，开发版使用独立的 `com.prompthub.app.dev`，显示名称仍为 PromptHub。通知 PNG 按 `app.isPackaged` 选择真实资源，不能以是否加载 Vite 判断资源布局。
- 开发版首次发送系统通知时，在当前用户 Start Menu 的 `PromptHub Development/PromptHub.lnk` 注册 ICO 和开发入口；仅更新具有相同开发 AppUserModelID 的快捷方式，不覆盖安装版或其他程序的快捷方式。安装版快捷方式继续由安装器维护。
- 快捷方式名称和 `Notification.title` 不能替代通知顶部来源名称。开发版与安装版首次通知前，均在 `HKCU\Software\Classes\AppUserModelId\<当前 ID>` 幂等写入 `DisplayName=PromptHub`、`IconUri=<当前 PNG 绝对路径>`，完成后才发送并缓存本进程注册成功状态。只写这两个产品资源值，不修改系统通知权限或激活处理器；两步写入任一步失败则不发送，保留错误并允许下次重试补齐。重启重新注册以适应应用更新或目录移动。快捷方式及这两个值是可重建 OS 集成元数据，不承载业务数据；手动删除相应开发快捷方式与开发 ID 下的两个值可撤销开发注册。安装器卸载清理当前用户安装版资源值，更新安装时保留。

- 桌面一级模块由统一的 `AppModule` 状态驱动，当前稳定模块包括 Prompt、Skill、Agent、Rules、MCP 与 Plugin；设置入口固定在一级 rail 底部。
- 快捷键设置采用紧凑行：上下留白 12px，说明与标题间隔 2px，作用域下拉按钮和录入框统一 36px 高。空间不足时操作区换行，不裁切标签或控件；保留录入、清除、冲突提示与焦点样式，沿用设置主题变量。
- 一级模块的显隐与顺序使用同一份持久化偏好。恢复旧快照时必须过滤未知项与重复项；当前模块被隐藏时必须回退到第一个可见模块。
- 收起侧栏时只保留一级 rail，二级模块面板整体隐藏，主内容区使用释放后的空间；二级面板不得维护另一份一级模块选择状态。
- Skill、MCP、Plugin 资料库的自动卡片排列共享 240px 最小列宽和实际容器宽度规则：能容纳三张卡片及间距时至少显示三列，更宽时继续增加；空间不足才降为两列或一列，单列不得撑出容器。手动列数与 Prompt 大／中／小卡片设置保持独立；复用这些组件的 Web 页面采用相同行为。

### 2.3 Windows Close Choice

- Windows 关闭窗口对话框的“记住我的选择”必须先把 `ask | minimize | exit` 写入 main
  process 的共享设置入口，提交到 SQLite，再执行最小化或
  退出；不得依赖可能在进程退出后才完成的 renderer 后台订阅。
- 下次启动从 canonical settings hydrate 后必须立即把规范化 close action 重新应用到
  main process 内存；不得继续使用 renderer hydrate 之前的默认 `ask`。
- 未勾选记住时只执行本次选择，不改变持久 close action。持久化失败时必须保留对话框、
  恢复之前的 renderer/main 内存值并显示可重试错误，不得假装记忆成功后继续退出。

### 2.3 Business Confirmation Dialogs

- Desktop 页面及复用 Desktop workspace 的 Web 页面，业务确认统一使用现有
  `ConfirmDialog` 自定义组件；禁止浏览器 `alert / confirm / prompt`。批量删除、
  覆盖、恢复、迁移与未保存离开都必须等待用户决定，取消不得继续写入或导航。
- 跨页面的异步确认由 renderer UI 的 `ConfirmationHost` 单独呈现；待确认内容和
  Promise continuation 仅属于瞬时 UI 状态，不持久化，不增加 IPC 或数据真源。
  替换请求或卸载 host 时明确取消旧请求，不保留队列或悬挂的 Promise。
- 确认 / 取消文案复用 i18n；破坏性操作使用 destructive 样式。对话框循环管理
  焦点，Enter 尊重当前聚焦的取消按钮，Escape 只取消当前确认，不穿透到底层
  编辑窗口；执行中的 loading 对话框禁用按钮、键盘和遮罩关闭。
- 文件 / 文件夹选择属于系统文件集成；main-process 托盘的 Provider 切换与结果
  通知保留 Electron OS dialog，供主窗口隐藏时使用；renderer 尚未启动时的
  启动失败提示保留 OS dialog。浏览器关闭 / 刷新页面的 beforeunload 未保存保护
  由宿主控制，不能用异步 React 弹窗代替而丢失保护。React Native Mobile 的
  `platformAlerts` 属于独立产品界面，本轮未迁移其 Alert 及 Web fallback。
- Prompt 批量删除保留原有逐项持久化契约；确认期间及执行期间不重复提交，
  失败显示错误且不得报告全部成功，不宣称整个批次具备新增的原子事务。画廊
  批量删除在取消 / 失败时保留选择，成功移除的记录由既有选择裁剪机制清除。

### 3. Stable Internal Sources

- 长期工程边界和代码结构治理见 `spec/knowledge/structure/code-structure-guidelines.md`。
- 数据布局与迁移事实见 `spec/knowledge/structure/data-layout-v0.5.5-zh.md`。
- Rules 工作台稳定逻辑见 `spec/knowledge/behavior/rules-workspace.md`。
- 历史 desktop 相关演进记录保存在 `spec/changes/legacy/docs-08-todo/`。

### 4. Card Detail Editing

- 桌面端 card view 的右侧 Prompt 详情区应支持不离开当前上下文的轻量快速编辑，用于修改选中 Prompt 的标题和当前可见的用户提示词；标题展示态应支持双击直接进入该快速编辑。
- 完整字段编辑仍由专门的 Prompt 编辑弹窗承担；轻量快速编辑不应替代完整编辑流程。

### 5. AI Workbench Protocol Routing

- 桌面端 AI workbench 必须为每个聊天模型持久化显式 `apiProtocol`，当前稳定支持 `openai`、`gemini`、`anthropic` 三种协议。
- 预制 provider 仅用于默认 base URL、推荐协议和展示文案，不是最终请求协议的唯一来源；自定义 provider 也可以显式选择 `Gemini` 或 `Anthropic` 协议。
- renderer 与 main process 的聊天请求和模型发现请求必须按 `apiProtocol` 分支构造 endpoint 与鉴权头，避免继续只按 provider 或 host 猜测协议。
- renderer、`packages/core` 与 Web 服务的 endpoint、鉴权头和旧配置协议推断统一由 `packages/shared/utils/ai-protocol.ts` 派生；业务调用层不得维护自己的副本。URL 尾部 `#` 表示在标准化后禁止继续自动追加协议路径。
- `Anthropic` 当前稳定行为为原生 `POST /v1/messages` 非流式聊天与 `GET /v1/models` 模型发现；在补齐原生 SSE 解析前，桌面端不应把 Claude 原生协议暴露为可流式聊天能力。
- AI workbench 的“测试模型 / 测试默认模型 / 测试连接”是轻量探活，不是长文本生成或性能压测；聊天模型测试必须使用短 prompt、小 token 上限、非流式、关闭 thinking，并带显式测试超时，避免本地 OpenAI-compatible 模型因为继承 2048 token、stream 或 thinking 配置而被拖慢。
- `settings-sqlite-v1` 前，非空 CLI AI 文件拥有模型清单；完成旧 renderer 迁移的 profile 则采用 provider 配置与旧设备 vault。升级后 Desktop/CLI 只读写 SQLite 模型与路由，凭据保留在加密 vault。初次浏览器迁移不得用默认空清单覆盖已有模型。空模型路由统一为 `{}`。历史 beta 清单丢失修复限于升级事务：只采用受管升级安全点中包含全部悬空路由 id 的候选；SQL 升级完成后绝不从旧备份复活清空的清单。

### 5.1 Agent Provider And Model Configuration

- Agent 原生供应商列表项的标题与分类状态分行展示，标题允许换行，激活开关不得挤掉标题。
- Agent 资产卡片及标签区随内容增高，不得用固定高度与溢出裁切隐藏换行后的标签。
- Agent 资产卡片的正文宽度必须受卡片约束；长路径在卡片内省略并可悬停读取全文，状态徽标可换行，标签包括连续长名称均须在卡片内换行，不能撑出列表横向滚动条。工具栏中独立滚动的筛选条不受此限制。
- Agent 的 Provider & Model 页面必须复用同一套供应商 workbench 布局和 normalized model contract；平台差异只能存在于 main-process native adapter，不得为每个 Agent 复制 renderer 页面。
- 用户侧统一使用“供应商”术语；内部 `ProviderProfile` 类型、存储和 IPC 名称仅作为兼容合同保留，不得直接成为界面文案。
- Agent 当前原生配置是只读投影，不得提供“导入当前配置”或“转为可编辑配置”入口。供应商侧栏保留“从 PromptHub 导入”和新增供应商操作；两者必须显示图标与本地化文字，固定宽度侧栏允许纵向滚动，但列表行、内边距和 focus state 不得制造横向滚动条。
- 从 PromptHub 导入供应商时必须复用 Model Services 的供应商图标，并按模型标识推断模型家族图标；协议选项由 main process 计算 PromptHub 上游协议与目标 Agent 可写协议的直接交集。界面必须显示并提交所选协议，main 必须重新验证；官方 OpenAI 直连优先 Responses，支持 Chat/Completions 的目标对第三方兼容端点优先使用该协议。当前 Codex 原生直连仅接受 Responses，缺省 `wire_api` 同样按 Responses 解释；不得通过本地代理伪装协议转换。
- 初期供应商/模型配置仅支持 Claude Code、Codex、Antigravity、Pi、OpenCode。`supported` 表示完整 Provider adapter，`partial` 表示已有原生模型适配；Antigravity 不因此获得第三方供应商接入能力。其他 Agent 在此能力上标为暂不支持，不开放配置、导入、激活或探活入口。共享 capability registry 是页面、主进程与托盘的唯一支持范围真源。
- 收敛范围不删除既有供应商档案、密钥、原生文件或会话，不新增数据库迁移；旧档案仍可备份、导出或删除，但不可新建、修改或激活到暂不支持的平台。恢复支持只需更新 registry 并重新验证适配器，不需要数据回迁。其他 Agent 保留既有 Skill、MCP、Plugin、规则与配置文件能力；没有原生 Plugin 协议的平台不因本轮扩大支持。已有历史会话读取保留，不新增适配，也不作为初期交付门槛。
- Antigravity 的 Skills/MCP root 仍是 `~/.gemini/config`，模型设置单独解析到 `~/.gemini/antigravity-cli/settings.json`。Claw family 只用于展示分组，各成员继续使用自己的 root、文件格式和安全边界，不得继承 OpenClaw adapter。
- native model adapter 只能向 renderer 返回 model、provider、脱敏 endpoint、可用模型与 credential status；API key、token 和独立 secret store 不得进入 IPC。写入只更新模型选择字段，并使用 2 MiB 有界读取、symlink/路径 containment 校验、私有备份、并发修改检测、原子替换、语义重读和失败回滚。
- 暂不支持的平台底层适配代码仅保留，不注册到供应商运行时；不得绕过 capability registry 恢复配置读写。

Agent 产品维护配置（2026-10-13）：每个内置 Agent 在
`packages/shared/constants/agent-definitions/<agent-id>.ts` 中维护一份纯数据
`AgentPlatformDefinition`，集中身份、跨平台路径、CLI 描述和深度能力声明；
`index.ts` 只做静态汇总与按 ID 查询。深度能力的 `status` / `evidence`
保留现有适配成熟度，`enabled` 单独控制产品开放。关闭已实现能力不删除适配器，
开启 `planned` / `unsupported` 也不会注册或伪造支持。原
`SKILL_PLATFORMS` 与 capability registry 均从这些定义派生，现有消费者和
适配器继续复用；路径级资产能力继续由声明路径计算，不维护第二份路径表。
模型入口文件的格式、候选路径优先级与默认根偏移由同一声明的 `modelConfig`
维护；Provider 回滚目标和 JSON/TOML/YAML 读写共用这些路径，不再维护模型
路径映射表。Antigravity 仅在根匹配声明的默认根后缀时使用 CLI 模型根偏移，
独立自定义根保持原值。Pi 的模型、供应商、凭据与测试入口也必须通过
`providerModel` 开关。会话服务的读取/删除/索引入口和 Codex 外观服务及 IPC
在执行文件、命令、对话框或网络操作之前校验相同能力真源；关闭会话时不暴露
索引源与删除能力，开启未实现状态不放行操作。
公共 Agent runtime 只解析 Codex 的配置根，不以 `providerModel` 开关决定
整个 runtime 是否可初始化；关闭 Codex 不影响其他 Agent 的供应商、会话与
独立外观能力。Codex 账号保存/导入/激活及原生供应商迁移读取由各自执行
所有者检查供应商开关，账号历史读取与删除仍可用。
完整供应商适配器（包括暂未注册的平台实现）、旧 Codex 迁移服务与额度服务
的模型配置读取也复用 `modelConfig`，不维护独立文件名或候选数组。
OpenCode 已有完整适配器与通用模型读取存在候选范围差异，现统一为既有
原生优先级 `opencode.jsonc` → `opencode.json` → `config.json`；前两项
缺失时可读取原本已被完整适配器支持的第三项，不引入新文件格式或备用层。
现有文件、凭据及备份结构不变，回退源码即可撤销；不自动迁移或删除文件。
这是编译期产品配置，不提供热加载，不修改 SQLite 用户设置、供应商档案、
原生文件或用户侧启停语义；无数据迁移，撤销仅回退本次源码重组。
固定 37 条声明只做线性初始化与常量时间 ID 查询，无新增磁盘扫描或网络请求。

本次配置重组验证：重组前后 37 条完整平台定义与有效深度能力逐项一致；
Shared 常用测试入口全部通过，新增 4 项配置契约用例；13 个桌面定向文件
163 项、3 个 Core 文件 24 项通过。开关测试替换单个 TS 声明，执行真实能力
查询与既有 Provider 注册清单，覆盖关闭已实现能力、开启未实现能力和启用
partial adapter；真实 Provider IPC 集成覆盖 SQLite、原生文件、重开读回与
失败回滚，Electron 运输层仍为替身。Shared/Core 类型检查、Desktop 源码及
测试类型检查、45 个本次 TypeScript 文件的 ESLint 与差异检查通过；
未执行真实账号、GUI、发行包或全量发布门禁。

本次遗漏修复验证（2026-10-13）：21 个桌面定向文件共 214 项通过，Shared
测试、Shared 类型检查、Desktop 源码及测试类型检查、定向 ESLint 与差异检查
通过。新增回归覆盖关闭后的会话读取/删除/索引拒绝、已有 SQLite 索引不可
绕过开关、全部 Pi 模型/供应商入口、外观入口在对话框和副作用前拒绝，以及
模型声明路径的真实写入/重开读回、Provider 默认回滚路径、既有路径优先级
与自定义根保持。执行开关闭环用例将关闭、数据保全和重新启用后的读写保留
在同一用例中，以明确时序和真实结果；不为控制用例行数拆散该闭环。
Electron 运输层与外观引擎使用测试替身；未执行真实账号、GUI、发行包或
全量发布门禁。既有用户文件、数据布局与持久化 schema 均未更改。
公共 runtime 的关闭 Codex 回归保留真实初始化、Claude 档案创建/激活、
原生文件读回、会话访问与 Codex 拒绝操作的完整时序；较长单用例用于证明
同一关闭状态下的跨能力结果，不拆成互相独立的模拟成功测试。

二次遗漏修复验证（2026-10-13）：30 个桌面测试文件共 360 项通过，包含
关闭 Codex 的真实 runtime 构造、Claude 首次激活字段确认/文件读回与会话
访问，以及禁用 Codex 账号变更和保留历史清理。完整 Claude/Codex/OpenCode
适配器回归覆盖改变声明后的原生读写、验证与回滚；既有未注册平台适配器、
Codex 迁移、额度、会话索引与 4 项注册 IPC/重开/失败恢复集成回归通过。
Shared 测试、Shared 类型检查、Desktop 源码和测试联合类型检查、定向
ESLint 与差异检查通过。复审未发现本次范围内的执行开关绕过、重复模型
文件名/候选表或新增策略层；辅助凭据、模型目录和备份包路径仍由原所有者
维护，不属于模型主配置入口。Electron 运输、密钥加解密与外部网络使用
测试替身，未执行 GUI、真实账号、发行包或全量发布门禁。

配置契约与开关回归可从仓库根目录执行
`pnpm --filter @prompthub/shared test` 和
`pnpm --dir apps/desktop exec vitest run tests/unit/services/agent-definition-switches.test.ts tests/unit/services/agent-platform-capabilities.test.ts`。

初期范围验证（2026-10-10）：18 个桌面定向测试文件共 253 项经分批修正与复测通过，另有 10 项深链接测试、4 项真实 SQLite/文件/注册 IPC 集成通过；文案变更后单独复测置灰组件用例。Core 类型检查、Desktop 源码及测试类型检查、定向 ESLint 通过。外部额度响应与 Electron 消息运输层使用测试替身；未执行真实账号请求、GUI、发行包或全量发布门禁。支持收敛使用常量时间 capability 查询，平台列表仅按现有 registry 线性过滤，不新增扫描、网络或持久化开销。

核心回归可从仓库根目录重跑：

```sh
pnpm --dir apps/desktop exec vitest run --project unit tests/unit/main/agent-initial-support.test.ts tests/unit/main/agent-platform-context.test.ts tests/unit/main/agent-provider-runtime.test.ts --minWorkers=1 --maxWorkers=1
pnpm --dir apps/desktop exec vitest run --project integration tests/integration/release-acceptance-agents-assets-providers.test.ts tests/integration/release-acceptance-agents-assets-provider-activation.test.ts --minWorkers=1 --maxWorkers=1
pnpm --dir packages/shared exec node --experimental-strip-types --test tests/agent-deep-link.test.ts
```

断言覆盖支持集合、托盘与工作区投影一致、范围外额度零凭据读取/零网络、原生文件不变、旧档案保全与导出、禁止新建/修改/激活，以及保留平台导入激活后的重开和故障回滚。旧范围内 Gemini/Copilot/Grok 额度与 Kiro/Copilot 激活的成功用例已替换为当前“暂不支持且无副作用”合同，不再把保留的底层实现作为发布支持承诺。

### 5.2 Agent Native Config Editor Surfaces

- Agent 配置文件页使用统一的共享文件编辑器，不为单个 Agent 复制编辑器或主题样式。
- 浅色主题下，配置页标题栏、共享文件编辑器右侧主画布和 CodeMirror 编辑面使用 `card` 语义面；应用 shell 与文件树保持较安静的 `background` / `muted` 语义面，并通过既有 divider 分层。
- 深色主题继续使用同一组配对语义 token；配置编辑器不得硬编码 white、专属灰阶或绕过全局主题变量。该表面层级不改变文件发现、allowlist、读写、保存、文件管理器动作或 IPC 边界。

### 6. Prompt AI Workbench Boundaries

- 桌面端 Prompt AI 测试抽屉必须按 `promptType` 收敛可见模式：文本 Prompt 只提供单模型测试与多模型对比，image Prompt 才提供生图测试。
- 文本 Prompt 在 AI 测试抽屉中附加的图片属于测试期临时附件，必须真正参与聊天消息构造，但不得写回 Prompt 持久化字段。
- image Prompt 在 AI 测试抽屉中可以同时使用已保存参考图与当前测试会话上传的临时参考图作为生图输入。
- Prompt 详情的大图预览必须按 `Prompt.images` 的既有顺序连续浏览：从被点击图片
  开始，多图时显示有界的上一张/下一张控制、当前位置，并支持左右方向键；单图或
  不属于已保存图片集合的临时 AI 图片不显示画廊控制。
- 进入生图工作台时必须默认收起 Prompts 二级侧栏，但顶栏侧栏按钮仍可在当前工作台
  会话内临时展开或收起；该临时状态不得覆盖普通 Prompt 页面持久化的侧栏偏好。

### 7. Prompt Modal Information Hierarchy

- 桌面端新建 Prompt 弹窗必须优先展示标题、Prompt 类型与用户提示词，让用户先进入写作流。
- 新建 Prompt 首屏不应再额外显示“Basic Info”分组标题，也不应展示仅用于解释类型的冗余说明文案；变量使用说明应作为用户提示词附近的轻量提示存在。
- 新建 Prompt 的描述、system prompt、参考媒体，以及文件夹、标签、来源、备注等扩展信息必须默认收纳在 `More Settings` 折叠区内，避免干扰主要创作流程。
- 桌面端编辑 Prompt 弹窗必须保留更强的已有内容上下文：`Basic Info` 中继续展示描述、Prompt 类型，以及 image Prompt 的参考媒体。
- 文本 Prompt 的参考媒体在编辑场景中仍应收纳在 `More Settings` 中，不挤占基础编辑区。
- Prompt 参考媒体的原始字节必须由 runtime path helper 管理在 `userData/data/assets/images/` 与 `userData/data/assets/videos/`；SQLite `prompts.images` / `prompts.videos` 只保存托管文件名数组，renderer 通过本地媒体协议读取，不能把任意来源绝对路径持久化到 Prompt。
- 桌面端参考媒体选择器必须绑定发起 IPC 的 PromptHub 窗口，避免原生对话框被其他窗口遮挡；用户取消选择保持静默，picker/bridge/托管复制失败必须显示本地化错误提示，不能只写控制台。

### 8. Quick Add Prompt Creation

- 桌面端 `Quick Add` 必须同时支持“分析已有内容”和“AI 生成 Prompt”两种快速创建路径。
- “分析已有内容”路径应允许用户粘贴一段已有 Prompt，系统先创建占位 Prompt，再由 AI 在后台补齐标题、描述、system prompt、标签和建议文件夹。
- “AI 生成 Prompt”路径应允许用户只描述目标与约束，由 AI 先返回结构化 Prompt 草稿，再一次性创建完整 Prompt；不得把用户的需求描述直接保存为最终 `userPrompt`。
- 两种路径都必须复用同一套 `quickAdd` 场景模型配置，不引入额外的 AI 场景设置负担。

### 9. Update Flow Failure Visibility

- 桌面端更新弹窗中的手动升级前备份动作必须在弹窗内处理失败路径；如果预升级快照或导出步骤失败，界面必须进入可见错误态，而不是把 Promise rejection 泄漏到事件处理器外。
- 更新弹窗只允许渲染主进程更新服务通过 IPC 返回的真实状态；开发构建可以明确提示更新检查已禁用，但不得在运行时注入演示版本、下载进度或其他模拟状态。
- 预览通道已精确匹配 GitHub Release tag 时，更新弹窗应优先展示该 Release 的发布说明，保留标题、Emoji、链接和经允许的 GitHub / Shields HTTPS 图片；未授权图片来源必须退化为 alt 文本。
- 下载过程不得隐藏已获取的发布说明；进度条使用弹窗内容宽度，只展示一个权威百分比，并通过可访问的 `progressbar` 语义暴露进度。
- 更新下载来源分为自动、官方源和镜像源；自动模式先尝试官方源，再按有界列表回退镜像。下载中切换来源必须取消当前传输、重新读取所选来源的更新元数据并从零开始，同时持续展示已下载大小、总大小、速度和手动网页下载入口。

### 9.1 Direct macOS In-App Updates

- 从 PromptHub 官方 DMG 安装、且后续 release ZIP 已完成 Developer ID 签名与 Apple 公证的 macOS 用户，必须可以在应用内下载并重启完成升级；更新流程使用 `electron-updater` 的已验证 ZIP payload，不要求用户手动挂载 DMG 或复制应用。
- Homebrew Cask 安装仍由 Homebrew 负责升级；应用内更新不得下载或替换 Caskroom 中的应用。

### 9.2 macOS Menu Bar Icon

- macOS 菜单栏必须使用独立的 PromptHub 单色 Template Image，不得缩小带蓝色圆角底板、阴影和高光的完整应用图标。
- 菜单栏资源以透明 `16x16` 72-dpi PNG 和同名 `32x32@2x` 144-dpi PNG 成对提供，文件名保留 `Template` 后缀；主进程不得对首选资源再次做运行时位图缩放。
- 主进程检查到可用或已下载版本时，macOS 菜单栏切换为带向上箭头更新标记的单色 Template Image；原生菜单以版本号和副标题替换通用“检查更新”动作，并复用既有更新弹窗。确认无更新后恢复普通图标和通用动作，检查中、下载中或暂时错误不得抹去已知更新。

### 9.3 Background Work After Window Reveal

- 主进程通过菜单栏、全局或本地快捷键、托盘命令、第二实例或既有窗口恢复路径显式显示主窗口时，必须主动向 renderer 发送最终可见状态，不得只依赖平台相关的 `show` / `restore` 事件。
- renderer 收到可见状态后必须先更新窗口状态，再恢复隐藏期间挂起的 WebDAV/S3 在线同步、自部署上传备份和本地数据刷新；重复的可见通知不得启动重复操作。
- 图形沿用 PromptHub 层叠卡片识别，但必须接近占满画布，并让顶层方片成为主要轮廓；系统负责深浅色、选中态和辅助显示环境下的着色。

### 9.3 Desktop Tray Agent Asset Actions

- 桌面状态栏菜单必须把 Prompt、Skill、MCP、Plugin 和 Rule 视为当前可管理的 Agent 资产；未来的一等 Agent 实体是独立产品边界，不得作为第六种资产类型混入现有创建命令。
- Prompt、Skill、MCP 与 Plugin 菜单项必须打开各自已有的创建或导入流程；Rule 当前只进入已有管理工作台，不得宣称存在尚未实现的通用新建流程。
- 状态栏命令必须使用 `packages/shared` 的类型化命令协议，经 main、preload 与 renderer 路由；主进程只负责原生菜单、窗口显示和命令投递，renderer 继续拥有导航与业务弹窗。
- preload 必须缓冲 renderer 尚未订阅时收到的状态栏命令。MCP 与 Plugin 等按需加载工作台必须先注册创建监听器，再发布就绪状态；卸载时必须先撤销就绪状态，再清理监听器，避免首次点击或重渲染期间因 lazy mount 竞态而丢失命令。
- 状态栏菜单文案必须覆盖桌面端七种语言，优先读取应用内已保存语言，并在数据库尚未可用时回退到系统语言。Renderer 的语言设置在用户切换和旧版本地状态恢复时都必须同步到 Main 设置数据库；同步恢复回调只能在 Zustand Store 完成初始化后执行，避免界面语言与原生菜单语言分叉。Renderer 没有持久化语言时，Zustand 临时默认值不得覆盖 Main 设置，必须由 Main 返回的已验证语言恢复界面；已有 Renderer 明确偏好继续优先并回写 Main。
- 未来 Agent 管理入口只有在对应能力真正可用时才显示；不得展示不可执行的灰色占位项。
- 旧版 Renderer 设置迁移必须保留语言字段的有效性：缺失或不支持的原值按未选择处理，不得把规范化产生的默认 `en` 作为明确偏好回写 Main。其他有效偏好照常迁移；本规则不增加持久化字段或改动 canonical renderer persistence。

### 9.4 Desktop Tray Agent Quotas

- 初期额度查询仅支持 Claude Code、Codex、Antigravity 和已有的 Kimi Code；其他平台统一暂不支持，不读其额度凭据、不发出额度请求、不进入托盘额度列表。Overview 和调用入口使用同一共享 capability registry，不将未知额度伪造为零。
- 状态栏额度只能通过 Electron 原生 `Menu` / submenu 呈现；不得为额度创建 renderer `BrowserWindow`、vibrancy 外壳、自绘卡片、产品图标行、套餐胶囊、环形/条形进度或展开控件。macOS、Windows 与 Linux 共享同一原生菜单信息层级。
- 原生状态栏菜单必须复用 Agent 工作区的进程级 usage service，不得创建第二套凭据读取、网络请求或额度缓存。
- 进程级 usage service 显式复用 `network-proxy` 的请求入口；系统代理模式使用应用已配置的 Electron Session 网络栈，手动代理和直连保持各自既有策略。不得捕获代理初始化前的全局 fetch 或在请求失败时偷偷改为直连。Overview 区分网络失败、超时和 HTTP 错误，未知错误保留通用提示，不展示原始网络异常或凭据。
- 菜单打开时先同步展示最近一次内存快照，再在后台通过 adapter 自身的 60 秒缓存更新；只有用户点击“刷新额度”时才绕过缓存。
- 首次快照尚未完成时，菜单必须按稳定 registry 顺序同步展示每个已验证 Agent 的具名 loading 行；两路有界并发中的单项结果完成后，只替换对应 Agent 行，不等待其他 Provider。
- 额度投影只覆盖已经验证的 usage adapter，Provider 请求最多两路并发。单个平台失败必须被隔离并显示明确的未连接、凭据过期或暂不可用状态，不得伪造成 `0%`。
- 紧凑摘要使用最紧张指标的剩余百分比；子菜单显示全部指标、重置时间和套餐。动态名称、指标和错误必须经过有界、无控制字符的安全投影，凭据和原始 Provider 错误不得进入菜单或日志。
- Agent Overview 与菜单栏额度必须复用版本化的 scope/period/value 契约和共享的 plan、剩余百分比、主指标纯函数。所有百分比和金额都统一表示“剩余”；Overview 可按 period 语义使用圆环或水平进度条，原生菜单只使用系统文本行表达相同数值、套餐和重置时间，不模拟图表。`unlimited` / `unknown` 不得伪造成 `0%`，刷新失败影响可信度时必须明确标记缓存数据。
- Agent Overview 的路径详情默认展开，resolved path 与 open-folder 动作无需额外点击即可访问。
- Antigravity baseline 额度只认 `RetrieveUserQuotaSummary` 的 Gemini 与 Claude/GPT 分组 5h/weekly 窗口；`GetUserStatus` 只提供套餐身份，其旧 `monthlyPromptCredits` / `availablePromptCredits` 字段不得显示为总额度。AI credits 属于 baseline 用尽后的 overage，只有独立且已验证的余额来源与类型化契约落地后才能展示。
- 额度组合按 account、model-group、feature、model scope 排序，不得按 Agent id 分支。单个 model 列表默认最多展示四项，展开后全量仍限制为 64 项并在额度区域内部滚动；Provider 动态 id、label 和 unit 必须在 main 侧清理和限长后才能进入 IPC。
- Kimi Code 当前 credential 的短期 access token 到期或在 usage 请求返回 `401` 时，主进程必须按官方 refresh contract 有界续期并最多重试一次 usage；续期必须与原生 CLI 共用锁语义、锁后重读、同进程合并并以 `0600` 原子替换当前 credential，未知字段保持不变，legacy credential 不得被写入。
- Kimi Code 额度只将 coding usages 的顶层 `usage` 作为周额度、`limits[]` 作为滚动窗口；当前 `remaining`/`limit` 与旧 `used`/`limit` 都必须兼容，`300 TIME_UNIT_MINUTE` 必须归一为 5 小时。跨 Kimi 产品共享的月度会员总额度不得从不可信 `totalQuota` 或本地用量推算。
- Kimi Code 套餐在 Overview 使用现有 badge、在原生菜单使用普通文本行，两者都只显示公开 tempo 名称，不展示内部 `LEVEL_*` 枚举；当前映射为 `Moderato`、`Allegretto`、`Allegro`、`Vivace`，未知值只做安全可读化。
- Kimi Code 历史列表通过有界 `session_index.jsonl` 候选读取 `state.json`，过滤没有 `lastPrompt` 的默认 `New Session` 空壳；可读会话仍以 contained `agents/main/wire.jsonl` 作为精确正文来源，但大小覆盖永久删除所拥有的完整 session 目录，正文仍按 2 MiB 上限只读投影。
- Grok、Gemini CLI 与 GitHub Copilot 的既有额度适配暂不开放；保留源码不代表产品支持或外部服务验收通过。
- Grok Build 历史列表以 contained `chat_history.jsonl` 的精确 real path 作为正文来源；会话大小覆盖永久删除所拥有的完整 session 目录，包括 summary 和该会话的运行附件。

### 9.5 Agent Conversation Storage Actions

- Agent 会话历史的项目筛选必须合并 PromptHub 已登记项目与当前原生会话报告的精确项目路径；同名不同路径必须保持为可区分的独立筛选项，不得只按目录 basename 合并。
- 会话来源配置、索引批注及独立会话元数据由 SQLite 持有；维护重建须保留稳定 ID、批注、收藏、归档和交接记录。扫描发现原生日志消失时只标记 missing，不清空批注。来源 ID 加 external_id 与 Agent ID 加 session_id 是不同作用域，不能自动合并；显式删除的记录不得由旧快照在普通启动时恢复。
- 每个已支持历史适配器返回的会话都必须显示与永久删除目标一致的非负占用：单文件使用精确字节，多文件求和，目录进行不跟随软链接的有界遍历，共享数据库计算该会话及子行的逻辑字节；不得把整个共享数据库大小重复算到每个会话。
- 永久删除只允许通过已验证的适配器操作，并在 renderer 中二次确认、在 main 中按 `agentId + sessionId` 重新解析当前会话。文件、多文件、目录、共享 SQLite 行和提供官方删除命令的 CLI 分别使用自己的 adapter-owned 策略；不得删除 renderer 提供的 `sourcePath`，也不得把软链接、越界或已变化目标当作原会话。
- 永久删除先执行适配器拥有的原生删除；原生删除失败不得修改 PromptHub 元数据。原生删除成功后应硬删除对应 PromptHub 元数据并由 renderer 立即移除会话；元数据清理失败不得把已删除的原生会话重新显示为可恢复状态。该操作不可撤销，且不得自动重试。

### 9.6 Agent Conversation Search Submission

- Agent 会话搜索必须区分输入草稿与已提交查询。用户输入期间不得请求、筛选或重排会话；只有在非输入法组合状态下按 Enter 才提交去除首尾空白的查询，提交空查询恢复完整列表。
- 搜索范围只包含会话标题、项目标签和项目路径，采用大小写不敏感的字面包含匹配。正文、备注、标签、模型名、脱敏 preview 与 session id 不得产生搜索结果。
- 已提交查询必须同时用于首批请求与后续加载；renderer、live-reader 最终投影和持久化 SQLite 索引必须保持相同范围。输入过程不得启动文件扫描、SQLite 查询、网络请求、计时器或持久化写入。

### 9.7 Agent Conversation Ordering And Titles

- 会话历史的第二个选择器是已加载清单排序，不是 PromptHub 元数据状态筛选；必须提供最近更新、最早更新、占用最大和占用最小，未知时间或大小在两个方向中都排在已知值之后，后续加载的分页按当前模式重新合并。
- OpenCode 会话清单必须通过只读 `opencode db` 全局分页，不得使用会受 PromptHub 当前工作目录影响的 `opencode session list`；详情继续使用脱敏导出，插件 sidecar 和缓存不得冒充会话。
- 会话显示标题的优先级固定为 PromptHub 非空改名、Agent 原生非空标题、适配器第一条可见用户消息回退、会话 id。列表、删除确认和跨 Agent 交接必须使用同一有效标题投影。
- Markdown/JSON 会话导出与跨 Agent 交接复用同一去敏投影；识别到的 API key、token、password、secret 赋值保留原字段名，并以 `[REDACTED]` 替换值。去敏不得写回原生 transcript 或 PromptHub 会话元数据。
- Codex 原生标题来自只读、至多 8 MiB 的 `session_index.jsonl` tail；同一安全 session id 取最后一条合法 `thread_name`，控制字符被清理，畸形、超限、软链接或缺失索引回退到 rollout 的第一条可见用户消息。PromptHub 不写入或迁移该索引。
- 移除状态筛选后，PromptHub 归档元数据不得让仍存在的原生会话不可达；列表以紧凑归档图标表示该状态。会话域不存在软删除、已移除筛选或恢复动作。归档不修改原生 transcript，永久删除继续遵守适配器所有权和二次确认边界。

### 9.8 Agent Conversation Latest Navigation And Context Actions

- Transcript 分页必须提供“最新消息”命令。一次操作最多跟进八个继续前进的原生 cursor，每页继续沿用 80 条读取上限和 20 条显示上限；按 entry id 去重并落到本次可达的最后一页。cursor 仍可前进时按钮继续可用，cursor 停滞时不得空转或显示空白页。
- 右键点击历史会话行必须先选中该行，再在视口范围内显示上下文菜单。菜单复用当前 Agent 原生续接、跨 Agent 续接、Markdown/JSON 导出和适配器允许的永久删除；不得复制一套 IPC 或业务流程。
- 永久删除继续要求二次确认。会话工具栏和右键菜单均不得提供通用“编辑信息”或元数据编辑弹窗；Agent 原生标题只读展示。右键菜单必须支持 Escape、外部点击、窗口失焦、缩放和滚动关闭，关闭操作不得写入任何数据。

### 9.9 Agent Transcript Markdown And Tool Roles

- 用户、Assistant 与 Tool 气泡都必须可在 flex 行中收缩。GFM 表格宽于气泡时，只允许在气泡内部形成横向滚动区域，不得撑宽气泡、Transcript 右栏或应用窗口；普通窄表格仍填满可用气泡宽度。
- Tool 调用和结果属于 Agent 侧消息，必须使用左对齐 Agent 头像、最大 82% 的有界气泡和气泡内 Tool 标签；不得使用居中的系统通知卡。System 与 unknown 事件继续使用居中信息提示语义。
- Markdown containment 只影响展示，不得改写 native transcript、handoff 或 Markdown/JSON 导出内容，也不得增加测量循环、缓存、网络或文件读取。

### 9.10 Agent Conversation Native Locations

- 会话工具栏“更多”和会话行右键菜单必须区分“在文件夹中显示”与“打开项目目录”。前者只使用适配器提供的原生会话 `sourcePath`，令 Finder/资源管理器定位该文件；后者只打开已解析的登记项目或原生 `projectPath`。
- 缺少某条路径时仅禁用对应菜单项，不得猜测父目录、Agent 根目录或其他项目。更多菜单的可见性不得由永久删除能力控制。
- 两个操作复用主进程既有安全 shell 路径处理器；renderer 不直接打开编辑原生会话文件、不拼接路径、不写 transcript 或 PromptHub 元数据。

### 9.11 Claude Conversation Projection

- Claude 会话正文只投影原生可见的 User、Assistant 与 `tool_result` 内容；`isMeta`、`system`、`mode`、`file-history-snapshot`、`attachment`、`last-prompt`、`ai-title`、空内容及已知本地命令 wrapper 不得显示为“事件”、用户消息或标题来源。合法但隐藏的记录不计为 parse error，畸形 JSON 或非对象记录仍计错。
- Claude `projects/<encoded-key>/` 目录名只是原生存储键。只要有界 JSONL 元数据提供安全绝对 `cwd`，项目 identity 必须保留该精确路径，界面 label 使用其 basename，项目筛选与原生 resume cwd 使用同一值；只有缺少有效 cwd 时才回退显示 encoded key。
- live reader 与本地索引必须使用同一 Claude 项目和标题投影。本地索引由“设置 → 应用设置 → 加速 Agent 历史搜索”统一控制并默认开启，Agent 历史页不再暴露单独开关。本地索引只存有界、可重建的脱敏元数据；投影规则升级通过 adapter version 重扫，不迁移或修改 Claude transcript，也不新增 PromptHub schema。

### 9.12 Gemini And Cursor Conversation Projection

- Gemini 项目身份来自 cache project 目录下至多 4 KiB 的 regular、非软链接 `.project_root`。安全绝对路径作为精确 `projectPath`、basename label 和 resume cwd；缺失、相对、超限、软链接或目录外 marker 只回退 cache key，不猜测路径。live 与本地索引使用同一投影，marker 改变时即使 chat 文件未变也必须刷新项目身份。
- Gemini 非空 native `summary` 优先于第一条可见 User 作为标题。`user`、`gemini` 分别投影为 User、Assistant；纯 `functionResponse.response.output` 投影为 Agent 侧 Tool；`info`、未知及空的合法记录隐藏且不计 parse error；原生 `error` 文本保留为 System，畸形文档与非对象 message 仍计错。
- Cursor encoded project key 只有在配置 home 下通过真实、非软链接目录组件得到唯一匹配时才成为精确 `projectPath`、basename label 和 resume cwd。解析全程最多打开 64 个目录、每目录流式接受 4,096 个 entry；零匹配、歧义、软链接、目录拒绝或上限命中都必须保持 null path。
- 对无法精确解析但确认属于 home 前缀的 Cursor key，只能剥离唯一匹配的既有目录前缀，并把剩余 literal tail 作为紧凑 label；不得把 tail 中的连字符猜成目录分隔符。Cursor 私有数据库、外部路径和 transcript 内容不得参与项目路径推断。

### 9.13 Agent History Acceleration And First-Page Navigation

- 会话元数据索引是系统级应用设置，默认开启。支持索引的 Agent 在首个有界列表完成后自动协调 enabled 状态；五分钟内完成的 fresh index 直接复用，缺失或过期时才启动一个 per-Agent 去重的后台刷新。离开 History 不取消应用级 warmup，但 renderer window 销毁仍由 IPC lifecycle 中止。
- 后台刷新完成时在已有列表上替换有界元数据，不得重新进入全屏 blocking loader。关闭加速后使用 live reader，不启动刷新。历史页不得显示索引开关、手动刷新或实现说明。
- 对话分页最左侧必须提供“第一页”图标按钮，与最右侧“最新消息”按钮形成对称边界导航。位于第一页或加载中时禁用；从深页返回第一页只切换已加载的 renderer 分页，不增加 native transcript I/O。

### 9.14 Agent Provider Sidebar Actions

- Provider & Model 的 PromptHub 导入与新增自定义供应商必须共同位于供应商侧栏顶部，均使用加号图标；侧栏底部不得保留重复新增入口。
- 供应商列表行和空白区域的右键菜单必须复用相同的导入与新增流程，不得复制 IPC 或持久化逻辑。Web 等不支持本地 PromptHub 导入的运行时只显示新增自定义供应商。

### 9.15 Codex Official Account Switching

- Codex 官方供应商继续只有一个原生 `auth.json`。PromptHub 可以在应用数据目录保存多份 main-process-only 的系统加密快照，但不得把账号数组写回 Codex 文件或改变 Codex 认证 schema。
- 用户可保存当前登录、以 write-only 方式新增完整 `auth.json`、查看脱敏账号摘要并切换账号。切换只允许原子替换 `auth.json`，必须在成功前重读校验，失败时恢复此前原始字节；当前登录被 Codex 刷新或尚未保存时必须先更新或保留对应快照。
- 账号管理不得返回或记录 token，不得修改 `config.toml`、供应商档案、模型、MCP、会话或其他 Codex 文件，也不得隐式联网验证。当前账号不可删除。

### 9.16 Canonical Data Recovery

- Prompt/Skill/Rule/Plugin canonical 文件图按各自现行边界恢复；MCP 当前定义、绑定、注释、版本元数据和加密凭据由 SQLite 持有，历史内容由文件持有。目录重建必须保留 MCP 表；存在 MCP 历史而 SQLite 缺失或不可读时必须要求恢复有效数据库备份，禁止当作可丢弃投影重建。
- 正常 renderer 启动不得扫描恢复候选或挂载恢复来源选择弹窗；手工候选浏览只保留在设置的数据恢复入口。启动阶段由 main process 完成布局版本迁移、校验和确定性自愈。
- 当前版本低于持久化的 last-run version 时，必须在备份迁移、数据库打开和任何 workspace 写入前拒绝启动，且不得把版本 marker 向下改写；版本比较必须遵守 prerelease 顺序。
- canonical Prompt 图被旧版本破坏，但当前 Markdown 工作区唯一、可严格解析且媒体可确定解析时，启动应自动把 Markdown 转换为已验证的 canonical bundle 并 journal 发布；只有重复 ID、解析失败、缺失/冲突媒体、危险路径或其它文件歧义才进入显式恢复。
- 从 SQLite 恢复时，superseded MCP metadata 只能作为有界、普通文件、只读输入参与 staged checkpoint；含凭据字段必须经设备加密 secret sink 持久化，不得先在损坏的 active root 上运行普通兼容迁移。
- SQLite 关闭后的恢复失败必须先重新打开原 catalog，再完整移除并重绑 `registerAllIPC` 所有 handler，随后才向 renderer 返回可重试错误；重复注册不得因遗漏 Prompt metadata、tag 或其他非数据库 handler 而中断。
- 当前 Prompt Markdown 工作区可读时，恢复必须以文件中的 Prompt 集合和当前内容为准；SQLite 只可补充仍属于这些 Prompt 的版本历史，不得覆盖文件内容或复活仅存在于数据库的 Prompt。检查和恢复不得移动或改写源 Markdown。
- 文件恢复同样以 `_folder.json`/`folders.json` 的 Folder 集合为准，并按父项优先的线性顺序导入 Folder 与 Prompt；缺失父项、环、符号链接、特殊/未声明/超限文件和超限清单都必须在发布前失败。SQLite 替换期间必须阻止新迁移客户端并拒绝活跃或未知客户端。
- 缺失媒体只可从 active assets、已验证 recovery artifact 或升级 safety point 中补齐；所有同名候选必须是普通文件且 SHA-256 一致，否则在发布前失败。IPC 重绑集合必须由实际成功注册动态捕获，嵌套 handler 和部分注册失败不得依赖手工列表。
- canonical authority 生效后，启动不得再把 SQLite 导出到旧 Markdown 工作区；转换前的 Markdown 由 journaled recovery artifact 保留。Prompt 自愈必须原样保留其它 canonical 领域，因此设备 MCP secret 损坏不得阻断 Prompt/SQLite 重建。
- canonical catalog 可忽略严格为空的 `rules/.versions` 与 `rules/projects` 兼容目录，但必须拒绝非空、符号链接或类型替换。缺失服务端用户行的 Skill owner 只在派生 SQLite 中降为 null；同平台同名活跃 Agent profile 只在派生 SQLite 中按 `updatedAt`、id 稳定保留一个活跃项，其余投影为 archived；源 bundle 均不得改写。

### 10. Renderer List Virtualization

- 桌面端 renderer 必须用 `@tanstack/react-virtual` 把以下四个长列表场景控制在 O(visible) 量级：
  - 技能列表视图（`SkillListView`）
  - Prompt 画廊视图（`PromptGalleryView`）
  - Prompt 看板视图（`PromptKanbanView` 的 unpinned 区域）
  - Prompt 详情列表（`MainContent` 内 list 模式）
- 桌面端 renderer 不应再使用基于 `setTimeout` 的"分批渲染"补丁来缓解长列表卡顿；该补丁已被虚拟化替代。
- 当组件测试运行在 jsdom 中时，`tests/setup.ts` 必须 mock `@tanstack/react-virtual` 为"全量渲染"直通版，否则 jsdom 的零布局会让虚拟化拒绝渲染任何行；生产代码继续使用真实虚拟化。

### 11. Renderer Bundle Budget

- 桌面端 renderer 必须维护 `apps/desktop/bundle-budget.json` 中声明的体积阈值（gzip 字节）；阈值是 guardrail，不是 ratchet，整体保留 5–10% 余量。
- `apps/desktop/scripts/check-bundle-budget.mts` 必须能在零额外依赖的环境下执行，并在任意阈值被突破时以非零退出码失败。
- `quality.yml` 工作流必须在 `Build` 之后运行 `bundle:budget` 步骤，确保 PR 不会无声地把 renderer 主入口或主要 chunk 顶过预算。
- 当一次有意的优化让某个 chunk 体积下降并希望把成果固化时，才应在该 PR 中收紧对应阈值。

### 12. Renderer Motion System

- 桌面端 renderer 必须有一份 motion design tokens（`apps/desktop/src/renderer/styles/motion-tokens.ts`），覆盖 duration / easing / scale / translate / stagger 五个维度，并同步暴露到 Tailwind theme 与 CSS 变量。
- 桌面端 renderer 必须提供意图驱动的 motion 组件（`apps/desktop/src/renderer/components/ui/motion/`）：`Pressable`、`Reveal`、`Collapsible`、`ViewTransition`；新增覆盖类组件应优先使用它们，避免散写 `duration-XXX / active:scale-XX / animate-in` 组合。
- 桌面端必须支持用户级动画偏好（`settings.motionPreference: 'off' | 'reduced' | 'standard'`），通过 `<html data-motion>` 落地；`globals.css` 必须包含 `@media (prefers-reduced-motion: reduce)` 全局降级，且应用内 `standard` 应能显式覆盖系统偏好。
- 桌面端代码不应再使用裸毫秒（`duration-200`）、裸缩放（`scale-95` / `scale-90`）或手写 spinner；这些应使用 token 或意图组件等价物。
- 桌面端不再依赖 `framer-motion`；如未来确需 layout / spring 动画，应在 `spec/issues/active/` 先立 issue。
- 长期工程契约见 `spec/knowledge/structure/desktop-frontend-animation.md`。

### 13. MCP Store Source And Update Boundaries

- MCP 商店搜索与 My MCP 搜索各自持有独立的会话内 query。安装后的既有跳转不变；
  返回同一来源/查询时复用已有分页结果、总数和 cursor，不因资料库筛选重新查询目录。
  商店返回位置由 MCP controller 的单个内存 ref 保存，按来源/查询识别；更换来源或
  查询回到顶部。滚动条复用应用现有样式，不隐藏。滚动事件只更新一个数值，不触发
  Zustand 持久化、目录序列化或额外网络调用；额外空间/每次滚动处理均为 O(1)。
  页面重建/进程重启不承诺恢复滚动位置；不改 DB、缓存格式或安装合同，回滚仅需还原
  本次 renderer 改动。#217 隔离 Electron 回归使用两页 96 条目录 fixture、真实
  安装 IPC/SQLite、资料库搜索和返回；连续用户流程测试为保留因果顺序超过 50 行。
  2026-10-14 修复前该流程确认 query 被覆盖、第二页丢失、位置归零和隐藏滚动条；
  修复后 `mcp-market-return.spec.ts` 通过，原浏览卡片仍在视口内，改查询归零。
  懒布局可能在安装前调整位置，因此用例记录离开前最后一次实际 scroll，而非动画
  中间帧。10 个 store、11 个商店组件、12 个资料库组件用例、Desktop build、
  source/test typecheck 和定向 ESLint 通过。网络目录使用 fixture，未验证在线 Registry
  可用性或 MCP 工具执行；安装记录由真实产品路径持久化。
- 新版 Antigravity MCP 的 `serverUrl`、认证、工具选择和禁用状态在导入、编辑、重开及原生投影中保留；Agent 导入在主进程按目标与名称读取原始配置，不能把 renderer 遮罩值保存为真实凭据（#220）。
- MCP 版本弹窗的普通 Tab / Shift+Tab 只在当前可用控件间循环；确认框独立管理焦点，取消后回到原操作按钮。确认前不禁用触发按钮，不改变其他弹窗的默认行为（#235）。
- 已保存 MCP 缺少 description 时显示独立的空描述状态，不显示“先选择或保存”提示（#231）。
- MCP 健康检查 UI 按稳定 issue code 和字段上下文翻译；Core/CLI 返回英文诊断，不把环境变量或凭据值拼入提示（#232）。健康检查仍是配置静态检查，不代表协议连接成功。
- Codex MCP 卸载保留无关配置和用户注释；最后一项托管条目删除后必须移除完整的 PromptHub 开始/结束标记，重复分发/卸载不得累积孤立标记（#233）。
- My MCP 的当前定义、设备绑定、用户注释、版本元数据和加密凭据以 SQLite MCP 表为唯一真源；`data/mcp/<server-id>/versions/` 只持有元数据引用的不可变历史内容。旧 JSON、bundle manifest、设备 binding 文件和 Electron vault 仅是显式启动升级/备份恢复输入，不是运行时 fallback。桌面和新 CLI 工作区使用同一合同。
- 非空 literal `env`/header/OAuth secret 只进入 AES-256-GCM 加密记录，设备主密钥由 OS 凭据库保护；空值保留为未配置状态。旧凭据暂不可解密时，保全原始升级来源和引用，允许脱敏清单/注释/历史列表；需要真实值的执行、比较和分发必须失败，恢复密钥访问后继续升级。MCP 备份只包含加密 SQL 和被引用的历史文件，不包含待迁移明文来源。
- MCP 自定义商店源的网络授权真相源位于主进程管理的数据文件中；renderer 只保留兼容展示镜像。新增、编辑、启停和删除来源必须先由主进程原子持久化成功，renderer 才能提交状态。
- MCP 商店抓取 IPC 必须同时携带 `sourceId` 与目标 URL。主进程只允许已注册来源的相同 origin 和受限 pathname；只有用户显式注册的自定义来源可获得私网和私网 HTTP 权限，内置来源不得继承该权限，重定向仍需逐跳复验。
- 从内置、MCP Registry、自定义来源或未来 PromptHub Official Store 安装的 MCP 必须保存稳定模板身份、版本和来源字段 fingerprint。更新检查使用安装基线、本地配置和当前模板三方对账，不得把 Agent 目标文件同步冒充为上游版本更新。
- MCP 上游更新只能由用户显式应用。安全更新可直接执行；本地修改、双向冲突和无基线旧记录必须要求明确复核。应用更新必须保留密钥值、用户状态、记录身份、绑定和目标文件；目标文件只由既有显式分发/同步流程写入。
- MCP Registry 的 npm/PyPI 模板必须固定已发布版本；无法正确映射为受支持运行时的 package 类型必须跳过，不得生成猜测命令。未来官方商店条目复用同一版本与 fingerprint 合同。

### 14. Development Renderer Origin

- 桌面开发服务器必须绑定明确的 IPv4 loopback 地址，不得使用可能在 IPv4 与 IPv6 之间分流的 `localhost`。
- `5173` 只是首选端口；端口已被其他应用占用时，Vite 必须选择下一个可用端口，并通过 `VITE_DEV_SERVER_URL` 把实际 origin 交给 Electron。依赖把 loopback 重写为 `localhost` 时，Electron 启动前必须恢复为明确的 IPv4 地址，同时保留动态端口。
- 开发启动流程不得为了抢占首选端口而终止、覆盖或干扰其他项目的进程。Electron 的无插件回退地址必须与 Vite 使用相同的地址族。
- main-process rebuild 必须串行停止并等待当前 PromptHub Electron 子进程退出后再启动替代实例；同一保存批次的并发 build callback 必须合并到最新 generation，且 coordinator 必须跨 Vite config reload 保持唯一。重启失败可以记录错误并等待下一次 rebuild 恢复，但不得通过未处理的 child-exit 或 Promise rejection 关闭 Vite。
- 应用进入退出阶段后，迟到的窗口可见性事件不得再刷新 tray、发送 renderer 消息或读取已关闭的应用数据库。

### 15. Prompt Tree Drag Global DnD And Selection Accordion

- `BackupDropRestoreLayer` 是桌面窗口的**文件**拖放兜底层：只有当 `DataTransfer` 携带文件（`files` / file items / `Files` type）时才能 `preventDefault` 并把 `dropEffect` 设为 `copy`；应用内部 Prompt 层级拖拽（自定义 MIME / 文本）必须保持透明，避免与 `effectAllowed=move` 冲突导致 Chromium no-drop 🚫。
- 非备份文件仍由该层阻止默认导航与丢档，但不得调用导入；备份文件命中时才进入导入预览。
- Prompt 列表/卡片树采用选择驱动的手风琴：单节点选中或重复选中时展开自身及祖先链，并把其他有子节点的分支置为 collapsed；取消选中保持原 collapsed 引用。`selectionRevision` 是 renderer store 内非持久化信号，仅用于让同一 ID 的重复点击也能重新展开。

## Stable Scenarios

### Local integration of PR #222 / #223 (2026-10-03)

- #223 includes #222. Integration targets the current `main` contracts, not the fork's release configuration: version `0.6.0-beta.2`, signed macOS packaging, release asset completeness checks, current database entrypoints and existing recovery workflows remain unchanged.
- Prompt list/card projections remain `PromptSummary`; full content is loaded through the current detail boundary. Subtree folder moves use one recursive SQLite update inside the existing move transaction, including rollback on failure.
- Startup-folder and backup-guidance preferences use the main-process SQLite settings API. Neither renderer local storage nor the canonical renderer-settings subscription stores a second copy. Folder restoration waits for workspace initialization.
- The fork's rules-backup implementation is superseded by the current import workflow: backup import must not write external Agent/project targets. Fork-only release scripts and obsolete IndexedDB fallbacks are not introduced.
- Focused verification covers FTS search, subtree move rollback, list/card batch interactions, settings persistence/reopen through preload and real SQLite, rules recovery, image IPC, and Web folder visibility. Desktop production build and Desktop/Web/CLI source type checks passed. GUI and release packaging were not exercised. Fork change records describe their original verification, not current-main release acceptance.
- Full desktop test type checking remains blocked by 298 diagnostics also present in the pre-merge main snapshot (comparison by file and diagnostic, ignoring shifted line numbers). Web client build passed; Web server build hits the unchanged `@prompthub/db` alias resolving a subpath below `index.ts`, also reproduced against the pre-merge configuration. These are not release-ready results.
- After restoring the pre-existing relationship-navigation edits, all 46 tests across relationship navigation/panels, tree collapse, gallery/table views and variable-copy dialogs passed; desktop source type checking and changed-file lint also passed on that combined working tree.

### Scenario: Contributor changes desktop runtime behavior

When a contributor changes desktop runtime behavior materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/desktop/spec.md`
- they sync durable behavior back into `spec/knowledge/behavior/desktop.md` after implementation

### Scenario: User needs public desktop usage information

When a user needs installation or usage help:

- the public entry remains `README.md` and localized docs under `docs/`
- internal architecture and implementation history remain in `spec/`

### Shortcut key identity

快捷键录入和局部触发共用按键识别：Option/Alt 修饰的字母和数字使用 KeyboardEvent.code，避免 macOS 把 J、N 等转换为符号或 dead key 后保存错误 accelerator。没有 Alt 的普通按键保留键盘布局的 key 语义。快捷键设置仍为既有持久配置，不迁移或猜测已保存的符号快捷键；受影响的用户可重新录入。

### Renderer 辅助状态的 SQLite 所有权

市场源、手动恢复路径、自部署同步设备 ID 由 Core renderer persistence 入口读写
SQLite `settings`，键分别为 `marketplaceSources`、`recoveryPaths`、
`selfHostedDeviceId`。普通设置 GET/SET 不读写这三个领域键；renderer 专用入口保持
原有请求/响应合同。历史三个 JSON 文件只在 `renderer-state-sqlite-v1` 升级中读取，
原始字节保留在 recovery，退出后不得作为日常 fallback。SQL 与旧文件不同值需要
显式恢复处理；已清空的来源和路径不会因旧文件重现而复活。

首次 renderer 导入同时提交设置与辅助状态 SQL 行、vault 和完成标记；SQLite
提交失败回滚全部文件。便携恢复工厂显式绑定暂存数据库。

### Shared application settings storage

应用、AI、同步设置的结构化值只存 SQLite settings；Desktop 与 CLI 使用同一个 Core
入口。凭据由设备 keyring 主密钥保护的 AES-256-GCM vault 保存，SQL 只存引用。
旧 app/providers/sync-providers/ai-models JSON 仅在 settings-sqlite-v1 中转换并保留
私有原始恢复材料，之后不再补写镜像。已有 Electron safeStorage 密文须先用新版
桌面端完成一次升级，再通过 CLI 使用。普通设置接口不得读取或修改主密码验证材料。
显式清空模型或设置在重开后保持；升级备份不能在普通读取时补回删除内容。
回退需恢复升级前数据库、原始配置与 vault，并保全升级后的 SQL 修改。
