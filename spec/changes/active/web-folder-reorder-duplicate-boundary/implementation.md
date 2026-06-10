# Implementation

## Shipped

- Added a service-level duplicate-id guard in `FolderService.reorder()`.
- Added a web route regression test proving duplicate ids return `422 VALIDATION_ERROR` and the existing private folder order remains unchanged.
- Added a route-level payload-size guard for `PUT /api/folders/reorder`: at
  most 500 ids and at most 200 characters per id.
- Added a web route regression proving oversized reorder payloads return
  `422 VALIDATION_ERROR` before folder rows are loaded.

## Verification

- `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "duplicate folder ids"` failed before the fix with `expected 200 to be 422`.
- `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "oversized folder reorder payloads"` failed before the follow-up fix with `expected 404 to be 422`.
- `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "duplicate folder ids"`
- `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts -t "oversized folder reorder payloads"`
- `pnpm --filter @prompthub/web test -- --run src/routes/folders.test.ts`

## Synced Docs

- Active change only; no stable behavior docs are expected for this narrow validation fix.

## Follow-ups

- None.
