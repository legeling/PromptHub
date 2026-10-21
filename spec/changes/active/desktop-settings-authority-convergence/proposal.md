# Desktop Settings Authority Convergence

## Phase And Status

- Phase: plan
- Status: in-progress
- Primary requirement: `FR-CONFIG-001`
- Exit condition: all Desktop settings use canonical config as their sole
  durable authority, legacy DB/renderer precedence is retired, destructive
  rebuild and restart fixtures pass, and stable knowledge is converged.

## Why

PromptHub already publishes versioned renderer settings below `config/`, but
normal behavior still spans canonical files, the SQLite `settings` table,
Zustand/LocalStorage, and main-process memory. The remembered-close defect
proved that a successful UI action can fail to become the next startup value.
Database rebuild and renderer cleanup expose the same ownership gap across the
larger settings inventory.

The product decision is that explicit settings and user preferences are
durable configuration. They must survive local database reconstruction and
must not depend on browser storage.

## Scope

- In scope:
  - inventory and classify every Desktop setting by owner, durability, device
    or portable scope, secret policy, backup policy, and reload behavior;
  - make versioned `config/` documents the sole durable Desktop authority;
  - introduce one typed main/Core configuration service and atomic patch path;
  - initialize main and renderer from one committed snapshot;
  - migrate and then retire SQLite/LocalStorage authority and dual writes;
  - align backup, restore, database rebuild, diagnostics, and tests.
- Out of scope:
  - changing authenticated Web/SaaS `user_settings` ownership;
  - automatically syncing every device preference across machines;
  - moving Prompt, Skill, Rule, MCP, Plugin, generation, or media domain assets;
  - redesigning the Settings UI.

## Risks

- Removing legacy reads too early can reset historical users to defaults.
- Whole-document writes can lose concurrent patches without serialized merge
  and revision checks.
- Portable backup can leak device paths or secrets unless scope is allowlisted.
- A partial multi-document write can expose incompatible app/provider/sync
  configuration without staging and rollback.

## Rollback Thinking

Canonical publication remains behind a durable migration marker. Until restart
and rebuild verification passes, legacy sources remain read-only recovery
candidates and the previous canonical snapshot remains the rollback target.
Rollback must never reactivate newer-wins dual authority.

## Related Records

- ADR: `spec/adr/ADR-20260820-001-desktop-settings-authority.md`
- Parent ADR: `spec/adr/ADR-20260811-001-storage-authority-and-evolution.md`
- Stable structure: `spec/knowledge/structure/storage-architecture.md`
- Related fix: `spec/changes/active/desktop-close-choice-persistence/`
