# Recovery Residual Skill Restore

## Why

Users can encounter a recovery dialog for current-directory legacy residuals that lists Skill files but reports a `0 B` database and then fails recovery with `Remaining entries: prompthub.db`. The failure is confusing when the legacy root database is only an empty placeholder while useful data lives in the Skill directory.

The recovery dialog is also too wide and visually loose for the amount of information shown, making the restore and dismiss actions hard to scan.

## Scope

- Treat empty legacy root `prompthub.db` files as non-blocking residuals when unified data already exists.
- Preserve protection for legacy root databases that contain prompts, folders, or skills.
- Show a clearer database status for recovery candidates with no effective database payload.
- Tighten the recovery dialog layout and action area without changing the recovery IPC contract.

## Risks

- Empty-database detection must not delete unreadable or non-empty databases.
- Recovery UI changes must not hide the destructive “start fresh” path or make restore less explicit.

## Rollback

Revert the migration cleanup and dialog layout changes. Existing data remains protected because non-empty legacy databases are still preserved as residual failures.
