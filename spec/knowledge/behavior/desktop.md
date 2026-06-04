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

## Stable Scenarios

### Scenario: Contributor changes desktop runtime behavior

When a contributor changes desktop runtime behavior materially:

- they create a delta spec under `spec/changes/active/<change-key>/specs/desktop/spec.md`
- they sync durable behavior back into `spec/knowledge/behavior/desktop.md` after implementation

### Scenario: User needs public desktop usage information

When a user needs installation or usage help:

- the public entry remains `README.md` and localized docs under `docs/`
- internal architecture and implementation history remain in `spec/`
