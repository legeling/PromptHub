# Data Storage And Database Migration Safety Proposal

## Phase And Status

- Phase: converge
- Status: local storage authority and compatibility implementation complete;
  final automated gates, submission, and archive pending
- Decision date: 2026-08-11
- Primary requirements: `FR-DATA-001` through `FR-DATA-013` and
  `FR-DBMIG-001` through `FR-DBMIG-009`
- Related issues: #89, #97, #98
- Related changes: `legacy-upgrade-recovery-audit`,
  `mcp-version-history-and-projection-safety`,
  `desktop-image-generation-workbench`, `web-sync-contract-completion`,
  `agent-management-workbench`, and `git-backup-transports`
- Owners: `packages/db`, `packages/core`, `apps/desktop/src/main`, and the
  Desktop/CLI/self-hosted Web storage boundary
- Exit condition: each process binds one explicit data root and layout epoch;
  local user-owned durable state has versioned canonical files; local SQLite is
  rebuildable as a catalog/index except for explicitly classified operational
  state; renderer storage is disposable;
  migrations and restores publish only verified complete state; database
  compatibility is ordered and atomic; backup-like artifacts have one named
  purpose, bounded retention, and a tested recovery contract.

## Why

The current problem is broader than the historical database incidents. PromptHub
has several individually useful persistence mechanisms, but they do not yet form
one storage system:

- runtime-path helpers independently choose current or legacy paths per domain,
  so one process can read a new database while still writing legacy Skills,
  Prompts, or media directories;
- Desktop duplicates Core runtime-path logic, while self-hosted Web has a
  different multi-user topology that stable documentation currently describes
  as if it were the same physical layout;
- data-root switch/migrate/overwrite copies top-level entries directly and then
  publishes a pointer without a staged inventory, capacity proof, consistent
  database image, complete verification, or crash journal;
- upgrade snapshots, integrity copies, recovery copies, Agent configuration
  backups, and MCP projection sidecars use different locations, retention, and
  recovery semantics;
- portable export and restore span SQLite, filesystem assets, renderer stores,
  and native services without one point-in-time snapshot or cross-domain commit;
- Prompt workspace files omit relational and operational fields, so the local
  database cannot currently be reconstructed without loss from the filesystem;
- settings are merged across renderer LocalStorage, SQLite, and
  `config/ai-models.json`, while renderer persistence includes credentials and
  other state that is not safe to treat as a browser cache;
- browser persistence also owns custom marketplace sources, device identities,
  Prompt variable history, and recovery paths, so clearing browser data can
  currently lose product state even though stable documentation calls it
  internal runtime data;
- the shared SQLite initializer mixes schema creation, inferred migrations,
  integrity work, backups, and host-specific reconciliation in one function.

The result is a source-of-truth problem, not merely an untidy directory problem.
Version history, temporary rollback material, upgrade safety points, portable
backups, and recovery candidates are currently easy to confuse even though they
have different ownership and lifecycle rules.

## Scope

### Storage And Filesystem

- Define a canonical storage catalog for relational truth, file truth,
  projections, device configuration, secrets, cache, logs, safety points,
  portable snapshots, and recovery candidates.
- Define the local three-tier authority contract: versioned files are canonical
  for user-owned durable domains, SQLite is a rebuildable catalog/index plus
  explicitly classified operational state, and renderer storage is bounded
  cache or session state only.
- Add versioned file bundles/manifests for local domain state that exists only in
  SQLite today, including Prompt relations/output formats and PromptHub-owned
  Agent conversation metadata. A database rebuild must preserve domain
  invariants before authority can move.
- Migrate current durable renderer state into main/Core-owned configuration or
  domain files, and move credentials into a device-bound secret store before
  browser data is excluded from recovery.
- Resolve one active root and one layout epoch before any durable domain path is
  returned. Legacy compatibility remains explicit at the root/layout boundary,
  not an independent fallback in every getter.
- Make data-root switch, migrate, and overwrite a staged state machine with a
  bounded inventory, capacity check, symlink/unknown-file policy, SQLite-aware
  verification, atomic pointer publication, and restart recovery.
- Replace broad whole-home copying with an allowlisted, SQLite-consistent safety
  point and a clear secret/config policy.
- Make cross-domain restore journaled and publish-only-after-verification even
  though SQLite and the filesystem cannot share one native transaction.
- Make portable export/sync point-in-time consistent, scope-aware, streaming,
  versioned, and bounded in memory and traversal.
- Centralize and bound recovery artifacts. Domain changes continue to own their
  version models, while this change owns storage classes and lifecycle policy.
- Document the distinct Desktop/CLI local root, self-hosted Web multi-user root,
  mobile SQLite, and Cloudflare D1 topologies without claiming identical paths.

### Shared SQLite

- Introduce an immutable, ordered migration manifest in `packages/db` for
  Desktop, CLI, and self-hosted Web.
- Add an explicit schema compatibility version and checksummed committed history.
- Make each database migration fail closed and atomic; a caught error must never
  become a successful partial commit.
- Separate host-neutral schema/data migrations from Desktop filesystem
  reconciliation such as Skill repository discovery.
- Coordinate data-layout migration, shared SQLite migration, Desktop host
  reconciliation, legacy IndexedDB import, and upgrade safety points as explicit
  retryable stages.
- Reject unsupported newer schemas without modifying the database or lowering
  the last-seen application version.
- Build a real fixture and failure-injection matrix for fresh, current, legacy,
  partial, corrupt, busy, newer, low-disk, and historical tagged states.

## Ownership Boundaries

- `packages/db` owns SQLite schema, manifest, transactions, integrity checks,
  database snapshot primitives, and rebuildable local projections. It does not
  become the owner of canonical local content merely because it indexes it.
- `packages/core` owns canonical runtime-path contracts and shared portable
  snapshot orchestration, versioned local bundle contracts, and import/rebuild
  workflows; it does not own Electron-specific filesystem actions.
- Desktop main owns native root selection, maintenance mode, filesystem staging,
  pointer publication, restart recovery, canonical local settings, and the
  device-bound secret boundary. Renderer stores may keep only disposable state.
- Self-hosted Web owns its multi-user physical layout while conforming to shared
  logical snapshot and storage-class contracts.
- `mcp-version-history-and-projection-safety` owns MCP domain history and removal
  of adjacent projection sidecars.
- `desktop-image-generation-workbench` owns `data/generations`; this change only
  classifies it as durable local data and includes it in the safety policy.
- `agent-management-workbench` owns Agent profile/config behavior; this change
  defines where and how its rollback artifacts and secrets may be retained.
- `git-backup-transports` owns GitHub/Gitee transport, not snapshot consistency,
  restore atomicity, or local storage layout.

## Decision Gate

The three material conflicts are resolved as follows:

1. `[confirmed 2026-08-11] Layout compatibility`: stable v0.5.5 documentation promises
   per-domain dual-read fallbacks until v0.7, while the current version is 0.6.0.
   The approved compatible transition is to detect the legacy layout once,
   bind the process to that complete layout epoch, and migrate to the canonical
   epoch through staging. It preserves legacy readability without allowing a
   mixed new/legacy process.
2. `[confirmed 2026-08-11] Secret safety policy`: same-device safety points include only
   encrypted, device-bound credential blobs; portable export/sync should exclude
   secrets by default and report required reauthentication. Existing plaintext
   API keys in `config/ai-models.json` must move to the secret store or be
   redacted before config can join portable snapshots.
3. `[confirmed 2026-08-10] Local persistence authority`: current stable
   documentation and code
   treat SQLite as authoritative for several local domains and use filesystem
   workspaces as incomplete projections. The recommended target is file-first
   for local user-owned durable data, rebuildable SQLite for catalog/search and
   explicitly classified operational state, and disposable renderer storage.
   Self-hosted server authentication, refresh tokens, concurrency leases, and
   remote service state remain database-authoritative exceptions rather than
   being forced into user-editable files.

The decisions no longer block implementation. Production authority changes only
through the implemented startup coordinator after canonical schemas, historical
fixtures, shadow rebuild, renderer migration, restart, failure injection, and
rollback gates pass; active user data is never rewritten in place without a
verified stage and bounded safety point.

## Deferred And Non-Goals

- Expo mobile SQLite and Cloudflare D1 remain separate physical migration
  domains. Shared envelope/version principles may be reused, but this change
  does not merge their manifests with the local SQLite manifest.
- This change does not add new remote transports, live multi-device merge,
  collaboration, signing, or mobile distribution.
- It does not replace Prompt, Skill, MCP, Plugin, Rule, or generation domain
  version history with filesystem backups.
- It does not silently delete unknown files, follow symlinks, or scan outside an
  explicit root. Existing durable renderer state must be migrated and verified
  before Electron browser/runtime directories become disposable and excluded.
- Stable knowledge documents are not rewritten as shipped truth until the
  implementation and migration evidence converge.

## Capacity And Cost

- A root inventory with `E` entries and `B` durable bytes costs `O(E + B)` time,
  bounded traversal depth/entry count, and bounded streaming memory.
- SQLite migration planning is `O(M)` in registered migrations. A migration over
  `N` rows must remain `O(N)` or `O(N log N)` when indexed ordering is required.
- Rebuilding a local catalog from `E` canonical manifest entries and `B` bytes is
  `O(E + B)` with bounded parsing, hashing, and batched SQLite transactions. It
  must not load the full library or every media payload into memory.
- Safety-point and restore staging require `O(B)` temporary disk. Capacity is
  checked before the first durable mutation; low capacity fails closed.
- Export compresses and hashes incrementally. It may not materialize all media
  or the complete archive in renderer memory.
- Leadership waits, retries, directory scans, recovery candidates, and artifact
  retention are finite. No feature may create an unbounded timestamped sibling
  or backup tree.

## Failure And Rollback Model

- The source root remains untouched until a staged target fully verifies and the
  boot pointer is atomically published.
- A filesystem layout and SQLite cannot share one transaction, so a durable
  operation journal records `prepared`, `swapping`, and `committed`; startup
  resolves an incomplete journal before opening application services.
- A destructive upgrade creates or reuses one managed safety point with a stable
  run identity. Later stages do not create another snapshot for that run.
- Restore swaps only verified staged entries. A failure before publication keeps
  the active state unchanged; a crash during publication is resolved from the
  journal and prior entry set.
- Migration leadership has a finite timeout and never deletes a live or unknown
  owner merely because another client wants to upgrade.

## Related Stable Records

- `spec/knowledge/structure/storage-architecture.md`
- `spec/knowledge/behavior/database-concurrency.md`
- `spec/knowledge/behavior/data-recovery.md`
- `spec/knowledge/behavior/sync.md`
