# Change Implementation: Homepage Changelog Route Retirement

> 状态：Active
> 更新时间：2026-06-06

## 执行记录

- 2026-06-06：创建 active change，准备处理 changelog route 残留、语言切换挤压和 Hero 单图视觉问题。
- 2026-06-10：复核当前仓库后确认，本 change 记录描述的是 Astro 官网文件边界
  （`apps/web/src/pages/docs/[...slug].astro`、`Hero`、`Navbar.getLanguageLink()`），
  但当前 `apps/web` 为 Hono/React/Vite 自托管应用，仓库中不存在这些 Astro
  官网入口。本轮应用审查不应把该 change 作为已实现内容提交；后续若恢复官网源码或
  将官网纳入本仓库，再按该边界重新落地。

## 验证记录

- `find apps/web -maxdepth 3 -type f`：当前 Web app 暴露的是
  Hono/React/Vite 结构，未发现 `src/pages` Astro 路由目录。
- `rg -n "changelog|Hero|hero|docs/\\[|Navbar|getLanguageLink|smoke" apps/web docs
  spec/changes/active/homepage-changelog-route-retirement`：命中仅为本 change
  记录、README 锚点、Web media/prompts 测试里的普通字符串，以及现有
  `apps/web/scripts/smoke.mts`；未发现 proposal/design 所述官网实现文件。
