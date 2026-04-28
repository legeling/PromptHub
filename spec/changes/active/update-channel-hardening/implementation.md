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

## Verification

- `pnpm test -- --run tests/unit/main/updater.test.ts tests/unit/components/update-dialog.test.tsx tests/unit/components/about-settings.test.tsx tests/unit/main/updater-real-scenario.test.ts`
- `pnpm lint`
- `pnpm build`

## Synced Docs

- Updated `README.md`, all localized `docs/README.*.md`, `spec/specs/release/spec.md`, and `.github/workflows/release.yml` to distinguish stable `0.5.5` from the historical beta `0.5.5-beta.1`.
- Intentionally did not run `website/scripts/sync-release.mjs` in this round, because the current website release sync pipeline assumes `package.json` always represents the latest stable release and would incorrectly replace stable-facing website metadata with the historical beta version.

## Follow-ups

- Confirm whether current `v0.5.5` prerelease should be treated as a one-off historical exception before switching to semver prerelease tags for the next preview cycle.
- Run release-related verification against an actual prerelease tag once the workflow changes land, since this round only validated runtime logic and targeted tests.
- Future preview lines should still prefer forward-moving prerelease versions such as `0.5.6-beta.1`; `0.5.5-beta.1` remains a one-off backfill exception.
