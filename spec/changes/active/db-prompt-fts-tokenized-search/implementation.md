# Implementation: db-prompt-fts-tokenized-search

## 实际落地
- `packages/db/src/prompt.ts`：新增导出纯函数 `buildFtsPhraseQuery(keyword)`；`search()` 用它构造 FTS5 MATCH 表达式，返回 `null`（全空白/仅引号类关键词）时跳过关键词过滤。
- `packages/db/src/index.ts` 与 `apps/desktop/src/main/database/{index,prompt}.ts`：re-export helper（沿 shim 先例）。
- 无 schema / 迁移 / IPC / shared types 变化。

## 测试与证据
- 新增 `apps/desktop/tests/unit/main/prompt-fts-query.test.ts`（helper 5 用例）。
- `prompt-db.test.ts` search 区新增 5 用例：不相邻多词命中（回归原缺陷）、AND 语义、纯空白=无过滤、单词一致性、10 项操作符/引号对抗 + 表完整性断言。
- 定向 67/67 通过；desktop 全套基线对照零回归（full-final.log vs full-baseline.log 文件集合一致）。

## 偏差与决策
- 原 keyword truthy 才进 FTS 谓词；现 truthy 但无有效 token 时按"无关键词"处理——纯空白字符串行为从"查不到任何数据/报错风险"变为"等同无过滤"，记为行为修正（CHANGELOG 已说明）。
- 短语能力不回归承诺：词内显式引号不再保证整体短语（DESIGN FR-FTS-004 维持）。

## 未覆盖分支
- 无新增未覆盖分支；`search()` 其余分支行为未变。
