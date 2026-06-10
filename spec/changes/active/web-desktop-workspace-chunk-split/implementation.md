# Implementation

## Shipped

- Converted `UpdateDialog`, `CloseDialog`, `DataRecoveryDialog`, and
  `BackupImportConfirmDialog` in `apps/desktop/src/renderer/App.tsx` from static
  imports to React lazy imports.
- Rendered those dialogs only when their corresponding open/preview state is
  active, with local `Suspense fallback={null}` boundaries.
- Kept startup, migration, update-check, and auto-sync services static. A trial
  dynamic-import version reduced little and introduced Vite mixed
  static/dynamic import warnings because those services are also statically
  imported by already-lazy settings/update chunks.
- Moved `services/ai` calls in `MainContent` behind a cached dynamic import so
  prompt AI testing, image generation, and multi-model comparison load the AI
  service only when invoked.
- Kept multi-model comparison loading state immediate before awaiting the lazy
  AI service chunk, so users still receive prompt feedback after clicking the
  compare action.
- Moved generated-image download helper loading behind the download button.
- Moved `skill.store` translation calls to lazy-load `services/ai` only when
  translation is requested, while keeping `ai-defaults` static because it is
  already needed by the visible prompt workspace.
- Replaced remaining hardcoded authenticated workspace loading and generated
  image accessibility text with i18n-backed text, reused the same generated
  image alt text in the AI settings image-test result modal, and marked the
  decorative desktop background image with an empty alt string.

## Verification

- `pnpm --filter @prompthub/desktop typecheck`
  - Result: passed.
- `pnpm --filter @prompthub/web typecheck`
  - Result: passed.
- `pnpm --filter @prompthub/web lint`
  - Result: passed.
- `pnpm --filter @prompthub/web build`
  - Result: passed.
  - `DesktopWorkspace` changed from about `571.44 kB / gzip 156 kB` before this
    pass to `523.16 kB / gzip 142.77 kB`.
  - `services/ai` is now emitted as a separate `ai` chunk of about
    `31.97 kB / gzip 10.42 kB`.
  - No mixed static/dynamic import warnings remain; the only remaining warning
    is Vite's default `>500 kB` chunk-size warning for the authenticated
    workspace.
- `pnpm --filter @prompthub/web exec vitest run src/client/App.test.tsx src/client/pages/DesktopWorkspace.test.tsx --config vitest.config.ts`
  - Result: 2 files passed, 6 tests passed.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/close-dialog.test.tsx tests/unit/components/data-recovery-dialog.test.tsx`
  - Result: 2 files passed, 14 tests passed.
- `git diff --check -- apps/desktop/src/renderer/App.tsx spec/changes/active/web-desktop-workspace-chunk-split`
  - Result: passed.
- `pnpm --filter @prompthub/desktop typecheck`
  - Result: passed after the final i18n/a11y sweep.
- `git diff --check -- apps/desktop/src/renderer/App.tsx apps/desktop/src/renderer/components/layout/MainContent.tsx apps/desktop/src/renderer/i18n/locales/en.json apps/desktop/src/renderer/i18n/locales/zh.json apps/desktop/src/renderer/i18n/locales/zh-TW.json apps/desktop/src/renderer/i18n/locales/ja.json apps/desktop/src/renderer/i18n/locales/fr.json apps/desktop/src/renderer/i18n/locales/de.json apps/desktop/src/renderer/i18n/locales/es.json spec/changes/active/web-desktop-workspace-chunk-split spec/knowledge/behavior/web.md`
  - Result: passed.
- Hardcoded text scan for `App.tsx` and `MainContent.tsx`
  - Result: no remaining `App background`, `Generated AI`, or visible
    `Loading...` matches.
- Follow-up hardcoded text scan for `App.tsx`, `MainContent.tsx`, and
  `AISettings.tsx`
  - Result: no remaining `App background`, `Generated AI`, `Generated`,
    visible `Loading...`, or stale `prompt.generatedImageAlt` matches.
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-settings-legacy.test.tsx tests/integration/components/main-content-inline-edit.integration.test.tsx`
  - Result: 2 files passed, 21 tests passed.

## Synced Docs

- `spec/knowledge/behavior/web.md`
