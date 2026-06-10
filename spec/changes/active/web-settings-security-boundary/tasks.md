# Tasks

- [x] 明确变更边界
- [x] 完成 delta spec
- [x] Add failing route regression for rejected security settings updates.
- [x] Add failing route regression for supported shared preference fields after strict schema.
- [x] Add failing route and service regressions for clearing `defaultFolderId`.
- [x] Update import/export round-trip regression to seed historical security
      state through imported payloads instead of live settings mutation.
- [x] Remove live `security` writes from normal Web settings update schema.
- [x] Explicitly allow supported live preference fields in the strict schema.
- [x] Preserve nullable clear signals and delete cleared settings from SQLite/workspace JSON.
- [x] Add failing route/import/sync regressions for malformed persisted preference fields.
- [x] Bound `backgroundImageFileName`, `lastManualBackupAt`, and `lastManualBackupVersion`.
- [x] Reuse the same persisted preference field validation in sync snapshot imports.
- [x] Verify focused settings route tests.
- [x] Verify focused import/export and sync route tests.
- [x] Update implementation.md
- [x] Decide whether stable docs need sync after implementation.
- [x] Add failing route regression for oversized background image blur.
- [x] Bound `backgroundImageBlur` to the renderer-supported range.
- [x] Rerun focused settings/import/sync tests, typecheck, lint, and diff check.
- [x] Update implementation.md for background blur bound.
