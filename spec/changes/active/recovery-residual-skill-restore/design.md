# Design

## Boundary

Owner: `apps/desktop`.

Source of truth:

- SQLite remains the durable database source under the active runtime data path.
- Filesystem Skill residuals remain under the legacy root until migration moves them into `data/skills`.
- Recovery candidates are renderer-facing metadata only; they must not redefine storage ownership.

## Approach

1. Add link-safe empty legacy database detection inside the data-layout migration service.
2. Exclude empty legacy root `prompthub.db` files from residual detection so they do not keep surfacing recovery.
3. During migration, if root `prompthub.db` conflicts with `data/prompthub.db` but the root file is empty of user data, remove the root placeholder and continue.
4. When a non-empty root database conflicts with an existing unified database, preserve the root database as a `prompthub.db.legacy-conflict-*.db` backup and complete the layout migration so the stale root file no longer wins runtime path selection.
5. Prefer `data/prompthub.db` in desktop runtime database path selection whenever it exists; root `prompthub.db` is now only a fallback for old layouts without a unified database.
6. Ignore Electron top-level runtime singleton symlinks (`SingletonCookie`, `SingletonLock`, `SingletonSocket`) during upgrade snapshot creation, while continuing to reject symlinks inside user data payloads.
7. Update the recovery dialog to use a narrower modal, denser cards, clearer action footer, and a database status label instead of showing `0 B` as meaningful.

## Compatibility

No IPC, shared type, or schema change is required. Existing candidates still carry `dbSizeBytes`; the renderer changes only how zero-sized candidates are described. Existing root database residuals are preserved as timestamped conflict backups rather than deleted.

## Verification

Focused unit tests cover empty root database cleanup, non-empty conflict backup preservation, unified database path priority, Electron singleton snapshot skipping, zero-size database label rendering, and action visibility.
