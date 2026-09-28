# Agent Management Workbench Test Plan

## Scope

This plan verifies the desktop Agent workspace and the Skill, MCP, Rules, and
Plugin workflows reachable from it. Tests use a real Electron process, isolated
`HOME` and `userData` directories, real SQLite and filesystem adapters, and no
real credentials or user data.

The plan covers supported product operations rather than forcing identical CRUD
semantics onto domains that do not expose them. Every successful mutation must
be verified in the owning domain, the Agent projection, and durable storage.

## Evidence Rules

- Each case starts from its own isolated profile and records exact fixture paths.
- UI assertions use roles, labels, visible state, enabled state, counts, and
  errors. Screenshots are supporting evidence, not the primary assertion.
- Durable assertions read SQLite, canonical files, and target Agent files after
  the UI operation and again after Electron restart where persistence matters.
- Delete and uninstall cases assert both removal and preservation of unrelated
  files. Failure cases assert no partial rows, files, versions, or active state.
- Existing green E2E tests count only for the assertions they actually make.
  Missing assertions require a new or extended deterministic test.
- Tests run serially with one Electron worker and must close the application,
  listeners, local servers, temporary profiles, and file handles.

## Priority

| Priority | Coverage                                                                                 |
| -------- | ---------------------------------------------------------------------------------------- |
| P0       | Agent shell, settings, Skill lifecycle, MCP lifecycle, Rules lifecycle, Plugin lifecycle |
| P1       | Provider activation, config editing, sessions, restart persistence, rollback             |
| P2       | Capability matrix, layout/accessibility, large inventories, platform-specific adapters   |

## Functional Cases

### `E2E-AGENT-001`: Installed Agent Discovery And Selection

**Setup:** Create only Claude Code, Codex, Pi, and Kiro roots in an isolated
`HOME`; leave all other platform roots absent.

**Steps:**

1. Launch Electron and open `Agents`.
2. Search each installed Agent and select it.
3. Clear search and select a different Agent.
4. Refresh the inventory.
5. Restart Electron with the same isolated profile.

**Assertions:**

- Only roots that satisfy the installed-platform contract appear.
- Search does not introduce an absent Agent.
- The selected heading, root path, overview counts, and tabs all belong to the
  same Agent.
- Unsupported tabs are disabled with an accessible reason and perform no read.
- Refresh does not create absent platform roots or native config files.
- The persisted selection restores only if the Agent remains installed;
  otherwise the first valid installed Agent is selected.

### `E2E-AGENT-002`: Agent Settings And Pinning

**Steps:**

1. Open an installed Agent's `More actions > Edit Agent` dialog.
2. Verify the current root, cancel, and confirm selection is unchanged.
3. Reopen, choose a valid isolated replacement root, and save.
4. Pin and unpin the Agent from the list.
5. Restart Electron.

**Assertions:**

- Cancel performs no settings write.
- Saving a valid root updates the list, header, paths, and capability reads
  together; no stale old-root data remains visible.
- Pinning changes ordering without duplicating the Agent.
- Root and pin state survive restart in canonical renderer settings.
- Empty, missing, null-byte, and non-directory roots are rejected without
  changing the previous setting.

### `E2E-AGENT-003`: Provider Profile Create, Read, Update, And Delete

**Setup:** Use a local bounded HTTP server and synthetic provider credentials in
the isolated device secret store.

**Steps:**

1. Open `Provider & Model` for Claude Code.
2. Create a custom provider with endpoint, protocol, model routes, and key.
3. Reopen the profile and verify all non-secret values.
4. Edit its display name, endpoint, and one model route.
5. Delete the profile after confirmation.

**Assertions:**

- Creation produces one stable-id profile; duplicate display names remain
  separate. `[待确认: ISS-20260825-002]`
- The key never appears in DOM, IPC payload evidence, ordinary settings JSON,
  logs, screenshots, or export.
- Editing preserves the same profile id and unrelated fields.
- Delete removes the profile and owned secret reference but does not change
  native Agent config unless the deleted profile was explicitly active.
- Cancel at every dialog performs no durable mutation.

### `E2E-AGENT-004`: Provider Import, Test, Activate, And Roll Back

**Steps:**

1. Import a compatible PromptHub provider into Claude Code.
2. Run connection and model tests against the local HTTP server.
3. Preview activation and confirm.
4. Verify native config, then simulate an external native edit.
5. Preview another activation and exercise cancel and confirmed overwrite.
6. Inject post-write verification failure.

**Assertions:**

- Import shows only protocol intersections supported by both sides.
- Connection/model tests report model, status, latency, and structured errors;
  the server receives the intended protocol and no unexpected request fanout.
- Preview redacts secrets and lists changed versus preserved fields.
- Active state is derived from re-read native config, not a UI boolean.
- External edits are detected before write.
- Verification failure restores byte-identical prior config and leaves no false
  active state or leaked secret in diagnostics.

### `E2E-AGENT-005`: Skill Create, Read, Update, Distribute, Remove, And Delete

**Setup:** Start with an empty PromptHub Skill library and an installed Codex
root. Use one multi-file Skill containing `SKILL.md` and a nested text file.

**Steps:**

1. From the owning Skills workspace, create `manual-agent-skill` with metadata,
   instructions, and the nested file.
2. Open the Skill detail and file tree.
3. Edit metadata and `SKILL.md`; create a version snapshot.
4. Distribute the Skill to Codex in symlink mode.
5. Edit the owned Skill again and verify the linked Agent projection changes.
6. Remove the Skill from Codex.
7. Restart Electron and re-open the Skill and its version history.
8. Delete the Skill from the PromptHub library and restart Electron again.

**Assertions:**

- Create produces one DB Skill, one canonical package, complete file inventory,
  and a visible detail row; duplicate create does not silently merge.
- Read shows exact metadata and file bytes without exposing `.git`,
  `.prompthub`, symlink escapes, or hidden runtime files.
- Update changes the current version and preserves prior snapshot bytes.
- Distribution writes one contained symlink below the validated Agent Skills
  root, resolves to the complete owned package, and shows the same installed
  state in Agent and Skills views.
- Editing the owned package is immediately visible through the symlink without
  duplicating or rewriting the Agent copy.
- Remove deletes only the contained Agent symlink and preserves the owned Skill.
- Restart preserves exact metadata, file bytes, current version, and snapshot.
- `[待确认: ISS-20260825-001]` Final library delete removes DB Skill/version
  rows and PromptHub canonical package state and never touches unrelated Agent
  files. The stable Skill matrix says managed repos are deleted and linked
  external sources are preserved, while the current confirmation UI promises
  source preservation without classifying ownership. The managed and external
  cases require separate assertions after that product decision. Copy-mode
  drift and overwrite confirmation remain required under `E2E-AGENT-B006`
  rather than being conflated with this symlink lifecycle.

### `E2E-AGENT-006`: MCP Create, Read, Update, Distribute, Remove, And Delete

**Setup:** Create an Agent native MCP file containing one unrelated server.

**Steps:**

1. Create a stdio MCP entry with non-secret args and a secret environment
   reference in the owning MCP workspace.
2. Open and edit its name and command arguments.
3. Distribute it to the selected Agent from the Agent `MCP` tab.
4. Edit the native file externally, then attempt an update.
5. Remove the distributed MCP entry and delete the library entry.

**Assertions:**

- CRUD uses stable identity and parameterized persistence.
- Secret values do not enter renderer state, logs, screenshots, or ordinary
  export; only allowed references cross the contract.
- Distribution preserves unrelated native servers and formatting semantics
  supported by the target adapter.
- External digest conflict blocks silent overwrite.
- Remove deletes only the managed MCP entry and preserves unrelated native
  configuration; final delete survives restart.

### `E2E-AGENT-007`: Rules Create, Read, Update, History, Restore, And Snapshot Delete

**Steps:**

1. Open an Agent whose declared global rule file is absent.
2. Confirm the create prompt and create the empty rule.
3. Edit and save rule content twice.
4. Open history and restore the first saved version.
5. Delete one non-current snapshot through the owning Rules workflow.

**Assertions:**

- Merely opening the tab does not create the missing file.
- Confirmed create writes only the declared contained path.
- Each save updates the file and creates recoverable history.
- Restore returns exact prior bytes and records the restoration result.
- Snapshot delete removes only that history entry; the rule file and current
  snapshot remain unchanged.
- Invalid paths, symlink escapes, and external modification conflicts fail
  closed with no partial file or history entry.

### `E2E-AGENT-008`: Plugin Install, Read, Update, Distribute, Remove, And Delete

**Setup:** Use a local deterministic Plugin bundle with manifest, child Skills,
MCP, Rules, and one unrelated package file.

**Steps:**

1. Install the Plugin into the owning Plugin library.
2. Open detail, content, and file inventory.
3. Update from a second local bundle revision and create a snapshot.
4. Distribute the Plugin package to a compatible Agent.
5. Remove the Agent distribution.
6. Delete the owned Plugin.

**Assertions:**

- Install validates manifest, path containment, complete inventory, and stable
  source identity before publishing.
- Read shows real package files and child inventory.
- Update preserves local changes unless overwrite is explicitly confirmed and
  retains the previous snapshot.
- Distribution and removal affect only the selected Agent target.
- Delete removes owned package and DB metadata after confirmation and leaves no
  partial child-asset ownership or unrelated target files.

### `E2E-AGENT-009`: Config File Read And Successful Save

**Steps:**

1. Open Claude Code `Config Files` with safe config, auth, session, cache, and
   symlink-escape fixtures.
2. Open the safe JSON config and edit a non-secret model field.
3. Save and reopen the file.

**Assertions:**

- Safe user configuration appears; auth, session, cache, backup, installed
  asset, binary, oversized, and symlink-escape entries do not.
- Embedded secrets are opaque placeholders in renderer text.
- Save preserves original secret bytes, writes the edited field atomically,
  creates an encrypted device-local backup, and reopens at the new revision.

### `E2E-AGENT-010`: Session List, Search, Read, Resume, Export, And Delete

**Steps:**

1. Open bounded Claude and Codex session fixtures.
2. Search by title and project, filter, sort, paginate, and open a transcript.
3. Inspect resume, export, reveal, and project-folder actions.
4. Permanently delete one synthetic session after confirmation.
5. Restart Electron.

**Assertions:**

- Draft text does not filter until submitted where the UI contract requires it.
- Transcript shows user/assistant content while hiding metadata/tool noise and
  secret-like internal records.
- Large tables remain horizontally contained; latest-page navigation is stable.
- Resume command uses the selected platform's exact session identity.
- Export contains the intended bounded transcript and no hidden internal record.
- Delete removes the exact native footprint, retains no fabricated transcript,
  and remains absent after restart.

## Boundary Cases

### `E2E-AGENT-B001`: Config Validation And External Modification

**Assertions:** invalid JSON/TOML cannot be saved; stale revision is rejected;
no backup is reported as successful for a failed write; prior bytes remain
unchanged; retry succeeds only after reload.

### `E2E-AGENT-B002`: Filesystem Trust Boundary

**Assertions:** null bytes, traversal, absolute renderer paths, symlink escapes,
FIFO/device files, oversized files, and paths outside the resolved Agent root are
rejected before read or write; external targets remain byte-identical.

### `E2E-AGENT-B003`: Empty And Missing Roots

**Assertions:** absent platforms do not appear; an empty but valid installed root
shows declared missing files without creating them; capability tabs do not read
or write unsupported paths.

### `E2E-AGENT-B004`: Large Inventory And Bounded Work

**Setup:** 1,000 safe config candidates, 2,000 sessions, and 500 asset rows.

**Assertions:** discovery, list rendering, search, and selection stay within the
recorded time/memory budget; scans and concurrency remain bounded; renderer IPC
does not receive unbounded transcript bodies or secret files.

### `E2E-AGENT-B005`: Restart And SQLite Rebuild

**Assertions:** canonical Agent settings, provider profiles, and owned assets
survive normal restart; deleting the rebuildable SQLite projection and restarting
reconstructs it without changing canonical files, native Agent configs, selected
roots, or active provider state.

### `E2E-AGENT-B006`: Failure And Rollback Matrix

**Assertions:** failure at backup, temporary write, rename, verification, SQLite
transaction, target distribution, or cleanup returns a specific error and leaves
the previous DB rows, canonical package, native file, active state, and UI state
consistent. No case may pass by swallowing an error or showing success early.

## Platform Capability Matrix

Representative adapters must cover each storage shape rather than repeating the
same happy path for every registry entry:

| Shape                           | Representative              | Required proof                                           |
| ------------------------------- | --------------------------- | -------------------------------------------------------- |
| JSON native config              | Claude Code                 | secret redaction, preserve unknown fields, rollback      |
| TOML native config              | Codex                       | structured validation, provider/model activation         |
| Split JSON config               | Pi                          | provider/model projection and no eager MCP file creation |
| Declared missing rule           | Gemini/Kiro                 | confirm-before-create and containment                    |
| Bounded JSONL sessions          | Claude/Codex                | search, transcript filtering, exact delete footprint     |
| Shared/native database sessions | Cursor                      | bounded lookup and native project identity               |
| Unsupported capability          | one installed partial Agent | disabled UI and zero underlying mutation                 |

Every built-in Agent still requires a registry/capability declaration test. A
representative adapter test does not permit an unverified platform to claim a
supported capability.

## Deterministic Test Files

Existing files should be extended when they already own the behavior; avoid
parallel duplicate specs.

| Area               | Target test                                                |
| ------------------ | ---------------------------------------------------------- |
| Registry and shell | `apps/desktop/tests/e2e/agent-workspace.spec.ts`           |
| Settings           | `apps/desktop/tests/e2e/agent-settings-dialog.spec.ts`     |
| Provider lifecycle | `apps/desktop/tests/e2e/agent-provider-workbench.spec.ts`  |
| Skill lifecycle    | `apps/desktop/tests/e2e/agent-skill-lifecycle.spec.ts`     |
| MCP lifecycle      | `apps/desktop/tests/e2e/agent-mcp-lifecycle.spec.ts`       |
| Rules lifecycle    | `apps/desktop/tests/e2e/agent-rules-missing-file.spec.ts`  |
| Plugin lifecycle   | `apps/desktop/tests/e2e/agent-plugin-lifecycle.spec.ts`    |
| Config boundaries  | `apps/desktop/tests/e2e/agent-config-files.spec.ts`        |
| Sessions           | `apps/desktop/tests/e2e/agent-session-search.spec.ts`      |
| Restart/rebuild    | `apps/desktop/tests/e2e/agent-persistence-restart.spec.ts` |

## Execution Order

1. Manually execute one real Electron case at a time and record actual UI,
   filesystem, SQLite, and restart results.
2. Add or tighten the deterministic test for that exact behavior and assertion
   set. Do not batch-generate unreviewed placeholders.
3. Run only that one test case outside any Agent.
4. If it fails, classify product defect, test drift, or environment failure
   before editing. Product defects remain failing evidence.
5. After P0 and P1 cases pass individually, run the serial Agent E2E surface as
   a regression gate. The aggregate run is not a substitute for steps 1-4.

## Current Evidence

- `OBS-AGENT-001`: A real isolated Electron launch entered the Agent workspace
  and displayed Claude Code, Codex, Pi, and Kiro fixtures with live paths,
  overview counts, tabs, usage state, and capability-disabled Appearance.
- `OBS-AGENT-002`: The same launch also materialized `.gemini` Antigravity and
  Gemini state although those roots were not part of the test fixture. Root
  cause candidate: the default `minimizeOnLaunch` renderer setting creates the
  tray; the tray quota projection queries every usage-capable Agent, including
  Antigravity; that adapter can start the installed Antigravity helper, which
  initializes `.gemini`; later path-based discovery then reports both
  Antigravity and Gemini as installed. A short automated launch did not reproduce
  the write, so `agent-discovery-side-effects.spec.ts` now waits for the bounded
  tray scan and asserts both the visible registry and filesystem state. The case
  is classified as a product defect because the bounded deterministic run now
  fails on the visible Antigravity row and created filesystem root.
- `OBS-AGENT-003`: A real isolated Electron Skill lifecycle completed create,
  detail read, metadata and `SKILL.md` updates, snapshot, Codex symlink install,
  uninstall, restart/reload, version-history read, and library delete. SQLite,
  canonical package, source workspace, and symlink assertions matched the
  clarified `E2E-AGENT-005` contract.
- `OBS-AGENT-004`: Real config-file reads redacted embedded secrets in the
  renderer. A Codex TOML edit then showed a failed-save toast and left the
  native file byte-identical; the main-process error was
  `AGENT_CONFIG_BACKUP_ENCRYPTION_UNAVAILABLE` in the unsigned macOS Electron
  test runtime.
- `OBS-AGENT-005`: A real MCP manual-create attempt with only non-secret stdio
  fields showed a failed-create toast and created no library row. The backing
  main-process error was `MCP_RESOURCE_SECRET_STORE_UNAVAILABLE`, so the MCP
  lifecycle is blocked in this runtime before distribution can be tested.
- `OBS-AGENT-006`: A real local Plugin import showed the toast `The Plugin
package failed validation. Its manifest, size, or file paths are invalid`.
  The backing handler error was `resource bundle manifest is missing` for the
  not-yet-published canonical Plugin bundle; the UI stayed at zero installed
  Plugins and the canonical Plugin directory remained empty.
- `OBS-AGENT-007`: A real Rules workflow saved two distinct Claude global-rule
  revisions, exposed four version snapshots, restored the first saved revision
  into the draft, and persisted it. The native file and canonical/version
  files contained the restored bytes.
- `OBS-AGENT-008`: The deterministic real-Electron Skill lifecycle reached UI
  create, detail read, metadata update, nested-file creation and edit,
  `SKILL.md` edit, snapshot/history, Codex symlink install, filesystem target
  verification, uninstall, and same-profile restart. Exact success Toasts were
  observed for both file saves, the snapshot, Codex install, and uninstall.
  Strengthened checkpoints prove `docs/note.txt` survives uninstall, Electron
  close, canonical authority publication, workspace hydration, and restart with
  exact bytes. The current failure is instead `ISS-20260825-001`: confirmation
  promises source preservation, but deleting the managed Skill removes its
  previous managed `local_repo_path`. DB Skill/version deletion and unrelated
  Agent-file preservation pass before this final ownership assertion.
- `OBS-AGENT-009`: A canonical-authority real Electron Provider run created one
  Claude profile and verified its UI detail, public IPC graph, redacted export,
  canonical `agent.json`, and byte-identical native Claude config. Creating a
  second profile with the same display name then produced the exact inline alert
  `Provider operation failed` and left the first profile intact. Root cause is
  `ISS-20260825-002`: `E2E-AGENT-003` requires duplicate display labels with
  stable IDs, while the DB and implementation record enforce a case-insensitive
  unique active name per platform.
- `OBS-AGENT-010`: The focused Provider CRUD test passed in real Electron. It
  verified cancelled create/edit/delete operations, two distinct stable IDs,
  UI detail reads, public IPC graphs, redacted export, canonical `agent.json`,
  same-ID metadata and model-route update, same-profile restart recovery, final
  deletion, and byte-identical `.claude/settings.json` throughout. Command:
  `pnpm --dir apps/desktop exec playwright test tests/e2e/agent-provider-workbench.spec.ts --grep "creates, updates, restarts, and deletes"`.
- `OBS-AGENT-011`: The focused credential boundary test passed on the unsigned
  macOS Electron runtime where `safeStorage.isEncryptionAvailable()` is false.
  Save displayed the exact inline `role=alert` text `Provider operation failed`;
  the form remained open, and no Provider row, canonical Agent bundle, or
  `agent-secrets.json` was created. The synthetic credential did not appear in
  body text and native Claude config remained byte-identical. This Provider
  surface uses an inline alert rather than the shared Toast component. Command:
  `pnpm --dir apps/desktop exec playwright test tests/e2e/agent-provider-workbench.spec.ts --grep "keeps credential writes atomic"`.
- `OBS-AGENT-012`: A canonical-authority real Electron settings run proved that
  cancelling an Agent root edit performs no durable mutation, but saving a
  valid replacement root only updated the current renderer projection.
  `window.api.settings.get()` continued to omit the root. The confirmed
  authority-split defect is recorded as `ISS-20260825-008`; its accepted fix
  belongs to `desktop-settings-authority-convergence`, not another SQLite dual
  write.
- `OBS-AGENT-013`: The focused Rules lifecycle passed in real Electron. It
  created the declared Gemini rule, saved two exact revisions, restored the
  first snapshot into the draft without changing the native file before Save,
  persisted the restored bytes across restart, and deleted only the selected
  non-current snapshot while preserving the rule file.
- `OBS-AGENT-014`: The focused Sessions lifecycle passed in real Electron for
  Codex, Claude, Gemini, and Cursor fixtures. It covered submitted search,
  project filters, sorting, bounded transcript pagination, hidden-record
  filtering, Markdown/JSON export bytes, exact native deletion, and deletion
  persistence across restart. The initial restart exposed
  `ISS-20260825-009`: native deletion left a stale local-index row. Commit
  `da95f78b` removes the exact index row only after native deletion succeeds;
  the rerun passed all three cases.
- `OBS-AGENT-015`: The converged serial Agent E2E surface passed 19 tests in one
  worker across discovery, Provider, Skill, MCP, Rules, Plugin, Config Files,
  Sessions, and the shared workspace. The settings persistence case remains
  excluded from the green aggregate because `ISS-20260825-008` still fails with
  a committed Agent root of `undefined`; it is reported separately rather than
  hidden by the passing domains.

## Current Contract Convergence

`TEST-AGENT-219` validates FR-AGENT-138 / DES-AGENT-157. Status: partially exercised;
the full acceptance gate remains open.
The fixture, normal-path, failure and mutation matrix is defined once in
[current-contract-design.md, section 6](current-contract-design.md#6-测试与成本).
Existing symlink-to-copy and old-field hydration tests must change together with
the migrated implementation; their previous green results are not this gate.
Run normal complete-package and settings lifecycle first, then direct malformed
inputs and recovery after each durable publication boundary. Native desktop, CLI
and OS evidence are recorded separately. UI automation requires user authorization.

2026-09-28 configuration evidence:

- `packages/core/tests/agent-settings-upgrade.test.ts`: real SQLite upgrade,
  original device bytes, reset/reopen, restored input after a completion marker,
  conflicting inputs, transaction failure/rollback/retry and malformed inputs.
- `apps/desktop/tests/integration/agent-settings-workflow.test.ts`: registered
  settings IPC and renderer migration IPC, shared installer/repository reads,
  current-only writes and SQLite reopen. Electron transport is mocked; storage
  and business services are real. This is not GUI acceptance.
- `apps/cli/tests/agent-settings-upgrade.test.ts`: actual CLI dispatcher startup,
  historical SQLite roots, reset and subsequent startup with no resurrection.
- Core migration replaced with a no-op in an isolated copy: the normal upgrade
  test failed on the persisted current root, proving the regression detects the
  missing conversion. The temporary copy was removed.
- Focused checks and limitations are recorded in the design implementation
  record. Broken-link status, explicit-mode failures, complete historical-profile
  upgrades, unified migration checksums, Web and native-product acceptance remain
  outstanding; these configuration checks cannot substitute for them.
