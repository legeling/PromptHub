# Accepted foundation requirements

<!-- traceability: enforced -->

Status: accepted by the user on 2026-09-05; implementation in progress. This requirement set is authoritative for the foundation redesign.

## `FR-FOUNDATION-001`: One command boundary and local storage owner

All supported Desktop and local CLI resource reads/writes pass through the
same Core domain contracts and one owner for a bound root. No production caller
bypasses the shared mutation contract or combines arbitrary raw SQL with
file publication. Web/SaaS use the same domain policies with server transactions and
isolated roots. Owner acquisition, peer authentication, crash recovery and
shutdown are explicit and bounded.

## `FR-FOUNDATION-002`: Durable operation outcomes

Structured mutations commit through one SQLite transaction. Commands that change
actual files publish a complete file set and matching database references using
the existing recovery boundary. Failure must not leave an acknowledged partial
result. Cleanup failures cannot reverse an already durable commit. Uncertain
outcomes are resolved before repeating a destructive operation.

## `FR-FOUNDATION-003`: Data ownership and invariants

Confirmed 2026-09-15: the client has exactly two persistence mechanisms:
**SQLite and the filesystem**. Simplicity applies to the overall data model,
not just migration. Each business fact has one authoritative representation.

- SQLite owns structured business records, relationships, user annotations,
  version metadata and application settings. Related record changes use ordinary
  SQL transactions. Keep domain tables and necessary constraints; do not replace
  them with a universal JSON/EAV table to reduce the table count.
- The filesystem owns actual package files, attachments, images, videos and
  required historical file contents. SQLite stores their identities/references.
  A file's content must not be another independently writable database value.
- Do not mirror ordinary business rows into a second canonical JSON database or
  maintain parallel writable workspace copies. Required external tool files and
  export/backup formats are outputs or explicit import sources, not additional
  business authorities. Package-native metadata needs one declared edit/import
  boundary; it must not silently compete with SQLite.
- IndexedDB, LocalStorage and renderer persistence must not durably own business
  data or settings. Memory state is transient; essential settings survive normal
  database reopen. Secret material remains protected and is never copied into
  plaintext settings during this transition.
- Backups preserve the SQLite database and referenced files consistently; they
  are recovery copies, not another live store. The business database is no longer
  considered disposable merely because a file catalog can be rebuilt.

This replaces the previous requirement to store every user asset in canonical
files and treat SQLite as only a projection. Implementation is pending: existing
files, settings and database-only fields must be preserved until the explicit
conversion and normal read/write/reopen verification succeed. The confirmed
0.6.0 baseline must describe this selected model, not freeze the previous one.

The implementation inventory for this boundary is maintained in
[client storage ownership](../../storage-inventory.md), including mixed-purpose
columns that must be preserved before any catalog rebuild or legacy cleanup.
Inventory completion does not mean the migration has been implemented.

## `FR-FOUNDATION-004`: Readiness and coherent UI state

Runtime mutation capability depends on validated root ownership, recovered
journals, successful versioned migration and supported current schema. Readiness failures are not
silently converted into an empty writable workspace. Resource queries and events
carry revisions; list/detail/cache state invalidates consistently. Stale async
results cannot overwrite newer reads. Recoverable source data remains intact when upgrade fails. An old backend,
empty replacement or timer cannot turn a failed upgrade into business readiness.

## `FR-FOUNDATION-005`: Immutable backup and causal sync

A failed backup publication leaves the previous committed snapshot readable.
Unchanged semantic content does not change its digest because time advanced.
Live synchronization uses a common base, revisions, deletion records and
conditional publication. Concurrent conflicting changes preserve both sides
and require resolution; timestamps do not decide authority. Providers without
verified conditional publication support expose backup-only capabilities.

## `FR-FOUNDATION-006`: Server concurrency and input validation

Online CRUD does not replace a whole mutable account snapshot. Writes validate
the complete input and use expected revisions plus request identity. A stale
write returns a conflict without losing acknowledged updates. Unknown newer
schemas and malformed arrays fail before mutation; empty replacement must be
an explicit validated operation, not a parser default.

## `FR-FOUNDATION-007`: Long-running job identity

Jobs use persistent job/attempt identity and explicit terminal transitions.
Cancelling or retrying fences previous attempts; late results cannot update the
new attempt. Saving an asset and deploying it externally are separate outcomes.
External file deployment compares the observed base digest and never silently
overwrites divergent user content.

## `FR-FOUNDATION-008`: Migration and measurable acceptance

Migrations stage and compare old/new IDs, versions, relationships, content and
media hashes before switching. They preserve an explicit rollback path and
test interruption/restart at every durable boundary. Initial conversion is
O(entries + bytes) with bounded batches; ordinary mutations operate on the
affected set. Release evidence covers historical fixtures, two-process access,
two starts, partial failures, input validation, restore drills and interaction
performance. Coverage counts alone do not establish these properties.

### Client migration baseline: 0.6.0

Confirmed on 2026-09-15 and reinforced on 2026-09-24; implementation and upgrade acceptance are pending.
The client data migration baseline is **0.6.0**. This names the target release
contract, not a claim that every existing 0.6.0 beta profile already satisfies
it. The baseline must be frozen against an exact release commit, schema and
migration artifacts, domain formats, root layout and configuration ownership.
Application version, SQLite migration ID and domain schema versions remain
independent; do not reset existing database history to version 1.

Implementation must stay simple (confirmed 2026-09-15): reuse the current single
SQLite database, actual package/media files and necessary recovery facilities.
Use one explicit startup upgrade entrypoint with an ordered list of migration
functions and the existing history table. Add only changes needed for confirmed
schema/data inconsistencies and safe upgrade. Do not introduce a general
migration platform, pluggable strategies, parallel compatibility writers or a
new cross-process architecture as a prerequisite for baseline adoption. Preserve
existing data and unresolved fields until their conversion is verified; the
inventory is an audit checklist, not a requirement to redesign every table.

- Inventory published stable and beta source states before freezing the target.
  Distinguish fresh installs from profiles upgraded through previous releases;
  a tag or `user_version` alone does not identify the complete stored state.
- Existing profiles enter through one adoption boundary: inspect without
  mutation, classify a recognized source, create/reuse the managed safety
  point, convert when needed, verify the target, then record adoption. An
  already-conforming profile needs validation and registration, not invented
  historical execution records. Preserve existing migration history/checksums.
- Conversion must cover SQLite, canonical resource packages and versions,
  related media, root layout, configuration and device-bound secrets according
  to their existing owners. Absence of the DB alone does not mean a new profile.
  Partial migrations and unresolved source conflicts are not completed adoption.
- Migration is the only layer that understands historical data layouts.
  Normal services, repositories, IPC and renderer code read/write the single
  current contract. Remove old-field aliases, legacy storage modes, read-time
  conversion and old-path fallback from these business paths in the same
  delivery that introduces the verified conversion. Keep historical migration
  steps for users who skip versions; do not keep historical business code.
  Current business paths have no compatibility or downgrade implementation.
  Releases with data changes append their own ordered migration; releases with
  no data change need no empty migration.
- No normal business access is enabled until required migration succeeds.
  Failure preserves the recoverable source and reports an upgrade failure,
  never switching to an old implementation or creating an empty replacement.
  Restore/import of historical data uses the same conversion boundary. Changes
  to file-backed data participate in the upgrade where needed, rather than
  leaving filesystem compatibility branches in normal code.
- Subsequent changes add immutable, ordered executable migrations, with checksums
  bound to the shipped migration artifacts. Reuse the existing history and
  recovery facilities; append the next unused identifier rather than rewriting
  the already-issued 1–3 history. File publication must recover independently
  of SQLite transactions and complete before normal writes are enabled.
- Acceptance first proves real old-profile to baseline upgrade, normal resource
  read/edit/save and reopen, then direct skipped-release upgrades and repeated
  starts. Compare IDs, content, history, relationships, package inventories and
  media hashes. Follow with malformed/future states, checksum drift, interruption
  and restore cases. Fixtures need pinned source provenance and must include both
  0.6.0 betas. Synthetic reduced schemas are supporting cases, not proof of full
  historical-client compatibility.

Current evidence, implementation gaps and fixture selection are recorded in
[the migration inventory](../../design.md#client-060-migration-inventory).
