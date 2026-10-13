# MCP Version History And Projection Safety Delta

## Added Requirements

### `FR-MCPVER-001`: Formal My MCP version history

PromptHub MUST maintain immutable, monotonically numbered versions for every My
MCP server. A version represents the normalized MCP server definition, not an
Agent's whole configuration file and not the MCP library schema number.

#### Scenario: Existing library migration

- **Given** a version-1 MCP library with existing servers and no version history
- **When** PromptHub completes the MCP history migration
- **Then** each existing server has an initial `v1` snapshot matching its
  current normalized definition
- **And** no Agent or project target file is modified
- **And** reopening PromptHub returns the same current server and version
  numbers

#### Scenario: Create or import a server

- **Given** a new MCP server is created, installed, or imported into My MCP
- **When** the library mutation succeeds
- **Then** PromptHub records `v1` as the current version
- **And** the current server and version snapshot have the same semantic digest

#### Scenario: Real configuration change

- **Given** a My MCP server already has a current version
- **When** transport, command, args, cwd, env, URL, headers, enabled state,
  source baseline, or other versioned definition data changes
- **Then** PromptHub creates exactly one next version
- **And** version numbers are never reused after deletion

#### Scenario: Metadata-only or byte-identical change

- **Given** only favorite state, personal tags, personal notes, or timestamps
  change, or the normalized definition is unchanged
- **When** PromptHub saves the server
- **Then** no new MCP version is created

### `FR-MCPVER-002`: Version management workflow

PromptHub MUST support listing, inspecting, comparing, manually annotating,
restoring, and deleting MCP versions without mutating historical payloads in
place.

#### Scenario: Restore an earlier version

- **Given** an MCP server has versions `v1` through `v4`
- **When** the user restores `v2`
- **Then** PromptHub preserves `v1` through `v4`
- **And** creates `v5` from the restored definition with rollback provenance
- **And** makes `v5` the current version
- **And** does not automatically distribute `v5` to Agent targets

#### Scenario: Update a version note

- **Given** an immutable MCP version exists
- **When** the user edits its note
- **Then** only the note metadata changes
- **And** the snapshot digest and version number remain unchanged

#### Scenario: Delete a historical version

- **Given** a server has more than one version
- **When** the user confirms deletion of a non-current version
- **Then** that historical version is removed
- **And** its version number is not reused
- **And** PromptHub rejects deletion of the current version

### `FR-MCPVER-003`: Projection creates no persistent backup

PromptHub MUST NOT create a durable backup, snapshot, history, or sidecar when
applying or removing My MCP entries in an external Agent/project config file.

#### Scenario: Apply to an existing target

- **Given** a parseable target file with unrelated settings
- **When** PromptHub applies a changed MCP projection
- **Then** unrelated settings remain intact
- **And** the target is replaced atomically and re-read for verification
- **And** no `*.prompthub-mcp-backup-*` or centralized target snapshot is created
- **And** the result omits `backupPath`

#### Scenario: Reapply identical content

- **Given** the projected bytes equal the current target bytes
- **When** PromptHub reapplies the same MCP entries
- **Then** the target file is not rewritten
- **And** no temporary or persistent recovery artifact remains
- **And** binding metadata may still be reconciled

#### Scenario: Remove a target entry

- **Given** an Agent target contains a managed or selected external MCP entry
- **When** the user removes that entry
- **Then** only the selected entry is removed
- **And** the operation does not create a My MCP version unless the normalized
  My MCP server definition also changes
- **And** no target backup is retained

### `FR-MCPVER-004`: Failure recovery without durable target copies

PromptHub MUST keep target writes valid and recoverable without retaining a
persistent copy of the whole external configuration.

#### Scenario: Validation or binding persistence fails in process

- **Given** PromptHub has read and validated the original target bytes
- **When** target verification or binding persistence fails after replacement
- **Then** PromptHub restores the exact original bytes from process memory
- **And** verifies the restoration
- **And** removes temporary files and transaction markers
- **And** reports an explicit failure

#### Scenario: Process interruption after target rename

- **Given** the target atomic rename completed but binding persistence did not
- **When** PromptHub starts or rescans the target
- **Then** the target remains a valid native config file
- **And** reconciliation reports the entry as missing-baseline,
  externally-modified, or conflict as appropriate
- **And** PromptHub does not silently overwrite it

### `FR-MCPVER-005`: External changes use version semantics

PromptHub MUST resolve external target changes at the MCP-entry level instead
of preserving whole target files as hidden backups.

#### Scenario: Import an external entry as a new version

- **Given** a target entry maps to an existing My MCP server but differs from
  its current definition
- **When** the user chooses Import as new version
- **Then** PromptHub shows an entry-level diff
- **And** creates the next My MCP version from the selected external entry
- **And** preserves unrelated target settings outside that entry

#### Scenario: Overwrite an external entry

- **Given** a target entry differs from the current My MCP version
- **When** the user explicitly chooses Keep My MCP and overwrite target
- **Then** PromptHub projects the current version through the safe apply flow
- **And** no new My MCP version or target backup is created

### `FR-MCPVER-006`: Legacy sidecar cleanup

PromptHub MUST provide explicit cleanup for legacy files it previously created,
without treating them as valid MCP version records.

#### Scenario: Preview cleanup candidates

- **Given** known MCP target locations contain regular files matching the exact
  legacy suffix pattern
- **When** the user scans for cleanup candidates
- **Then** PromptHub lists path, size, modification time, and related live target
- **And** does not read outside allowlisted target locations
- **And** rejects symlinks, directories, null bytes, and path escapes
- **And** makes no filesystem mutation

#### Scenario: Confirm cleanup

- **Given** the user selected previewed candidates
- **When** the user confirms cleanup
- **Then** PromptHub moves only those unchanged candidate identities to the
  platform trash or approved recovery area
- **And** skips files whose identity or metadata changed after preview
- **And** leaves unselected and unknown files untouched

### `FR-MCPVER-007`: File-authoritative MCP configuration migration

PromptHub MUST keep My MCP definitions and history in canonical files. SQLite
and renderer state MUST NOT be the only copy of an MCP definition. Device-bound
secret storage owns only non-empty literal credential values.

#### Scenario: Existing library contains unconfigured credential placeholders

- **Given** a version-1 MCP library contains empty `env` or header values
- **When** PromptHub migrates it to canonical MCP bundles
- **Then** the empty placeholders remain in the canonical server and version files
- **And** only non-empty literal credentials are extracted into the encrypted vault
- **And** reopening My MCP returns every server instead of failing the whole list
- **And** Agent/project MCP files remain derived projections

#### Scenario: Device secret storage is unavailable

- **Given** canonical MCP bundles are valid but a referenced device secret is
  missing, unreadable, or bound to another unavailable device vault
- **When** the renderer requests the My MCP inventory
- **Then** PromptHub returns the file-owned definitions with credential values redacted
- **And** does not discard the server list or fall back to SQLite
- **And** execution and mutation paths that require the real credential still fail closed

## Non-Functional Requirements

### 2026-10-13 entrypoint implementation boundary (#234)

Version entrypoints expose the already deployed MCP bundle/vault contract; they
do not add a second history store or perform the pending foundation-wide
SQLite ownership conversion. That confirmed target remains owned by
`FR-FOUNDATION-003`. The independent CLI's uninitialized JSON-only workspace
does not yet have the same MCP history/vault initialization; its migration
scope is pending confirmation, rather than silently changing root authority.
Existing initialized workspaces retain their bundle schema and secret refs.
The CLI has no device secret-store adapter: list/detail remain redacted, while
credential-bearing comparisons and mutations still fail closed. Their support
requires the shared initialization/vault boundary, not a plaintext fallback.
No destructive conversion or Agent target write occurs during version restore.

The history page loads a bounded page of version documents and details on
demand, verifying the selected payload hashes while retaining full manifest and
file-inventory validation. Bundle publication reuses the existing atomic
coordinator and vault transaction. The existing coordinator reads the library's
retained history and republishes the changed server's retained snapshots;
mutation cost therefore still grows with retained history, not only the new snapshot.
The `O(S)` mutation target remains an implementation gap, not a claimed gate.
Rollback uses the existing publication journal; rollback source compatibility
is unchanged because no new bundle format is introduced.

The history mutation coordinator, CLI action dispatcher and React modal remain longer than 50 lines
to keep their single transaction/action state machine and associated rendered
states together. The CLI dispatcher keeps one usage/output boundary for the
seven commands, covered by the public runCli workflow. Functional history tests cover the public workflow, failure
rollback, native target preservation and reopen; isolated GUI acceptance covers
history actions, cancellation, both themes and persistence after restart.
Empty-description text uses its own empty-state key;
health UI translates stable issue codes and field context rather than backend
diagnostic strings. Core/CLI health diagnostics are English and never contain
literal environment values.

### `NFR-MCPVER-001`: Bounded work

- Version list APIs MUST be paginated and load snapshot payloads on demand.
- A semantic mutation MUST be `O(S)` for a snapshot of size `S`, excluding the
  bounded index update for that server.
- Target projection MUST read and parse the target once, generate once, and
  write once only when bytes change.
- Legacy cleanup MUST scan only known target locations and process candidates in
  bounded batches without network calls.

### `NFR-MCPVER-002`: Secret boundary

- Local MCP version files MUST receive the same owner-only permission policy as
  the current MCP library where the platform supports it.
- Version history MUST follow the existing MCP secret redaction/encryption rules
  during export, backup, sync, logging, IPC, and UI preview.
- Transaction metadata MUST NOT duplicate literal MCP credentials or whole
  external target files.
- Empty credential placeholders are configuration state rather than secrets;
  canonical files may contain the key with an empty value, but never a non-empty
  literal credential.
- Renderer inventory fallback MUST expose only the existing redaction sentinel;
  it MUST NOT convert an unavailable secret into a usable empty credential.

## Compatibility Requirements

- Version-1 MCP libraries remain readable throughout migration.
- Existing target bindings and entry digests remain valid.
- Existing adjacent sidecars are not deleted automatically.
- Optional `backupPath` fields remain accepted but are deprecated and omitted
  by new MCP projection results.
