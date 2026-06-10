# Implementation

## Shipped

- Wrapped `BackupService.import` database mutation work in a SQLite
  transaction.
- Kept existing preflight validation before the transaction.
- Kept prompt and skill workspace sync after the transaction so filesystem
  workspace output is generated only from committed DB state.
- Added `validatePulledSyncMedia` so imported media names and base64 payloads
  are checked before database import without writing files.
- Moved route-level pulled media writes until after successful import for both
  JSON and zip import paths.
- Added a route regression that mocks a later rule import failure after folders
  and prompts have been inserted, then verifies subsequent export contains no
  partially imported folders, prompts, or rules and that `atomic-image.png` is
  absent from the user's media workspace.
- Added `writeFileAtomicSync()` for synchronous same-directory temporary writes
  followed by rename.
- Switched pulled sync media writes to `writeFileAtomicSync()` so interrupted
  writes do not create a visible partial final media file.
- Made `writePulledSyncMedia()` return a rollback function that restores
  overwritten files and removes newly written files for failed imports.
- Reordered direct sync import, WebDAV pull import, and JSON/ZIP import routes
  so pulled media is written after all validation and before database/rule
  import; if media writing fails, import records are never written, and if a
  later import step fails, pulled media is rolled back.

## Verification

- Failure-first check before implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "rolls back database"`
  - Failed because the simulated rule import failure left `atomic-prompt`
    visible in export.
  - `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts -t "partial files"`
  - Failed because an interrupted pulled media write left the final
    `remote-image.png` file present.
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "pulled media writing fails"`
  - Failed because `PUT /api/sync/data` returned `422` but the next sync export
    still contained `remote-prompt-1`; after an initial fix it also revealed
    rule workspace records were still visible.
- Passing checks after implementation:
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "rolls back database"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "unsafe imported rule paths"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "envelopes"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/settings.test.ts src/services/settings.service.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts -t "partial files"`
  - `pnpm --filter @prompthub/web test -- --run src/services/sync-media.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "media"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts -t "pulled media writing fails|direct sync import fails during later writes"`
  - `pnpm --filter @prompthub/web test -- --run src/routes/sync.test.ts`
  - `pnpm --filter @prompthub/web test -- --run src/routes/import-export.test.ts -t "media|rollback|envelopes|unsafe imported rule paths"`
  - `pnpm --filter @prompthub/web typecheck`
  - `pnpm --filter @prompthub/web lint`

## Synced Docs

- Active proposal, design, delta spec, tasks, and implementation records cover
  this import atomicity and media side-effect ordering change.
- Synced the pulled sync media partial-file guarantee into
  `spec/knowledge/behavior/web.md`.
- Synced the sync import media/record consistency guarantee into
  `spec/knowledge/behavior/web.md`.

## Follow-ups

- Import route JSON and zip branches now share the same validation-before-write
  media ordering.
- The broader WebDAV pull/push flow should still be audited separately for
  remote manifest and multi-file failure handling.
