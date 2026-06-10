# Implementation

## Shipped

- Added a service-level regression test proving `FolderService.list()` must not
  issue per-folder detail queries after the visible list query.
- Changed `FolderService.list()` to query complete visible folder rows directly
  and map them to the existing Web folder payload shape in one read path.
- Kept `GET /api/folders` contract, sorting, and permission semantics unchanged.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/services/folder.service.test.ts -t "lists visible folders without per-folder detail queries"`
  - Failed before implementation because listing two visible folders called
    `prepare()` five times.
- `pnpm --filter @prompthub/web test -- --run src/services/folder.service.test.ts -t "lists visible folders without per-folder detail queries"`
- `pnpm --filter @prompthub/web test -- --run src/services/folder.service.test.ts`
- `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts`
- `pnpm --filter @prompthub/web typecheck`
- `pnpm --filter @prompthub/web lint`
- `git diff --check -- apps/web/src/services/folder.service.ts apps/web/src/services/folder.service.test.ts spec/changes/active/web-folder-list-query-efficiency`

## Synced Docs

- No stable docs required updates because this change preserves the public Web
  API contract, SQLite schema, filesystem layout, and durable folder semantics.
  The active delta spec records the query-efficiency boundary.

## Follow-ups

- Consider pagination or explicit result limits for `GET /api/folders` only if
  large self-hosted folder trees become common; this change only removes the
  current N+1 read pattern.
