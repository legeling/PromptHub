# Design

## Overview

Apply the smallest set of targeted fixes:

- Catch and surface backup errors inside `UpdateDialog` instead of letting promise rejections escape event handlers.
- Return a stable non-empty summary string from `rules.ipc` AI rewrite responses.
- Update test fixtures/helpers so the full unit suite reflects the current rules UI copy, store state shape, upgrade-backup API surface, and CLI runtime dependencies.
- Centralize remote skill store cache reads so legacy entries without a `skills` array are treated as empty lists instead of crashing renderer code.

## Affected Areas

- Data model:
- No schema or storage format changes. Renderer compatibility code accepts older persisted cache entries that are missing `skills`.
- IPC / API:
- `rules:rewrite` response must include a string `summary`.
- Test window mocks must expose `window.api.upgradeBackup`.
- Filesystem / sync:
- No production filesystem behavior changes; only backup error propagation is hardened.
- UI / UX:
- `UpdateDialog` backup failures move into visible dialog error state instead of generating unhandled rejections.
- Skill store source counts, selected store loading state, My Skills update indicators, and remote store cache reuse all use the same `getRemoteStoreSkills` / `getRemoteStoreSkillCount` helpers.

## Tradeoffs

- Keeping the existing updater dialog error surface is less elaborate than introducing a dedicated inline backup error banner, but it is a minimal, user-visible failure mode that avoids swallowed or leaked async errors.
- Tightening tests to current labels is preferable here because the UI text already intentionally changed.
- Treating malformed remote store cache entries as empty is safer than trying to repair them in place because remote store content is cache data; valid entries remain unchanged and invalid entries are naturally refreshed by normal load paths.
