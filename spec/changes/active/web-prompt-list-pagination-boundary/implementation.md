# Implementation

## Shipped

- Added `PromptListResult` to the Web prompt service.
- Updated `PromptService.list()` to return `{ items, total }`, where `total` is
  computed after filtering/sorting and before slicing.
- Updated `GET /api/prompts` to keep the same paginated response shape while
  using the filtered total for `pagination.total`.
- Added a route regression covering three matching prompts with `limit=2`.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "filtered prompt totals"`
  - Failed because `pagination.total` returned `2` for three matching prompts
    when `limit=2`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "filtered prompt totals"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/prompts.ts apps/web/src/services/prompt.service.ts apps/web/src/routes/prompts.test.ts spec/changes/active/web-prompt-list-pagination-boundary`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web prompt pagination response contract. No stable docs were
  synced because this corrects the existing API field semantics.

## Follow-ups

- Prompt list filtering still happens in memory; SQL-level filtering/pagination
  remains a future performance optimization.
