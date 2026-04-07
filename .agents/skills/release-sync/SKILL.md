---
name: release-sync
description: PromptHub release update skill. Use for `/update-readme`, version bumps, changelog updates, website sync, GUI screenshot/doc refresh, and multilingual release/documentation alignment.
trigger: manual
---

# Release Sync Skill

This skill is for PromptHub release housekeeping.

## Use this when

- The user asks to bump the version, for example `0.4.5 -> 0.4.6`
- The user asks to update `README.md`
- The user asks to update `CHANGELOG.md`
- The user asks to sync the website or release docs
- The user asks to refresh GUI screenshots or feature descriptions
- The user asks to align multilingual docs or app locales
- The request is something like `/update-readme`, `发版`, `更新官网`, `同步文档`

## Source of truth

Always treat these as source of truth first:

- `package.json`
- newest section in `CHANGELOG.md`

## Required update surfaces

- Core
  - `package.json`
  - `CHANGELOG.md`
- Release docs
  - `README.md`
  - `docs/README.en.md`
  - `docs/README.zh-TW.md`
  - `docs/README.ja.md`
  - `docs/README.de.md`
  - `docs/README.es.md`
  - `docs/README.fr.md`
- Website
  - `website/scripts/sync-release.mjs`
  - `website/src/generated/release.ts`
  - `website/src/content/docs/changelog.md`
  - `website/src/content/docs/introduction.md`
  - `website/src/content/docs/en/introduction.md`
  - `website/src/i18n/ui.ts`
- App locales when user-facing app copy changed
  - `src/renderer/i18n/locales/zh.json`
  - `src/renderer/i18n/locales/zh-TW.json`
  - `src/renderer/i18n/locales/en.json`
  - `src/renderer/i18n/locales/ja.json`
  - `src/renderer/i18n/locales/de.json`
  - `src/renderer/i18n/locales/es.json`
  - `src/renderer/i18n/locales/fr.json`
- Screenshots/assets when GUI changed
  - `docs/imgs/`
  - `website/public/imgs/`

## Execution order

1. Identify target version and release date.
2. Update `package.json`.
3. Add the new top release section to `CHANGELOG.md`.
4. Update `README.md`, including:
   - version badge
   - download section text
   - release download links
   - roadmap/current-version section
   - latest-version summary section
5. Sync localized README files under `docs/`, especially `docs/README.en.md`, with the same surfaces:
   - version badge
   - download links
   - roadmap/current-version section
   - latest-version summary section
6. Run:

```bash
node website/scripts/sync-release.mjs
```

7. If needed, patch website copy beyond generated metadata.
8. If app copy changed, sync `src/renderer/i18n/locales/*.json`.
9. If GUI changed, verify docs/screenshots match the text.
10. Search for stale version strings in docs before finishing, for example:

```bash
rg -n "0\\.[0-9]+\\.[0-9]+" README.md docs
```

11. Run:

```bash
pnpm exec tsc --noEmit --pretty false
```

## Rules

- Keep changelog bilingual if the current release style is bilingual.
- Keep README badge version, download links, and install text consistent with the target version.
- Keep README "current version" and "latest version" summary blocks aligned with the newest changelog entry.
- When the release includes operational fixes, do not omit them from docs. Commonly missed categories:
  - backup / restore format changes
  - WebDAV sync behavior
  - data directory / migration behavior
  - performance / large-dataset work
  - test / CI / release-gate improvements
- Do not silently skip localized docs; explicitly report what was updated and what was not.
- If the release mentions CLI, clarify whether it is desktop-available or only available via CLI/npm distribution.
- Prefer existing automation:
  - use `website/scripts/sync-release.mjs` instead of manually editing generated release metadata

## Output checklist

Final response should say:

- target version
- files updated
- whether website sync was run
- whether screenshots were updated
- which locales/docs were updated
- what was intentionally skipped
