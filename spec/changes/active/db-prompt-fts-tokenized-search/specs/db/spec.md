# Spec Delta: Prompt DB 搜索（db 域）

## 修改的需求

### FR-FTS-001 多词 AND 匹配
`PromptDB.search({ keyword })` 在关键词含空白分隔的多词时，每个词独立转义为短语并以 `AND` 组合；两词在文档中不相邻也必须命中同时包含它们的记录。

#### Scenario
- Given FTS 索引内某条 prompt 标题含「提示词」、正文含「管理」，两词不相邻
- When `search({ keyword: "提示词 管理" })`
- Then 该条 prompt 在结果中（当前实现返回空 → 失败）

### FR-FTS-002 单词行为不变
单词关键词的命中集合与旧实现逐条一致。

### FR-FTS-003 特殊字符防线保留
- 每个词的 `"` 仍按 `""` 转义；`test"OR"hack`、`AND`、`NEAR`、`*`、`^`、括号等不得引发 SQL 错误。
- 仅由空白/控制字符组成的关键词不进入 FTS 谓词（不查询 MATCH，行为等同无 keyword）。

### FR-FTS-004 引号内短语能力保留
用户对单个词加显式双引号（`"foo bar"  baz`类输入）不做额外保护承诺；分词后每段独立转义即可，不新增短语语法糖。
