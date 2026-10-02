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

### 6. Prompt AI Workbench Boundaries

- 桌面端 Prompt AI 测试抽屉必须按 `promptType` 收敛可见模式：文本 Prompt 只提供单模型测试与多模型对比，image Prompt 才提供生图测试。
- 文本 Prompt 在 AI 测试抽屉中附加的图片属于测试期临时附件，必须真正参与聊天消息构造，但不得写回 Prompt 持久化字段。
- image Prompt 在 AI 测试抽屉中可以同时使用已保存参考图与当前测试会话上传的临时参考图作为生图输入。

### 7. Prompt Modal Information Hierarchy

- 桌面端新建 Prompt 弹窗必须优先展示标题、Prompt 类型与用户提示词，让用户先进入写作流。
- 新建 Prompt 首屏不应再额外显示“Basic Info”分组标题，也不应展示仅用于解释类型的冗余说明文案；变量使用说明应作为用户提示词附近的轻量提示存在。
- 新建 Prompt 的描述、system prompt、参考媒体，以及文件夹、标签、来源、备注等扩展信息必须默认收纳在 `More Settings` 折叠区内，避免干扰主要创作流程。
- 桌面端编辑 Prompt 弹窗必须保留更强的已有内容上下文：`Basic Info` 中继续展示描述、Prompt 类型，以及 image Prompt 的参考媒体。
- 文本 Prompt 的参考媒体在编辑场景中仍应收纳在 `More Settings` 中，不挤占基础编辑区。

### 8. Quick Add Prompt Creation

- 桌面端 `Quick Add` 必须同时支持“分析已有内容”和“AI 生成 Prompt”两种快速创建路径。
- “分析已有内容”路径应允许用户粘贴一段已有 Prompt，系统先创建占位 Prompt，再由 AI 在后台补齐标题、描述、system prompt、标签和建议文件夹。
- “AI 生成 Prompt”路径应允许用户只描述目标与约束，由 AI 先返回结构化 Prompt 草稿，再一次性创建完整 Prompt；不得把用户的需求描述直接保存为最终 `userPrompt`。
- 两种路径都必须复用同一套 `quickAdd` 场景模型配置，不引入额外的 AI 场景设置负担。

### 9. Update Flow Failure Visibility

- 桌面端更新弹窗中的手动升级前备份动作必须在弹窗内处理失败路径；如果预升级快照或导出步骤失败，界面必须进入可见错误态，而不是把 Promise rejection 泄漏到事件处理器外。
- 更新弹窗只允许渲染主进程更新服务通过 IPC 返回的真实状态；开发构建可以明确提示更新检查已禁用，但不得在运行时注入演示版本、下载进度或其他模拟状态。

### 9.1 Direct macOS In-App Updates

- 从 PromptHub 官方 DMG 安装、且后续 release ZIP 已完成 Developer ID 签名与 Apple 公证的 macOS 用户，必须可以在应用内下载并重启完成升级；更新流程使用 `electron-updater` 的已验证 ZIP payload，不要求用户手动挂载 DMG 或复制应用。
- Homebrew Cask 安装仍由 Homebrew 负责升级；应用内更新不得下载或替换 Caskroom 中的应用。

### 9.2 macOS Menu Bar Icon

- macOS 菜单栏必须使用独立的 PromptHub 单色 Template Image，不得缩小带蓝色圆角底板、阴影和高光的完整应用图标。
- 菜单栏资源以透明 `16x16` 72-dpi PNG 和同名 `32x32@2x` 144-dpi PNG 成对提供，文件名保留 `Template` 后缀；主进程不得对首选资源再次做运行时位图缩放。

### 9.3 Background Work After Window Reveal

- 主进程通过菜单栏、全局或本地快捷键、托盘命令、第二实例或既有窗口恢复路径显式显示主窗口时，必须主动向 renderer 发送最终可见状态，不得只依赖平台相关的 `show` / `restore` 事件。
- renderer 收到可见状态后必须先更新窗口状态，再恢复隐藏期间挂起的 WebDAV、S3、自部署同步和本地数据刷新；重复的可见通知不得启动重复同步。
- 图形沿用 PromptHub 层叠卡片识别，但必须接近占满画布，并让顶层方片成为主要轮廓；系统负责深浅色、选中态和辅助显示环境下的着色。

### 9.3 Desktop Tray Agent Asset Actions

- 桌面状态栏菜单必须把 Prompt、Skill、MCP、Plugin 和 Rule 视为当前可管理的 Agent 资产；未来的一等 Agent 实体是独立产品边界，不得作为第六种资产类型混入现有创建命令。
- Prompt、Skill、MCP 与 Plugin 菜单项必须打开各自已有的创建或导入流程；Rule 当前只进入已有管理工作台，不得宣称存在尚未实现的通用新建流程。
- 状态栏命令必须使用 `packages/shared` 的类型化命令协议，经 main、preload 与 renderer 路由；主进程只负责原生菜单、窗口显示和命令投递，renderer 继续拥有导航与业务弹窗。
- preload 必须缓冲 renderer 尚未订阅时收到的状态栏命令。MCP 与 Plugin 等按需加载工作台必须先注册创建监听器，再发布就绪状态；卸载时必须先撤销就绪状态，再清理监听器，避免首次点击或重渲染期间因 lazy mount 竞态而丢失命令。
- 状态栏菜单文案必须覆盖桌面端七种语言，优先读取应用内已保存语言，并在数据库尚未可用时回退到系统语言。Renderer 的语言设置在用户切换和旧版本地状态恢复时都必须同步到 Main 设置数据库；同步恢复回调只能在 Zustand Store 完成初始化后执行，避免界面语言与原生菜单语言分叉。
- 未来 Agent 管理入口只有在对应能力真正可用时才显示；不得展示不可执行的灰色占位项。

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

- MCP 自定义商店源的网络授权真相源位于主进程管理的数据文件中；renderer 只保留兼容展示镜像。新增、编辑、启停和删除来源必须先由主进程原子持久化成功，renderer 才能提交状态。
- MCP 商店抓取 IPC 必须同时携带 `sourceId` 与目标 URL。主进程只允许已注册来源的相同 origin 和受限 pathname；只有用户显式注册的自定义来源可获得私网和私网 HTTP 权限，内置来源不得继承该权限，重定向仍需逐跳复验。
- 从内置、MCP Registry、自定义来源或未来 PromptHub Official Store 安装的 MCP 必须保存稳定模板身份、版本和来源字段 fingerprint。更新检查使用安装基线、本地配置和当前模板三方对账，不得把 Agent 目标文件同步冒充为上游版本更新。
- MCP 上游更新只能由用户显式应用。安全更新可直接执行；本地修改、双向冲突和无基线旧记录必须要求明确复核。应用更新必须保留密钥值、用户状态、记录身份、绑定和目标文件；目标文件只由既有显式分发/同步流程写入。
- MCP Registry 的 npm/PyPI 模板必须固定已发布版本；无法正确映射为受支持运行时的 package 类型必须跳过，不得生成猜测命令。未来官方商店条目复用同一版本与 fingerprint 合同。

### 14. Prompt Tree Drag Global DnD And Selection Accordion

- `BackupDropRestoreLayer` 是桌面窗口的**文件**拖放兜底层：只有当 `DataTransfer` 携带文件（`files` / file items / `Files` type）时才能 `preventDefault` 并把 `dropEffect` 设为 `copy`；应用内部 Prompt 层级拖拽（自定义 MIME / 文本）必须保持透明，避免与 `effectAllowed=move` 冲突导致 Chromium no-drop 🚫。
- 非备份文件仍由该层阻止默认导航与丢档，但不得调用导入；备份文件命中时才进入导入预览。
- Prompt 列表/卡片树采用选择驱动的手风琴：单节点选中或重复选中时展开自身及祖先链，并把其他有子节点的分支置为 collapsed；取消选中保持原 collapsed 引用。`selectionRevision` 是 renderer store 内非持久化信号，仅用于让同一 ID 的重复点击也能重新展开。

## Stable Scenarios

### Scenario: Contributor changes desktop runtime behavior

When a contributor changes desktop runtime behavior materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/desktop/spec.md`
- they sync durable behavior back into `spec/knowledge/behavior/desktop.md` after implementation

### Scenario: User needs public desktop usage information

When a user needs installation or usage help:

- the public entry remains `README.md` and localized docs under `docs/`
- internal architecture and implementation history remain in `spec/`
