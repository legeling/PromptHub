# ADR-20260811-001: Storage Authority And Evolution

## Status

The local universal file-first / SQLite-projection decision is superseded for the
new client target by [FR-FOUNDATION-003](../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants)
on 2026-09-15. The sections below record the prior decision and existing data
layout, not instructions to add more canonical copies. Implementation of the
replacement remains pending. Unrelated cloud decisions are unchanged.

Accepted on 2026-08-11 and implemented locally on 2026-08-12. File-first local
authority is active through the guarded startup migration; official backup and
SaaS portions remain gated by their child changes and verification evidence.

## Context

PromptHub has published multiple local-first versions while durable state has
accumulated across SQLite, domain files, renderer storage, settings files,
external Agent directories, scattered rollback copies, portable snapshots, and
remote sync stores. Future products add an official encrypted backup provider
and a server-authoritative SaaS workspace. Treating all of these stores as
equivalent authorities would continue upgrade data loss, mixed layouts,
unbounded backup files, and ambiguous local/cloud overwrite behavior.

The architecture must preserve historical users while allowing new asset
families, accounts, paid backup, SaaS, and later multi-device connection without
redesigning storage ownership for every feature.

## Decision

PromptHub adopts one logical resource model with product-specific physical
authority:

1. Desktop and local CLI use versioned canonical files under `data/` for all
   PromptHub-owned user assets. Local SQLite is a rebuildable catalog/search
   projection plus explicitly classified operational state.
2. Renderer LocalStorage, IndexedDB, SessionStorage, cache, and external Agent
   projections are not authoritative user-asset stores.
3. Non-secret configuration, device-bound secrets, managed recovery artifacts,
   cache, and logs have separate owners outside the canonical asset domains.
4. Official cloud backup preserves local authority and stores immutable,
   client-side encrypted recovery manifests and objects. It is not live SaaS
   data.
5. Official SaaS is server-authoritative, tenant/workspace scoped, normalized
   relational data plus object storage. The first release is a tenant-ready
   personal workspace with explicit import/export.
6. A later connected Desktop workspace explicitly changes that workspace to
   SaaS authority and keeps an identified local checkout using revisions,
   cursors, tombstones, offline retry, and conflict handling.
7. Backup-to-SaaS conversion is an explicit staged import. Uploading a backup
   never mutates a live workspace.
8. Root layout, domain schemas, user revisions, local catalog, portable
   envelope, sync/API protocol, server migrations, and encryption envelope have
   independent versions and converter/migration registries.
9. Domain version history, ephemeral rollback, managed safety points, portable
   snapshots, user cloud backups, recovery candidates, and provider disaster
   recovery are distinct artifacts with distinct retention.

The existing `data/prompthub.db` path remains the target local catalog path to
avoid a migration with no user value. New durable domains normally register
`data/<domain>/` bundles without moving existing domains or changing the root
layout epoch.

## Alternatives

| Option                                                          | Benefits                                                                   | Costs/Risks                                                                                                           | Decision |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| SQLite is the only local authority                              | Simple transactions                                                        | Files, external projections, backup, and browser state remain incomplete; user data is opaque and migration-sensitive | Rejected |
| Every store uses last-write-wins                                | Minimal initial conversion work                                            | No deterministic authority, silent overwrite, mixed versions, and unsafe multi-device behavior                        | Rejected |
| One mutable cloud snapshot powers backup and SaaS               | One remote payload shape                                                   | `O(total workspace)` rewrites, weak tenancy/concurrency/search, and backup mutation                                   | Rejected |
| File-first local authority plus separate backup and SaaS planes | Explicit ownership, rebuildability, portability, and incremental evolution | Requires staged historical migration, converter registries, and stronger tests                                        | Accepted |

## Consequences

- Positive: `data/` becomes a complete, portable durable asset boundary rather
  than a partial projection.
- Positive: new features can add a versioned domain without whole-root or
  whole-account snapshot rewrites.
- Positive: local backup, SaaS live data, domain versions, and operational DR no
  longer share misleading semantics.
- Cost: historical SQLite-only and renderer-only fields require one-time
  extraction, canonical bundle conversion, shadow rebuild, and comparison at
  the guarded authority transition.
- Negative: official backup and SaaS require separate storage/API/lifecycle
  implementations even when they share accounts and infrastructure.
- Compatibility/migration: one process binds one complete legacy or canonical
  layout epoch. Migration stages new files/catalog, verifies stable IDs, hashes,
  versions, relations, and media, then publishes atomically while retaining one
  bounded safety point.
- Verification: historical-version fixtures, catalog rebuild, browser-clear,
  unknown-newer, low-disk, interruption, rollback, tenant-isolation, backup
  corruption, and restore-drill evidence are mandatory before release claims.

## Links

- Requirements:
  `spec/changes/active/database-migration-safety/specs/data-storage/spec.md`
- Requirements:
  `spec/changes/archive/2026/08/2026-08-18-official-cloud-backup-and-saas-platform/specs/`
- Change: `spec/changes/active/database-migration-safety/`
- Change: `spec/changes/archive/2026/08/2026-08-18-official-cloud-backup-and-saas-platform/`
- Rule: `spec/rules/storage-evolution-rules.md`
- Issue: none
- Supersedes / superseded by: refines the target beyond
  `spec/knowledge/structure/data-layout-v0.5.5-zh.md`; that stable document now
  records the converged local behavior.
