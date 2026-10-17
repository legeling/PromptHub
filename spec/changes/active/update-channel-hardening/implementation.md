# Implementation

## Shipped

- Refactored `apps/desktop/src/main/updater.ts` to remove the broken `preview.yml` path.
- Stable checks still use the GitHub provider, while preview checks now resolve the latest prerelease tag and read the real `latest*.yml` manifest from that release via a generic feed URL.
- Added explicit downgrade filtering before surfacing `update-available`, so remote versions `<= currentVersion` are emitted as `not-available` instead of appearing as installable updates.
- Added shared semver-aware version helpers in `apps/desktop/src/utils/version.ts` so prerelease comparisons like `0.5.6-beta.1 < 0.5.6` are handled correctly.
- Extended `apps/desktop/src/renderer/stores/settings.store.ts` with `updateChannelExplicitlySet` and `inferUpdateChannel(version)` so prerelease app versions can default to preview until the user explicitly opts out.
- Stabilized renderer update state in `apps/desktop/src/renderer/App.tsx` and `apps/desktop/src/renderer/components/UpdateDialog.tsx` so background `checking` events no longer override visible `available` / `downloaded` states and cause UI flicker.
- Added regression coverage for downgrade filtering and dialog-state stability in `apps/desktop/tests/unit/main/updater.test.ts` and `apps/desktop/tests/unit/components/update-dialog.test.tsx`.
- Updated release policy and public docs so `0.5.5-beta.1` is documented as a historical beta reissue that restores a machine-readable prerelease marker without replacing `0.5.5` as the current stable release.
- Replaced the shared version-helper imports in `src/main/updater.ts` and `src/renderer/stores/settings.store.ts` with relative paths after CI showed that the main-process Vite sub-build did not resolve the top-level `@` alias consistently.
- Tightened the preview-only contract for `0.5.5-beta.3`: preview checks no longer treat stable releases as fallback candidates, user-facing locale copy now explains that returning to stable requires turning the preview channel off, and additional regression coverage was added for prerelease feed selection plus beta/stable SemVer ordering.
- Tightened `apps/desktop/src/renderer/components/UpdateDialog.tsx` so the update UI now reuses the shared `Modal` shell, keeps release notes inside a bounded scroll area, shortens the `available` state copy to version-focused guidance, and reserves installation acknowledgement UI for the `downloaded` state.
- Removed the misleading in-app install backup gate from Homebrew-managed `available` / `downloaded` flows and kept those paths focused on Homebrew / Releases guidance instead.
- Extended `apps/desktop/tests/unit/components/update-dialog.test.tsx` to lock in the lighter download-stage backup copy and the Homebrew-specific available-update behavior.
- Direct macOS installations now use `electron-updater.downloadUpdate()` and
  `quitAndInstall(false, true)` after the existing pre-upgrade snapshot. The
  released ZIP, rather than a manually opened DMG, is the update payload.
- Homebrew remains excluded from the in-app download and install paths.
- The downloaded-update dialog now presents direct macOS installation as a
  restart action, with no manual DMG guidance or redundant Downloads action.
- Added regression coverage for direct macOS native download/install behavior
  and for the corresponding dialog action while preserving Homebrew coverage.
- `TEST-UPDATER-005`: main-process updater coverage verifies native macOS
  download/restart behavior and the Homebrew ownership boundary.
- `TEST-UPDATER-006`: renderer coverage verifies the direct macOS install
  action without manual DMG or Downloads guidance.
- Removed three development-only runtime timers that injected conflicting
  `available`, `not-available`, and `downloading` states after a real manual
  update check. The dialog now renders only updater IPC results in every build.
- `TEST-UPDATER-007`: renderer coverage reproduces a development-mode manual
  check and verifies that its real disabled result remains stable after the
  former timer window.
- Preview discovery now retains the exact GitHub Release body already returned
  with the prerelease tag, without adding another API request or cache. The
  candidate version must match the tag before this rich body overrides the
  packaged changelog fallback.
- Release-note Markdown now displays headings, emoji, and approved GitHub or
  Shields images. Images are HTTPS-only, lazy, referrer-free, and unapproved
  origins degrade to alt text.
- Download progress now spans the dialog content width, exposes an accessible
  progressbar, renders one percentage, and keeps the last release notes visible
  without retransmitting them on each progress event.
- `TEST-UPDATER-008`: main-process coverage verifies that the exact preview
  Release body reaches the available-update status.
- `TEST-UPDATER-009`: renderer coverage verifies rich Markdown image policy,
  continuous release notes, full-width progress, clamping, and one percentage.
- Update checks and downloads now accept explicit automatic, official, and
  mirror source modes. Automatic tries official first and falls back through a
  bounded mirror list.
- Switching source cancels the active `electron-updater` token, refreshes
  metadata for the replacement provider, and restarts visible progress at zero.
- Downloading now shows transferred/total size and speed, keeps source controls
  active, and exposes the manual GitHub Releases download action.
- `TEST-UPDATER-010`: main-process coverage verifies automatic fallback and
  cancellation before a replacement download.
- `TEST-UPDATER-011`: renderer coverage verifies transfer metrics, source
  switching, progress reset, and manual download access.
- macOS now switches between the existing PromptHub Template Image and a
  deterministic update-badge Template Image when the authoritative updater
  reports available, downloaded, or not-available states.
- The native tray menu replaces its generic update check with the detected
  version and a clickable detail sublabel that opens the existing update
  dialog. Transient checking, downloading, and error states preserve the last
  known actionable update.
- `TEST-UPDATER-012`: main-process updater, tray controller, native menu, and
  icon-resource coverage verifies status delivery, icon switching, localized
  version actions, Retina assets, and missing-badge fallback behavior.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/tray-icon.test.ts tests/unit/main/tray-menu.test.ts tests/unit/main/tray-controller.test.ts tests/unit/main/updater.test.ts` (`TEST-UPDATER-012`: 77 tests passed)
- `pnpm --filter @prompthub/desktop typecheck` (passed)
- Targeted ESLint for the updater, tray modules, main-process wiring, and their tests (passed with zero warnings)
- `pnpm --filter @prompthub/desktop build` (renderer, main, and preload production builds passed)
- The update Template Image was rendered and inspected at `16x16` / 72 dpi and `32x32` / 144 dpi; the PromptHub mark, circular badge, and transparent upward arrow remain distinguishable.
- After visual review, the badge gained a wider separation ring and a larger
  `arrow.up.circle.fill`-style arrow so the update meaning survives 16px
  rasterization instead of reading as an indistinct circular cutout.
- Targeted Prettier validation passed for this change's owned tray source, tests, and docs. The already-modified `updater.test.ts` still has pre-existing formatting differences outside `TEST-UPDATER-012`; they were not rewritten to avoid mixing unrelated work.
- Live macOS menu bar acceptance was not run because this request did not authorize desktop GUI control; native menu state and icon switching were verified at the main-process boundary.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/updater.test.ts tests/unit/components/update-dialog.test.tsx` (31 tests passed for source switching and transfer telemetry)
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/renderer-i18n-smoke.test.tsx` (2 tests passed across the renderer locale loader)
- `pnpm --filter @prompthub/desktop typecheck` (passed)
- Targeted ESLint for updater main/preload/renderer/tests (passed with zero warnings)
- `pnpm spec:traceability` (15 active changes passed)
- `pnpm --filter @prompthub/desktop build` (renderer, main, and preload production builds passed)

- `pnpm test -- --run tests/unit/main/updater.test.ts tests/unit/components/update-dialog.test.tsx tests/unit/components/about-settings.test.tsx tests/unit/main/updater-real-scenario.test.ts`
- `pnpm lint`
- `pnpm build`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/updater.test.ts tests/unit/main/updater-real-scenario.test.ts tests/unit/components/about-settings.test.tsx tests/unit/components/update-dialog.test.tsx tests/unit/components/renderer-i18n-smoke.test.tsx tests/integration/components/main-content-inline-edit.integration.test.tsx tests/integration/components/main-content-large-dataset.integration.test.tsx tests/unit/cli/run.test.ts`
- `pnpm --filter @prompthub/desktop lint` (passed after `TEST-UPDATER-007`)
- `pnpm --filter @prompthub/desktop typecheck` (passed after `TEST-UPDATER-007`)
- `pnpm --filter @prompthub/desktop build` (passed after `TEST-UPDATER-007`)
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/update-dialog.test.tsx tests/unit/components/about-settings.test.tsx tests/unit/main/updater.test.ts tests/unit/main/updater-real-scenario.test.ts` (42 tests passed)
- `git diff --check` for the current update dialog change: passed
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/update-dialog.test.tsx --run`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop build`
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/updater.test.ts tests/unit/components/update-dialog.test.tsx` (28 tests passed for `TEST-UPDATER-008` and `TEST-UPDATER-009`)
- `pnpm --filter @prompthub/desktop typecheck` (passed for the rich release-note and progress change)
- Targeted ESLint for `updater.ts`, `UpdateDialog.tsx`, and their two test files (passed with zero warnings)
- `pnpm spec:traceability` (14 active changes passed)
- `pnpm --filter @prompthub/desktop build` (renderer, main, and preload production builds passed)
- GUI screenshot acceptance was not run because this task did not authorize browser or desktop control; component behavior, generated CSS, and production compilation were verified without starting a persistent process.

## Synced Docs

- Updated `README.md`, all localized `docs/README.*.md`, `spec/releases/release-rules.md`, and `.github/workflows/release.yml` to distinguish stable `0.5.5` from the historical beta `0.5.5-beta.1`.
- Intentionally did not run `website/scripts/sync-release.mjs` in this round, because the current website release sync pipeline assumes `package.json` always represents the latest stable release and would incorrectly replace stable-facing website metadata with the historical beta version.
- Updated `CHANGELOG.md`, `README.md`, all localized `docs/README.*.md`, and `.github/workflows/release.yml` again for `0.5.5-beta.3` so the preview entry points track the current prerelease while stable-facing download surfaces remain on `0.5.5`.
- Intentionally still did not run `website/scripts/sync-release.mjs` for `0.5.5-beta.3`, because the website sync pipeline remains stable-oriented and would overwrite stable-facing metadata with the prerelease version.

## Follow-ups

### 2026-10-17 mirror selection verification

- Network settings now exposes the shared built-in mirror catalog with automatic selection. Both update IPC paths consume the stored selection; explicit mirrors fail visibly without switching to another mirror.
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/network-settings.test.tsx tests/unit/components/update-dialog.test.tsx tests/unit/main/updater.test.ts`: 41 passed. Component interactions cover selection and reopen; updater tests replace Electron/updater transport and verify endpoint selection and failure behavior.
- `pnpm --dir packages/core exec vitest run tests/settings-sqlite.test.ts`: 8 passed, including real SQLite close/reopen retention of mirror selection and existing rollback coverage.
- Desktop `typecheck:tests`, affected source ESLint and diff whitespace checks passed. GUI acceptance was not performed at the user's request; public mirror availability and real updater downloads were not exercised.

- Confirm whether current `v0.5.5` prerelease should be treated as a one-off historical exception before switching to semver prerelease tags for the next preview cycle.
- Run release-related verification against an actual prerelease tag once the workflow changes land, since this round only validated runtime logic and targeted tests.
- Future preview lines should still prefer forward-moving prerelease versions such as `0.5.6-beta.1`; `0.5.5-beta.1` remains a one-off backfill exception.
