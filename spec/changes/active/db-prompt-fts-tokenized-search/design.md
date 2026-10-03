# Design: FTS 分词查询构造

## 模块
`packages/db/src/prompt.ts`（新增导出纯函数 `buildFtsPhraseQuery(keyword: string): string | null`，供 `search()` 使用）。

## DES-FTS-001 查询构造算法
1. `trim()` 后按 `/\s+/` 切分，`filter(Boolean)` 去空段。
2. 无任何有效词 → 返回 `null`，`search()` 跳过 FTS 谓词（保持现语义：不追加过滤）。
3. 每词 → `'"' + word.replace(/"/g, '""') + '"'`（沿用旧转义）。
4. 词间以 `" AND "` 连接。

## 数据与契约
- 无 schema/迁移/IPC/shared types 变化。
- 兼容：旧调用方（桌面 search IPC、CLI 搜索）透传字符串，行为只扩大召回。

## 验证（TEST-FTS-*）
- TEST-FTS-001 helper 单测：多词/单词/引号/混合空格/全空白/控制字符。
- TEST-FTS-002 真 SQLite：不相邻双词命中（回归本缺陷，先失败后通过）。
- TEST-FTS-003 真 SQLite：单词结果集与实现前一致。
- TEST-FTS-004 对抗：`'test"OR"hack'`、`'a AND b'`、`'"'`、`'OR'` 不抛错且表完好（扩展现有 escapes 用例）。
- TEST-FTS-005 边界：keyword 仅空白 → 返回全部（无 keyword 语义）。
- 载体：`apps/desktop/tests/unit/main/prompt-db.test.ts` search 区块 + packages/db 侧 helper 测试（若 db 包无独立测试目录则就近放 desktop main 测试，实现时按现有布局决定并记录）。
