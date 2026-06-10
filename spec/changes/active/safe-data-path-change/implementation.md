# Implementation

## Changes

- Added reusable target directory inspection based on PromptHub data markers.
- Reworked data path changes into explicit `migrate`, `switch`, and `overwrite` actions.
- Updated settings UI to warn when the selected target already has data and default users toward switching.
- Replaced the data-path success flow's renderer-only `window.location.reload()` with a dedicated desktop relaunch IPC so `app.setPath("userData", ...)` is actually re-applied on restart.
- Tightened `data:getStatus` so choosing the already-active directory no longer reports a false pending-restart state.
- Extracted data path copy behavior from the desktop main-process entry file into `data-path.ts` so it can be tested without importing Electron startup side effects.
- Data path migration now uses link-safe `lstat` checks and skips root or nested symlink entries instead of dereferencing external files into the target data root. Migration counts now increment only for items that were actually copied.
- Data path inspection now uses the same link-safe boundary for target markers: symlinked `workspace` / `data` / browser-storage directories and symlinked `prompthub.db` files are not reported as existing PromptHub data.
- Target data roots that are themselves symlinks are no longer inspected through, and the preview/apply IPC paths reject them before switching or copying data.

## Verification

- `pnpm --filter @prompthub/desktop test:run tests/unit/main/data-path.test.ts tests/unit/components/data-settings.test.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop test:run` was attempted; it failed under full-suite parallel load with unrelated timeouts in existing slow tests and one permission error writing to the real Application Support path.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-path.test.ts -t "copyDataPathItem" --run`: failed first before the copy helper was exported from `data-path.ts`, then passed after extraction and link-safe handling.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-path.test.ts -t "symlinked.*existing app data|symlinked marker" --run`: failed first because `inspectDataPath()` followed symlinked marker directories and database files, then passed after link-safe inspection.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-path.test.ts -t "data path root|link-safe data path roots" --run`: failed first before `isLinkSafeDataPathRoot()` existed, then passed after root-symlink handling was added.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-path.test.ts --run`: **1 file / 24 tests**, passing.
- `pnpm --filter @prompthub/desktop test -- tests/unit/main/data-path.test.ts tests/unit/components/data-settings.test.tsx --run`: **2 files / 52 tests**, passing.
- `pnpm --filter @prompthub/desktop typecheck`: passing.
- `pnpm --filter @prompthub/desktop lint`: passing.
- `git diff --check` for the touched data-path implementation/test/spec files: clean.
