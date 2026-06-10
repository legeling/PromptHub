# Proposal

## Why

Recent desktop unit-suite runs exposed a mixed set of regressions:

- `UpdateDialog` could surface an unhandled rejection when the upgrade-backup API was unavailable during the manual pre-upgrade backup flow.
- `rules.ipc` returned `summary: null` even though the shared contract requires a string summary for AI rewrite results.
- Several unit tests drifted behind current UI labels, store shape, and runtime package metadata, causing false negatives in the full suite.
- Legacy or malformed remote skill store cache entries could omit the `skills` array and still be rehydrated into renderer state, crashing store counts, store pages, update indicators, or cache-loading paths that assumed `skills.length` was always available.
- Desktop local media protocol handlers accepted any resolved file extension once the path stayed inside the media directory, leaving image/video protocol boundaries looser than the save-side media validation.

## Scope

- In scope:
- Harden the update backup action so failures do not leak as unhandled promise rejections.
- Restore the rules IPC rewrite response contract.
- Align desktop unit tests and shared test helpers with current UI/API behavior.
- Treat remote skill store cache entries without a `skills` array as empty cache entries throughout renderer store, sidebar, skill store, skill manager, and remote loading code.
- Restrict desktop local media protocol resolution to the expected image/video extension sets and reject unsafe path segment characters before resolving on disk.
- Out of scope:
- New updater features, backup storage semantics, or rules authoring UX redesign.
- Broader CLI packaging changes beyond test expectation alignment.
- Remote store schema migrations or destructive cache rewrites.

## Risks

- Test updates could accidentally mask a real regression if they are loosened too far.
- Update error handling must not hide install-state transitions or backup prerequisites.
- Remote store cache compatibility must not hide successful loaded caches; valid `skills` arrays must still drive counts, update indicators, and cache reuse.

## Rollback Thinking

- Revert the specific UI/IPC/test patches in this change if they introduce behavioral regressions.
- The change is isolated to desktop renderer/main code and tests; no schema or persisted-data rollback is required.
