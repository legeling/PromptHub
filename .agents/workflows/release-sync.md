---
name: release-sync
description: End-to-end PromptHub release update workflow for version bumps, README/CHANGELOG sync, website release metadata, screenshots, and multilingual docs.
---

# Release Sync Workflow

Use this workflow when the task is a PromptHub release update.

## Inputs

- target version, for example `0.4.6`
- release date
- release notes scope
- whether GUI/screenshots changed
- whether in-app user-facing copy changed

## Execution order

1. Update `package.json`.
2. Add the newest section to `CHANGELOG.md`.
3. Update root `README.md`.
4. Sync localized READMEs in `docs/`.
5. Run:

```bash
node website/scripts/sync-release.mjs
```

6. If needed, patch website copy files:
   - `website/src/i18n/ui.ts`
   - `website/src/pages/index.astro`
   - `website/src/pages/en/index.astro`
7. If the release changes GUI, review screenshots in:
   - `docs/imgs/`
   - `website/public/imgs/`
8. If app copy changed, sync `src/renderer/i18n/locales/*.json`.
9. Verify with:

```bash
pnpm exec tsc --noEmit --pretty false
```

## Output expectations

- all user-facing release versions are consistent
- README and website download/install text match the target version
- bilingual changelog style is preserved
- docs/locales skipped for good reason are explicitly called out
