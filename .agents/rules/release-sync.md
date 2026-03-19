---
trigger: manual
---

---

name: release-sync
description: Update PromptHub release materials when the task is `/update-readme`, bumping the app version, refreshing README or CHANGELOG, syncing the website, updating GUI screenshots, or aligning multilingual docs and locales.

---

Use this rule for PromptHub release housekeeping.

## Trigger examples

- `/update-readme`
- `更新版本号到 0.4.6`
- `更新 README / CHANGELOG / 官网`
- `同步多语言文档`
- `发版前把文档和网站都更新掉`

## Required workflow

1. Identify the target release version and release date.
2. Decide the release scope before editing:
   - version bump only
   - docs-only sync
   - docs + website
   - docs + website + in-app locales
   - docs + website + screenshots/assets
3. If the user mentions GUI updates, confirm the release narrative matches the current product UI before editing release-facing docs.
4. Update source-of-truth files first:
   - `package.json`
   - `CHANGELOG.md`
5. Sync release-facing docs:
   - `README.md`
   - `docs/README.en.md`
   - `docs/README.zh-TW.md`
   - `docs/README.ja.md`
   - `docs/README.de.md`
   - `docs/README.es.md`
   - `docs/README.fr.md`
6. Sync website release metadata:
   - run `node website/scripts/sync-release.mjs`
   - verify generated changes in `website/src/generated/release.ts`
   - verify `website/src/content/docs/changelog.md`
7. If the release changes visible GUI or feature emphasis, also review:
   - `website/src/i18n/ui.ts`
   - `website/src/pages/index.astro`
   - `website/src/pages/en/index.astro`
   - screenshot references under `docs/imgs/` and `website/public/imgs/`
8. If user-facing text changed inside the app, sync locales:
   - `src/renderer/i18n/locales/zh.json`
   - `src/renderer/i18n/locales/zh-TW.json`
   - `src/renderer/i18n/locales/en.json`
   - `src/renderer/i18n/locales/ja.json`
   - `src/renderer/i18n/locales/de.json`
   - `src/renderer/i18n/locales/es.json`
   - `src/renderer/i18n/locales/fr.json`
9. Run verification:
   - `pnpm exec tsc --noEmit --pretty false`
10. In the final response, always report:
   - target version
   - whether website sync script was run
   - whether screenshots were updated
   - which locales/docs were updated
   - any intentionally skipped surfaces

## Rules

- Treat `package.json` version and the newest `CHANGELOG.md` section as the release source of truth.
- Keep changelog entries bilingual if the existing release sections are bilingual.
- Keep README badge version, download links, release text, and website release metadata consistent.
- Do not mention new GUI states in docs unless matching screenshots/assets exist or are updated in the same task.
- Do not silently skip multilingual docs; say which locales were updated and which were not.
- If the release mentions CLI, be explicit whether it is available from the desktop build or only from the CLI/npm distribution path.
- Prefer minimal drift:
  - if website metadata can be generated, generate it instead of hand-editing
  - if only zh/en website copy changed, say the remaining locales are unaffected because the website currently only exposes zh/en UI
- For version bumps, update every hardcoded release number that affects user-facing download/install instructions.

## PromptHub-specific file checklist

- Core:
  - `package.json`
  - `CHANGELOG.md`
- Docs:
  - `README.md`
  - `docs/README.en.md`
  - `docs/README.zh-TW.md`
  - `docs/README.ja.md`
  - `docs/README.de.md`
  - `docs/README.es.md`
  - `docs/README.fr.md`
- Website:
  - `website/scripts/sync-release.mjs`
  - `website/src/generated/release.ts`
  - `website/src/content/docs/changelog.md`
  - `website/src/content/docs/introduction.md`
  - `website/src/content/docs/en/introduction.md`
  - `website/src/i18n/ui.ts`
  - `website/src/components/DownloadSection.tsx`
  - `website/src/components/Hero.tsx`
  - `website/src/components/FeatureGrid.tsx`
- Screenshots:
  - `docs/imgs/`
  - `website/public/imgs/`
- App locales:
  - `src/renderer/i18n/locales/*.json`

## Suggested command sequence

```bash
pnpm exec tsc --noEmit --pretty false
node website/scripts/sync-release.mjs
pnpm exec tsc --noEmit --pretty false
```

If website code itself changed, also run the website build or the smallest relevant website verification command available in the repo.

## Release response template

- Version: `x.y.z`
- Updated: root version, changelog, README, website metadata, localized docs/locales
- Verified: `pnpm exec tsc --noEmit --pretty false`
- Not updated: list any skipped locales, screenshots, or website surfaces with reason
