# Desktop Settings Authority Delta

The physical authority decision below is superseded for the new client target by
[FR-FOUNDATION-003](../../../foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants):
SQLite owns durable application settings. Existing config files are protected
upgrade inputs until conversion is verified. The former file-authority scenarios
below describe prior behavior, not the target acceptance. Field classification,
secret protection, atomic update, reload and device/portable distinctions still
apply; they do not require a second writable copy of settings.

## Issued-profile credential repair (2026-10-19)

### Expanded credential upgrade requirement

The initial, unshipped empty-connection repair is superseded by
`settings-credentials-v1`. The previous local recovery marker does not skip this
step. Already-converted SQL settings may still contain historical inline secrets:
the v0.5.9 Desktop settings writer persisted public connection/flat fields directly,
and the current decoder rejects inline AI keys and flat secrets as well as proxy
credentials. Upgrade must cover the shared `FLAT_SECRET_FIELDS` contract,
`aiProviders` / `aiModels` API keys, and `networkProxy` / `sync` credentials.

Implementation: normalize absent-secret placeholders according to the
existing encoder; move valid inline credentials into the current encrypted vault
and replace only affected SQL fields with references. Preserve unrelated rows,
AI metadata, existing protected references and vault secrets. A raw credential
that disagrees with an existing protected value must stop without changing either
source; malformed values, unavailable keys and unknown formats are not silently
accepted. Empty-only repair must leave encrypted vault bytes unchanged.

The Core settings startup owner runs this once after the immutable SQL upgrade,
using existing SQLite/file publication for updates, encrypted vault and completion
marker together. Failure must restore exact rows and prior ciphertext and permit
retry on reopen. Current public writers/readers retain their existing single
secret-reference contract. No fallback reader, network call or new dependency is
introduced. Cost is linear in the known credential rows and vault bytes, not the
whole business database. Upgrade safety points remain the rollback source.

Acceptance adds flat/AI/connection placeholders and nonempty credentials,
credential conflicts, unavailable keys, publication rollback, subsequent writes
and multiple reopens; Desktop preload/IPC hydration must exercise the same upgrade.

Expanded verification on 2026-10-19:

- `pnpm --filter @prompthub/core exec vitest run tests/settings-credentials-upgrade.test.ts tests/settings-empty-credentials.test.ts tests/settings-sqlite.test.ts tests/renderer-settings-codec.test.ts tests/settings-vault.test.ts --minWorkers=1 --maxWorkers=2`: 48 passed. New cases exercise all flat credential fields, AI providers/models, both connection domains, empty/null/blank placeholders, nonempty legacy values, protected-value conflicts, missing keys, exact ciphertext/row rollback and reopen/edit. Longer lifecycle test bodies keep source fixtures, byte-preservation checks and two reopen observations together.
- `pnpm --filter @prompthub/desktop exec vitest run tests/integration/settings-replacement-validation.test.ts tests/unit/main/network-proxy-startup.test.ts --minWorkers=1 --maxWorkers=1`: 47 passed. Real preload/registered IPC/Core/SQLite handles both absent and nonempty historical secrets; OS keychain and Electron transport are substituted. Startup proxy application receives the preserved credentials on both launches.
- Adjacent Core suites `historical-runtime-upgrade`, `renderer-persistence-migration`, `renderer-persistence-ai-file-authority`, `sqlite-entry-publication`, `agent-settings-upgrade`, `prompt-workspace-upgrade`, `skill-sqlite-migration`, and `rule-metadata-migration`: 71 passed. `renderer-state-sqlite.test.ts` separately passed 9 tests; an obsolete auxiliary-state filename in the first filter selected no tests. Historical v0.5.9/beta.1/beta.2 profiles still upgrade, edit, reopen and recover after injected failure. Ambiguous historical configurations remain explicit recovery cases, not silent automatic selection.
- Isolated source-copy mutation removed only the credential-upgrade startup call. Running `settings-credentials-upgrade.test.ts -t 'normalizes all supported|protects legacy plaintext'` exited 1 with four actual `Unprotected secret in settings` failures. The same cases pass in the working source. An initial relocated pnpm shim lookup failed before testing; it is not regression evidence. The temporary source copy and synthetic profiles were removed.
- Core typecheck, Desktop test-inclusive typecheck, focused ESLint, file-size gate, `git diff --check` and main/preload/renderer production build passed. No installed app/profile changes, native UI validation, cross-platform package acceptance, full release harness, commit or publication occurred in this expanded batch.

### Initial local repair and earlier verification

Already-upgraded SQLite profiles were found to contain historical `networkProxy`
or `sync` objects with explicit empty `username` / `password` fields. A completed
`settings-sqlite-v1` marker alone does not make these objects readable by the
current secret-reference codec. Reloading the renderer repeats the same failure.

The initial local repair used `settings-empty-credentials-v1` to remove exact
empty-string placeholders from two connection rows in one transaction. Its source
implementation was not shipped and is now consolidated into the broader step
above; the local profile's earlier marker may remain as recovery history. The
repair preserved other settings and ciphertext after a managed database safety
point. Rollback restores that safety point while stopped, not a whole-table reset.

Acceptance: `packages/core/tests/settings-empty-credentials.test.ts` verifies
preservation, two reopens, subsequent writes, protected references and transactional
failure/retry. Desktop `network-proxy-startup.test.ts` and
`settings-replacement-validation.test.ts` cover startup application and real
preload → registered IPC → SQLite hydration; Electron transport is substituted.
Real installed-app startup remains a separate acceptance boundary.

Verification on 2026-10-19:

- `pnpm --filter @prompthub/core exec vitest run tests/settings-empty-credentials.test.ts tests/settings-sqlite.test.ts tests/renderer-settings-codec.test.ts tests/renderer-persistence-migration.test.ts tests/renderer-persistence-ai-file-authority.test.ts tests/historical-runtime-upgrade.test.ts --minWorkers=1 --maxWorkers=2`: 52 passed, including v0.5.9 / beta.1 / beta.2 upgrade, edit/reopen and injected failure/retry.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/network-proxy-startup.test.ts tests/unit/main/settings-renderer-persistence-ipc.test.ts tests/unit/services/renderer-persistence.test.ts tests/integration/settings-replacement-validation.test.ts --minWorkers=1 --maxWorkers=1`: 68 passed. The new preload/IPC case exercises migration, hydration and normal settings GET after two reopens.
- Core typecheck, Desktop `typecheck:tests` (including shared package tests), focused ESLint, file-size gate, `git diff --check` and `pnpm build`: passed.
- An authorized private profile copy completed two settings hydrations with 40 other tables unchanged, all unrelated settings rows byte-identical, and the encrypted vault byte-identical. The same migration repaired the stopped installed profile after creating a managed database safety point; it changed only the two empty proxy fields and its own ledger entry.
- Installed macOS 0.6.1: main page, actual renderer Reload, Skills/MCP/Plugins/Rules reads, full Quit and subsequent launch passed. Both post-repair launches logged successful proxy application; normal Prompt and Skill counts remained 118 and 123. The installed app bundle was not modified. This verifies the current profile recovery, not publication of the source fix or other platforms.

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
