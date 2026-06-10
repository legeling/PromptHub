# Change Design: Homepage Changelog Route Retirement

> 状态：Active
> 更新时间：2026-06-06

## 方案

- `Navbar.getLanguageLink()` 只保留通用 docs 语言切换规则，不再认识 changelog 作为特殊公开路由。
- `apps/web/src/pages/docs/[...slug].astro` 在读取内容前识别 changelog slug，并重定向到对应语言的 introduction。
- 保留 `apps/web/src/content/docs/changelog.md`，避免影响 release sync。
- `Hero` 保持单个 `dict.screenshot` 输入，移除额外发光层和厚预览壳，渲染一个截图 `<img>`。

## 验证

- `apps/web/tests/smoke.test.mjs` 覆盖首页 header、Hero 图片数量、旧 hero 多图资源、changelog 文档 route 重定向。
- 本地预览只使用 web `3103`，不停止或清理 `5173`。
