# Tasks

- [x] Add failing store tests for GitHub-imported installed skill update checks without registry cache.
- [x] Add installed-source update APIs to `useSkillStore`.
- [x] Add My Skills detail source check/update action.
- [x] Add component regression coverage for the detail action.
- [x] Add i18n strings for the new visible states.
- [x] Add issue #168 regression coverage for stale install baselines that previously reported false local modifications.
- [x] Add package-source update regression coverage so installed GitHub packages with `content_url` still refresh via clone-backed package sync, not raw asset byte downloads.
- [x] Add SSH source update regression coverage so installed package updates preserve the original SSH `source_url`.
- [x] Fix repo-to-DB sync so managed package `SKILL.md` content over 10,000 characters is not truncated by generic import-field limits.
- [x] Remove silent length truncation from Skill import sanitization for content, metadata fields, tags, prerequisites, and compatibility entries.
- [x] Add update-check regression coverage for package Skills whose DB content is stale/truncated but managed repo content already matches remote.
- [x] Fix package update checks so remote directory fingerprint changes report updates even when `SKILL.md` content is unchanged.
- [x] Fix package update checks so local and remote package freshness use the same directory fingerprint algorithm instead of comparing Git provider tree/blob SHAs with local file fingerprints.
- [x] Add regression coverage that a synced package reports `up-to-date` once its local directory fingerprint matches the freshly computed remote package fingerprint.
- [x] Extend package fingerprint ignore coverage for PromptHub-owned metadata, local environment secrets, virtual environments, and runtime state while preserving distributable template files.
- [x] Add regression coverage that package version label changes do not show `update-available` when local and remote package fingerprints match.
- [x] Add My Skills detail overwrite action for explicit source updates after a real local-modified/conflict check.
- [x] Run focused store/component/type/lint verification.
