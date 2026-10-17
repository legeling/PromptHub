# MCP Version History And Projection Safety Delta

## Added Requirements

跨 Skill / MCP / Plugin 的公共接口、分发状态、加载和界面合同见
[公共资源架构](../../../../../knowledge/structure/resource-library-architecture.md)（待实施）。
MCP 的服务配置、凭据、版本与目标投影仍遵循本规范，公共层不把配置合并替换为包复制。

### My MCP JSON editing (2026-10-17)

Basic personal MCP management takes priority over new gateway capabilities
(confirmed 2026-10-17). Desktop forms must retain input after failed saves,
prevent duplicate in-flight submissions, and submit only changed fields when
editing. Structured argument arrays preserve positional empty strings, whitespace
and embedded newlines through import, persistence and JSON editing. Key/value
form values retain whitespace after `=`. These corrections reuse existing Core
normalization, SQLite/version publication and IPC; no schema or file migration
is needed. Existing corrupted arguments require correction from the original
configuration because removed whitespace cannot be reconstructed. Verification
for this correction is pending; earlier verification below has narrower scope.

The Desktop Files tab presents one `mcp.json` configuration view in a file sidebar
and reuses the Skill code editor with line numbers and JSON highlighting. Editing,
formatting, saving and canceling happen there; Source / Content remains read-only
with copying, matching the Skill tab separation (confirmed 2026-10-17). The file
view derives from the current SQLite record; it does not introduce a physical
workspace file or access Agent target files. It edits command, arguments,
cwd, environment values/references, transport, URL and headers. The service key
must remain the current name; unrelated/unsupported fields and multiple servers
are rejected instead of silently dropped. Native options and library metadata
outside this editable projection remain unchanged. JSON is strict, values retain
Unicode/newlines, and malformed shapes, null bytes and invalid transport fields
are rejected. Existing `[REDACTED]` values retain their same-key literals; new
masked keys are rejected. Removing a key removes the corresponding value/reference.

Shared pure utilities own the JSON contract; Desktop owns ephemeral editor state
and uses the existing MCP store/update IPC. Core retains secret merging and
transactional version publication; SQLite remains authoritative. No new IPC,
schema, file layout or migration is introduced. Failed saves keep the draft;
cancel resets it, tab switches retain it, and server changes reset it. A changed
server snapshot blocks stale edits until reopened. Saving creates a version only
for semantic changes and does not write distributed target files automatically.

Verification covers parser refusals and real SQLite save/reopen/restore,
secret/reference preservation and deletion, publication failure/retry, existing
native metadata retention, plus actual Desktop JSON editing and cancel/validation.
The editor JSX and linear lifecycle tests may exceed 50 lines to keep one
accessible surface and its ordered state transitions together.

Implemented by `packages/shared/utils/mcp-json-editor.ts` and Desktop
`McpJsonEditor.tsx`. The Files-tab placement supersedes the original inline-source
editor placement. Files-tab component and Desktop workflow checks passed after
the placement correction. Storage and parsing contracts are unchanged.
Verification on Windows (2026-10-17):

- `pnpm --filter @prompthub/core test tests/mcp-json-editor.test.ts`: 20 passed;
  real SQLite/filesystem, AES-GCM with a fixture key store, close/reopen, restore,
  unchanged target bytes and injected publication rollback/retry. Initial no-op
  save regression failed with version 2 instead of 1; preserving absent command/URL
  as `undefined` fixed the spurious version. Invalid JSON never reaches mutation.
- `pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/components/mcp-json-editor.test.tsx`:
  2 passed; component-only failure retention and stale-snapshot handling substitute
  the store update boundary. This is not persistence evidence.
- `pnpm --filter @prompthub/desktop exec playwright test tests/e2e/mcp-json-edit.spec.ts --workers=1`:
  1 passed using the Files-tab sidebar and real Skill code editor: read-only
  Source, JSON language and line numbers, editing, formatting, validation, tab
  retention, cancel, Ctrl+S, IPC/SQLite save and renderer reload. No business/store
  mocks or MCP process execution. Light read-only and dark narrow-window editor
  screenshots were inspected from isolated application fixtures. The initial
  Files-tab check caught an absent translation key; using the existing Skill
  Files label fixed it before the successful rerun.
- Desktop build and scoped ESLint passed. Focused TypeScript program using
  `apps/desktop/tsconfig.test.json` options and the MCP detail plus all three new
  test files as roots passed with their imports and declaration files. Full
  `typecheck:tests` encountered unrelated `prompt-test-history-layout.test.tsx`
  `ByRoleOptions.exact` errors (lines 54/67); a broader source check also encountered
  `agent-codex-account.ipc.ts:38` passing `unknown` as `string` in concurrent work.
  Neither aggregate is claimed passing. Full release harness was not run.

### Native configuration round-trip

Codex TOML imports use the existing TOML parser, including multiline arrays and nested tables.
Disabled state, environment/authentication references, tool selection, helper commands and
native timeout/required fields must survive import, persistence/reopen and target projection.
Claude `headersHelper` is preserved without executing it during import. Native names are
translated once at the import/projection boundary into the shared typed MCP fields.
Native field preservation does not itself change storage ownership. The later
2026-10-14 adoption below makes SQLite and immutable contents the current owners.
Optional native fields require no separate migration;
missing values retain the native defaults. Previously lost fields require recovery from the
original configuration; same-name imports still skip duplicates, so back up and verify the
existing records and target bindings before restoring a correct record.

The existing JSONC parser is extracted into `mcp-jsonc.ts` to keep the touched config module
within the source-file budget; the public entrypoint and parsing behavior are unchanged.
Its comment scanner remains one state machine slightly above 50 lines because quote/escape
state must stay consistent throughout one pass; existing JSONC and MCP-library regressions
cover this extraction.
The native-options normalizer remains slightly above 50 lines to keep the one
typed field/validation contract together across import, canonical validation and
projection. Native round-trip, malformed TOML, OAuth masking and retained-secret
regressions cover this boundary; it performs no I/O or helper execution.

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

### `FR-MCPVER-007`: SQLite-owned MCP configuration adoption

Implemented 2026-10-14: MCP follows
`FR-FOUNDATION-003`. SQLite owns current definitions, device bindings, annotations,
version metadata and encrypted secret records. The filesystem owns immutable
historical definition contents referenced by SQLite. The root's historical
canonical-files flag does not select a second MCP business backend. Existing
library JSON, bundles, bindings and Electron-encrypted vault are upgrade inputs,
not normal read/write fallback paths.

#### Scenario: Existing library contains unconfigured credential placeholders

- **Given** a version-1 MCP library contains empty `env` or header values
- **When** PromptHub completes the explicit MCP startup adoption
- **Then** the empty placeholders remain in the current record and historical contents
- **And** only non-empty literal credentials enter encrypted SQLite secret records
- **And** reopening My MCP returns every server instead of failing the whole list
- **And** Agent/project MCP files remain derived projections

#### Scenario: Device secret storage is unavailable

- **Given** current SQLite records are valid but a referenced device secret is
  missing, unreadable, or bound to another unavailable device vault
- **When** the renderer requests the My MCP inventory
- **Then** PromptHub returns the SQLite definitions with credential values redacted
- **And** does not discard the server list or switch storage backends
- **And** execution and mutation paths that require the real credential still fail closed

## Non-Functional Requirements

### 2026-10-14 MCP adoption design (#234)

#### Market installation identity (2026-10-17)

New market installations allocate the same opaque `mcp_*` local identity as
manual creation. A remote template identity (including registry namespaces
such as `modelcontextprotocol:io-github-upstash-context7`) belongs in `source.id`,
never in the new local server id or historical directory name. Source identity
and market fingerprints continue to drive update detection; updates retain the
local id. Previously the template spread copied its id into the local draft,
causing Windows `mkdir` failure when history was published.

Ownership and layout remain unchanged: SQLite owns current records, version
metadata and source identity; Core owns installation/publication and filesystem
history. No migration, rekeying or new schema/IPC is required. Existing records,
bindings and versions keep their identities. Publication failure must leave no
installed record and allow a clean retry. Verify namespaced installation,
source update, disk reopen, history restore, and rollback through real storage,
plus the Desktop store install entrypoint. Implemented in the shared
`installMcpTemplate` normalization boundary.

Verification (Windows, 2026-10-17):

- `pnpm --filter @prompthub/core test tests/mcp-market-installation.test.ts tests/mcp-market-reconciliation.test.ts`:
  10 passed. New installation regressions use real disk SQLite/history and cover
  namespaced, slash-bearing and Windows-reserved template ids, source updates,
  reopen/restore, publication failure/retry, and preservation of existing bindings.
  These assertions reject remote ids used as local ids; the old implementation
  was not separately executed for red-test evidence.
- `pnpm --filter @prompthub/desktop exec playwright test tests/e2e/mcp-market-return.spec.ts --workers=1`:
  1 passed. Actual store click, install IPC and SQLite readback verify the local id
  and retained namespaced source. Only catalog HTTP content is replaced with a
  fixture; live registry/package execution and packaged release are not verified.
- `pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/main/mcp-library-persistence-targets.test.ts -t 'installs remote MCP|tracks and applies upstream|requires review for legacy'`:
  first run 2 passed / 1 failed during journal replacement (`EPERM`); unchanged
  focused rerun 3 passed / 23 unselected. The intermittent rename failure remains
  recorded separately from the fixed invalid-directory-name failure.
- Desktop build and `typecheck:tests` passed (includes package tests). ESLint
  passed for the changed shared helper, new Core regression and amended E2E.
  Full release harness was not run.

### 2026-10-14 MCP adoption design (#234)

Scope is the MCP domain, not a claim that every other foundation domain has
completed baseline adoption. Schema migration 4 appends MCP domain tables without
rewriting database migration history/checksums 1–3. Current configuration uses
typed stable columns plus one sparse config JSON field; bindings and secret/version
references have foreign keys. Version metadata includes current/high-water numbers,
note, restore provenance, content digest and path. History numbers are never reused.

One shared startup upgrade inspects known JSON/canonical inputs, compares identities
and content, preserves independent records/history/bindings, and rejects unresolved
same-identity conflicts or future formats before adoption. Existing source bytes
remain recoverable until counts, references and read/edit/reopen verify the target.
Retired source material belongs to the existing bounded recovery registry, not
another writable library or adjacent backup files. Historical import/restore uses
this same conversion boundary. Schema success alone does not mark data adoption.

Desktop and CLI share Node AES-256-GCM. The device master key is protected by the
OS credential store, never a plaintext settings/key file. A small N-API keyring
binding is required because current dependencies expose only Electron safeStorage;
CLI must not install Electron or implement its OS-specific ciphertext format.
Linux requires the persistent Secret Service backend, not the non-persistent
kernel-keyring fallback. Legacy Electron ciphertext is decrypted only by a supplied
Desktop upgrade adapter. Without that adapter/key access, definitions and version
references are adopted with explicit unavailable secret rows; original credential
sources are retained until a later startup can encrypt them. This is the current
SQL contract, not a second business backend. Metadata operations remain available;
credential-dependent operations fail closed. `availability` records whether ciphertext
was adopted, not whether the OS key store is currently unlocked.
Fresh CLI and old CLI JSON profiles use the same current schema and key provider.

Related SQL mutations are transactional. New immutable history content is published
under the existing file recovery boundary while the SQL write is serialized;
unreferenced interrupted content is reconciled before normal access. Deletion commits
metadata before file cleanup; a cleanup failure cannot reverse a durable result.
Ordinary changes inspect only selected records and append/remove selected snapshots;
metadata-only edits touch no history files. Startup conversion/verification is
linear in visited entries and bytes, with bounded traversal. Current MCP tables must
survive canonical catalog rebuild, recovery, scoped backups and restoration together
with referenced contents. External Agent files remain explicit projections only.

Acceptance includes fresh CLI, pinned 0.5.9 and 0.6.0-beta.2 fixtures, mixed-source
conflicts, idempotent starts, old encrypted-vault conversion, unsupported/newer input,
null-byte/path/symlink rejection, failures on both sides of publication/SQL commit,
two-process access, consistent backup/restore, selected-snapshot I/O measurements,
and isolated Desktop import/edit/history/project/reopen. OS-backed and injected-key
evidence remain distinct. Verification results are recorded in `implementation.md`.

The adoption and snapshot restore orchestrators exceed 50 lines to keep validation,
file publication and the SQL transaction in one visible recovery sequence. Their
real SQLite regressions cover conflicts, missing keys, publication failure, rollback,
immutable collisions and reopen. Complete workflow tests likewise retain one fixture
through export, mutation and restoration instead of hiding state across test cases.

Backups carry a domain-only `mcp-state.sqlite` (format 1) and SQL-referenced history
files; retained legacy plaintext and migration journals are excluded. Restore validates
SQLite integrity/FKs and content hashes before publishing files and committing SQL,
preserves active device bindings, and uses hash-suffixed paths for immutable collisions.
No native target is implicitly modified. Database schema migration 4 is not rewritten
after release. Before upgrading, keep a verified whole-root backup; rollback requires
restoring that root and its OS key access together, not running older code against the
upgraded database. Retired metadata/credentials live in the bounded recovery registry;
plaintext credential sources are encrypted there only after key access succeeds.

### Historical 2026-10-13 entrypoint boundary (#234)

This subsection records the earlier partial delivery. Its storage and performance
limitations are superseded by the implemented 2026-10-14 adoption above.

Version entrypoints expose the already deployed MCP bundle/vault contract; they
do not add a second history store or perform the pending foundation-wide
SQLite ownership conversion. That confirmed target remains owned by
`FR-FOUNDATION-003`. The independent CLI's uninitialized JSON-only workspace
does not yet have the same MCP history/vault initialization; its migration
scope was authorized on 2026-10-14; this paragraph records the earlier incomplete implementation.
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

### Antigravity native definition preservation (#220)

- File import, pasted JSON and Plugin child MCP import use the same Core parser. Native `serverUrl` becomes the canonical server `url` and is projected back as `serverUrl` for Antigravity.
- Imported server names are exact native config entry keys, including case and punctuation. The shared normalizer retains explicit names on imported records; generated/manual/store names keep their existing slug convention. Inventory, selected import, editing, reopen, duplicate detection, target sync and removal use the same exact key, so `Docs.API` and `docs-api` remain distinct. Existing normalized records are not renamed automatically; recovery of an earlier changed name requires the original config and review of its existing record/bindings. No schema or credential migration is needed. Reverting this change would normalize these imported names again; export the affected records and inspect targets before downgrading.
- Agent MCP import in both the MCP workspace and Agent asset panel uses the existing create-from-source IPC with `{ kind: "target", preset, serverName }`. Core rereads only the selected target file, selects the named server and creates the managed record with complete native fields and real credentials. Redacted renderer inventory is never used as a new credential source; missing entries or malformed requests do not create records. `McpTargetPreset` is shared by the request and inventory contract; its existing Core type export is unchanged for consumers.
- Agent MCP detail previews use the target's shared native projection with credential redaction, including `serverUrl`, OAuth, tool selection and disabled state. The source file is not rewritten by import or preview. No database or vault-layout migration is required; existing records that were imported with lost fields or literal mask values require restoration from the original config after checking records and bindings.
- The existing `createFromSource` orchestrator remains above 50 lines to keep source selection and its single persistence/result contract together; existing import/health regressions and the new Agent-import integration cover its branches. Normal integration scenarios remain longer than 50 lines so import, masked form edits, runtime reopen, both target scopes, conflict synchronization and removal verify the same persisted identities rather than independent prebuilt records. Target handling remains linear in selected entries and file size, with no additional scans, network calls or business limits introduced by name preservation.
- `authProviderType`, `oauth.clientId`, `oauth.clientSecret` and `disabledTools` are optional versioned definition fields. Ordinary edits retain them; projections to other Agents do not emit these Antigravity options. Native `disabled` maps to the existing `enabled` state.
- Non-empty `oauth.clientSecret` uses the existing device-bound secret vault. Canonical current/version files contain only an optional `secretReferences.oauth.clientSecret` reference. Older bundles without the optional fields retain their schema and semantic digest; no target-file migration is required.
- IPC/export/sync/config previews redact `clientSecret`; saving a redacted value retains the existing local credential. Antigravity-owned OAuth token files are never read or modified by this workflow.
- Reverting the source change requires exporting affected definitions through the current version first; an older reader cannot hydrate the newly introduced OAuth reference. Recovery uses the existing canonical bundle and device secret store, rather than resetting or reimporting the library.

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
