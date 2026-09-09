# PromptHub 内部文档

从相关主题进入，读取本次需要的约定。文档投入和唯一真源规则见 [文档规则](rules/document-routing-rules.md)。

| 要找的内容 | 入口 |
| --- | --- |
| 产品边界、术语 | [Context](knowledge/context/README.md) |
| 模块、架构、数据所有权 | [Structure](knowledge/structure/README.md) |
| 功能需求、行为与状态流 | [Behavior](knowledge/behavior/README.md) |
| 协议、平台、schema、回归资产 | [Reference](knowledge/reference/README.md) |
| 工程、存储、测试、提交约束 | [规则](rules/README.md) |
| 验证命令与 fixtures | [验证](workflow/04-verification/README.md) |
| 进行中的工作及历史 | [计划与变更](changes/README.md) |
| 未解决问题与交付状态 | [Issues](issues/README.md) |
| 已发布版本 | [Releases](releases/README.md) |
| 重大设计取舍 | [ADR](adr/README.md) |

项目级背景、需求、架构入口继续保留在 `workflow/00-intake`、`01-requirements`、`02-design`；不要求每个功能更新整个 workflow。当前业务主题优先原位更新，计划只引用需求并记录执行状态。

历史 change 和旧流程仅用于追溯，不能覆盖当前规则。大量归档无需默认加载或重写；普通编辑历史由 Git 保存。现行规则与历史的边界见 [文档规则](rules/document-routing-rules.md)。对外文档见 [docs](../docs/README.md)。
