# Proposal: Prompt 搜索多词语义修复（短语匹配 → 分词 AND）

## Change Key
`db-prompt-fts-tokenized-search`（v0.6.2 / P1，功能类）

## Why
`packages/db/src/prompt.ts` `search()` 将用户关键词整体包进双引号交给 FTS5 `MATCH`，语义是精确短语：搜索「提示词 管理」时，若两词在正文中不相邻则 0 命中。与用户对多词搜索的直觉（每个词都应参与匹配）不符，属于既存的搜索结果漏报缺陷。上游已用双引号包裹解决了特殊字符报错（quality 记录中的转义），但引入了短语化副作用。

## Scope
- 仅改 `packages/db/src/prompt.ts` 的 keyword→FTS 查询串构造（抽纯函数 helper）。
- 不改 schema、不改 `SearchQuery` 类型、不改 IPC 契约、不改调用方。

## Non-goals
- 不做相关度排序调整、不做模糊/前缀搜索、不改 tags/filters 其余分支。

## Risks & Rollback
- 风险：多结果集扩张（更宽召回）。可解释、符合预期方向；对依赖"整体短语精确匹配"的用户行为是变化，故在 CHANGELOG 明确说明。
- 回滚：单文件还原 + 删除 helper 测试即可，无数据迁移。

## Traceability
FR-FTS-001..004 → DES-FTS-001 → TEST-FTS-001..005
