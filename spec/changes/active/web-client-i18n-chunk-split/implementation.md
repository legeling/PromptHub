# Implementation

## Shipped

- Changed `apps/web/src/client/i18n.ts` from static locale JSON imports to
  dynamic per-language loaders that merge desktop renderer locale files with
  web-specific locale additions.
- Added `i18nReady` and made `apps/web/src/client/main.tsx` wait for it before
  mounting React, matching the async i18n model used by the desktop renderer.
- Kept English preloaded as the fallback resource when the initial language is
  not English.
- Updated web i18n and main bootstrap tests for the async initialization
  contract.
- Lazy-loaded `DesktopWorkspacePage` in `apps/web/src/client/App.tsx` so the
  setup/login/auth shell no longer eagerly imports the embedded desktop
  workspace.
- Normalized regional language values in the exported web `changeLanguage()`
  helper so calls such as `zh-CN` and `zh-HK` resolve to the same supported
  language buckets used during initial bootstrap.
- Updated the `@desktop-renderer-i18n` ambient declaration to include
  `i18nReady`.
- Updated the Docker runtime dependency integration test so local environments
  without DNS access to `registry.npmjs.org` finish quickly with an explicit
  warning, while CI and network-capable runs still perform the runner-style
  production install and dependency resolution check. The pnpm install step now
  disables long fetch retries to avoid slow sandbox failures.

## Verification

- `pnpm --filter @prompthub/web exec vitest run src/client/i18n.test.ts src/client/main.test.tsx src/client/App.test.tsx src/client/pages/DesktopWorkspace.test.tsx --config vitest.config.ts`
  - Result: 4 files passed, 13 tests passed.
- `pnpm --filter @prompthub/web typecheck`
  - Result: passed.
- `pnpm --filter @prompthub/web lint`
  - Result: passed.
- `pnpm --filter @prompthub/web build`
  - Result: passed.
  - The previous Vite warnings about desktop locale JSON being both dynamic and static imports are gone.
  - Observed web client main entry changed from about `1,813.32 kB / gzip 543.16 kB` before this pass, to about `819.59 kB / gzip 235.86 kB` after dynamic locales, then to about `247.42 kB / gzip 78.94 kB` after lazy-loading `DesktopWorkspacePage`.
- `pnpm --filter @prompthub/web test`
  - Before the Docker runtime dependency test hardening, result was 45 files
    passed and 317 tests passed; the only failing file was
    `tests/integration/docker-runtime-deps.integration.test.ts` because its
    internal fresh `pnpm install --prod --frozen-lockfile --ignore-scripts`
    needed npm registry DNS in the sandbox.
  - After the test hardening, result: 46 files passed, 319 tests passed.
- `pnpm --filter @prompthub/web exec vitest run tests/integration/docker-runtime-deps.integration.test.ts --config vitest.config.ts` with network access
  - Result: passed, confirming the full-suite failure is sandbox DNS, not a runtime dependency contract regression.
- `pnpm --filter @prompthub/web exec vitest run tests/integration/docker-runtime-deps.integration.test.ts --config vitest.config.ts` in the local sandbox
  - Result: passed in about 0.35s; the test printed an explicit warning and
    returned early because `registry.npmjs.org` was not resolvable.

## Synced Docs

- `spec/knowledge/behavior/web.md`

## Follow-ups

- The authenticated desktop workspace chunk and `SkillFileEditor` chunk remain
  above Vite's default 500 kB raw warning threshold. They are now out of the
  setup/login initial shell, but can be optimized in a separate authenticated
  workspace splitting pass.
