# Data Recovery Delta

## Modified Requirements

### Requirement: Current residual recovery must not fail on empty legacy DB placeholders

When current-directory residual recovery reruns data-layout migration and the only remaining root database is an empty legacy `prompthub.db`, the system must remove that placeholder and continue recovery.

#### Scenario: Skills residual with empty root database

- Given the current data directory contains a migration marker, legacy `skills/` data, and a root `prompthub.db` with no prompts, folders, or skills
- And the unified `data/prompthub.db` already exists
- When recovery retries migration
- Then Skill files are migrated into `data/skills`
- And the empty root database does not cause `Remaining entries: prompthub.db`

#### Scenario: Non-empty root database conflict

- Given the current data directory contains both root `prompthub.db` and `data/prompthub.db`
- And the root database contains prompts, folders, or skills
- When migration retries
- Then the root database is preserved as `prompthub.db.legacy-conflict-*.db`
- And the migration completes without reporting `Remaining entries: prompthub.db`

### Requirement: Runtime database selection must not let residual root databases win

When both root `prompthub.db` and unified `data/prompthub.db` exist, the desktop runtime must use `data/prompthub.db` as the active database. The root database is legacy residual data and must be handled by layout migration or preserved as a conflict backup.

#### Scenario: Partial marker with root residual

- Given a previous layout migration marker recorded `failedEntries: ["prompthub.db"]`
- And both root `prompthub.db` and `data/prompthub.db` exist
- When the desktop initializes the database path
- Then it uses `data/prompthub.db`
- And the root residual does not create a new active database lock

### Requirement: Upgrade snapshots must ignore Electron runtime singleton entries

When Electron has created top-level runtime singleton links in `userData`, upgrade snapshot creation must skip `SingletonCookie`, `SingletonLock`, and `SingletonSocket`. User-data symlinks outside the runtime singleton names must still be rejected.

#### Scenario: Startup layout retry while Electron singleton links exist

- Given Electron has created `SingletonLock` or `SingletonSocket` in the user data root
- And layout migration needs a safety snapshot before moving root `prompthub.db`
- When the migration creates its snapshot
- Then singleton links are ignored
- And the migration can preserve the root database conflict and complete

### Requirement: Recovery UI must not present zero database size as recovered database content

When a recovery candidate has `dbSizeBytes` equal to zero, the dialog must show a clear no-effective-database status instead of displaying `Database size: 0 B` / `数据库大小：0 B`.
