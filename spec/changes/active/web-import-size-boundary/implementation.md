# Implementation

## Shipped

- Added `MAX_IMPORT_REQUEST_BYTES` with a 50 MiB route-level request limit.
- Added `rejectOversizedImportRequest()` to validate `Content-Length` before
  any import body parsing.
- Added a route regression proving an oversized declared import is rejected and
  leaves exported records empty.

## Verification

- Failure-first check:
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "oversized content-length"`
  - Failed because a request declaring a 51 MiB `Content-Length` still returned
    `201` and imported the payload.
- Passing checks:
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "oversized content-length"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`
  - `git diff --check -- apps/web/src/routes/import-export.ts apps/web/src/routes/import-export.test.ts spec/changes/active/web-import-size-boundary`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this narrow Web import size boundary. No stable docs were synced because the
  broader import/export contract remains unchanged.

## Follow-ups

- Chunked or otherwise unknown-length request limits still need server or
  middleware-level enforcement.
