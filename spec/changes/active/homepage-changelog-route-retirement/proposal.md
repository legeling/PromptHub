# Change Proposal: Homepage Changelog Route Retirement

> 状态：Active
> 更新时间：2026-06-06

## 背景

官网更新日志已经从首页导航和 CTA 中移除，但文档动态路由仍会把 `/docs/changelog` 渲染成公开文档页，导航语言切换也保留了 changelog 专门路径。该残留入口会让更新日志继续表现为官网常规路由，并在窄宽度下挤压多语言入口。

Hero 区域已经收敛为单张产品截图数据，但视觉上仍有额外发光层和厚预览壳，和主项目官网单张产品图的表达不一致。

## 范围

- 将 `/docs/changelog` 与 `/docs/en/changelog` 从公开文档页改为返回文档首页。
- 删除导航语言切换中的 changelog 特殊路径逻辑。
- 将首页 Hero 视觉收敛为单张产品图预览，不保留额外发光预览层。
- 增加 web smoke 回归，确认 changelog route 不再渲染公开页面，Hero 仍只有一张产品图。

## 非目标

- 不删除 changelog 内容文件，发版同步脚本仍可读取。
- 不触碰或清理本机 `5173` 端口进程。
- 不处理后台、后端商业化门禁。
