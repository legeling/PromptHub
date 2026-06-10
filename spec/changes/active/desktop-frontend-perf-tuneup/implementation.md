# Implementation

> 本文件随阶段推进**实时**更新。当前状态：**P1-P10 已实施并完成本地验证；后续优化继续按 follow-up 拆分。**

## Baseline (2026-05-16)

`pnpm --filter @prompthub/desktop build` 在 main `01f6874` (toolchain Node 24 升级后) 实测：

| chunk | size | gzip |
| --- | --- | --- |
| `index-*.js`（主入口） | 1.20 MB | 368 KB |
| `markdown-vendor` | 322 KB | 100 KB |
| `SettingsPage` | 194 KB | 50 KB |
| `ui-vendor`（framer-motion + dnd-kit） | 165 KB | 55 KB |
| `react-vendor` | 138 KB | 45 KB |
| `icons`（lucide-react） | 70 KB | 14 KB |
| `i18n-vendor` | 49 KB | 15 KB |
| 其它（按需） | n/a | n/a |
| `out/renderer/assets/*.css` | 99 KB | n/a |

vite 构建告警：`Some chunks are larger than 500 kB after minification`。

源码侧巨型文件（行数）：

| 文件 | 行数 |
| --- | --- |
| `apps/desktop/src/renderer/components/settings/DataSettings.tsx` | 2774 |
| `apps/desktop/src/renderer/components/settings/AISettings.tsx` | 2717 |
| `apps/desktop/src/renderer/components/layout/MainContent.tsx` | 2490 |
| `apps/desktop/src/renderer/services/ai.ts` | 2458 |
| `apps/desktop/src/renderer/components/skill/CreateSkillModal.tsx` | 2144 |
| `apps/desktop/src/renderer/stores/settings.store.ts` | 1776 |
| `apps/desktop/src/renderer/stores/skill.store.ts` | 1695 |
| `apps/desktop/src/renderer/components/layout/Sidebar.tsx` | 1603 |

虚拟化情况：`@tanstack/react-virtual` 与 `react-window` 均未引入；`MainContent.tsx` 内已存在手写分批渲染补丁（`INITIAL_PROMPT_RENDER_COUNT = 160`、`PROMPT_RENDER_CHUNK_SIZE = 160`、`PROMPT_RENDER_CHUNK_DELAY_MS = 24`）。

## Shipped

> 留空。每完成一个阶段填写"做了什么 + 与计划的偏差"。

### P1 — Bundle 可观测性

- 状态：已完成（2026-05-16）
- 做了什么：
  - 新增 `apps/desktop` devDependency `rollup-plugin-visualizer`。
  - `apps/desktop/vite.config.ts`：把 config 改为 async factory，按 `BUILD_ANALYZE=1` 懒加载 visualizer（避免 ESM-only 包污染 vite-plugin-electron 的 CJS 配置加载）。
  - 新增 `apps/desktop/package.json` 脚本：`build:analyze`、`bundle:budget`。
  - 新增 `apps/desktop/scripts/check-bundle-budget.mts`：零外部依赖，按 glob 比对 gzipped 大小，超阈值非 0 退出。
  - 新增 `apps/desktop/bundle-budget.json`：8 项基线（主入口、markdown vendor、SettingsPage、ui vendor、react vendor、icons、i18n vendor、css 总量）；阈值给到当前实测 + 5–10% 缓冲。
  - 根 `.gitignore` 新增 `apps/desktop/dist-stats/`。
- 与计划偏差：
  - 计划写"按 `gzipSize`"，实际通过本地 `gzipSync` 直接计算，避免依赖 rollup metadata；优点是脚本不依赖任何构建器内部数据。
  - `bundle-budget.json` 中给 `markdown vendor` 标了 `required: false`，因为 P6 之后该 vendor 会被消解，这样未来 P6 不会因找不到该 chunk 而失败。
- 实测数字（baseline + budget）：

| chunk | actual gzip | budget |
| --- | --- | --- |
| `index-*.js` | 359.31 KB | 384 KB |
| `markdown-vendor` | 98.21 KB | 120 KB |
| `SettingsPage` | 49.07 KB | 60 KB |
| `ui-vendor` | 54.04 KB | 70 KB |
| `react-vendor` | 44.38 KB | 50 KB |
| `icons` | 13.51 KB | 18 KB |
| `i18n-vendor` | 14.96 KB | 20 KB |
| renderer css total | 19.48 KB | 30 KB |

- 验证：
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop build:analyze` ✅（`apps/desktop/dist-stats/renderer.html` 1.5 MB treemap）
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（8/8 通过）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅

### P2 — 设置页拆分

- 状态：**降级为 follow-up（2026-05-16）**
- 决策依据：在 P1 拿到精确数据 + 详细阅读 `DataSettings.tsx` (2774 行) 与 `AISettings.tsx` (2717 行) 结构后，重新评估 ROI：
  - `SettingsPage` chunk 已经只有 49 KB gzip，且本身已经从 `App.tsx` 通过 `lazy()` 在打开设置页时按需加载。它**不在首屏关键路径**上。
  - `DataSettings` 已按 `activeSubsection` 路由，只渲染当前激活面板，子面板的运行时 render cost 已经被裁剪。
  - 把它做成"每个 panel 一个文件 + panel 级 lazy"需要把 30+ 个 useState、若干 useEffect、几十个 handler 跨文件拆并通过 props 注入；diff 巨大、回归风险高、代码 review 困难。
  - 投入产出比远低于 P3（列表虚拟化，直接消除滚动卡顿）、P5（`skill.store` 拆分，直接砍主入口体积）、P6（移除 markdown-vendor 首屏强加载）。
- 调整方案：
  - 本次变更范围内**不做**完整物理拆分。
  - 设置页相关的可维护性清理作为后续独立 change 单独提案（`spec/changes/active/desktop-settings-modularization` 或类似 key），避免把它和性能调优混在一起。
  - 体积预算（P1 写入的 `bundle-budget.json`）保留对 `SettingsPage` 的阈值监控，确保不退化。
- 与计划偏差：`design.md` / `tasks.md` 中描述的 P2 物理拆分被推迟到独立 change。
- 实测数字：n/a（未执行物理拆分）

### P3 — 长列表虚拟化

- 状态：已完成（2026-05-16）
- 做了什么：
  - 新增 `apps/desktop` 依赖 `@tanstack/react-virtual ^3.13.x`。
  - 在 `apps/desktop/tests/setup.ts` 中注入全局 `vi.mock('@tanstack/react-virtual', ...)`，把 `useVirtualizer` 替换为"全量渲染"直通版，避免 jsdom 无真实布局导致测试找不到行节点；生产代码仍跑真正的虚拟化。
  - **`SkillListView`**：内部接管滚动容器（父级 `SkillManager` 在 list 模式下用 `overflow-hidden`），用 `useVirtualizer` 按行虚拟化；行高通过 `measureElement` 动态测量，初值 84 px；`getItemKey` 绑定 `skill.id` 让测得高度跨 reorder 不丢失。
  - **`PromptGalleryView`**：grid 模式按"行虚拟化"。新增 `getColumnsForSize(size, width)` 把 Tailwind 响应式断点显式翻译为列数，配合 `ResizeObserver` 跟踪可用宽度，应对 `prompt-list-pane` 的 `ColumnResizer` 实时拖拽。`estimateRowHeight` 由 `aspect-[4/3]` 加 ~120 px 的卡片底部估算。
  - **`PromptKanbanView`**：抽出 `<UnpinnedKanbanGrid>` 子组件做行虚拟化；保留 pinned section 的 `LayoutGroup` + `motion.div`（≤4 个、动画有意义），但 unpinned 卡片改用普通 `<div>`，避免虚拟化挂卸载与 framer-motion layout 动画产生帧抖。
  - **`MainContent.tsx`**：移除常量 `LARGE_PROMPT_LIST_THRESHOLD`、`INITIAL_PROMPT_RENDER_COUNT`、`PROMPT_RENDER_CHUNK_SIZE`、`PROMPT_RENDER_CHUNK_DELAY_MS`、`PROMPT_CARD_INTRINSIC_SIZE` 与对应的 `setTimeout` 分批渲染 `useEffect`；`renderedPromptCount` state 一并删除；新增 `<VirtualizedPromptList>` 子组件承接 list 视图，整页自此交给 virtualizer 控制渲染数量。
  - **`tests/integration/components/main-content-large-dataset.integration.test.tsx`**：原断言强依赖旧的 160-cap 分批渲染；改为断言"first + last + 完整数量"，与新的虚拟化契约对齐。
- 与计划偏差：
  - **Sidebar 文件夹树未虚拟化**：folder tree 通过 `dnd-kit` 的 `SortableTree` 渲染，dnd-kit 需要所有可拖动项处于同一 DnD context 才能正确感知坐标；强行嵌入虚拟化容器会引入拖拽回归。绝大多数用户的文件夹数量远低于 200，性价比低，**改为后续 follow-up**（`spec/changes/active/desktop-frontend-perf-tuneup` 的 follow-ups 段已记录）。
  - **未新增 `prompt-large-list.spec.ts` e2e**：现有 `tests/integration/components/main-content-large-dataset.integration.test.tsx` 覆盖了 1000 条数据集场景；继续追加 e2e 是 marginal value。也归入 follow-up。
- 实测数字（`pnpm build` + `pnpm bundle:budget`，相对 P1 baseline）：

| chunk | P1 baseline gzip | P3 实测 gzip | Δ |
| --- | --- | --- | --- |
| `index-*.js`（主入口） | 359.31 KB | 364.30 KB | +4.99 KB（virtualizer 入口） |
| `SkillListView-*.js` | 7.7 KB（raw） | 7.9 KB（raw） | 基本持平 |
| `PromptGalleryView-*.js` | 6.0 KB（raw） | 6.0 KB（raw） | 持平 |
| `PromptKanbanView-*.js` | 10.5 KB（raw） | 11 KB（raw） | +0.5 KB |

主入口体积小幅上涨是 `@tanstack/react-virtual` 进入首屏关键路径的代价；整体预算仍在 384 KB 阈值内。运行时收益：

- Skill 列表：从全量 `.map()` 改为只渲染可视 + overscan 6 行的 DOM，1000+ 条 skill 时 DOM 节点数从 O(n) 降到 O(visible)。
- Prompt 画廊：grid 行级虚拟化，1000 条 prompts 不再一次性挂载 2000+ DOM 节点。
- Prompt 看板：unpinned 区域同样行级虚拟化；pinned 仍保留 framer-motion 动画。
- MainContent：去除手写 `setTimeout` 分批渲染，避免分批延迟可见 + 滚动到底突然卡顿的体验缺陷。

- 验证：
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop test:unit` ✅（132 test files / 1157 tests）
  - `pnpm --filter @prompthub/desktop test -- tests/integration --run` ✅（10/10 通过）
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（8/8 阈值满足）

### P4 — Modal 状态解耦

- 状态：已完成（2026-05-16，按缩减范围执行）
- 决策依据：在 P3 完成后重新评估 P4 收益。原计划是抽出 `prompt-modal.store`、`<PromptModalsHost />`、`<PromptCard memo>` 三件套，让 modal 开关绝对不触发列表 rerender。但实际剖析 `MainContent.tsx` 发现：
  - `PromptCard` 早已是 `React.memo`，已具备最关键的隔离层。
  - `VirtualizedPromptList` 是新引入的桥梁，只要它本身 memo 化，并且它收到的 props 引用稳定，整列就不会随 modal 开关 rerender。
  - 把 modal 状态搬到外部 store 需要重写大量 modal 业务逻辑（AI 测试 / 多模型对比 / 复制变量弹窗的状态相互耦合），diff 大、回归面广，但额外收益边际下降。
- 因此把 P4 调整为"最小有效干预"：让 `VirtualizedPromptList` 可被 `React.memo` 真正命中。
- 做了什么：
  - `MainContent.tsx`：把 `VirtualizedPromptList` 用 `React.memo` 包裹（同时调整闭合括号与 displayName）。
  - 把 `handleContextMenu` 从普通函数改为 `useCallback(..., [])`，与已经 useCallback 的 `handleSelectPrompt` 一起保证回调引用稳定。
  - 验证 `prompts`、`selectedPromptIdSet`、`highlightTerms` 来自 `useMemo`，引用本身已经稳定。
- 与计划偏差：
  - **未抽 `prompt-modal.store`**：留作后续独立 change（`desktop-prompt-modal-store-isolation` 或类似 key）。当前 memo 化已能覆盖"列表不重渲染"主要场景；如果未来 React Profiler 证据显示仍有问题，再做 store 抽离。
  - **未抽 `<PromptModalsHost />` / 未抽 `<PromptCard>` 到独立文件**：原因同上。
- 实测数字：
  - bundle：主入口 364.29 KB（与 P3 相比基本持平，memo 包装不影响 chunk 体积）。
  - rerender 行为：通过 React.memo + `useCallback` + `useMemo` 三件套，目前理论上 modal toggling 不会让 `VirtualizedPromptList` 子树重渲染（其依赖项均稳定）。这个声明等 follow-up 的 store 抽离阶段做 React Profiler 实测验证。
- 验证：
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop test:unit` ✅（132 / 1157）
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅

### P5 — `skill.store` 拆分

- 状态：**降级为 follow-up（2026-05-16）**
- 决策依据：在 P3/P4 完成后实测分析发现：
  - `skill.store.ts` 的体积主要来自业务逻辑（registry sync、scan、translate、export），但这些 action 都被 `useSkillStore()` 统一公开，运行时一定会随 store 创建而执行的代码很少。
  - 唯一明显的"冷路径包袱"是 `chatCompletion` from `services/ai`（2458 行），仅在 `translateContent` 内部使用一次。**但是** `services/ai` 已经被 `MainContent.tsx`、`AISettings.tsx`、`AiTestModal.tsx`、`EditPromptModal.tsx`、`QuickAddModal.tsx`、`CreateSkillModal.tsx` 等热路径组件直接导入，所以无论 skill.store 怎么改，`services/ai` 都会被打进主入口。
  - 实测把 skill.store 中 `chatCompletion` 改为动态 import：主入口 gzip 不降反升 0.8 KB（从 364.29 → 365.09 KB），原因是动态 import 的 chunk 拆分胶水代码反而有少量额外开销，而 `services/ai` 仍然进主入口。
  - 物理把 `skill.store.ts` 拆成 `core.ts / platform-sync.ts / scan.ts / export.ts` 仅改变源码组织，**不会**改变 vite/rollup 的 chunk graph：所有 action 都通过 `useSkillStore()` 集中暴露，bundler 视角下它们仍属同一 reachable 图。
  - 真正能砍主入口的杠杆是 P6（移除 `markdown-vendor` 强加载）+ 将来对 `services/ai` 自身瘦身（独立 change）。
- 因此把 P5 降级为 follow-up：实质性收益需要先解决 `services/ai` 在多个组件中的直接静态导入（这超出了"只动 skill.store"的范围）。
- 调整方案：
  - 本次变更内**不做** skill.store 物理拆分。
  - 把"`services/ai` 模块化与按需加载"作为后续独立 change（key 建议 `desktop-ai-service-modularization`）。
- 与计划偏差：`design.md` / `tasks.md` 中描述的 P5 物理拆分推迟到独立 change。
- 实测数字：n/a（未做物理拆分；动态 import 实验已回退）

### P6 — manualChunks 复核 + 体积预算收紧

- 状态：已完成（2026-05-16，按经验调整范围）
- 决策依据：在 P1–P5 跑完后，重新评估 P6 的真实杠杆：
  - **`markdown-vendor` 移除**的设想前提是"它只在冷路径用到"。但实测 `MainContent.tsx` 自身静态 `import ReactMarkdown from 'react-markdown'`，prompt detail 渲染就在主入口里走 markdown，所以无论 manualChunk 是否声明，markdown 依赖都会被打进首屏关键路径。把 manualChunk 删掉只会让这些依赖混到 `index-*.js` 里、把主入口顶得更大；当前 `markdown-vendor` 反而起到 vendor 缓存复用的作用。
  - **`lucide-react`** 全部都是命名 import（`grep` 全文确认无默认导入或 namespace import），tree-shaking 已经成立。
  - **`tailwind` content** 仅扫描 `apps/desktop/src/renderer/**/*.{ts,tsx}` 是正确的：`packages/core/db/shared` 都是非 React/JSX 代码，不需要扫描。
  - **预算阈值**：当前每条都留有 ~5–10% 余量，足够吸收无关 PR 的小幅波动。强行收紧会让无关变更频繁红 CI，违背 P1 时定下的"guardrail 而非 ratchet"原则。
- 因此 P6 调整为最小有效干预：
  - 不删 `markdown-vendor` manual chunk（删了会让主入口更大）。
  - 不动 `dnd-kit` 拆分（它在 `ui-vendor` 内只有 ~30 KB，不值得单独拆）。
  - **把 `bundle:budget` 接到 `quality.yml` 的 `Build` 之后**，让 PR CI 自动守护体积。
  - 在 `bundle-budget.json` 顶部写明"guardrail，不是 ratchet"的策略说明，避免后续误改。
- 与计划偏差：
  - **未删 `markdown-vendor` manual chunk**：实测会让主入口变大；保留现状。
  - **未把"markdown 渲染统一到 `<MarkdownViewer>` + lazy 化"作为本次范围**：那需要重写 6+ 个组件的 markdown 用法，是独立 change。
- 实测数字（最终 baseline，附在 `apps/desktop/out/renderer/`）：

| chunk | 终态 gzip | 预算 | 备注 |
| --- | --- | --- | --- |
| `index-*.js`（主入口） | 364.29 KB | 384 KB | +5 KB vs P1 baseline，来自 `@tanstack/react-virtual` |
| `markdown-vendor` | 98.21 KB | 120 KB | 持平 |
| `SettingsPage` | 49.07 KB | 60 KB | 持平 |
| `ui-vendor` | 54.04 KB | 70 KB | 持平 |
| `react-vendor` | 44.38 KB | 50 KB | 持平 |
| `icons` | 13.51 KB | 18 KB | 持平 |
| `i18n-vendor` | 14.96 KB | 20 KB | 持平 |
| renderer css total | 19.45 KB | 30 KB | 持平 |

- 验证：
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（8/8）
  - `quality.yml` 中新增 `Bundle budget` step（CI 触发后会随 PR 自动跑）。

### P7 — 启动入口瘦身（2026-06-06 follow-up）

- 状态：已完成（2026-06-06）
- 背景：在继续审查 bundle 后发现，主入口从历史 P6 的 ~364 KB gzip 进一步膨胀到 ~436 KB gzip，并超过 384 KB budget。`build:analyze` 显示最大原因不是 React 或 markdown，而是 7 个 locale JSON 全部被静态打进 `index-*.js`，合计约 290 KB gzip 的模块贡献；同时 prompt 详情 markdown 栈仍在 `MainContent` 启动路径上。
- 做了什么：
  - 新增 `apps/desktop/src/renderer/components/prompt/PromptMarkdownContent.tsx`，把 prompt 详情正文的 `react-markdown` / `remark-gfm` / `rehype-sanitize` / `rehype-highlight` / `defaultSchema` 从 `MainContent.tsx` 移出。
  - `MainContent.tsx` 通过 `React.lazy()` 加载 `PromptMarkdownContent`，Suspense fallback 使用纯文本预览，避免 markdown 依赖阻塞主入口。
  - `App.tsx` 将 `UpdateDialog` 改为 lazy load，并把 `UpdateStatus`、`ImportedPromptData` 改为 type-only import；`TopBar.tsx` 同步修正 `UpdateStatus` 的 type-only import。
  - `apps/desktop/src/renderer/i18n/index.ts` 将 locale JSON 改为动态 import。启动阶段只加载当前语言 + English fallback；用户切换到其它语言时先加载对应资源，再调用 `i18n.changeLanguage()`。
  - `apps/desktop/src/renderer/main.tsx` 等待 `i18nReady` 后挂载 React，避免 async i18n 初始化导致首屏出现未翻译 key。
  - 初始非 English locale chunk 加载失败时回退到 English resources，保证 renderer 仍会完成 i18n 初始化并挂载。
  - `settings.store.ts` 的语言切换改为显式 `void changeLanguage(...).catch(...)`，防止 locale chunk 加载失败时出现未处理 promise rejection；用户选择仍会立即持久化，失败时记录错误。
  - 新增 `TopBarRulesSearch` 与 `RulesSidebarPanel`，把 Rules 搜索、Rules 侧栏列表、重扫、项目规则增删等 store 订阅从常驻 `TopBar` / `Sidebar` 移到 Rules-only lazy 组件。
  - `TopBar.tsx` / `Sidebar.tsx` 仅在 `appModule === "rules"` 时 lazy 加载 Rules UI；Prompt/Skill 首屏不再静态 import `rules.store.ts`。
- 与计划偏差：
  - 历史 P6 判断"markdown 无法离开首屏"只对当时的静态 `MainContent` 写法成立。本轮抽出 prompt 详情 markdown 后，主入口已不再直接包含 prompt 详情 markdown 栈，但其它冷路径组件仍各自 import markdown，后续仍建议统一到共享 Markdown viewer。
  - locale 采用"按语言文件"切分，而不是 namespace 级切分；当前目标是先把大 JSON 从启动入口移走，namespace 级 lazy load 留待 i18n key 继续膨胀后再评估。
  - Rules shell 拆分保留现有 `rules.store.ts` 作为单一 source of truth，只改变加载边界，不改变 Rules 数据模型或 IPC contract。
- 实测数字：

| chunk | P7 前 gzip | P7 后 gzip | 预算 | 备注 |
| --- | --- | --- | --- | --- |
| `index-*.js`（主入口） | 436.03 KB | 147.05 KB | 384 KB | locale JSON、prompt markdown、Rules store 从启动入口移出 |
| `markdown-vendor` | n/a | 99.04 KB | 120 KB | 保持独立 vendor chunk |
| `SettingsPage` | n/a | 57.84 KB | 60 KB | 接近预算，后续设置页增长需警惕 |
| `i18n-vendor` | n/a | 14.99 KB | 20 KB | 仅 i18n runtime，不含 locale JSON |
| locale JSON chunks | 打进主入口 | 37.11-42.97 KB each | n/a | `en`、`zh`、`zh-TW`、`ja`、`es`、`de`、`fr` 均为动态 chunk |
| `rules.store` | 打进主入口 | 2.81 KB | n/a | 仅 Rules UI / settings refresh 动态加载 |

- 验证：
  - `pnpm --filter @prompthub/desktop test -- tests/unit/services/i18n-init.test.ts tests/unit/stores/settings-language.test.ts tests/unit/components/language-settings.test.tsx --run` ✅（10 tests，覆盖初始语言、非初始 locale lazy load、初始 locale 失败 fallback、settings store 失败路径）
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/prompt-markdown-content.test.tsx tests/unit/components/spinner.test.tsx --run` ✅
  - `pnpm --filter @prompthub/desktop test -- tests/integration/components/main-content-inline-edit.integration.test.tsx tests/integration/components/main-content-large-dataset.integration.test.tsx --run` ✅
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/top-bar.test.tsx tests/unit/components/top-bar-agent-search.test.tsx tests/unit/components/sidebar.test.tsx tests/unit/components/rules-manager.test.tsx --run` ✅（48 tests，覆盖 Rules 搜索、侧栏、选择、过滤、RulesManager）
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（main entry 147.05 KB gzip / 384 KB budget）
  - Vite build 不再出现 `rules.store.ts is dynamically imported ... but also statically imported` 警告 ✅

### P8 — 技能详情冷路径拆分（2026-06-06 follow-up）

- 状态：已完成（2026-06-06）
- 背景：P7 后主入口已降到预算内，但 `build:analyze` 显示技能详情页默认 chunk 仍高达 ~264.93 KB gzip。主要原因是 `SkillFullDetailPage` 默认打开 Preview tab，却静态 import 了 Files tab 的 `SkillFileEditor`；`SkillFileEditor` 又带入 CodeMirror、Lezer language parser 与文件树 CSS。同时 `EditSkillModal` 静态 import `SkillFileEditor`，导致第一次把 Files tab 改成 lazy 后 Vite 仍提示该模块"dynamic import 同时被 static import"，实际无法拆出独立 chunk。
- 做了什么：
  - `SkillFullDetailPage.tsx`：将 Files tab 的 `SkillFileEditor` 改为 `React.lazy()` + `Suspense`，只在 `activeTab === "files"` 时加载。
  - `SkillFullDetailPage.tsx`：将 `EditSkillModal` 改为按需加载，只在 `isEditModalOpen` 为 true 时请求编辑弹窗 chunk。
  - `EditSkillModal.tsx`：移除对 `SkillFileEditor` 的静态 import，并在用户打开文件编辑器弹窗时 lazy 加载文件编辑器。
  - `SkillFullDetailPage.tsx`：修复 project detail sidebar 中 `projectContext?.scannedSkill.installMode` 的空值崩溃，改为 `projectContext?.scannedSkill?.installMode`。这条是在跑 integration test 时暴露的真实缺陷；project detail test 允许只传 `projectContext.project` 来验证从 `source_url` 读取 SKILL.md 的路径。
  - `tests/integration/components/skill-ui.integration.test.tsx`：增加回归测试，断言默认技能详情页只渲染 preview，不加载 `EditSkillModal` / `SkillFileEditor` mock module；点击 Files tab 后才加载并渲染 file editor。同时修正一个已有 async update 测试的 race，等待 `Update` 按钮出现后再点击。
- 实测数字（`pnpm --filter @prompthub/desktop build:analyze`）：

| chunk | P8 前 gzip | P8 后 gzip | 备注 |
| --- | --- | --- | --- |
| `SkillFullDetailPage-*.js` | 264.93 KB | 23.06 KB | 默认技能详情 / Preview tab 不再携带 CodeMirror |
| `SkillFileEditor-*.js` | 打进 `SkillFullDetailPage` | 239.96 KB | 仅 Files tab / edit modal 文件编辑器路径加载 |
| `EditSkillModal-*.js` | 打进 `SkillFullDetailPage` | 3.50 KB | 仅点击编辑技能元数据时加载 |
| `SkillFullDetailPage-*.css` | 合并文件编辑器样式 | 1.37 KB | 文件编辑器样式拆入 `SkillFileEditor-*.css` |
| `SkillFileEditor-*.css` | n/a | 2.22 KB | 仅文件编辑器路径加载 |
| `index-*.js`（主入口） | 147.05 KB | 147.05 KB | 本阶段优化冷路径，不改变启动入口 |

- 验证：
  - `pnpm --filter @prompthub/desktop test -- tests/integration/components/skill-ui.integration.test.tsx --run` ✅（11 tests，覆盖 skill detail lazy loading、snapshot、local store import/update、project SKILL.md source_url）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（main entry 147.05 KB gzip / 384 KB budget；SettingsPage 57.84 KB gzip / 60 KB budget）
  - `pnpm --filter @prompthub/desktop build:analyze` ✅（确认 `SkillFileEditor` 独立 chunk，且不再出现 `SkillFileEditor.tsx dynamically imported ... but also statically imported` 警告）

### P9 — 设置页 section 级冷路径拆分（2026-06-06 follow-up）

- 状态：已完成（2026-06-06）
- 背景：P7 后 `SettingsPage` chunk 接近 60 KB budget（`build:analyze` 输出约 59.23 KB gzip），且 `SettingsPage.tsx` 静态 import 了所有设置 section。用户只是打开设置页默认 General section 时，也会同时拉入 Data、AI、Skill、Appearance、About 等冷路径设置面板。历史 P2 曾推迟 `DataSettings` / `AISettings` 的内部物理拆分，但本轮发现可以先做低风险的 route-level split：设置 shell 与导航同步渲染，各 section body 按需加载。
- 做了什么：
  - `SettingsPage.tsx`：移除所有 settings section 的静态 import，改为 `React.lazy()` + `Suspense` 按 `activeSection` 加载当前 section body。
  - `SettingsPage.tsx`：新增 `SettingsContentFallback`，使用共享 `Spinner` 作为 section chunk 加载态；设置侧栏、Data 子菜单、标题和 shell layout 保持同步渲染，避免导航本身闪烁。
  - `tests/unit/components/settings-page.test.tsx`：增加回归测试，断言默认 settings route 只加载 `GeneralSettings` mock module，不请求 `DataSettings` / `AISettingsPrototype` mock module。
  - `apps/desktop/bundle-budget.json`：将 `SettingsPage-*.js` 预算从 60 KB 收紧到 6 KB，并新增 `DataSettings`、`AISettingsPrototype`、`SkillSettings` section chunk 预算，避免拆分后大面板失去预算守护。
- 实测数字（`pnpm --filter @prompthub/desktop build:analyze` + `bundle:budget`）：

| chunk | P9 前 gzip | P9 后 gzip | 预算 | 备注 |
| --- | --- | --- | --- | --- |
| `SettingsPage-*.js` | 59.23 KB | 2.59 KB | 6 KB | 仅保留设置 shell、导航、lazy 边界 |
| `DataSettings-*.js` | 打进 `SettingsPage` | 11.57 KB | 15 KB | 仅 Data & Sync section 加载 |
| `AISettingsPrototype-*.js` | 打进 `SettingsPage` | 26.44 KB | 32 KB | 仅 Model Services section 加载 |
| `SkillSettings-*.js` | 打进 `SettingsPage` | 6.73 KB | 10 KB | 仅 Agent Management section 加载 |
| `GeneralSettings-*.js` | 打进 `SettingsPage` | 1.16 KB | n/a | 默认 General section 单独加载 |
| `index-*.js`（主入口） | 147.05 KB | 147.03 KB | 384 KB | 本阶段优化设置冷路径，不改变启动入口 |

- 验证：
  - `pnpm --filter @prompthub/desktop test -- tests/unit/components/settings-page.test.tsx --run` ✅（8 tests，覆盖默认 section lazy loading、Data 子菜单、pending section navigation、AI shell layout）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop build:analyze` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（新增 Settings section budgets 均通过）

### P10 — 旧技能详情面板冷路径拆分（2026-06-10 follow-up）

- 状态：已完成（2026-06-10）
- 背景：继续审查技能详情冷路径后发现，主线 `SkillFullDetailPage` 已在 P8 将文件编辑器和编辑弹窗拆成 lazy chunk，但旧 `SkillDetailView` 仍静态 import `EditSkillModal`、`SkillFileEditor` 与 `react-markdown` 渲染栈。当前源码没有业务入口直接渲染 `SkillDetailView`，但它仍通过 skill barrel export 保留；如果未来被重新接入或被 barrel 误用，关闭状态下也会携带 CodeMirror 和 markdown 依赖。
- 做了什么：
  - `SkillDetailView.tsx`：将 `EditSkillModal` 改为 `React.lazy()`，只在点击 Edit Skill 后挂载和加载。
  - `SkillDetailView.tsx`：将 `SkillFileEditor` 改为 `React.lazy()`，只在点击 File Editor 后挂载和加载。
  - `SkillDetailView.tsx`：将 inline markdown 渲染替换为 lazy `SkillMarkdown`，让 `SkillDetailView` 自身不再静态 import `react-markdown`、`remark-gfm`、`rehype-highlight`、`rehype-sanitize`。
  - `skill-detail-view-timers.test.tsx`：补充回归测试，断言默认渲染不加载编辑器模块，点击编辑/文件编辑器按钮后才加载对应 lazy module。
- 与计划偏差：
  - 未删除 `SkillDetailView`。虽然当前没有 live 渲染入口，但它仍有历史文档和测试覆盖，删除属于更大范围的死代码清理；本阶段只收紧加载边界。
- 实测数字：
  - `index-*.js` 主入口：149.71 KB gzip / 384 KB budget。
  - `SkillFileEditor-*.js` 仍为独立冷路径 chunk：240.02 KB gzip，仅文件编辑器路径加载；Vite 仍会因该 raw chunk 超过默认 500 KB 给出既有提示。
- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-detail-view-timers.test.tsx` ✅（4 tests）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅

### P11 — 内置技能注册表冷路径拆分（2026-06-10 follow-up）

- 状态：已完成（2026-06-10）
- 背景：继续审查 Q-003 时，当前 `pnpm --filter @prompthub/desktop build`
  显示 `index-*.js` 为 549.06 KB raw / 154.55 KB gzip，仍超过 Vite
  500 KB raw chunk warning limit。`build:analyze` 显示主入口中包含
  `packages/shared/constants/skill-registry.ts`（54.2 KB raw）和
  `skill-icons.ts`（42.6 KB raw），原因是 `skill.store.ts` 在启动路径里静态
  import `BUILTIN_SKILL_REGISTRY`，而注册表只在打开技能商店并执行
  `loadRegistry()` 时需要。
- 做了什么：
  - 新增轻量 `packages/shared/constants/skill-categories.ts`，让常驻 UI 和 store
    只导入分类元数据，不再为分类常量加载完整技能注册表。
  - `skill-registry.ts` 保留 `SKILL_CATEGORIES` re-export，兼容旧导入路径。
  - `skill.store.ts` 将 `loadRegistry()` 改为动态 import 内置注册表，并在 chunk
    加载期间保持 `isLoadingRegistry`。
  - `SkillStore.tsx` 改为从轻量分类常量文件导入 `SKILL_CATEGORIES`。
  - `bundle-budget.json` 将主入口预算从 384 KB gzip 收紧到 150 KB gzip，锁住本次收益。
- 实测数字：

| chunk | P11 前 | P11 后 | 备注 |
| --- | --- | --- | --- |
| `index-*.js`（主入口） | 549.06 KB raw / 154.55 KB gzip | 459.04 KB raw / 125.91 KB gzip | 低于 Vite 500 KB raw warning limit |
| `skill-registry-*.js` | 打进主入口 | 47.21 KB raw / 11.70 KB gzip | 仅 `loadRegistry()` 路径加载 |
| `skill-icons-*.js` | 打进主入口 | 43.03 KB raw / 15.62 KB gzip | 仅注册表路径加载 |
| `skill-categories-*.js` | n/a | 0.68 KB raw / 0.38 KB gzip | 轻量分类常量 |

- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/skill.store.test.ts -t "loadRegistry loads"` ✅（先红后绿，验证注册表异步加载契约）
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/stores/skill.store.test.ts` ✅（53 tests）
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-detail-timers.test.tsx tests/unit/components/skill-store-remote.test.tsx` ✅（83 tests）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build:analyze` ✅
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（main entry 122.95 KB gzip / 150 KB budget）

### P12 — CodeMirror 语言包按需加载（2026-06-10 follow-up）

- 状态：已完成（2026-06-10）
- 背景：P11 后主入口已低于 Vite 500 KB raw warning limit，但
  `SkillFileEditor-*.js` 仍为 688.52 KB raw / 240.02 KB gzip。`build:analyze`
  显示 `SkillCodeEditor.tsx` 静态 import 了 `@codemirror/lang-css`、
  `lang-html`、`lang-javascript`、`lang-json`、`lang-markdown`、`lang-python`、
  `lang-sql`、`lang-yaml`，导致用户打开任意一个文件编辑器时一次性下载所有语言包。
- 做了什么：
  - `SkillCodeEditor.tsx` 移除全部 CodeMirror language extension 静态 import。
  - 新增 `loadSkillCodeEditorLanguage()`，按当前文件扩展名动态 import 对应语言包。
  - 初始 editor state 只创建基础 CodeMirror surface，语言包加载完成后通过
    `languageCompartment.reconfigure()` 注入；切换文件时重复按需加载，失败时回退 plaintext。
  - `skill-code-editor.test.tsx` 补充异步 language loader 回归测试。
  - `check-bundle-budget.mts` 支持 `aggregation: "max"`，修复语言包动态 chunk 也叫
    `index-*.js` 时主入口预算被误累计的问题。
  - `bundle-budget.json` 的主入口预算改为 max 聚合，并新增 `SkillFileEditor-*.js`
    150 KB gzip 预算。
- 实测数字：

| chunk | P12 前 | P12 后 | 备注 |
| --- | --- | --- | --- |
| `SkillFileEditor-*.js` | 688.52 KB raw / 240.02 KB gzip | 408.87 KB raw / 130.37 KB gzip | 低于 Vite 500 KB raw warning limit |
| `index-*.js`（主入口） | 459.04 KB raw / 125.91 KB gzip | 459.04 KB raw / 125.92 KB gzip | 不回流到启动路径 |
| CodeMirror language chunks | 打进 `SkillFileEditor` | 2.26-84.88 KB raw each | 只按文件类型加载 |

- 验证：
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-code-editor.test.tsx` ✅（先红后绿）
  - `pnpm --filter @prompthub/desktop test -- --run tests/unit/scripts/check-bundle-budget.test.ts tests/unit/components/skill-code-editor.test.tsx` ✅（6 tests）
  - `pnpm --filter @prompthub/desktop typecheck` ✅
  - `pnpm --filter @prompthub/desktop lint` ✅
  - `pnpm --filter @prompthub/desktop build:analyze` ✅（renderer 不再出现 Vite chunk-size warning）
  - `pnpm --filter @prompthub/desktop bundle:budget` ✅（main entry 122.96 KB gzip / 150 KB budget；SkillFileEditor 127.31 KB gzip / 150 KB budget）

## Verification

- 每阶段完成时记录：lint / typecheck / unit / integration / e2e:smoke / perf 的实际结果。
- 每阶段对应 PR 中附 `build:analyze` 前后对比截图或数字。

## Synced Docs

- 全部完成后同步：
  - `spec/knowledge/behavior/desktop.md`：把虚拟化、bundle 预算作为稳定行为写入（已完成 2026-05-16）。
  - `spec/knowledge/structure/desktop-frontend-performance.md`：新增桌面端 renderer 性能策略文档（已完成 2026-05-16），并补充启动入口禁止静态聚合 locale JSON / heavy markdown 依赖的规则（已完成 2026-06-06）。
  - `docs/contributing.md`：补充"如何运行 build:analyze 与 budget 检查"——本次未做，留作 follow-up（贡献者面向 doc，不阻塞本次闭环）。
- 完成后再把本变更从 `spec/changes/active/` 归档到 `spec/changes/archive/`。

## Follow-ups

- **设置页物理拆分**：拆 `DataSettings.tsx` 与 `AISettings.tsx` 为子目录 + 二级 lazy，独立 change 推进（key 建议 `desktop-settings-modularization`）。
- **markdown 渲染统一为 `<MarkdownViewer>` + lazy 化**：prompt 详情正文已完成 lazy 化；剩余 `PromptEditor`、prompt modal、skill modal/detail 等冷路径仍重复 import `react-markdown + remark-gfm + rehype-* + defaultSchema`，建议后续封装为单一共享 viewer（key 建议 `desktop-markdown-viewer-extraction`）。
- **services/ai 模块化与按需加载**：拆 2458 行的 `services/ai.ts` 为按 provider / 按用途分块，让冷路径（如 skill 翻译）能用动态 import 把整块代码挪出主入口（key 建议 `desktop-ai-service-modularization`）。
- **prompt modal store 抽离**：把 `MainContent` 内的 modal 状态搬到独立 zustand store + `<PromptModalsHost />`，并用 React Profiler 实测确认列表零重渲染（key 建议 `desktop-prompt-modal-store-isolation`）。
- **Sidebar 文件夹树虚拟化**：与 dnd-kit `SortableTree` 协作复杂，等出现 200+ 文件夹的实际投诉再单独评估（key 建议 `desktop-sidebar-tree-virtualization`）。
- **大列表 e2e**：把 `tests/e2e/prompt-large-list.spec.ts` 作为后续 e2e 加固的一部分（与 P3 跨工作流，单独提）。
- 评估 `framer-motion` 替换或精简（独立变更，单独 proposal）。
- 评估 `react-i18next` 按 namespace lazy load（locale 文件已动态加载；namespace 级拆分仅在 locale JSON 继续显著膨胀时再做）。
- 评估 `services/ai.ts` (2458 行)、`CreateSkillModal.tsx` (2144 行) 是否需要后续拆分（与 services/ai 模块化合并，或单独 proposal）。
- 评估 `settings.store.ts` (1776 行) 拆分（单独 proposal，本变更只识别但不动）。
