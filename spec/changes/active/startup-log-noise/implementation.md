# Implementation

## Shipped

- Added a startup DevTools policy that keeps DevTools closed by default in dev and opens it only when `PROMPTHUB_OPEN_DEVTOOLS=1` or `ELECTRON_OPEN_DEVTOOLS=1` is set.
- Updated desktop startup to use that policy, which avoids Chromium DevTools internal console noise during normal dev startup.
- Changed stale SQLite lock cleanup to log only when a lock directory actually existed and was removed.
- Changed pre-migration backup behavior so current databases are not backed up on every startup. Legacy/non-current databases still get a backup before migration.
- Suppressed Browserslist stale-data warnings in the desktop Vite configs.
- Removed renderer AI test debug logs from `apps/desktop/src/renderer/components/layout/MainContent.tsx` so prompt image generation, stream/thinking flags, and chat parameter objects are not printed during normal user workflows.
- Gated normal renderer startup and auto-sync progress logs in `apps/desktop/src/renderer/App.tsx` behind the existing `debugMode` setting. Startup/sync failures remain visible through `console.error`.
- Removed normal-flow logs from `apps/desktop/src/renderer/services/ai.ts` that exposed streamed text, Gemini image response payloads, generated image URLs, base64 image data, and raw provider responses. Gemini parsing failure logs now keep concise markers without console payload dumps.
- Removed success-only logs from legacy IndexedDB helpers in `apps/desktop/src/renderer/services/database.ts` for version-change cleanup, database reset, image clear, and video clear flows. Failure warnings/errors remain visible.
- Silenced expected pointer-capture fallback logs in `apps/desktop/src/renderer/components/ui/ColumnResizer.tsx` while preserving drag behavior when `setPointerCapture` or `releasePointerCapture` is unavailable or throws.
- Hardened `apps/desktop/src/renderer/services/skills-sh-store.ts` so `skills.sh` index/detail parsers treat missing remote HTML as empty input instead of throwing `TypeError: Cannot read properties of undefined (reading 'replace')` and relying on upper-layer catch logging.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/database-migration-locks.test.ts tests/unit/main/devtools-policy.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop build`
- `git diff --check -- packages/db/src/init.ts apps/desktop/src/main/index.ts apps/desktop/vite.config.ts apps/desktop/vite.web.config.ts apps/desktop/tests/unit/main/database-migration-locks.test.ts apps/desktop/tests/unit/main/devtools-policy.test.ts spec/changes/active/startup-log-noise`
- `rg -n "console\\.log\\(|AI Test - Stream|Image Prompt\\. Using model|Stream UI" apps/desktop/src/renderer/components/layout/MainContent.tsx`
- `rg -n "console\\.log\\(|sync completed|Will sync|App initialized|Retrying database initialization|Migrated legacy IndexedDB" apps/desktop/src/renderer/App.tsx`（only the debug-gated helper calls remain）
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/ai.test.ts --run -t "Gemini routing"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/ai.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/ai-transport.test.ts --run`
- `rg -n "console\\.log\\(|AI Stream|Starting stream response|Stream mode|Response received|Found URL|Found base64|Full response" apps/desktop/src/renderer/services/ai.ts apps/desktop/tests/unit/services/ai.test.ts`
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/database.test.ts --run`
- `rg -n "console\\.log\\(" apps/desktop/src/renderer/services/database.ts apps/desktop/tests/unit/services/database.test.ts`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/column-resizer.test.tsx --run`
- `rg -n "console\\.(warn|debug|log)\\(|ColumnResizer:" apps/desktop/src/renderer/components/ui/ColumnResizer.tsx`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/services/skills-sh-store.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`

## Notes

- The Vite CJS Node API deprecation warning can still appear in Vitest output. It is a separate tooling migration issue and was not part of the Electron startup noise shown in the user report.
