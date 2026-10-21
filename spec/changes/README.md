# 计划与变更记录

默认只看 [按产品分类的活动工作](index.md#active)。稳定需求从 [产品与模块入口](../README.md) 进入；计划只记录动作、进度和验收，不复制需求。

| 位置 | 含义 |
| --- | --- |
| [active](index.md#active) | 未完成工作，按 Shared / Desktop / CLI / Web / Cloudflare / Mobile / Delivery 分组 |
| [completed](index.md#completed) | 完成或被替代的记录；保留证据，链接现行权威主题 |
| [archive](index.md#archived) / [legacy](index.md#legacy) | 较早历史；默认不展开、不作为现行要求 |

## 状态与分类

索引依次从 `plan.md`、`tasks.md`、`implementation.md` 读取首个 `## Status` 和 `## Product` 后的第一行。状态行先写规范状态，不把 Phase 放在该行。分类取值与生命周期由 [文档规则](../rules/document-routing-rules.md) 唯一维护。

未完成时写明剩余实现、验收或外部条件。完成时同时改状态为 `completed`、移动整个目录到 `completed/<change-key>/`、合并有效设计并更新引用。索引检查拒绝 active 中的终态和 completed 中的非终态；记录状态不等于新验证或已发布。

新增、移动或更新状态/产品后执行 `pnpm spec:index` 和 `pnpm spec:test`。已有追踪 ID 原样保留；[模板](_templates/README.md) 仅按需要使用，不强制创建五份文档。
