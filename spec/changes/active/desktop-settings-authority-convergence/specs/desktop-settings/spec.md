# Desktop Settings Authority Delta

The physical authority decision below is superseded for the new client target by
[FR-FOUNDATION-003](../../../foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants):
SQLite owns durable application settings. Existing config files are protected
upgrade inputs until conversion is verified. The former file-authority scenarios
below describe prior behavior, not the target acceptance. Field classification,
secret protection, atomic update, reload and device/portable distinctions still
apply; they do not require a second writable copy of settings.

## Added Requirements

### `FR-CONFIG-001`: Canonical Config Is The Sole Durable Authority

Desktop non-secret settings and explicit user preferences MUST be durably owned
by versioned documents below the active root's `config/` directory. SQLite,
renderer storage, and process memory MUST NOT independently decide the current
value after canonical migration completes.

#### Scenario: Database is rebuilt

- **Given** valid canonical configuration and a completed migration marker
- **When** the local SQLite catalog is deleted or staged and rebuilt
- **Then** every explicit Desktop setting retains its committed value
- **And** the rebuild does not rewrite canonical configuration with defaults

### `FR-CONFIG-002`: Settings Are Classified Before Persistence

Every persisted Desktop field MUST declare its canonical document, schema,
durability, device/portable scope, secret policy, backup policy, default,
normalizer, and reload/application behavior. A field without that declaration
MUST NOT be added to a persistence allowlist.

#### Scenario: Explicit preference versus transient UI state

- **Given** a user changes language, close behavior, appearance, editing, or a
  durable layout preference
- **Then** the value is committed to its canonical config document
- **But Given** a view has an incidental draft, active selection, temporary
  filter, hover state, or dialog state
- **Then** it may remain bounded renderer/session state and may reset

### `FR-CONFIG-003`: One Atomic Write Contract

Renderer setting actions MUST submit typed patches to a main/Core configuration
service. The service MUST validate, merge with the latest committed snapshot,
serialize concurrent writers, atomically publish all affected config/vault
documents, verify reload, and only then report success.

#### Scenario: Publication fails

- **When** validation, staging, file replacement, vault publication, fsync, or
  reload verification fails
- **Then** the previous complete snapshot remains authoritative
- **And** main memory and renderer state are restored or visibly marked failed
- **And** no success-dependent action such as exit proceeds

### `FR-CONFIG-004`: Deterministic Startup And Migration

Main MUST recover interrupted publications and load canonical config before
creating user-facing runtime state. Before the completion marker exists,
legacy values MAY be migrated once using explicit per-key precedence. After the
marker exists, SQLite and renderer storage MUST NOT override canonical config.

#### Scenario: Legacy stores disagree

- **Given** canonical config is absent and valid legacy renderer and SQLite
  values disagree for a historically renderer-owned key
- **When** migration runs
- **Then** the explicit renderer value wins, SQLite only fills missing values,
  and defaults apply last
- **And** a verified completion marker prevents the conflict from recurring

### `FR-CONFIG-005`: Durable Does Not Imply Portable

Every canonical setting MUST separately declare whether it is device-local,
eligible for a same-device safety point, portable with redaction, or eligible
for cross-device sync. Device paths, native startup/window behavior, and secret
references MUST NOT become portable merely because they are durable.

#### Scenario: Portable settings export

- **When** a user exports portable settings
- **Then** only fields explicitly classified as portable are included
- **And** credentials, device-bound identifiers, native paths, and local-only
  behavior are excluded or safely redacted

### `NFR-CONFIG-001`: Bounded And Recoverable Configuration

Canonical settings documents MUST retain bounded size and entry limits. A patch
is `O(S)` over the bounded affected snapshot, uses no network request, and is
serialized through a bounded writer. Unknown newer schemas fail closed or open
read-only; older supported schemas use ordered converters without destructive
downgrade.

## Removed Behavior

- SQLite `settings` rows are not a post-migration Desktop authority.
- Zustand persistence is not a durability guarantee for explicit settings.
- Background subscriptions that have not completed cannot be treated as a
  committed setting.
- Newer-wins merging across unrelated config, DB, and renderer timestamps is
  not permitted.
