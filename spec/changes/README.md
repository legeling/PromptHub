# 计划与变更记录

按 [文档规则](../rules/document-routing-rules.md) 决定是否需要计划；现有主题优先原位维护。这里不再要求每个非平凡改动新建五份文件。

- [工作与历史索引](index.md)：自动生成；记录状态不代表实际发布或验收通过。
- [可选模板](_templates/README.md)：仅在需要新主题或跨会话计划时取用。
- `active/`：尚在推进的计划和既有变更主题，沿用原路径与已被引用的 ID。
- `archive/`、`legacy/`：历史证据，不是当前执行约定；现行功能从 [主题入口](../README.md) 查找。
- `completed/`：兼容入口，非第二份归档存储。

索引读取 `plan.md`、`tasks.md`、旧 `implementation.md` 的首个 Status；没有状态时标记 active，不要求补文件。completed/shipped/superseded 记录从活动列表移出，保留原路径供追溯。新增、移动或修改记录状态后运行 `pnpm spec:index`，检查运行 `pnpm spec:test`。显式启用追踪的旧 change 保留其 ID 校验，新工作不要求 ID。
