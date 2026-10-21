# PromptHub 当前文档

日常先选产品，再读相关模块；待办只看 [Active](changes/index.md#active)。历史仅在追溯决定、迁移或验证证据时打开。维护规则见 [文档规则](rules/document-routing-rules.md)。

## 按产品进入

| 产品 | 当前需求与设计 | 活动工作 |
| --- | --- | --- |
| Shared：Core / DB / Shared | [存储架构](knowledge/structure/storage-architecture.md)、[公共资源管理](knowledge/structure/resource-library-architecture.md)、[共享模块](knowledge/behavior/README.md#共享模块) | [Shared](changes/index.md#shared) |
| Desktop | [桌面行为与集成](knowledge/behavior/desktop.md)、[前端架构](knowledge/structure/code-structure-guidelines.md)、[动画](knowledge/structure/desktop-frontend-animation.md) | [Desktop](changes/index.md#desktop) |
| CLI | [独立 CLI 与安装集成](knowledge/behavior/cli.md)、[Agent 命令](knowledge/behavior/cli-agent-management.md) | [CLI](changes/index.md#cli) |
| Web | [自托管 Web](knowledge/behavior/web.md)、[部署说明](../docs/web-self-hosted.md) | [Web](changes/index.md#web) |
| Cloudflare | [Worker 运行时与验收](knowledge/behavior/cloudflare.md)、[部署说明](../docs/cloudflare-workers.md) | [Cloudflare](changes/index.md#cloudflare) |
| Mobile | [移动应用](knowledge/behavior/mobile.md) | [Mobile](changes/index.md#mobile) |
| Delivery | [工程规则](rules/README.md)、[验证入口](workflow/04-verification/README.md)、[发布状态](releases/README.md) | [Delivery](changes/index.md#delivery) |

跨产品共用同一业务合同；产品入口只写该产品的界面、运行时和验收差异。没有独立计划的产品仍可能参与 Shared 工作。

## 按模块和工程问题进入

- [产品背景与术语](knowledge/context/README.md)、[架构设计](knowledge/structure/README.md)、[平台与协议参考](knowledge/reference/README.md)。
- [当前问题与交付差距](issues/README.md)、[验证命令和 fixtures](workflow/04-verification/README.md)。
- [重大设计决策](adr/README.md)；已经被替代的决定不能覆盖现行主题。
- 项目级 workflow 保留为背景入口，普通功能不要求逐阶段登记。

## 完成与历史

- [Completed](changes/index.md#completed)：已完成或被替代的 change，已移出 active，正文链接现行权威主题。
- [旧变更归档](changes/index.md#archived)、[Legacy](changes/index.md#legacy)：按需展开。
- [规则与设计历史](archive/README.md)：已废弃的方案及完成的流程迁移记录。

对外入口见 [docs](../docs/README.md)；文档整理与待核对事项见 [治理记录](issues/active/ISS-20260710-001-spec-governance-debt.md)。
