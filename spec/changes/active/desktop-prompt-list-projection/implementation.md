# Implementation

## Product

Desktop

## Status

in progress. Renderer summary/detail migration and its acceptance remain open in tasks.md.

> 本文件随阶段推进实时更新。当前状态：**Stage 1 已完成并本地验证；Stage 2+ 按 tasks.md 推进。**

## Stage 1 — 契约与数据层（已完成）

### 做了什么

- **`packages/shared/types/prompt.ts`**：新增 `PromptSummary` 接口。只含列表/搜索/看板/画廊所需字段，刻意排除大文本字段（`userPrompt`、`userPromptEn`、`systemPrompt`、`systemPromptEn`、`notes`、`lastAiResponse`、`variables`）。
- **`packages/shared/constants/ipc-channels.ts`**：新增 `PROMPT_GET_ALL_META: "prompt:getAllMeta"`。
- **`packages/db/src/prompt.ts`**：
  - 新增 `getAllMeta(): PromptSummary[]`：投影 SQL，只 SELECT 列表列（含 `tags`/`images`/`videos` 供列表展示），**不读取** `user_prompt`、`system_prompt`、`system_prompt_en`、`user_prompt_en`、`notes`、`last_ai_response`、`variables` 列。
  - 新增私有 `rowToPromptSummary()`：把投影行转 `PromptSummary`。
- **`apps/desktop/src/main/ipc/prompt.ipc.ts`**：注册 `PROMPT_GET_ALL_META` handler → `db.getAllMeta()`。
- **`apps/desktop/src/preload/api/prompt.ts`**：暴露 `getAllMeta`。

### 测试（先红后绿）

在 `apps/desktop/tests/unit/main/prompt-db.test.ts` 新增 `getAllMeta` describe（5 个用例）：

1. 与 `getAll` 返回同一集合，按 `updated_at DESC` 排序。
2. 投影字段集正确（title/description/promptType/tags/folderId/images/videos/isFavorite/source/usageCount/currentVersion 等）。
3. **无大字段泄漏**：`JSON.stringify(meta)` 不包含 `userPrompt`/`systemPrompt`/`notes`/`lastAiResponse` 内容。
4. `\x00` 标题不丢数据。
5. 空库返回 `[]`。

首次运行 5 个全红（`getAllMeta is not a function`），实现后转绿。

### 与计划偏差

- **排序测试的时序**：原计划直接两次 `create` 后断言排序，实测同一毫秒内两次创建 `updated_at` 相同导致排序不稳定（违反 AGENTS.md 的"不依赖 Date.now() 排序"规则）。改用 `vi.setSystemTime()` 显式控制时间戳。
- **`isFavorite` 断言**：`PromptDB.create` 的 INSERT 硬编码 `is_favorite = 0`（新建默认非收藏），`CreatePromptDTO` 无 `isFavorite` 字段。投影测试改为 create 后 `db.update(id, { isFavorite: true })` 再断言。
- **外键**：投影测试用到 `folderId: "f1"`，但 `prompts.folder_id` 有 FK 约束，需先在 `folders` 表插入对应行。

### 验证结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/prompt-db.test.ts` | ✅ 62/62 |
| `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/prompt-ipc-idb-migration.test.ts` | ✅ 3/3 |
| `pnpm --filter @prompthub/desktop typecheck` | ✅ |
| `pnpm --filter @prompthub/db typecheck` | ✅ |
| `pnpm --filter @prompthub/shared typecheck` | ✅ |
| `pnpm --filter @prompthub/desktop lint` | ✅ |

### 待办

- Stage 2：store 双轨（`prompts: PromptSummary[]` + `promptDetailCache` + `getPromptDetail(id)` + `usePromptDetail` hook）。
- Stage 3：组件迁移。
- Stage 4：web 端列裁剪。
- Stage 5：收尾验证 + 传输量对比 + 文档同步 + 归档。

## Verification

- 每阶段完成时记录：lint / typecheck / unit / integration / build / bundle:budget 的实际结果。

## Synced Docs

- 完成后同步：
  - `spec/knowledge/structure/desktop-frontend-performance.md`：补充"列表主路径用列表投影、大文本按需加载"稳定规则。
  - `spec/knowledge/behavior/desktop.md`：补充 `prompt:getAllMeta` 契约与 store 双轨行为。
