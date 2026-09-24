# Design

<!-- traceability: enforced -->

## Semantic Model

The change separates four concepts that currently overlap:

| Concept                   | Owner                         | Durable             | Meaning                                          |
| ------------------------- | ----------------------------- | ------------------- | ------------------------------------------------ |
| My MCP current record     | PromptHub `data/mcp`          | Yes                 | Current normalized server definition             |
| My MCP version            | PromptHub `data/mcp/versions` | Yes                 | Immutable history of one server definition       |
| Agent/project target file | Agent or project              | Yes                 | Native projection plus unrelated native settings |
| Write recovery state      | Core mutation coordinator     | No after completion | Temporary atomic-write and reconciliation state  |

`McpLibraryFile.version` remains a schema discriminator. It must never be shown
or documented as an MCP server history version.

## `DES-MCPVER-001`: File-Based Version Store

Keep `packages/core` as the owner because My MCP is already a filesystem-backed
shared Core workflow used by Desktop and CLI. Do not introduce an MCP-only
SQLite migration or duplicate React state.

Proposed layout:

```text
<userData>/data/mcp/
├── library.json
├── versions/
│   └── <sha256(server-id)>/
│       ├── index.json
│       ├── v000001.json
│       └── v000002.json
└── transactions/
    └── <operation-id>.json   # transient metadata only
```

- `index.json` stores server id, `nextVersion`, current version, immutable
  snapshot digests, notes, timestamps, and snapshot filenames.
- Each `vNNNNNN.json` stores one normalized `McpServerVersionSnapshot` and is
  written once through atomic rename.
- File and directory names never contain an untrusted server name or path.
- Snapshot payloads exclude presentation-only `isFavorite`, `tags`, `notes`,
  `createdAt`, and `updatedAt`; those remain current library metadata.
- Versioned fields include transport/configuration, enabled state, source
  provenance, installed baseline, and all values required to recreate the
  normalized server definition.
- Literal credential-bearing data follows the same local storage and
  export/sync policy as the existing MCP library. Version deletion is the
  explicit way to remove obsolete historical credentials.

This layout makes version detail I/O `O(S)` for snapshot size `S`, avoids
rewriting all servers' history, and lets list APIs read only a bounded index
page. A typical mutation writes one snapshot, one small index, and the library.

## `DES-MCPVER-002`: Automatic Version Policy

Define a canonical semantic snapshot and SHA-256 digest in a pure shared/Core
helper. Mutation orchestration compares digests before allocating a version.

- Create, market install, source import: create `v1`.
- Configuration edit, enable/disable, accepted source update, or external entry
  import: create exactly one next version after validation.
- Favorite, personal tags, personal notes, timestamps, binding changes, target
  apply/remove, and byte-identical normalized saves: no version.
- Manual snapshot is allowed but must reject a duplicate unless the user adds a
  distinct note-only checkpoint; note-only checkpoints reference the existing
  snapshot digest rather than duplicate payload bytes.
- Restore never rewinds history. It creates a new version from the selected
  snapshot and records `restoredFromVersion`.
- Version numbers increase monotonically and are never reused.

## `DES-MCPVER-003`: Mutation Coordinator And Recovery

My MCP mutation spans the current library, version index, and snapshot file.
Use one Core coordinator instead of scattering writes across IPC, CLI, and UI.

1. Read and validate current library and per-server index.
2. Normalize the candidate and stop on a semantic no-op.
3. Write a metadata-only transaction marker containing operation id, server id,
   old/new version numbers, expected digests, and affected filenames.
4. Atomically write the immutable snapshot and updated index.
5. Atomically write the current library record with the matching
   `currentVersion` and semantic digest.
6. Re-read and verify library/index/snapshot agreement.
7. Remove the marker and every temporary file.

Recovery reads markers before serving MCP mutations:

- If all expected digests agree, finalize by removing the marker.
- If the library still points at the old version, remove an unreferenced pending
  snapshot/index entry.
- If the library points at the new version and the snapshot is valid, repair the
  index and finalize.
- If neither state verifies, stop MCP writes and expose a recovery error; never
  guess from timestamps.

The marker stores no whole target file and no literal credential payload. Work
is `O(S)` for the affected server, memory is `O(S)`, and no network work occurs.

## `DES-MCPVER-004`: Projection Without Persistent Backup

Refactor `apply`, `removeFromTarget`, `removeNamesFromTarget`, and target-sync
apply through one safe projection primitive:

1. Validate target path, reject unsafe symlinks/path escapes, and read original
   bytes once.
2. Parse once and generate the candidate while preserving unrelated native
   settings.
3. Return without writing when bytes are equal.
4. Write a same-directory temporary file, flush where supported, and atomically
   rename it over the target.
5. Re-read, parse, and verify the selected entry-level projection.
6. Persist binding metadata only after target verification.
7. On any in-process failure after rename, atomically restore the exact original
   bytes held in memory, verify restoration, and clean temporary files.

No persistent target snapshot is written before or after the operation. A hard
process interruption after the target rename leaves a valid native file; the
next reconciliation reports the incomplete binding state and requires an
explicit action.

The optional public `backupPath` field is deprecated and remains `undefined`
during the compatibility window. A later breaking release may remove it from
shared types and CLI output.

## `DES-MCPVER-005`: Entry-Level Conflict Workflow

The three-way inputs are:

- baseline digest recorded at the last successful distribution,
- current My MCP version projection,
- current raw target entry.

The user can choose:

- Import external entry as the next My MCP version.
- Keep current My MCP version and overwrite only the target entry.
- Cancel and leave both sides untouched.

The diff and import operate on the selected MCP entry only. PromptHub never
copies unrelated Agent configuration keys into My MCP history.

## `DES-MCPVER-006`: Legacy Cleanup

Legacy cleanup is a separate maintenance workflow, not migration into version
history.

- Discovery visits only built-in MCP target files, registered project MCP
  targets, and explicit custom targets already known to PromptHub.
- It matches the exact PromptHub legacy suffix and accepts regular files only.
- Preview records path, target path, size, mtime, and a content digest; content
  is not rendered unless explicitly opened through the existing secret-safe
  config viewer.
- Confirmation revalidates realpath, file type, size, mtime, and digest before
  moving a candidate to the platform trash or PromptHub's approved recovery
  boundary.
- No recursive home-directory scan, unbounded concurrency, network call, or
  automatic deletion is allowed.

Complexity is `O(F + B)` for `F` known target locations and `B` selected bytes
hashed during preview/revalidation. Candidate listing and cleanup are paginated
and batch-limited.

## `DES-MCPVER-007`: Empty Credential Placeholder Boundary

Canonical MCP bundles keep normalized definitions and immutable versions below
`data/mcp/<server-id>/`. A literal `env` or header value is classified as:

- non-empty: extract it into the device-bound encrypted secret store and retain
  only its deterministic reference in the bundle;
- empty: keep the key and empty value in the bundle as explicit unconfigured
  state and do not create a vault entry.

Hydration merges referenced secret values into the file-owned empty maps rather
than replacing them. Missing or unreadable non-empty secret references continue
to fail closed for execution and mutation. The renderer inventory uses a
separate redacted read mode: only secret-read failures become the established
`[REDACTED]` sentinel, while bundle/schema/path failures still fail closed. The
migration does not weaken secret-store validation or store plaintext
credentials. Classification and hydration are linear in the number of `env`
and header entries and add no extra file scan.

## Contracts And Ownership

- `packages/shared/types/mcp.ts`: version, mutation, diff, cleanup, and
  deprecated-result contracts.
- `packages/core/src/mcp-library/*`: version storage, normalization, mutation
  coordinator, projection, recovery, and cleanup policy.
- `apps/desktop/src/main/ipc/mcp.ipc.ts`: validated IPC handlers only.
- `apps/desktop/src/preload/api/mcp.ts`: minimum typed bridge.
- `apps/desktop/src/renderer/stores/mcp.store.ts`: derived UI state, not durable
  history ownership.
- MCP UI: version list/detail/diff/restore/delete and legacy cleanup preview.
- CLI: matching version list/show/create/restore/delete and cleanup scan/apply
  commands with summary output by default.
- Backup/sync/export: include version indexes/snapshots and apply existing MCP
  credential redaction/encryption recursively.

## Migration

1. Detect `McpLibraryFile.version === 1`.
2. Validate and normalize the complete library before writing.
3. Iterate servers one at a time, writing verified `v1` snapshots and indexes
   with bounded memory.
4. Write a schema-v2 library containing current-version pointers/digests only
   after every baseline snapshot succeeds.
5. On failure, leave the version-1 library authoritative and remove only
   transaction-owned partial outputs.
6. Do not touch Agent/project targets or legacy sidecars.

Migration time and I/O are `O(N * S)` for `N` servers and average snapshot size
`S`; memory remains `O(S)` by processing one server at a time.

## Verification Plan

| Test ID           | Method                     | Required proof                                                                                                                          |
| ----------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST-MCPVER-001` | Integration + black box    | v1 migration, create/import v1, reload, and exact current-version agreement                                                             |
| `TEST-MCPVER-002` | White box + property cases | Every versioned field changes digest; metadata/no-op paths do not create versions                                                       |
| `TEST-MCPVER-003` | Failure/rollback           | Failure at snapshot, index, library, verify, binding, and restore boundaries leaves one valid state                                     |
| `TEST-MCPVER-004` | Filesystem integration     | Apply/remove/sync create no sidecar or central snapshot; unchanged target keeps inode/mtime where supported                             |
| `TEST-MCPVER-005` | Conflict integration       | Import creates one new entry-level version; overwrite creates none and preserves unrelated target keys                                  |
| `TEST-MCPVER-006` | Security/fuzz              | traversal, null byte, symlink, malformed JSON/TOML, hostile ids, and changed-after-preview cleanup candidates are rejected              |
| `TEST-MCPVER-007` | Sync/export contract       | MCP versions round-trip; secret-bearing fields obey the current encrypted/redacted channel policy                                       |
| `TEST-MCPVER-008` | Performance/stress         | Large server/history inventory is paginated, details load on demand, mutation remains per-server bounded                                |
| `TEST-MCPVER-009` | UI/CLI behavior            | history, diff, restore, delete, cleanup preview, confirmation, loading, empty, and error states are usable                              |
| `TEST-MCPVER-010` | Migration + schema         | empty placeholders migrate into files, non-empty values remain vault-only, and unavailable vaults still permit redacted inventory reads |

Acceptance follows the [testing standard](../../../rules/testing-standards.md):
first prove normal version workflows and durable filesystem results, then validate
the affected black-box inputs and failure/recovery scenarios above. UI acceptance
requires actual desktop interaction or Playwright evidence, not only component
callbacks; coverage metrics are supplementary.

## Analyze Result

- Current implementation gap: My MCP has no user version entity or version
  storage; `McpLibraryFile.version` is schema-only.
- Current design conflict: archived MCP management requires adjacent pre-write
  backups. The clarified product decision rejects that rule.
- Source of truth after implementation: My MCP current record plus formal My MCP
  versions under PromptHub data; Agent files remain derived external state.
- Compatibility decision: retain and deprecate `backupPath`, omit it from new
  results, remove only in a later breaking change.
- Unresolved `[待确认]`: none for the design boundary. Implementation may expose
  additional UI copy choices but cannot reintroduce persistent target backups.

## Traceability

| Requirement      | Design                                               | Verification                                            | Task                                           |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| `FR-MCPVER-001`  | `DES-MCPVER-001`, `DES-MCPVER-002`, `DES-MCPVER-003` | `TEST-MCPVER-001`, `TEST-MCPVER-002`, `TEST-MCPVER-003` | `T-MCPVER-001`, `T-MCPVER-002`, `T-MCPVER-003` |
| `FR-MCPVER-002`  | `DES-MCPVER-002`, `DES-MCPVER-003`                   | `TEST-MCPVER-002`, `TEST-MCPVER-003`, `TEST-MCPVER-009` | `T-MCPVER-003`, `T-MCPVER-006`                 |
| `FR-MCPVER-003`  | `DES-MCPVER-004`                                     | `TEST-MCPVER-003`, `TEST-MCPVER-004`                    | `T-MCPVER-004`                                 |
| `FR-MCPVER-004`  | `DES-MCPVER-003`, `DES-MCPVER-004`                   | `TEST-MCPVER-003`, `TEST-MCPVER-006`                    | `T-MCPVER-003`, `T-MCPVER-004`                 |
| `FR-MCPVER-005`  | `DES-MCPVER-005`                                     | `TEST-MCPVER-005`                                       | `T-MCPVER-005`                                 |
| `FR-MCPVER-006`  | `DES-MCPVER-006`                                     | `TEST-MCPVER-006`, `TEST-MCPVER-009`                    | `T-MCPVER-007`                                 |
| `NFR-MCPVER-001` | `DES-MCPVER-001`, `DES-MCPVER-006`                   | `TEST-MCPVER-008`                                       | `T-MCPVER-008`                                 |
| `NFR-MCPVER-002` | `DES-MCPVER-001`, `DES-MCPVER-003`                   | `TEST-MCPVER-006`, `TEST-MCPVER-007`                    | `T-MCPVER-002`, `T-MCPVER-009`                 |
| `FR-MCPVER-007`  | `DES-MCPVER-007`                                     | `TEST-MCPVER-010`                                       | `T-MCPVER-013`                                 |
