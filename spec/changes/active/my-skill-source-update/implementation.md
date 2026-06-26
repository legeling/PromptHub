# Implementation

## Status

Implemented.

## Changes

- Added installed-source update APIs to the desktop skill store:
  - `getInstalledSkillSourceUpdateStatus(skillId)`
  - `updateInstalledSkillFromSource(skillId, options?)`
- Added GitHub fallback candidate derivation for installed skills that have a GitHub tree `source_url` but no cached registry entry.
- Reused the existing registry update status service for remote hash comparison, local modification detection, conflict detection, version snapshots, and repo sync.
- Added a My Skills detail header action that checks source updates and switches to an update action when a source update is available.
- Fixed GitHub issue #168 false local-modified detection: if the installed `SKILL.md` content already matches the latest source content, a stale `installed_content_hash` no longer reports local changes.
- Added an explicit `Overwrite local changes` action in My Skills detail after a source update check returns `local-modified` or `conflict`, matching the existing store-detail overwrite behavior. Creating a snapshot preserves rollback history, while the overwrite action is now the explicit user consent required to continue.
- Added locale strings for the new check/update states in all supported desktop locales.
- Preserved the installed skill's user-facing `source_label` during store/source updates so private store labels do not drift into generic Git host labels such as Gitea Import.
- Fixed package-source updates for installed Skills such as `spec-init`: GitHub package sources that have `source_directory`, `canonical_skill_path`, or `directory_fingerprint` now refresh through `saveRemoteGitToRepo()` and `syncFromRepo()` even when a raw `content_url` is recorded. This avoids the fragile GitHub API plus `raw.githubusercontent.com` byte-fetch path for package assets.
- Preserved original SSH package sources during installed-source updates. When `source_url` is `git@github.com:owner/repo.git`, the update path keeps that SSH URL for package sync instead of converting the update into raw HTTPS downloads.
- Fixed false local-modified detection for large managed package Skills. Root cause: repo-to-DB sync reused generic imported-field sanitization for `instructions`, so `SKILL.md` content over 10,000 characters was truncated in SQLite while the managed repo and remote source remained identical. Source update checks now sync from the managed repo before comparing, and repo sync writes the complete `SKILL.md` content instead of the import-sanitized string.
- Removed silent length truncation from Skill import sanitization. Imported Skill content, metadata strings, tags, prerequisites, and compatibility entries are no longer capped by fixed field lengths during sanitization; malformed types are still filtered and surrounding whitespace is still trimmed. Future size limits must be explicit validation failures instead of mutating persisted Skill data.
- Fixed package freshness detection for installed package Skills. Source update checks now compute the latest remote package fingerprint with the same PromptHub directory fingerprint algorithm used for local managed repos, so remote changes to assets, scripts, references, examples, or agent configs report `update-available` even when `SKILL.md` itself has not changed. This avoids comparing Git provider tree/blob SHAs with local file-content fingerprints, which could make an already-updated package keep showing as updateable.
- Added a read-only `skill:getRemoteGitPackageFingerprint` IPC path. It clones the recorded Git source into a temporary directory, resolves the package directory or single Skill directory, computes the package directory fingerprint from file bytes, and removes the temporary clone without saving or mutating the installed Skill.
- Extended package fingerprint ignore rules for local-only files: PromptHub-owned `.prompthub/` metadata, local environment secrets (`.env`, `.env.local`, etc.), virtual environments, pid/socket runtime files, and common cache/log/temp byproducts are ignored. Distributable environment templates such as `.env.example`, `.env.sample`, and `.env.template` remain part of the package fingerprint.
- Clarified package version behavior: if the local package fingerprint and remote package fingerprint match, a source/store version label change alone does not show `update-available`; the check remains `up-to-date` and can refresh baseline metadata quietly.

## Verification

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts --testNamePattern "GitHub-imported skill"` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx --testNamePattern "source updates|locale skill keys"` passed.
- `pnpm --filter @prompthub/desktop typecheck` passed.
- `pnpm --filter @prompthub/desktop exec eslint src/renderer/stores/skill.store.ts src/renderer/components/skill/SkillFullDetailPage.tsx tests/unit/stores/skill.store.test.ts tests/unit/components/skill-i18n-smoke.test.tsx` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-i18n-smoke.test.tsx` passed.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/stores/skill.store.test.ts --testNamePattern "private Gitea"` passed.
- `pnpm --dir apps/desktop exec vitest run tests/unit/components/skill-full-detail-async-actions.test.tsx tests/unit/components/skill-i18n-smoke.test.tsx tests/unit/services/skill-store-update.test.ts tests/unit/stores/skill.store.test.ts` passed: 4 files, 102 tests.
- `pnpm --dir apps/desktop exec tsc --noEmit --pretty false` passed.
- `git diff --check` passed.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/stores/skill.store.test.ts -t "updates an installed GitHub package skill|preserves SSH source URLs|uses the content path for GitHub raw registry entries"` passed: 3 targeted tests.
  - Note: this machine's Homebrew Node is v26.3.1, whose experimental global `localStorage` requires a file-backed option; the test itself still runs in the project's jsdom setup.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/main/skill-repo-sync.test.ts tests/unit/stores/skill.store.test.ts` passed: 2 files, 95 tests.
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/main/skill-import-sanitize.test.ts -t "does not silently truncate"` passed: 1 targeted test.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/main/skill-import-sanitize.test.ts tests/unit/main/skill-repo-sync.test.ts tests/unit/stores/skill.store.test.ts` passed: 3 files, 98 tests.
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/cli exec vitest run tests/run.test.ts -t "does not silently truncate long local JSON skill fields"` passed: 1 targeted CLI test.
- Removed silent length truncation from the CLI Skill import path as well. CLI JSON/local Skill install and scan helpers now preserve full content and metadata strings instead of slicing descriptions, versions, authors, tags, prerequisites, compatibility entries, or source URLs.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/stores/skill.store.test.ts -t "detects installed package source updates when only non-SKILL files changed remotely"` passed: 1 targeted test.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/main/skill-import-sanitize.test.ts tests/unit/main/skill-repo-sync.test.ts tests/unit/stores/skill.store.test.ts tests/unit/services/skill-store-update.test.ts` passed: 4 files, 107 tests.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/main/skill-local-repo-ipc.test.ts tests/unit/stores/skill.store.test.ts tests/unit/services/skill-store-update.test.ts` passed: 3 files, 86 tests.
- `NODE_OPTIONS="--localstorage-file=/tmp/prompthub-vitest-localstorage.json" PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop exec vitest run --config vitest.config.ts tests/unit/services/skill-identity.test.ts tests/unit/services/skill-store-update.test.ts tests/unit/stores/skill.store.test.ts tests/unit/main/skill-local-repo-ipc.test.ts` passed: 4 files, 96 tests.
- `PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" pnpm --filter @prompthub/desktop typecheck` passed.
- Local data repair for the reported `spec-init` row:
  - Backed up the SQLite DB to `/Users/lingxiaotian/Library/Application Support/PromptHub/data/prompthub.db.codex-before-spec-init-content-fix-20260624145011`.
  - Verified remote raw `SKILL.md` and managed repo `SKILL.md` are byte-identical.
  - Updated the `spec-init` DB `content` from the managed repo and refreshed `updated_from_store_at`; the stored baseline hash remains `d81c981c5d38b752c7cb181935aee85bea669c8c75c2b1d4879c2ccf6c0c4ce8`, matching the complete normalized content.
