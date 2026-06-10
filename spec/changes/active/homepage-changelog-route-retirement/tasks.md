# Change Tasks: Homepage Changelog Route Retirement

> 状态：Paused
> 更新时间：2026-06-10

暂停原因：2026-06-10 复核当前仓库后确认，本 change 记录描述的 Astro 官网
入口（`apps/web/src/pages/docs/[...slug].astro`、`Hero`、
`Navbar.getLanguageLink()`）不在当前 Hono/React/Vite 自托管 Web app 中。
后续若官网源码恢复或纳入本仓库，再重新激活并执行以下任务。

- [x] 创建 active change 记录。
- [ ] 移除 changelog 公开 docs route 渲染。
- [ ] 清理导航语言切换的 changelog 特殊逻辑。
- [ ] 收敛 Hero 视觉为单张产品图。
- [ ] 增加并运行 web smoke 验证。
- [ ] 归档 change 并提交独立模块。
