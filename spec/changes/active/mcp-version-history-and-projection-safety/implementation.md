# Implementation

## Status

- Phase: implement
- Status: in-progress
- Completed scope: external target projection safety, `backupPath` deprecation,
  My MCP version history and shared Desktop/CLI SQLite adoption (#234).
- Remaining scope: #203 conflict workflows, legacy-sidecar cleanup and convergence;
  #220 Windows IDE/OAuth acceptance remains separate from local implementation.

## Implemented In This Iteration

- Replaced adjacent `.prompthub-mcp-backup-*` creation in apply, remove, and
  managed-target synchronization with one shared projection commit boundary.
- Added byte-identical no-op detection so repeated distribution does not change
  target inode or modification time.
- Added same-directory temporary publication, file flush, atomic rename,
  post-write byte and MCP-entry verification, and exact in-memory rollback.
- Restores the original bytes when verification or binding persistence fails;
  removes a newly created target when the same failure occurs on first write.
- Removes temporary projection files on success and failure. No persistent or
  centralized copy of an external Agent/project config is created.
- Kept the optional `backupPath` fields readable for compatibility, marked them
  deprecated, and omitted them from new projection results.
- Classified empty MCP `env` and header values as file-owned unconfigured
  placeholders. Canonical publication now extracts only non-empty literal
  credentials into the device vault and merges both classes on hydration.
- Added a renderer inventory read path that degrades only unavailable device
  secrets to the existing redaction sentinel. Strict execution and mutation
  reads still reject missing or invalid secrets.
- Routed Desktop `mcp-library:get` through the redacted file inventory path so
  one unavailable vault cannot erase every file-owned MCP entry from the UI.

## Remaining Delivery

- Entry-level import/overwrite conflict handling.
- Previewed and confirmed cleanup for legacy PromptHub sidecars.

## Verification Status

- Test-first evidence: the changed Desktop projection tests failed against the
  previous sidecar implementation before production code changed.
- `pnpm --filter @prompthub/core exec vitest run
tests/mcp-target-projection.test.ts --coverage
--coverage.include=src/mcp-target-projection.ts --coverage.reporter=text`:
  9 tests passed; the changed projection helper reached 100% statements,
  branches, functions, and lines.
- Focused Desktop MCP suite: 3 files and 52 tests passed.
- `pnpm --filter @prompthub/core typecheck`: passed.
- `pnpm --filter @prompthub/shared typecheck`: passed.
- Empty-placeholder and vault-degradation regression suite: 2 Core files and
  23 tests passed; 3 Desktop files and 25 tests passed.
- Changed Core MCP coverage run: 23 tests passed; canonical migration reached
  100% statements/branches/functions/lines, while the larger existing canonical
  library and resource-schema modules reached 91.61%/88.18% and
  94.97%/68.62% statement/branch coverage respectively. Every new
  placeholder, strict-read, missing-vault, unreadable-vault, and redacted-read
  decision is exercised.
- Core and Desktop typechecks passed. Scoped Desktop ESLint, Prettier, file-size
  enforcement, and repository spec governance/traceability passed.
- Development-root migration produced six validated per-server MCP bundles,
  four device bindings, no superseded `library.json`, and explicit empty Slack
  credential placeholders without literal secret output. A direct canonical
  reload returned all six server names.
- UI verification, legacy-sidecar cleanup tests, and performance measurements
  remain pending with the unfinished tasks.

## Convergence Gate

This change must remain active until implementation, adversarial verification,
stable documentation sync, and issue-state reconciliation are complete.

## MCP Functional Audit — 2026-10-13

### Baselines and Scope

- Audited the dirty working copy, including existing uncommitted MCP adaptation
  work, in a dependency-reusing source snapshot. No product code, test assertions,
  GitHub issues, commits, or personal Agent configuration were changed by this
  audit.
- Initial baseline: HEAD `428f4c2296825957292c3c43544f53760f55fe11`, 2,258
  source/config files, SHA-256
  `efe3862a12e1078f7f64711d1ec1393654c4f0bd5f7b1b4eec50174952baf48d`.
- Concurrent edits changed MCP IPC and native-root selection during acceptance.
  The refreshed snapshot contained 2,262 source/config files, SHA-256
  `acbb4be72d9b59a6b0e167eae520298374a430d4b32a1b89b8ecf9715bb79157`.
  Affected entrypoint/root tests and typechecks were rerun. GUI evidence applies
  to the initial built snapshot, not the refreshed build or future edits.

### Executed Checks

| Boundary                                                                  | Initial result                            | Refreshed result                                   |
| ------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Desktop registered IPC, preload/renderer import, real SQLite/files/reopen | 4 files, 37 passed                        | 4 files, 37 passed                                 |
| Core MCP library/schema/env/market/projection                             | 7 files, 51 passed                        | Not repeated; affected root behavior covered below |
| Desktop MCP unit/component tests                                          | 24 files, 201 passed, 1 failed            | Failed assertion remains unresolved                |
| Native MCP roundtrip and Claude/Codex root workflows                      | Included native MCP cases above           | 4 files, 13 passed                                 |
| Installed Antigravity `agy` against isolated native files                 | 1 passed; native opt-in enabled           | Not repeated                                       |
| CLI `runCli` entrypoint, actual isolated persistence/output               | 2 passed, 17 unrelated cases filtered out | 2 passed, same filter                              |
| Web runtime capabilities/install bridge/workspace components              | 3 files, 17 passed                        | Not repeated                                       |
| Web Agent routes/service/dependencies                                     | 3 files, 16 passed                        | 3 files, 16 passed                                 |
| Desktop test types, Core/CLI/Web types                                    | Passed                                    | Passed                                             |
| Desktop main/preload/renderer build                                       | Passed                                    | Not repeated                                       |

The initial test batch totaled 325 passed and 1 failed. The refreshed 68 passing
cases overlap the initial batch and must not be added as independent coverage.
Core projection tests inject verification, persistence, rename and write failures
against real temporary files, checking exact rollback and temporary-file cleanup.
Credential import tests exercise redaction, selective secret hydration and native
field preservation; injected Electron/keychain boundaries do not prove OS vault
security. Web route tests use real authentication/SQLite but inject domain results;
workspace/bridge tests are component contracts, not Web MCP mutation acceptance.
The first Web route collection failed because required `JWT_SECRET` was absent;
rerunning with an isolated fixture environment passed without changing source.

Commands used the existing package scripts and Vitest configuration: Desktop
integration filters `release-acceptance-agents-assets-mcp`,
`release-acceptance-agents-assets-plugin-mcp`, `antigravity-mcp-agent-import`;
Desktop unit filter `mcp`; Core filter `mcp`; CLI `tests/run.test.ts -t MCP`;
Web `src/routes/agents.test.ts`, `src/services/agent-services.service.test.ts`,
`src/services/agent-services.dependencies.test.ts` plus the three client tests
listed above. All used `pnpm`; native Antigravity required
`PROMPTHUB_NATIVE_AGENT_TESTS=1`.

### Isolated GUI Acceptance

- Fresh startup without an authority fixture; manual creation and same-process
  detail/list rendering; metadata/argument edits; library disable and re-enable.
- Static health refresh; missing-command and missing-env fixtures remain explicit
  error states rather than being counted as successful service connections.
- Actual Codex TOML and Cursor JSON distribution, edited-argument synchronization,
  native-file readback, unrelated-entry preservation and binding persistence.
- Agent detail import, pasted JSON import and local config-file path import;
  exact `Docs.API` identity preserved; duplicate import adds no record; malformed
  config is rejected without changing existing records.
- Environment edit persists while renderer inventory remains redacted.
- Process restart reads all three records, changed arguments and two bindings;
  platform removal, cancelled deletion and confirmed deletion work. A second
  restart shows an empty My MCP list and no bindings or canonical MCP bundles.
- Library disable produces `skipped-server-disabled` on synchronization and does
  not disable/remove an already distributed native entry. Runtime stop/start is
  not implemented by this switch; explicit platform removal is a separate action.

### Findings and Remaining Acceptance

1. **Test drift:** `mcp-manager-import.test.tsx` still mocks/asserts `createServer`
   for Agent detail import. The current action correctly uses `createFromSource`
   with the exact target preset/name so main rereads the native source, rather
   than persisting redacted inventory values. Real IPC/GUI import passed, but the
   stale component assertion keeps the unit gate red. It was not weakened.
2. **Misleading empty-description text:** `McpFullDetailPage.tsx` uses
   `mcp.selectServerHint` for an already saved server with no description.
3. **Untranslated health errors:** `packages/core/src/mcp-health.ts` supplies
   Chinese issue messages directly to the English GUI, reproduced with
   `COMMAND_NOT_FOUND`.
4. **TOML cleanup residue:** removing the last managed Codex entry leaves the
   opening PromptHub block comment without its closing comment. Native entries
   are removed and unrelated values remain; the observed file still parses,
   but managed-block cleanup is incomplete.
5. **Unfinished product surface:** canonical automatic snapshots are tested, but
   formal version list/detail/diff/manual-create/restore/delete entrypoints,
   conflict workflow and confirmed legacy-sidecar cleanup remain unfinished.

Health checks do not launch an MCP process, perform an MCP handshake or call a
tool. Standalone Web currently offers Agent MCP inventory browsing, not the
Desktop My MCP mutation workflow. Remote marketplace/network imports, real MCP
protocol connections, Web GUI, Windows/Linux hardware and release packaging were
not accepted by this audit. The active change remains in progress.

## MCP correction #231 — 2026-10-13

Saved MCP entries with no description display the dedicated empty-description
key in all seven locales. `mcp-detail-feedback.test.tsx` asserts the rendered
empty state and absence of the selection/save hint. In an isolated copy,
restoring the original hint makes this test fail on the empty-state assertion
(exit 1); the repaired MCP component batch passes 204 tests in 26 files.
The isolated English Electron detail view displays the repaired text before
and after process restart. No CLI/Web entrypoint uses this Desktop detail UI.

## MCP correction #232 — 2026-10-13

Desktop health results translate stable issue codes with command/field/cwd
context in all seven locales. Core/CLI diagnostics are English and omit literal
environment/placeholder values. `mcp-health-feedback.test.tsx` asserts localized
text instead of the legacy message; restoring direct diagnostic rendering in
an isolated copy fails that assertion (exit 1). Core
`mcp-health-language.test.ts` asserts codes and English diagnostics; the Core
MCP/resource batch passes 102 tests. Isolated English Electron GUI shows the
missing-command error. Health remains static validation, not a protocol handshake.

## MCP correction #233 — 2026-10-13

Shared Codex TOML removal preserves unrelated sections and comments and removes
empty paired managed markers. `packages/core/tests/mcp-toml-cleanup.test.ts`
performs three apply/remove cycles and checks exact retained content and no
managed marker. Restoring the original removal in an isolated copy fails on
the orphan opening marker (exit 1); the repaired cleanup/backup batch passes
27 tests. Isolated Electron distribution/uninstall and process restart preserve
the unrelated Codex entry and leave neither managed marker. Desktop and CLI
consume the shared remover; Web's existing Agent MCP surface is read-only.

## MCP history entrypoints #234 — 2026-10-13

Desktop Versions and initialized-workspace CLI expose list/detail/diff/manual
create/note/restore/delete. Public Core regressions cover configuration versus
metadata changes, secret masking, credential-only diff, publication rollback,
target preservation and reopen. A 100-version fixture reads only the selected
five version payloads plus the current version (4.42 ms on the test machine);
this is a scoped measurement, not a general performance guarantee. The clean
submission snapshot's equivalent measurement was 4.08 ms with the same six
payloads. Keeping the current definition during a restore instead of loading
the historical definition makes two Core assertions fail (arguments and
historical credentials, exit 1); this mutation was limited to an isolated copy.

Registered preload/IPC tests cover all actions, 11 malformed inputs without
mutation, and the existing asset snapshot export/restore with complete retained
history and notes after reopen (3 passed). CLI `runCli` covers every version
action in an initialized workspace using a non-secret fixture. The independently built CLI bin entry reads
the Electron-created retained versions and v1 note/definition after reopen.
A fresh CLI profile can still create a server, but its history request fails
with the explicit initialization error (exit 10), confirming the remaining gap.
Isolated Electron GUI accepts automatic v2, manual
v3, comparison/note, restored v4, cancelled/confirmed historical deletion, v5
without number reuse, current-version deletion protection, light/dark rendering
and process restart with the retained history/note. Restoring history never
rewrites the distributed Codex file. A HEAD-plus-owned-changes submission
snapshot, excluding other dirty adaptation work, passes 82 Core/schema/resource/
backup tests, the 3 registered history IPC tests, and the CLI history workflow.
Desktop source/test, Core and CLI typechecks and the standalone CLI build pass
on that snapshot. These checks overlap the earlier dirty-source batches.

The CLI still does not construct the device secret-store adapter; list/detail
use redaction, but comparison/restoration involving stored credentials require
an adapter and remain unsupported there. Core credential tests inject a fixture
store and do not prove OS vault security or CLI credential access.

The JSON-only standalone CLI initialization/migration, device vault access and O(S) mutation target
remain incomplete, so #234 is in_progress and must not use Closes. SQLite
foundation ownership conversion, full #203 sidecar/retention scope, entry import
conflict workflows and Windows/Linux release acceptance remain separate gates.

## MCP import regression #230 — 2026-10-14

The Agent detail component assertion uses the actual createFromSource request
with exact target/name and asserts that createServer/importFile were not called.
The production source-import contract is delivered in `bd4ad7f3` (#220), so the
test correction can now be submitted independently. The combined independent
HEAD-plus-authorized-MCP snapshot passes 204 MCP unit tests (including this
file's 9 cases) and 9 registered IPC/history cases. Re-run from the repository:
`pnpm --dir apps/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=1 tests/unit/components/mcp-manager-import.test.tsx`.
The component's mocked IPC result proves request/UI selection, not persistence;
`antigravity-mcp-agent-import.test.tsx` supplies real storage/reopen and injected
AES-GCM boundary coverage. The isolated Electron non-secret Agent import/edit/
process-reopen also passes. The OS-backed credential import remains explicitly
blocked by unavailable Electron secret storage, not classified as GUI success.

### Cross-surface checks and resource closure

- Desktop MCP unit: 204 passed; registered MCP integrations: initial 38 passed,
  followed by the expanded history file's 3 passed (overlapping, not additive).
- Core MCP/resource: 102 passed; cleanup/canonical backup: 27 passed.
- CLI MCP/history: 3 passed; 17 unrelated cases filtered out.
- Web client/runtime/bridge/service: 20 passed; authenticated Agent routes and
  dependencies: 13 passed after supplying the required isolated fixture config.
  Domain results are injected in route tests; these do not prove Web mutations
  or a Web GUI that the existing product does not expose.
- Desktop source/test, Core, CLI, Shared and Web typechecks; scoped Desktop lint
  and Desktop main/preload/renderer build passed.
- Whole-repository file-size gate fails on pre-existing
  `agent-usage-service.ts` (1,529 lines against 1,500 preferred); touched MCP
  files remain below the applicable limits. Full release packaging, live remote
  marketplace and real MCP protocol connections were not executed.
- Only isolated test profiles, home/platform files, source snapshots and named
  browser control sessions were used; personal application data were untouched.
  All owned Electron/test processes exited, port 19485 has no listener, and the
  named browser session is detached. Temporary profiles, snapshots and logs were
  moved to recoverable Trash on 2026-10-14; the active temporary root no longer
  exists. Existing user processes and data were not changed.

## MCP correction #235 — 2026-10-14

The MCP history dialog reuses the existing Modal/confirmation components and
theme tokens. Its local keyboard handler cycles plain Tab/Shift+Tab through
enabled controls in DOM order, including initial container focus, without a
global listener or changes to other dialogs. Modifier shortcuts remain native.
Confirmation runs before the mutation busy state so cancellation can return
focus to the enabled trigger; the parent handler does not intercept the separate
confirmation portal.
When a mutation disables the active control and Chromium moves focus to body,
the local busy-state effect focuses the history dialog container; it leaves
focus in other dialogs or controls untouched.

`mcp-version-history-focus.test.tsx` covers forward/reverse wrapping, exclusion
of disabled controls, modifier passthrough, confirmation focus and cancellation
without restoring data, and confirmed restore dispatch with retained dialog
focus. Its single scenario exceeds 50 lines because the fixture
and the complete keyboard/confirmation sequence share one rendered dialog;
splitting it would obscure the same-instance focus lifecycle. The original
untrapped dialog failed the forward-focus assertion (exit 1). Isolated Electron
also reproduced focus returning to body when the confirmation trigger was
disabled before opening the confirmation.
The repaired cancellation returned focus to the trigger in Electron, but a
confirmed restore reproduced body focus after creating v6; the local busy-state
focus restoration addresses that observed path as well.

The independent HEAD-plus-owned-changes snapshot passes the focus regression
and existing confirmation host tests (3 tests in 2 files), Desktop source/test
typechecks, scoped lint and the main/preload/renderer build. Re-run commands:

- `pnpm --dir apps/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=1 mcp-version-history-focus confirmation-host`
- `pnpm --dir apps/desktop typecheck` and `pnpm --dir apps/desktop typecheck:tests`
- `pnpm --dir apps/desktop exec eslint src/renderer/components/ui/Modal.tsx src/renderer/components/mcp/McpVersionHistoryModal.tsx`
- `pnpm --dir apps/desktop build`

The component uses injected IPC results and a store reload stub; persistence is
not inferred from those mocks. The independent Electron build passes forward/
reverse Tab, disabled-control exclusion, confirmation focus, Escape cancellation
with trigger focus and unchanged v6, confirmed v1 restoration creating v7, and
retained dialog focus/Tab cycling afterward. The isolated Codex target file still
contains only the original unrelated model/entry. The keyboard handler scans
only the current page's controls linearly and performs no history or filesystem
I/O. This is Desktop transient UI state only: no persistence, CLI or Web contract
change. Other Modal consumers retain their default behavior.

Owned GUI/browser sessions are closed, port 19485 is free, and isolated profiles,
snapshots and logs were moved to recoverable Trash. Full packaged/cross-platform
release acceptance and real MCP protocol connections were not run.

## MCP adaptation #220 — 2026-10-14

The authorized submission includes only existing MCP native import/normalization,
credential masking/vault references, target projection, Agent MCP import/preview
and their regression tests. Codex root/provider preferences, unrelated Agent
models, Plugin and Prompt changes remain outside this commit. The shared preset
type moves to Shared because the target import request crosses the IPC boundary;
its unrelated Codex-root behavior change is not included.

The current official Antigravity MCP contract requires `serverUrl` for remote
servers and defines `authProviderType`, OAuth, disabled tools and disabled state:
<https://antigravity.google/docs/mcp> (checked 2026-10-14). Native fields are
adapted once into the typed internal contract, not retained as runtime aliases.
OAuth secrets are excluded from portable definitions and previews; selected
Agent import reads actual credentials from the source file in the main process.

Independent HEAD-plus-authorized-MCP verification passes 204 Desktop MCP unit
tests, 9 registered IPC/storage integrations and 29 Core history/schema tests;
Desktop source/test, Core and Shared types, scoped renderer lint and the Desktop
build pass. The #230 test-only
correction is included in the verification snapshot but will be committed
separately. Windows IDE 2.16.0 native acceptance, remote/OAuth handshakes and
release packaging remain unverified; those boundaries must not be promoted from
source or local IPC results. Isolated Electron renders the exact native
`serverUrl`/tool selection and masks OAuth/header credentials. The actual
credential import reports `MCP_RESOURCE_SECRET_STORE_UNAVAILABLE` in this runtime
and preserves an empty My MCP library and the source file; this is not a GUI
success claim. IPC crypto tests substitute Electron's unavailable OS boundary
with real AES-GCM and disposable fixture keys.

The same isolated UI also imports a valid non-secret native definition, edits
its display name and retains `Docs.API`, OAuth client identity and disabled-tools
selection after a full process restart. The original native file and unrelated
entry remain unchanged by import/edit. The test launcher uses software rendering
and disables background renderer throttling because the initial occluded runtime
did not advance click-stability frames; this is not default-GPU or packaged UI
acceptance. Owned GUI processes and the named browser session are stopped; the
temporary verification root is retained only while the authorized migration work
continues. #220 remains Refs-only for its unverified native/credential boundaries.

## MCP SQLite adoption #234 — 2026-10-14

SQLite migration 4 owns current definitions, bindings, version metadata and encrypted
credential records; immutable version contents remain under `data/mcp`. Migration
checksums 1–3 are unchanged. Known legacy JSON, canonical bundles and Electron vault
inputs are adopted once, with explicit conflicts, retained unavailable credentials,
bounded recovery archives and retry after publication failure. Current code does not
select a second MCP backend using the canonical-files feature flag.

Desktop and fresh CLI workspaces share the OS-backed AES-GCM key provider. Version
restore appends a new current version without distributing it; notes do not rewrite
payloads, current versions cannot be deleted, and deleted numbers are not reused.
Selected mutations read indexed server records and append only their new contents.
MCP SQL authority survives canonical catalog recovery; an unreadable/missing MCP DB
is not replaced by an empty reconstruction from history alone. Domain snapshots and
portable ZIPs preserve the seven MCP tables and referenced contents, excluding old
plaintext inputs. Restore validates counts, FKs, digests and immutable collisions.
Upgrade and rollback instructions are in `docs/mcp-version-history.md`.

Verification used an independent HEAD-plus-owned-changes snapshot and existing
dependencies. No unrelated dirty Agent, Plugin, Prompt or Rules changes were included.

- Core migration/history/database/credentials/catalog suite: 70 passed; affected
  final migration/history/snapshot checks: 14 passed. The selected-record getter
  assertion and history workflow then passed all 6 cases. These overlap and are
  not additive. A 100-version page read zero history payloads (about 2 ms locally).
- Desktop MCP unit suite: 66 passed. Later selected-mutation checks passed 51
  cases; their one stale duplicate-message assertion was corrected and passed
  in a focused rerun. The final registered IPC suites passed 10 cases, including
  legacy Electron-vault adoption, redacted edit, reopen and snapshot restoration.
- Current MCP portable ZIP: 1 real SQLite/filesystem round-trip passed, including
  encrypted credentials, retained notes/history, old-plaintext exclusion and cleanup.
- CLI public `runCli` workflows: 2 passed, covering fresh and initialized roots.
  The built CLI also passed native macOS credential import, masked output, explicit
  custom-target projection and reopen. Two simultaneous CLI processes created
  distinct versions 2 and 3, leaving the complete [3, 2, 1] history.
- Web settings/Agent routes and asset/desktop-backup services: 29 passed. Web
  remains read-only for Agent MCP; this does not claim a Web version-editing UI.
- Core/CLI/Desktop source types, Desktop test types, Web types, scoped ESLint and
  Desktop/CLI production builds passed. Relevant canonical checkpoint/portable
  import/restore tests passed in the broader storage batch.
- The repository file-line gate remains red on the pre-existing
  `agent-usage-service.ts` preferred-limit excess (1,529 versus 1,500 lines).
  It is outside this submission; no full release-gate pass is claimed.
- Spec governance tests (5) and traceability (16 changes) pass. The aggregate
  spec gate stops on the pre-existing missing `existing-feature-release-acceptance`
  index entry; its already-dirty generated index is outside this MCP submission.

Re-run entrypoints (Vitest uses one worker, `--minWorkers=1 --maxWorkers=1`):

```sh
pnpm --filter @prompthub/core exec vitest run tests/mcp-database.test.ts tests/mcp-credentials.test.ts tests/mcp-storage-migration.test.ts tests/mcp-storage-upgrade.test.ts tests/mcp-storage-snapshot.test.ts tests/mcp-version-history.test.ts tests/canonical-mcp-library.test.ts tests/canonical-catalog-reconciliation.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project integration tests/integration/mcp-version-history.test.ts tests/integration/antigravity-mcp-agent-import.test.tsx --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/desktop exec vitest run --project unit tests/unit/main/mcp-portable-snapshot.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/cli exec vitest run tests/mcp-version-history.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/web exec vitest run --config vitest.config.ts src/routes/settings.test.ts src/routes/agents.test.ts src/services/agent-assets-sync.test.ts src/services/desktop-backup-store.test.ts --minWorkers=1 --maxWorkers=1
pnpm --filter @prompthub/core --filter @prompthub/cli --filter @prompthub/desktop typecheck
pnpm --filter @prompthub/desktop typecheck:tests
pnpm --filter @prompthub/desktop --filter @prompthub/cli build
```

Isolated Electron GUI acceptance exercised version entry, note editing, manual
creation, comparison, confirmed restore and historical deletion. Restore created
v4 from v1 without touching the Agent file; deleting v3 kept v4 current. Saving a
header credential created v5, and reopened forms showed only `[REDACTED]`. Explicit
distribution wrote the real fixture credential to the isolated Cursor config,
while the original Antigravity file and unrelated entry stayed unchanged. A full
process restart retained v5/v4/v2/v1 (deleted v3 stayed absent), the library and
masked credential. Native keyring tests
used unique owned entries; isolated HOME initially lacked a default keychain, then
resolved only the OS keychain through its standard macOS location. All Agent roots
and application data remained isolated. No external MCP protocol/OAuth handshake,
Windows/Linux physical acceptance or packaged release acceptance was performed.
Those #220 boundaries and the broader #203 work remain open; #234 is local delivery,
not publication or a claim that the remote issue has already closed.

The owned Electron process and browser session are stopped, port 19486 is free,
and unique native credential entries and temporary keychain links are removed.
