# Implementation

## Shipped

- Added a route regression proving `/api/prompts/meta/tags/rename` accepted an
  oversized `newTag` and wrote it into existing prompt metadata.
- Updated prompt tag rename/delete request schemas to reuse
  `promptMetadataTagSchema`, aligning tag management payloads with prompt
  create/update metadata bounds.
- Rejected oversized delete payloads before service mutation and verified
  rejected payloads leave prompt tags unchanged.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "oversized prompt tag mutations"`
  - Failed because oversized rename returned `200`.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "oversized prompt tag mutations"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts -t "scopes tag listing"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/prompts.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/prompts.ts apps/web/src/routes/prompts.test.ts spec/changes/active/web-prompt-tag-mutation-boundary`

## Follow-ups

- Prompt list filtering still happens in memory for valid queries; SQL-level
  filtering/pagination remains a separate performance task.
