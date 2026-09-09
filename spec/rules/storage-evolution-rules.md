# Storage Evolution Rules

These rules apply whenever PromptHub adds or changes durable data, a filesystem
layout, SQLite/D1/server schema, renderer persistence, export/backup format,
sync protocol, recovery behavior, or cloud object lifecycle.

## Durable Ownership

- Every persistent value must have one declared authority, owner, physical
  class, retention policy, reload behavior, migration path, rollback behavior,
  and verification layer before implementation.
- PromptHub-owned local user assets must have a versioned canonical
  representation below `data/`. The local SQLite catalog, renderer storage,
  cache, external Agent projection, and adjacent backup file must not be their
  only copy.
- Local SQLite may authoritatively own only explicitly classified operational
  state. Server authentication, tenancy, leases, and remote service state remain
  database-authoritative in their server product boundary.
- Non-secret device/application configuration belongs under the classified
  `config/` owner. Secrets belong in an OS facility or encrypted device-bound
  vault. Cache, logs, recovery artifacts, and portable exports are not user
  asset domains.

## Adding A Feature Or Asset Domain

Before a new durable domain writes production data, its authoritative topic must
define:

1. stable resource identity and ownership;
2. canonical `data/<domain>/` bundle or explicit server-authoritative exception;
3. domain schema version and user-visible revision behavior;
4. referenced media/object behavior and deletion semantics;
5. local catalog/search projection and rebuild behavior;
6. portable backup/export/sync inclusion and secret policy;
7. retention, cleanup, import, restore, and downgrade behavior;
8. old/current/newer fixtures, failure injection, restart, security, and
   performance verification.

A new domain must not require moving unrelated domains or bumping the root
layout epoch unless the root topology itself changes.

## Version Axes

The following versions are independent and must not be inferred from the
application version:

- local root `layoutEpoch`;
- per-domain resource `schemaVersion`;
- user resource `revision`;
- local catalog/database schema version;
- portable export/backup envelope version;
- remote sync/API protocol version;
- server database migration version;
- object/encryption envelope version.

Historical converter entries and committed database migrations are immutable.
Corrections receive a new ordered identifier and checksum.

## Compatibility And Publication

- A process binds one complete root and layout epoch before opening storage. It
  must not mix independently selected legacy and canonical domain paths.
- Supported older resources use ordered converters. Additive readers preserve
  unknown fields. Unknown newer resources fail closed or open read-only and are
  never rewritten by an older client.
- Layout, schema, restore, and authority changes use staging, bounded capacity
  preflight, integrity verification, durable journal/state markers, atomic
  publication, reopen verification, and a tested rollback path.
- Existing authority remains active until a shadow rebuild proves stable IDs,
  counts, hashes, versions, relations, and media references match.
- After local file-first authority is active, every production mutation of a
  user-owned domain must publish its canonical bundle/object state through the
  domain coordinator. SQLite-only writes are permitted only for explicitly
  classified catalog, compatibility, server-authoritative, or operational rows.
- Migration code must be idempotent and restartable. It must never call an
  empty target directory or partially populated database a completed upgrade.

## Version History, Safety, Backup, And Recovery

- Domain version history records user/domain changes.
- Ephemeral rollback material exists only for one in-flight atomic projection
  and is deleted after verification.
- Managed safety points protect destructive local operations and live only
  under the bounded recovery registry.
- Portable snapshots and official cloud backups are explicit recovery/export
  artifacts, not domain history or live SaaS workspaces.
- Provider disaster-recovery copies are operational infrastructure and are not
  exposed as user versions.
- New code must not create adjacent `.backup-*`, `.pre-recovery-*`, timestamped
  database siblings, or per-Agent backup trees. Count, age, and byte retention
  limits are mandatory for managed recovery artifacts.

## Cloud Boundaries

- Official backup preserves local authority and publishes immutable encrypted
  manifests/objects through a staged idempotent protocol.
- Official SaaS is server-authoritative and uses tenant/workspace-scoped
  relational records plus object storage. Browser cache and uploaded backup
  archives are not live SaaS authority.
- Backup and SaaS use separate tables/object namespaces, service identities,
  APIs, quotas, retention, and deletion jobs even when infrastructure is shared.
- Connecting a local workspace to SaaS is an explicit authority transition with
  revisions, cursors, tombstones, offline retry, device revocation, conflict
  handling, export, and disconnect behavior.

## Performance And Verification

- Inventory, conversion, rebuild, snapshot, import, and restore must stream or
  batch work in `O(E + B)` over visited entries and bytes, with bounded memory,
  traversal, concurrency, retry, queue, and output.
- Tests must cover real historical fixtures, empty/current/newer states,
  malformed input, Unicode, traversal and symlink attacks, low disk, large
  inventories, concurrent access, interruption at every publication boundary,
  restart, rollback, cleanup, and unknown newer versions.
- A local authority change is not complete until deleting/staging a rebuild of
  the catalog from canonical files reproduces all user-owned assets, versions,
  relations, and media references.
- A cloud storage change is not complete without tenant-isolation, idempotency,
  quota, corruption, migration, object cleanup, and restore-drill evidence.

## Documentation Gate

Follow [document-routing-rules.md](document-routing-rules.md) for scope and ownership. Record target topology, unshipped migration status, compatibility, verification, and upgrade/rollback instructions in the affected topic before release. A separate ADR is needed only for a material independent decision. Confirmed requirements update immediately; clearly distinguish verified behavior from pending implementation.
