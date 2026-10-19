# #221 Backup Connection Rebinding

Status: export connection defect fixed; legacy ZIP import adapter implemented
and locally verified on 2026-10-19. Historical import `2da40ad6` and startup recovery
`96528645` are committed and pushed, not released. Original Windows
startup report now has a separate identified conflict path and a locally verified
recovery implementation. Original-profile/Windows acceptance remains open.

## 2026-10-19: historical workspace startup conflict

The supplied startup screenshot identifies `Historical Prompt workspace conflict`
in the released `prompt-workspace-v1` converter. That converter compared
projected records wholesale. The v0.5.8 writer omits Prompt `parentId` and `order`,
while the current parser supplies defaults, so equivalent old mirrors can conflict
with current SQL-only metadata. Genuine content differences also stop startup.
The screenshot alone does not identify the exact differing field or its cause in
the reporter's private profile.

The ordered successor `prompt-workspace-v2` compares represented fields, preserves
SQL-only metadata and opens an isolated recovery surface for real differences.
Explicit choices are fingerprint-bound, validated and published with the existing
SQL/file journal. Original files and a managed SQLite safety point are retained.
The normal App and database-bound business IPC are not opened while blocked.
Released migration code remains unchanged; unsafe input is still rejected.
Implementation and acceptance boundaries live in
`spec/knowledge/behavior/data-recovery.md`. The later split commit/push was
explicitly authorized; no release or original-issue closure is included.

Local verification passed: 15 successor migration cases, 2 real Desktop
initialization/preload/IPC/reopen cases, 11 recovery component/locale cases and
1 isolated renderer-entry case. The unchanged v1 migration, canonical startup,
catalog/publication/historical-runtime and portable import suites also passed
(112 existing cases). Source/test typechecks, scoped ESLint, file-size checks and
Desktop production build passed. This does not establish the result on the
reporter's private profile, native Windows UI or the full release harness.

## 2026-10-19: legacy ZIP incompatibility

The user reports that creating Prompts on Windows and pasting images now work.
A separate forwarded report says an in-place 0.6.0 upgrade fails at startup,
a clean 0.6.0 install starts but cannot import an older compressed backup, and
0.5.8 can import the same backup. The reporter supplied neither an extension
nor error text; these two failures must not be assigned one root cause.

The v0.5.8 `data:exportZip` writer in `apps/desktop/src/main/index.ts` creates
`import-with-prompthub.json` plus selected resource directories. It does not
create `portable-manifest.json`. In 0.6.0 the native file preview and restore
paths in `apps/desktop/src/renderer/services/database-backup.ts` dispatch every
ZIP with a native file path to the portable snapshot handlers. Extraction calls
`readPortableSnapshot`, which unconditionally reads `portable-manifest.json`
before any logical-data migration. The old layout is consequently rejected.
These relevant implementation files match the published `36401160` baseline;
this is not attributable to the unrelated dirty-worktree changes.

The two initial regressions in
`apps/desktop/tests/integration/legacy-backup-zip-compatibility.test.ts` failed
with missing-manifest `ENOENT` before the fix. Both now pass through one Core
adapter for the exact historical ZIP layout, followed by the existing current
manifest validation and atomic restore. A modern manifest never falls back to
this adapter. The seven cases cover preview/restore, gzip normalization,
malformed modern manifest, deleted modern manifest, traversal and newer format
rejection without modifying the active database.

`release-acceptance-data-recovery-portable.test.ts` adds five cases using
nonempty historical-layout fixtures: ZIP/JSON/gzip imports through renderer,
preload and registered IPC, publication failure rollback, and ordinary full
export without an extra upgrade snapshot. All five passed after fixture-only
repairs; the nine existing current-format cases also passed. These checks use
real SQLite, file publication and startup/reopen functions, while mocking OS
dialogs and Electron transport. They preserve Prompt/Folder/history IDs, Skill
text, ZIP binary package bytes, images and selected settings across repeated
imports and restarts. The original archive remains unchanged. The fixture is
not the reporter's private archive or a Windows binary test.

Shared scope normalization expands historical Skills-bundled MCP/Plugin fields
without overriding explicit modern exclusions; five shared unit cases pass.
Nonempty historical MCP/Plugin package restoration is not yet separately
accepted. Fifty directly related Desktop unit cases, source/test typechecks
and scoped ESLint pass. Backup families and retained safety boundaries are
defined in `spec/knowledge/behavior/data-recovery.md`; existing backup files
were not deleted. No commit, publication or issue closure is included.

The startup chain separately performs restore recovery, upgrade safety snapshot,
legacy layout migration, canonical publication and SQLite initialization. It does
not read a user-selected ZIP. No exact failing stage has been reproduced for
the forwarded Windows upgrade report, so the ZIP finding does not explain it.
Retain the original backup and old profile; deletion/reinstallation is not a
validated migration remedy.

## Confirmed defect

An isolated current-build Electron profile can create a Prompt and export a
complete native ZIP, then fails on `prompt:update` with `Database already closed`.
`createCheckpointedPortableSnapshotZip` closes the writer under maintenance and
reopens it after export, but registered Prompt/Folder/Version and other handlers
still hold DB classes constructed with the closed connection.

The fix passes the existing main-process `registerDatabaseBoundIpc` lifecycle
callback through the portable export boundary. It runs after successful DB
reopen on both export success and export failure. The maintenance barrier,
checkpoint consistency validation and archive format remain unchanged. No
schema, data layout, fallback or automatic retry is added; rollback is the
independent source commit. Rebinding reuses the existing bounded registration
set and does not scan native Agent directories or start new processes.

## Verification

- `tests/e2e/prompt-backup-continuity.spec.ts`: real Electron preload/IPC creates
  a Prompt, exports and previews ZIP, updates and creates after export, fully
  restarts and reads both records. Only the native save dialog is replaced.
  The test's continuous
  transaction/restart narrative is intentionally longer than 50 lines.
- Pre-fix: the test fails on `prompt:update` after export with the closed-DB
  error. This is a confirmed current-build reproducer, not proof of the
  reporter's Windows/version-specific cause.
- `tests/unit/main/canonical-portable-export.test.ts`: rebind follows reopening
  on successful export and archive failure; existing cleanup ordering remains.

2026-10-14: the two export coordinator tests and the isolated Electron
export/edit/create/restart regression pass. Desktop build, source/test
typechecks and scoped ESLint pass. This is not full backup/restore or Windows
acceptance.

A wider restore probe reached `restorePortableBackup` after the connection fix
and failed with `PromptHub canonical authority root identity mismatch`. The
restore candidate/runtime identity modules have concurrent uncommitted changes;
this independent fix does not modify or include those changes. The failing
sequence is: fresh profile → create Prompt → full native ZIP export → preview →
edit Prompt → restore same archive. Restore remains an open acceptance gate.

## Original report evidence still needed

#221 combines failed export, failed import and failed Prompt creation on
Windows, naming `0.5.9` and `6.0.12`. The attached dialog is generic and no log
or sample backup is provided. The published versions visible on 2026-10-14 are
stable `0.5.9` and prerelease `0.6.0-beta.2`; `6.0.12` is not an identified
release. Ask for the About version, exact backup entrypoint/format, failure
ordering and redacted log/error text. Do not request credentials or a complete
private backup. Do not close the original report solely from this regression.
