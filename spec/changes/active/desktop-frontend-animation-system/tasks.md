# Tasks

按 commit 边界组织。每 commit 都应能独立通过 typecheck / lint / test / build / bundle:budget。

## C1 — Motion tokens + reduced-motion defaults

- [x] 新建 `apps/desktop/src/renderer/styles/motion-tokens.ts`（duration / easing / scale / translate / stagger）
- [x] 同步 `apps/desktop/tailwind.config.js`（`transitionDuration`、`transitionTimingFunction`、`scale` 命名扩展）
- [x] `apps/desktop/src/renderer/styles/globals.css`：加 CSS 变量；加 `@media (prefers-reduced-motion: reduce)` 全局降级；加 `html[data-motion="off|reduced|standard"]` 选择器
- [x] 删除 `globals.css` 中未使用的 `@keyframes fadeIn / slideUp / scaleIn / floatSoft` 与对应的 `.animate-fadeIn / .animate-slideUp / .animate-scaleIn / .animate-floatSoft`
- [x] 跑 `pnpm lint` `pnpm typecheck` `pnpm build` `pnpm bundle:budget` 全绿

## C2 — Motion components + 用户偏好

- [x] 新建 `apps/desktop/src/renderer/components/ui/motion/Reveal.tsx`
- [x] 新建 `apps/desktop/src/renderer/components/ui/motion/Collapsible.tsx`
- [x] 新建 `apps/desktop/src/renderer/components/ui/motion/ViewTransition.tsx`
- [x] 新建 `apps/desktop/src/renderer/components/ui/motion/Pressable.tsx`
- [x] 新建 `apps/desktop/src/renderer/components/ui/motion/index.ts`（统一导出）
- [x] `apps/desktop/src/renderer/stores/settings.store.ts`：加 `motionPreference: 'off' | 'reduced' | 'standard'`、`setMotionPreference(value)` action（默认 `'standard'`，加 persist 字段）
- [x] `apps/desktop/src/renderer/components/settings/AppearanceSettings.tsx`：暴露 3 档选择器
- [x] 在顶层组件（`App.tsx` 或 `main.tsx`）写 effect：把 `motionPreference` 同步到 `document.documentElement.dataset.motion`
- [x] 7 个 locale 文件（en / zh / zh-TW / ja / fr / de / es）添加 5 个 i18n key：`settings.motion.title / off / reduced / standard / desc`
- [x] 给 4 个 motion 组件写最小单测（mount + prop 切换 + 断言 className）
- [x] 跑全套绿

## C3 — 仓库迁移到 token

- [x] 替换裸 duration（用 perl + `\b` 边界全局替换）：
  - [x] `duration-100` → `duration-instant`
  - [x] `duration-150` → `duration-quick`
  - [x] `duration-200` → `duration-base`
  - [x] `duration-300` → `duration-smooth`
  - [x] `duration-500` → `duration-slow`
- [x] 替换 scale：`active:scale-90` 与 `active:scale-95` 统一为 `active:scale-press-in`
- [x] 替换手写 spinner：`apps/desktop/src/renderer/components/prompt/PromptEditor.tsx` 把 `<span className="border-2 ... animate-spin">` 改为 `<Loader2Icon className="animate-spin">`
- [x] 跑全套绿；视觉 diff 抽检

## C4 — 补齐缺失动画

- [x] `Toast.tsx` 删除 toast 时：加 `animate-out fade-out duration-quick`（两阶段：mark leaving → setTimeout unmount）
- [x] `Modal.tsx` 入场 / 出场曲线统一到 `ease-enter` / `ease-exit`，时长统一到 `duration-base` / `duration-quick`
- [x] `ContextMenu.tsx` 与 `Select.tsx` 的下拉入场曲线统一为 `ease-enter`
- [-] ~~`MainContent.tsx` 中 `<PromptCard>`：`bg-primary` 切换加 `transition-colors duration-quick`~~（已存在 `transition-all duration-base`，免补）
- [-] ~~`MainContent.tsx` 中 `selectedPrompt` 详情区：`<div key={selectedPrompt.id}>` 让重选不重播~~（已存在）
- [-] ~~`MainContent.tsx` 中 view mode 切换（list / gallery / kanban）：用 `<ViewTransition activeKey={viewMode}>` 包裹~~（已存在 opacity cross-fade）
- [-] ~~`Sidebar.tsx` 中 `showAllTags` 与 `showAllSkillTags` 折叠区：用 `<Collapsible>` 替代直接 toggle~~（panel 整体已有 reveal，内部 show-all 仅扩展滚动内容，无强烈需求）
- [x] 跑全套绿；手动验收

## C5 — 卸 framer-motion

- [x] `PromptKanbanView.tsx` 中 pinned section 的 `LayoutGroup` + `motion.div` 改为 `<Reveal intent="enter">` + Tailwind transition
- [x] 卸 `framer-motion` 依赖：`pnpm --filter @prompthub/desktop remove framer-motion`
- [x] `apps/desktop/vite.config.ts`：从 `ui-vendor` manualChunk 中移除 `framer-motion`
- [x] `apps/desktop/bundle-budget.json`：把 `ui-vendor` 阈值从 70 KB 收紧到 22 KB
- [x] 跑全套绿；`bundle:budget` 显示 `ui-vendor` 收缩

## C6 — 同步稳定文档

- [x] 新建 `spec/knowledge/structure/desktop-frontend-animation.md`（token 取值、意图分类表、禁用清单、缺失补齐清单、reduced-motion 策略）
- [x] `spec/knowledge/behavior/desktop.md`：加章节"Renderer Motion System"，固化 token 必须存在、必须支持 `motionPreference`、必须尊重 `prefers-reduced-motion`
- [x] 更新 `implementation.md`，记录每个 commit 的实测数据与偏差
- [x] 在 follow-ups 中记录"未做的 expressive 档"等延后项

## Cross-cutting

- [x] 所有 commit 跑过 `pnpm --filter @prompthub/desktop typecheck && lint && test:unit && test:integration && build && bundle:budget`
- [x] Skill 管理补齐横向页面/详情切换动画：My Skills / Store / Project Skills / Agent Skills 顶层切换，以及 Project/Agent 内部目标切换
- [x] 手写 CSS spinner 收敛为共享 `<Spinner>`：App / MainContent / AI settings / DataRecoveryDialog / SkillManager 不再直接写 `border-t-transparent animate-spin`
- [ ] PR 描述附 motionPreference 3 档体感对比（GIF / 视频）（PR 时补）
