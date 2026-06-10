# Desktop Frontend Animation Architecture

## Purpose

定义桌面端 renderer 动画的稳定工程契约：**何时该动、动多久、由什么 token 控制、由谁守护**。本文是长期规则，不记录某次具体优化的过程；具体改动留在 `spec/changes/`。

## Stable Principles

### 1. Token 是动画的唯一来源

所有动画时长、缓动曲线、缩放与位移数值的 source of truth 是
`apps/desktop/src/renderer/styles/motion-tokens.ts`。三个消费方都从那里取值：

- Tailwind theme（`tailwind.config.js` 中 `transitionDuration / transitionTimingFunction / scale / animationDuration / animationTimingFunction` 的 extend 区段）
- CSS 变量（`globals.css` 中 `--motion-duration-* / --motion-easing-*`）
- 任何内联 JS 动画（直接 `import { MOTION } from "../styles/motion-tokens"`）

修改 token 必须三处一起改；新建组件不允许使用裸毫秒（`duration-200`）或裸缩放值（`scale-95`）。

### 2. 五维 Token 与各自语义

```ts
duration: instant 80ms · quick 120ms · base 180ms · smooth 280ms · slow 420ms
easing:   standard · enter · exit · emphasized · linear
scale:    pressIn 0.95 · enterFrom 0.96 · hoverLift 1.02 · mediaZoom 1.08
translate: xs 2px · sm 4px · md 8px · lg 16px
stagger:  tight 16ms · normal 32ms · loose 60ms
```

各 token 的使用场景在 §3 的"意图分类"中有完整说明。

### 3. 意图分类（每个动画必须能映射到一种意图）

| 意图 | 推荐 token | 形式 |
| --- | --- | --- |
| **微反馈**（按钮按下、checkbox toggle） | `duration.instant + scale.pressIn` | `<Pressable>` 或 `transition-transform duration-instant active:scale-press-in` |
| **状态变色**（hover、selected、focus） | `duration.quick + easing.standard` | `transition-colors duration-quick` |
| **元素入场**（modal、popover、toast、菜单） | `duration.base + easing.enter + scale.enterFrom` | `<Reveal intent="enter">` 或 `animate-in fade-in zoom-in-95 duration-base ease-enter` |
| **元素出场** | `duration.quick + easing.exit` | `<Reveal intent="exit">` 或 `animate-out fade-out duration-quick ease-exit` |
| **页面 / 视图切换** | `duration.base + easing.standard` | `<ViewTransition activeKey>` 或 opacity-driven cross-fade |
| **折叠 / 展开** | `duration.smooth + easing.emphasized` | `<Collapsible>` |
| **强调 / 吸引注意** | `animate-pulse` 或 `animate-ping` | 直接用 Tailwind utility |

### 4. 五个意图驱动组件

`apps/desktop/src/renderer/components/ui/motion/` 提供：

- `<Pressable>`：按钮微反馈包装
- `<Reveal intent="enter" | "exit">`：意图驱动的入场 / 出场
- `<Collapsible open>`：CSS-only `grid-rows` 高度过渡
- `<ViewTransition activeKey>`：cross-fade 视图切换

加载指示器使用 `apps/desktop/src/renderer/components/ui/Spinner.tsx`。不要在业务组件里手写
`border-* border-t-transparent rounded-full animate-spin`；需要加载图标时用 `<Spinner size tone label>`，
让尺寸、颜色、reduced-motion 与可访问性行为保持一致。

新增 modal / popover / dropdown / drawer 等覆盖类组件时，**优先使用这些包装**。如果包装确实不能覆盖（罕见），需要在 PR 描述中说明原因，并把动画细节限制在该组件内。

### 5. 用户偏好与 a11y

- `globals.css` 中必须保持 `@media (prefers-reduced-motion: reduce)` 全局降级到 0.01 ms（OS 级 a11y 默认）。
- `settings.store.motionPreference` 三档（`off / reduced / standard`），同步到 `<html data-motion="...">`：
  - `off`：所有动画 0.01 ms（覆盖 OS 偏好）
  - `reduced`：所有 duration token 缩到约 60%
  - `standard`：覆盖 OS 偏好回到完整动画
- `AppearanceSettings → Motion` 暴露给用户。

### 6. 禁用清单（不允许出现的写法）

- ❌ 裸毫秒：`duration-200` / `duration-150` / 其它裸数字
- ❌ 裸缩放：`scale-95` / `scale-90` 等。统一用 `scale-press-in / scale-enter-from / scale-hover-lift / scale-media-zoom`
- ❌ 在 `globals.css` 新增 `@keyframes`。统一用 `tailwindcss-animate` 提供的 `animate-in / animate-out` 系列，或 `<Reveal>` / `<Collapsible>`
- ❌ 引入 `framer-motion`。本仓库已经卸载它；如果未来需要 layout 动画或 spring，先在 `spec/issues/active/` 立 issue 评估
- ❌ 手写 CSS spinner：`border-2 border-t-transparent rounded-full animate-spin`。统一用 `<Spinner>`
- ❌ 数据敏感场景做"渐变到新值"（数字、状态、success / error 计数）：用瞬切，避免误读
- ❌ 在虚拟化的列表行上加 stagger 入场（`@tanstack/react-virtual` 的 mount/unmount 时机不可控）

### 7. 守护机制

- `spec/knowledge/behavior/desktop.md` 中的"Renderer Motion System"章节固化稳定契约。
- 本架构文档跟随 token 与组件演进而更新。
- PR review checklist 应明确："是否新增了动画？是否使用了意图组件？是否避免了禁用清单中的写法？"

## Stable Scenarios

### Scenario: Adding a new modal

When 新增 modal / popover：

- 用 `<Modal>` 或 `<Reveal intent="enter" variant="fade-zoom">` 包装
- 入场用 `duration.base + easing.enter`，出场用 `duration.quick + easing.exit`
- backdrop 用 `transition-opacity duration-base ease-enter` 进入，`duration-quick ease-exit` 退出

### Scenario: Adding a hover state

When 新增 hover / focus / selected 视觉变化：

- 用 `transition-colors duration-quick`，不用 `duration-instant`（按下用）也不用 `duration-base`（入场用）

### Scenario: Adding a list item entrance

When 列表是**虚拟化**的：

- 不要给单行加 stagger 入场动画
- 列表整体可以用 `<Reveal>` 包裹一次
- 单行至多用 `transition-colors` 处理 hover / selected

When 列表**非虚拟化**且数量稳定 < 50：

- 单行可以加 `animate-in fade-in slide-in-from-left-2 duration-base ease-enter` 配合 `animationDelay: index * MOTION_STAGGER.normal`

### Scenario: Bundle budget step trips on motion-related growth

When CI 的 `Bundle budget` 因 `ui-vendor` 或 motion 相关 chunk 失败：

- 默认假设是真实回归
- 用 `pnpm --filter @prompthub/desktop build:analyze` 找到新进入主入口或意外膨胀的模块
- 不要绕过预算 step（不要 `continue-on-error`）
- 真实优化后的体积下降才是收紧 budget 的合法时机

## Non-goals

- 本文不规定具体的视觉风格（暗黑模式、色板、字体）——那是 design tokens 的另一类。
- 本文不替代特定优化的 change folder——任何具体改动仍走 `spec/changes/active/<change-key>/`。
