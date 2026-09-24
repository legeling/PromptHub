# Foundation integrity redesign

Status: accepted by the user on 2026-09-05; implementation in progress. Live-data migration and release require the specified verification gates.

The 2026-09-05 foundation audit reproduced partial canonical publication, DB/file
rollback divergence, invalid remote snapshots, lost concurrent Worker updates,
and stale renderer detail state. This change proposes a common integrity
boundary for those problems. Audit evidence remains under
`spec/issues/active/foundation-audit-20260905/`.

The current local data direction is defined by FR-FOUNDATION-003: SQLite owns
structured business records/settings; the filesystem owns actual files.
The previous file-first/canonical catalog requirement is superseded for the
client target. Conversion is pending; existing data remains protected. Server
storage and remote protocol changes retain their separate scope.

Scope: local writer ownership, domain commits, DB invariants, startup/readiness,
renderer revision invalidation, remote snapshots/sync, Worker record storage,
long-running attempts, migration and verification gates. Non-goals: rewriting
all UI, adopting microservices, CRDTs for all content, replacing the WASM driver
without evidence, or changing production data in the design phase.

Authoritative accepted requirements: `specs/foundation/spec.md`.
Recommended implementation approach: `design.md`.
Execution sequence and verification: `tasks.md`.
Actual delivery status: `implementation.md`.

Implementation follows the versioned data-migration boundary in the requirements.
Normal business code has one current contract with no old backend, old-field or
downgrade branch. Migration and corresponding runtime removal ship together;
server protocol work remains a separate scope.
