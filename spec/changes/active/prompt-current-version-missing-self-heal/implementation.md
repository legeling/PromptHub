# Implementation — prompt-current-version-missing-self-heal

## What actually shipped

Root cause（已由用户本机日志定位）: 首次 canonical authority 发布会因某个 prompt 的
`current_version` 在其 `prompt_versions` 中无对应行而在 `validateVersionSet` 抛
"Prompt resource current version is missing"，把失败直接提升为该启动失败（不是捕获、
不是 recovery）。

Shipped:
- New `packages/db/src/prompt-version-consistency.ts`（exported via `packages/db/src/index.ts`）:
  `repairPromptVersionConsistency(database)` 单事务幂等修复器——逐 prompt
  `MAX(version)`；指针陈旧/超前则收敛；无版本行则按 prompts 当前字段补一条 v1
  快照并置 `current_version = 1`；健康 prompt 不触碰。
- `apps/desktop/src/main/services/canonical-storage-startup.ts`：新增
  `healPromptVersionPointers(sourceDatabasePath)`（先检验前 16 字节 SQLite 头
  `"SQLite format 3\0"`，非 SQLite 直接跳过），在 `prepareSourceDatabase?.()`
  之后、`publish(...)` 之前调用；打开后用 `repairPromptVersionConsistency` 修复并
  deterministic `finally close`。
- 未改动 core 校验 / canonical 物化；未新增 schema 文件（复用现有版本表）。

## Verification (actual)

Run from `apps/desktop` and `packages/db`:

- `pnpm exec vitest run tests/unit/main/prompt-version-consistency.test.ts` → 1 file, 4 passed
  (收敛到 max；无版本链补 v1 且字段即 prompts 当前值、置 1；健康数据不动；幂等)。
- `pnpm exec vitest run tests/unit/main/canonical-storage-startup.test.ts tests/unit/main/prompt-version-consistency.test.ts` → 2 files, 15 passed
  （startup 既有用例保持绿：mocks / 非 SQLite fixture 不被触碰、只 SQLite 头触发修复）。
- `pnpm typecheck`（packages/db）→ exit 0。
- `pnpm typecheck`（apps/desktop）→ completed，无 diagnostics（exit 0）。
- `pnpm exec eslint src/main/services/canonical-storage-startup.ts tests/unit/main/prompt-version-consistency.test.ts --max-warnings 0` → exit 0。
- `pnpm build`（desktop）→ exit 0，产出新的 `out/main/index.js`（用户可据此重新启动复测）。

## Known limits / follow-ups

- 全量 `pnpm test:run` 仍受本会话约 2 分钟墙钟超时限制未能一次跑完；本次仅跑相关单测、
  typecheck、lint、build。
- 修复“向前收敛到最大可恢复版本”而非再造“已丢失的那一版内容”：若缺失的正是最新版行
  而其内容已丢失，当前版本会回落到最近完好的历史版本（可用性优先，无损不后退）。
- 用户本机复测步骤：在这种已应用修复的 `out/main` 构建上直接启动，日志不再出现
  "Prompt resource current version is missing" 即可确认。待用户确认后再提交/推送/PR。

## Follow-up in same PR branch (uncommitted, awaiting local confirm)
- `apps/desktop/src/main/services/canonical-storage-startup.ts`
  `relocateTrashedPromptWorkspaceFromCanonicalRoot(dataRoot, activeRoot)`：
  仅当 canonical 根存在 `data/.trash/cache/prompt-workspace`（旧 file-workspace 快照被误放入
  权威根）时，非破坏 rename 到 `<activeRoot>/recovery/canonical-prompt-trash/prompt-workspace-<时间戳>-<pid>`，
  从而让 `verifyInventory` 不再因未声明文件在每次 prompt 写操作（如删除 prompt 123）时抛
  `canonical graph file inventory count mismatch`。
  其它 `.trash` 形态（如 conflicts）不受影响；目标无非 SQLite 探测才跳过）。
- 单测 3 例（relocate no-delete、其余 trash 不动、异常不存在时 no-op）。
验证：`vitest` canonical-storage-startup + prompt-version-consistency → 2 files 18 passed；
desktop `typecheck`、`eslint`、`pnpm build` 全部 exit 0（重建 `out/main/index.js`）。
前版本 current-version fix 章节内注的 “out of scope delete-123 follow-up” 之删除阻塞已在本推进解决，
但仍未 commit，待用户本机确认后可启动+正常删除 prompt-123 后统一提交同一 PR（#214）。

### Front-end deleteTag guard（新增，用户已本地确认；经 CodeRabbit 回合调整）

按产品决策（decision: 前端拦截并在 PR 评论留给维护者后续讨论底层可删除性）：
- `PromptDB.deleteTagIfUnreferenced(tag)`（原子事务）：仅当没有任何 prompt 引用时才允许删除，返回
  `{ deleted, referenced }`；参照数组精确匹配、忽略不可解析行，避免“先查再删”的两步竞态（CodeRabbit #4）。
- `prompt:deleteTag` IPC：先校验 tag 为非空 string、失败以统一错误抛拒；捕获 DB 异常返回结构化
  `{ deleted, referenced }` 或统一错误（CodeRabbit #2）；preload 对 `deleteTag` 声明显式返回类型
  `Promise<{ deleted: boolean; referenced: number }>`（CodeRabbit #3）。
- `TagManagerModal.handleDelete`：prompt 域单次调用 `deleteTag`，若返回 `referenced>0` 则提示并阻止，
  否则（deleted）更新目录/同步；删除不再触发 canonical 写或 `current_version` 二次报错。
- canonical relocate 清理改为 **best-effort**：任何失败（EACCES/EXDEV）仅记录完整错误、不再阻断启动
  （CodeRabbit #1），且快照原样保留。
单测 `prompt-tag-references` 4 passed + relocate 失败路径 case；desktop typecheck/build、eslint exit 0。


## Docs synced

`spec/changes/active/prompt-current-version-missing-self-heal/`: proposal、specs/storage/spec、
design、tasks、implementation。无跨语法 stable knowledge/rules 变更。
