# Cloudflare Worker

产品：Cloudflare（`apps/web-cloudflare`），与 [自托管 Web](web.md) 分别维护运行环境和部署验收。公共说明见 [Cloudflare 部署](../../../docs/cloudflare-workers.md)。

## Runtime and packaging

- `apps/web-cloudflare` 是独立于 `apps/web` 的 Cloudflare Workers 自部署实现，但它仍必须作为 monorepo 内可重复安装、可重复 typecheck、可重复 lint、可重复测试的 workspace package 存在。
- Cloudflare worker 若通过 `wrangler` 生成运行时类型，应优先使用生成的 `worker-configuration.d.ts`，避免长期维护与真实平台 API 漂移的手写声明。
- Cloudflare worker 的辅助脚本只能调用仓库内真实存在的构建命令；公开同步脚本不得依赖失效命令名。
- Cloudflare worker 的 500 响应不得向客户端透传内部异常 message；详细异常仅记录在服务端日志。


## Shared contracts

资源管理和不提供 Agent 分发的边界引用 [公共资源架构](../structure/resource-library-architecture.md)。验证码开关复用 [Web Auth Captcha Configuration](web.md#61-web-auth-captcha-configuration)，不复制第二套请求合同。D1/R2 等绑定不采用桌面本地目录布局；部署和迁移必须按 Worker 自身入口验收。

## Verification

When a contributor changes `apps/web-cloudflare` runtime bindings, scripts, or shared package imports:

- they keep the package installable from the monorepo root
- they rerun Cloudflare type generation after wrangler binding changes
- they verify `typecheck`, `lint`, `test`, and `build:web:cf`


活动工作见 [Cloudflare 分类](../../changes/index.md#cloudflare)；跨端功能见 [Shared](../../changes/index.md#shared)。
