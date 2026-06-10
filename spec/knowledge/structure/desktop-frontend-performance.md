# Desktop Frontend Performance Architecture

## Purpose

定义桌面端 renderer 的稳定性能策略与"如何不让性能慢慢退化"的工程契约。本文是长期规则，不记录任何一次具体优化的过程；阶段性优化记录在 `spec/changes/`。

## Stable Principles

### 1. 长列表必须用虚拟化

任何渲染规模可能 ≥ O(用户数据量) 的列表必须基于 `@tanstack/react-virtual` 把可见 DOM 节点数控制在 `O(visible + overscan)` 量级。

当前已被这条规则覆盖的场景：

| 场景 | 文件 | 模式 |
| --- | --- | --- |
| 技能列表 | `apps/desktop/src/renderer/components/skill/SkillListView.tsx` | 行虚拟化 + measureElement |
| Prompt 画廊 | `apps/desktop/src/renderer/components/prompt/PromptGalleryView.tsx` | 行虚拟化（grid，列数随 ResizeObserver 动态改变） |
| Prompt 看板（unpinned） | `apps/desktop/src/renderer/components/prompt/PromptKanbanView.tsx` | 行虚拟化（pinned 仍保留 framer-motion 动画） |
| Prompt 详情列表 | `apps/desktop/src/renderer/components/layout/MainContent.tsx` 中 `<VirtualizedPromptList>` | 行虚拟化 + measureElement |

新增长列表组件时，**默认套虚拟化**；如果出于产品交互（如拖拽、layout 动画）放弃虚拟化，必须在 `spec/issues/active/` 留一个明确的 follow-up 条目，列出"放弃的原因 + 何时重新评估"。

### 2. 不再使用 `setTimeout` 分批渲染

renderer 不应再以"先渲前 N 条、setTimeout 慢慢补齐剩余"的形式做长列表平滑化。该补丁会带来：

- 进入页面时滚动到底突然卡顿；
- 数据更新后旧批次未渲染时陷入"不可见但已加载"的不一致中间态；
- 与 React reconciliation 的协作不稳定。

虚拟化是唯一推荐的替代方案。如果未来出现"虚拟化无法覆盖的渲染热点"，先升级虚拟化策略（窗口大小、overscan、measureElement），不要回到 setTimeout 分批。

### 3. jsdom 测试必须 mock virtualizer

jsdom 不做真实布局，`useVirtualizer` 测得 0×0 viewport 后会拒绝渲染任何行，组件测试就会找不到任何节点。`apps/desktop/tests/setup.ts` 中以全局 `vi.mock('@tanstack/react-virtual', ...)` 把 hook 替换为"全量渲染"的直通实现，让测试既能验证可见性又不需要真实布局。

任何对 `useVirtualizer` 的本地 mock 必须保持与 setup 中的 mock 行为一致（`getVirtualItems`、`getTotalSize`、`measureElement` 至少返回安全占位）。生产代码不可依赖该 mock。

### 4. Bundle 预算是 guardrail，不是 ratchet

桌面端 renderer 通过 `apps/desktop/bundle-budget.json` 声明每个关键 chunk 的 gzip 上限。规则：

- 阈值通常**比当前实测高 5–10%**，吸收无关 PR 的小幅波动；
- 收紧阈值的唯一时机：本 PR 内做了有意的优化、希望把成果固化。把"收紧阈值"和"造成下降的优化"放在同一个 PR；
- **不要**在与体积无关的 PR 里收紧阈值；
- 跨阶段、跨 PR 监控由 CI 完成：`quality.yml` 在 `Build` 之后跑 `pnpm --filter @prompthub/desktop bundle:budget`，超阈值 PR 直接失败。

### 5. Bundle 可观测性入口

`apps/desktop/package.json` 暴露两个脚本：

- `pnpm --filter @prompthub/desktop build:analyze`：在普通 build 基础上启用 `rollup-plugin-visualizer`，把 treemap 写到 `apps/desktop/dist-stats/renderer.html`（`.gitignore`）。
- `pnpm --filter @prompthub/desktop bundle:budget`：依据 `bundle-budget.json` 校验最近一次 build 的 chunk 大小。

视觉化工具仅在 `BUILD_ANALYZE=1` 时通过动态 import 加载，避免 `rollup-plugin-visualizer` 的 ESM-only 包污染 `vite-plugin-electron` 的 CJS 配置加载。

### 6. 启动入口不得静态聚合大资源

Renderer startup entry (`index-*.js`) 不应静态 import 与当前首屏无关的大型资源或重依赖。已知高风险类型：

- locale JSON：`apps/desktop/src/renderer/i18n/index.ts` 必须通过动态 import 加载语言资源；启动只加载当前语言和 English fallback，其它语言在 `changeLanguage()` 时按需加载。
- markdown 渲染栈：`react-markdown`、`remark-gfm`、`rehype-sanitize`、`rehype-highlight` 等依赖只能出现在需要渲染 markdown 的 lazy/cold-path 组件中。首屏组件如果只需要 prompt 正文预览，应使用 plain-text fallback 或 lazy viewer。
- 代码/文件编辑栈：CodeMirror、Lezer language parser、文件树编辑器样式等只应在用户明确进入编辑面板或文件编辑器时加载。详情页默认 preview route 不得静态 import 文件编辑器；如果同一弹窗里还能打开文件编辑器，弹窗本身和内部文件编辑器都应分别按需加载，避免 static import 抵消 lazy split。CodeMirror language extensions 也必须按文件类型动态加载，不能在文件编辑器入口一次性静态 import 全部语言包。
- 多 section 设置/管理页：Settings 这类 shell + sidebar 页面应保持导航、标题、子菜单同步渲染，但 section body 默认按 `activeSection` lazy load。拆分后不能只预算 shell chunk；Data、AI、Skill 等仍可能增长的 section chunk 也要在 `bundle-budget.json` 中单独声明预算。
- 更新、导入、AI 测试、技能详情等 modal/detail surface 默认按需加载；共享类型必须用 `import type`，避免 TypeScript 类型意外变成 runtime import。
- 功能专属 store：常驻 shell 组件（如 `TopBar`、`Sidebar`、`App`）不得为了某个非默认模块静态 import 对应 store。应把模块专属搜索、导航面板、详情面板抽到 lazy 组件中，由该组件订阅自己的 store。例如 Rules UI 通过 `TopBarRulesSearch` / `RulesSidebarPanel` 按需加载 `rules.store.ts`。
- 内置注册表、模板目录、base64 图标表等大静态数据不得为了一个轻量 selector 或分类常量进入启动路径。需要共享小型元数据时，拆成独立轻量常量文件；完整注册表只在用户打开对应 store/marketplace 并触发加载动作时动态 import。

新增或修改启动路径 import 后，必须运行 `pnpm --filter @prompthub/desktop bundle:budget`。如果预算失败，先用 `pnpm --filter @prompthub/desktop build:analyze` 确认是否把 cold-path JSON、markdown、AI provider、modal 或设置页模块打进了主入口。

## Stable Scenarios

### Scenario: Adding a new long list

When 新增任何渲染量随用户数据线性增长的列表组件：

- 默认接入 `@tanstack/react-virtual`；
- 父级容器保持 `overflow-hidden`，由列表组件自带滚动元素，让 virtualizer 能测量到正确的可视窗口；
- 估算 `estimateSize` + 通过 `measureElement` 修正实际高度；
- `getItemKey` 绑定数据 id，让测得高度跨 reorder 不丢失。

### Scenario: Adding a new heavy dependency

When 引入一个体积 ≥ 50 KB 的新依赖：

- 评估它是否真的需要进首屏（多数情况答案是"否"）；
- 若不在首屏，使用动态 `import()` 或 `lazy()` 把它放到对应的次级 chunk 中；
- 跑一次 `pnpm --filter @prompthub/desktop build:analyze` 确认它没意外被打进主入口；
- 如果它确实必须在首屏，在 `bundle-budget.json` 中相应 chunk 的预算上加一个能容纳的额度，并在同一 PR 里记录原因。

### Scenario: Adding a new locale or translation namespace

When 新增语言或显著扩大翻译资源：

- 新 locale 必须加入 `apps/desktop/src/renderer/i18n/index.ts` 的动态 `localeLoaders`，不要静态 import JSON；
- 启动语言加载失败时必须保留 English fallback，让 React mount 不被卡住；
- `changeLanguage()` 必须先加载目标 locale bundle，再切换 i18n language；
- 对初始化语言映射、非初始 locale lazy load、失败 fallback 至少补一条单测。

### Scenario: A bundle-budget step fails on someone else's PR

When CI 的 `Bundle budget` 步骤失败：

- 默认假设是真实回归，不要立即放宽预算；
- 先用 `build:analyze` 找到新进入主入口或意外膨胀的模块；
- 如果是合理的功能增长，**在同一 PR** 中调整预算并解释原因；
- 如果是意外的副作用（误把 cold-path 模块静态 import 进 hot-path），修正 import；
- 不要绕过预算 step（不要 `continue-on-error`）。

## Non-goals

- 本文不规定"最优 chunk 大小"或"最优 estimateSize"——这些数字由实测决定，不写死；
- 本文不替代特定优化的 change folder——任何具体改动仍然走 `spec/changes/active/<change-key>/`。
