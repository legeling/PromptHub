# Tasks: db-prompt-fts-tokenized-search

- [x] T1 写失败回归：prompt-db.test 新增不相邻多词命中用例（TEST-FTS-002）
- [x] T2 实现 `buildFtsPhraseQuery` + helper 单测（TEST-FTS-001/004/005）
- [x] T3 `search()` 接入 helper；跑 packages/db / desktop main 相关全量测试
- [x] T4 单词结果一致性回归（TEST-FTS-003）
- [x] Verify `vitest run tests/unit/main/prompt-fts-query.test.ts tests/unit/main/prompt-db.test.ts` → 67/67；全套基线对照零回归
