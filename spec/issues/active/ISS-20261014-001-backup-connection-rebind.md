# #221 Backup Connection Rebinding

Status: connection defect fixed locally. Original Windows 0.5.9 report and
restore acceptance remain unresolved.

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
