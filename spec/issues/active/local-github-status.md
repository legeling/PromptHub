# Local GitHub Issue Status

## Purpose

This file is the local triage and delivery overlay for GitHub issues.

The GitHub snapshots record remote facts:

- `github-open.md`: issues currently open on GitHub.
- `../archive/github-closed.md`: issues currently closed on GitHub.

This file records PromptHub's local delivery state. A GitHub issue can remain
open while its local status is `local_done` or `release_pending`. Commit links
and automatic closure follow [the issue rules](../../rules/issue-management-rules.md#github-issue-状态规则);
remote closure and publication are recorded separately.

## Status Values

| Status            | Meaning                                                                       | GitHub action                        |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| `untriaged`       | The issue exists remotely but has not been classified locally.                | Leave open                           |
| `accepted`        | The issue is valid and should be handled, but implementation has not started. | Leave open                           |
| `in_progress`     | A local change is actively handling the issue.                                | Leave open                           |
| `local_done`      | Code, tests, and docs are complete locally, but not released.                 | Follow issue closure rules           |
| `release_pending` | The issue is assigned to a release that has not shipped yet.                  | Follow issue closure rules           |
| `released`        | The target version has shipped.                                               | Verify closure and refresh snapshots |
| `wontfix`         | The project will not implement this issue.                                    | Explain publicly, then close         |
| `duplicate`       | The issue is tracked by another issue.                                        | Link the canonical issue, then close |

## Current Local Overlay

### 0.6.0 Draft assignment — 2026-10-16

All currently completed product changes are included in the authorized 0.6.0
draft candidate. Their local delivery status is `release_pending`; draft assets
do not establish publication. Remote closure is verified separately after the
corresponding commits reach the default branch.

### #237 / #238 local fixes — 2026-10-15

| Issue | Local status | Verified scope / remaining boundary |
| --- | --- | --- |
| #238 | release_pending | Remote skills.sh search replaces partial-leaderboard filtering; ranked matches remain visible, errors and stale requests are isolated, repository + selector installation is retained. Domain-only hosted catalogs still have no package installer: mixed responses diagnose omitted hosted results; hosted-only responses fail explicitly. |
| #237 | release_pending | Plugins list/count/detail/picker share the enabled-Agent selection; capability flags remain unchanged. Antigravity reads independent IDE and CLI inventories without creating directories or changing distribution paths. Native CLI registration/install remains outside this fix. |
| #236 | untriaged | Left open as requested; this change neither fixes nor closes the Windows prompt-crash report. |

These issues were open at the targeted remote check on 2026-10-15. The fixes
are submitted as separate local issue commits; no remote issue changes, push
or release are included. #236 remains open. The older aggregate snapshot below
remains dated independently.

Behavior owners: [skills.sh search](../../knowledge/behavior/skills.md#skillssh-directory-search)
and [Agent assets](../../knowledge/reference/agent-platforms.md). The added
`pluginDiscoveryRootRelativePaths` registry field is read-only configuration,
not persisted user state; no schema or data migration is introduced. Reverting
the scoped source changes removes discovery/search behavior without moving or
deleting user files. Search is linear in the bounded API results, detail requests
reuse the existing page-size/concurrency policy, and inventory scans add one
direct CLI directory pass rather than recursive home scanning.

Verification: 163 distinct unit/component cases and 3 integration cases passed
across 14 files. Source and test TypeScript checking plus scoped ESLint passed.
Before submission, index-only source snapshots excluded all unrelated working
changes: #237 passed 82 unit/component plus 3 integration cases; #238 passed
81 unit/component cases. Both snapshots passed source/test TypeScript checks,
reusing existing dependencies (including the Web dependencies needed by tests).
The regression helper restores four pre-fix implementations from `30d9a628` in
an isolated source copy: 5 unit/component and 1 integration assertions fail
with exit 1 for the actual missing results/visible disabled targets/absent CLI
inventory. The helper's single invocation-and-report validation function keeps
its bounded subprocess and expected failure audit together; its longer body is
intentional and was executed successfully. Temporary sources/reports are removed.

- `plugin-manager-distribution.test.tsx`: disabled Claude is absent from list and
  picker, settings changes apply immediately, OpenCode capability stays disabled,
  and distribution requests contain only selected visible targets. Plugin API is
  mocked; this verifies renderer behavior, not native application loading.
- `skill-store-remote-skills-sh.test.tsx`: `searches the remote skills.sh directory
  beyond the browse index` covers exact and semantic matches, real component
  cards and repository/selector output, using a mocked HTTP boundary.
- `skills-sh-search-state.test.tsx`: malformed response, query recovery and old
  success/failure races; `skills-sh-store.test.ts` covers URL encoding, payload
  validation and mixed hosted sources. Existing package resolver/installer cases
  retain directory inventory and explicit-selector behavior.
- `plugin-antigravity.test.ts`: CLI-only custom root, invalid manifests and
  unregistered symlinks. `antigravity-plugin-entrypoints.test.ts` runs the real
  preload/registered IPC/business/SQLite/filesystem chain, substituting Electron
  transport and isolating HOME; checks IDE+CLI same-name inventories after reopen,
  unchanged source bytes, and existing copy/symlink distribution/removal.

Re-run from the repository root:

```sh
pnpm --filter @prompthub/desktop exec vitest run --project unit --minWorkers=1 --maxWorkers=1 \
  tests/unit/components/plugin-manager-distribution.test.tsx \
  tests/unit/components/plugin-manager-detail.test.tsx \
  tests/unit/components/plugin-manager-library.test.tsx \
  tests/unit/components/plugin-manager-store.test.tsx \
  tests/unit/components/plugin-agent-target-picker.test.tsx \
  tests/unit/components/skill-store-remote-skills-sh.test.tsx \
  tests/unit/components/skills-sh-search-state.test.tsx \
  tests/unit/services/skills-sh-store.test.ts \
  tests/unit/services/skill-source-resolver.test.ts \
  tests/unit/stores/skill-store-package-install.test.ts \
  tests/unit/main/skill-installer-remote-git-package.test.ts \
  tests/unit/main/plugin-target-inventory.test.ts \
  tests/unit/main/plugin-antigravity.test.ts
pnpm --filter @prompthub/desktop exec vitest run --project integration --minWorkers=1 --maxWorkers=1 \
  tests/integration/antigravity-plugin-entrypoints.test.ts
pnpm --filter @prompthub/desktop exec tsx tests/helpers/reproduce-store-plugin-issues.mts 30d9a628
pnpm --filter @prompthub/desktop exec tsc --noEmit -p tsconfig.test.json
```

Live network check used the actual search/detail parsers with HTTP fetched by
curl: `lancedb`, requested limit 24, yielded 19 repository entries and 5 explicitly
diagnosed hosted entries; one `lancedb/lancedb` detail resolved to the GitHub
repository plus `lancedb` install selector. This is not a live install test.
GUI automation was not authorized; Electron GUI, Windows/native loader and full
release acceptance were not run. Existing capability switches and user data remain
unchanged.

### Earlier aggregate snapshot

Remote state refreshed on 2026-10-14 (36 open / 173 closed; 209 issues).
The six-issue review below closed #226, #224, #220, #219 and #217 after scoped
reproduction and verification; #221 remains open. All six independent commits
are local and unpublished. The latest published prerelease checked in this cycle
is 0.6.0-beta.2 (2026-09-03); the latest stable release is 0.5.9.
Closure is not publication, Windows acceptance or complete release acceptance.

| Issue | GitHub state | Local status | Target release | Change                                                                         | Notes                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------ | ------------ | -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #229 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/skills.md` | Native file-write IPC/preload return void. Real editor save/readback/reopen regression passes; isolated Electron viewer retains saved text and byte size after restart. Closes #229 awaits default-branch delivery; unpublished. |
| #235 | closed | release_pending | 0.6.0 (unreleased) | `mcp-version-history-and-projection-safety` | Forward/reverse Tab, disabled-control exclusion, confirmation cancellation and post-mutation focus are repaired. Independent regression/confirmation tests (3), source/test types, scoped lint and build pass; isolated Electron keyboard/confirmed restore acceptance passes without target-file writes. Desktop transient UI only; Closes #235 awaits default-branch delivery. |
| #234 | closed | release_pending | 0.6.0 (unreleased) | `mcp-version-history-and-projection-safety` | SQLite adoption and immutable history are shared by Desktop and fresh CLI. Verified legacy upgrade, recovery, redaction, backup/restore, selected-record mutations, concurrent built-CLI writers, native macOS keyring and isolated GUI history/edit/distribution/restart. Web read-only and backup checks pass. Complete fix uses Closes #234; remote closure and publication remain separate. #203 and #220 native Windows/OAuth scope are not closed. |
| #233 | closed | release_pending | 0.6.0 (unreleased) | `mcp-version-history-and-projection-safety` | Shared TOML removal clears paired empty managed blocks and preserves unrelated sections/comments. Three-cycle regression detects the original orphan opening marker; isolated Codex GUI distribution/uninstall and restart readback pass. Closes awaits default-branch delivery; unpublished. |
| #232 | closed | release_pending | 0.6.0 (unreleased) | `mcp-version-history-and-projection-safety` | Health UI translates stable codes in all seven locales; Core/CLI diagnostics use English without literal environment/placeholder values. English GUI error and old-renderer mutation regression pass. Static health is not MCP protocol connection acceptance. Closes awaits default-branch delivery; unpublished. |
| #231 | closed | release_pending | 0.6.0 (unreleased) | `mcp-version-history-and-projection-safety` | Saved MCP with no description uses a dedicated localized empty state. Component regression fails against the original selection hint; isolated English Electron detail view passes. Closes awaits default-branch delivery; unpublished. |
| #230 | closed | release_pending | 0.6.0 (unreleased) | `mcp-version-history-and-projection-safety` | Corrected the stale Agent detail-import test to assert the exact target/name createFromSource request, reject createServer/importFile calls and observe detail selection. #220 source contract is delivered in bd4ad7f3; 9 component cases and the combined 204-unit/9-IPC snapshot pass. Component IPC results are mocked; real storage/crypto boundaries are separately covered. Closes #230 awaits default-branch delivery. |
| #228 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/skills.md` | All scan import callers use the package lifecycle. Copy/Link full-tree, binary, user/source tags, baseline, reopen, linked metadata editing/rollback and external-source preservation pass; Plugin child integration and isolated native folder/import/edit/delete GUI pass. CLI/Web related tests pass. Closes #228 awaits default-branch delivery; unpublished. |
| #227 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/skills.md` | Renderer migration waits for deferred authority publication and database/IPC rebinding. Fresh-profile create, retry/reopen regressions and isolated first-launch Electron GUI pass. CLI/Web initialization checked. Closes #227 awaits default-branch delivery; unpublished. |
| #226 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/plugins.md` | Original path/manifest fix: 37a20820. Report-specific preload/registered IPC copy and symlink workflows pass with canonical persistence, root resolution, inventory reopen and safe removal. Restoring the old version-directory behavior makes both cases fail at the target-path assertion. Fresh-profile Electron local import, actual target picker, byte-preserving flat IDE layout and process restart pass. The reported IDE configuration defect is complete; Windows loader, Zotero execution, CLI/project Plugin support and publication are not claimed. Remote closure is verified separately. |
| #225 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/prompt-workspace.md` | System-only Prompt saving and merged-content validation are implemented across Desktop, CLI, self-hosted Web, Cloudflare Worker and Mobile. 28 new regressions and 254 focused cases pass, including real persistence/reopen and rejected-edit history preservation; source/test typechecks and scoped lint pass. Full shared-worktree file-size gate is blocked by unrelated parallel mcp-config.ts growth. GUI, real-model and release acceptance remain open; unpublished. Maintainer-requested Closes #225 is recorded; remote closure awaits default-branch delivery. |
| #224 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/reference/agent-platforms.md` | Independent Qwen Work CN registration and official icon; scan/import/source update/full-package redistribution/reopen and canonical managed-link classification verified. Red: unknown platform and managed-link misclassification. Green: 3 new + 17 shared integration, 86 unit, 6 platform-contract and 1 isolated Electron workflow tests; types/lint/build pass. Windows native Junction and Qwen Work runtime execution not run; unpublished. |
| #221 | open | in_progress | 0.6.0 (unreleased) | `ISS-20261014-001-backup-connection-rebind.md` | Real Electron reproduces closed-DB prompt writes after full export; existing IPC rebind now runs after reopen on success/failure. Export/edit/create/restart regression passes. Wider restore probe fails with canonical authority root identity mismatch; candidate/runtime modules have concurrent uncommitted work, excluded here. Original Windows 0.5.9 / ambiguous “6.0.12” causes still need redacted logs; Refs only, keep open. |
| #220 | closed | release_pending | 0.6.0 (unreleased) | `ISS-20261013-001-antigravity-adaptation-audit` | Native configuration fix bd4ad7f3 confirmed by pre-fix empty-import and native-field-loss red checks. Added actual SQLite close/reopen regression; 9 focused unit and 7 real registered IPC/storage cases pass. OS encryption is substituted in integration; Windows native execution and remote OAuth login are unverified, separate from configuration support. Unpublished. |
| #219 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/web.md` | Fix f783066e confirmed with the exact reported HTTP bodies for create and move; both reproduce 422 under the pre-fix expressions and pass current code. Actual SQLite close/reopen, list/detail and permission checks pass; existing 17 route and 11 service cases and Web typecheck pass. Browser/reporter Docker deployment not exercised; unpublished. |
| #218 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/skills.md` | Canonical managed-path recovery now restores the complete package by Skill id instead of using an obsolete repository checkout; sync returns the post-recovery record even when content is unchanged. Five new nested-Git regressions and 107 focused cases pass, including binary/attachment-only update, reopen, removed/existing checkout recovery, and failed-source package/history preservation. Restoring the old path implementation reproduces the reported regular-root-SKILL.md exception. Desktop source/test typecheck, scoped lint and new-test formatting pass. Desktop IPC only; CLI/Web do not consume that IPC. Windows GUI, live-network and release acceptance not run; unpublished. Closes #218 awaits default-branch delivery. |
| #217 | closed | release_pending | 0.6.0 (unreleased) | `spec/knowledge/behavior/desktop.md` | Real isolated Electron reproduced lost query, second page, scroll position and hidden scrollbar. Split market/library search, retain the active browse position in memory, and restore the native scrollbar. Two-page real-install/return regression passes, as do 33 store/component cases, source/test types, build and scoped lint. Remote catalog is a fixture; no native MCP execution or release claim. |
| #216 | open | in_progress | | `foundation-integrity-redesign/storage-inventory.md` | Source-only legacy collection is implemented locally. Renderer bridge 13, settings IPC 12 and Core migration 19 tests passed (44 unique), including real file publication/reopen and failure preservation. Desktop source/test typecheck and focused lint passed. Reporter-profile/GUI/release acceptance remains open; no live profile changes. |
| #215 | open | untriaged | | | Partial clone/sparse checkout proposal; assess existing package retrieval and measured transfer cost before adding transport complexity. |
| #212 | open | untriaged | | | Instructions versus scoped Rules proposal; compare current ownership and Agent-native semantics before changing a public contract or migrating data. |
| #211 | closed | accepted | | `skills-issue-211-git-http-fallback` | Remote closure is confirmed. Existing implementation notes record the reporter's Git-install workaround; package fallback changes still require their own current verification and release evidence. |
| #210  | open         | release_pending   | 0.6.0 (draft) | `rules-managed-copies`                                                         | Managed-only import is implemented locally across Core, Desktop fallback, direct CLI import, and CLI workspace/sync restore. External targets remain unchanged, history merges within 20 versions, rollback is covered, and the dedicated importer has 100% line/function/branch/statement coverage. Keep GitHub open until release. |
| #209  | open         | accepted     |                | `rules-managed-copies`                                                         | External `CLAUDE.md` edits must remain conflict-visible. Normal Rule materialization only inspects drift, so the reported reopen-time overwrite still needs a current-build reproduction to identify whether a deferred backup/sync restore reaches the #210 import path. Do not merge as a duplicate without that evidence.         |
| #207  | closed       | wontfix      |                |                                                                                | IdeaHunter was submitted as a tools/resources-list entry, but PromptHub is a product repository rather than a curated tools list. Closed publicly as out of scope.                                                                                                                                                                   |
| #205 | open | in_progress | | PR #206 | Security scan workflow merged on 2026-10-13 in 1df96686. Workflow integration is complete; successful scanner/SARIF execution is not established by this review. Current uncommitted reporting changes are separate work and were preserved. |
| #204  | open         | untriaged    |                |                                                                                | Requests import/export compatibility with `npx skills`. The external storage/config/version contract and collision/update semantics have not yet been verified; no delivery claim is recorded.                                                                                                                                       |
| #203  | open         | in_progress  |                | `mcp-version-history-and-projection-safety`                                    | Design corrected: My MCP will own formal per-server version history; Agent/project files remain derived projections and new writes create no persistent backup. Legacy PromptHub sidecars require previewed, confirmation-based cleanup and are never imported as versions.                                                          |
| #202  | closed       | released     | 0.6.0-beta.1   | `mcp-issues-200-202-implementation`                                            | Environment/header references, target-specific rendering, reference health warnings, direct/reference UI, and redaction across renderer/IPC/preview/apply/remove/backup/sync shipped in the published prerelease.                                                                                                                    |
| #201  | closed       | released     | 0.6.0-beta.1   | `mcp-issues-200-202-implementation`, `pi-agent-separation`                     | Pi shared, `.agents`, native, and project MCP targets shipped in the published prerelease. PromptHub writes compatible `mcpServers` JSON but does not execute the adapter or claim runtime precedence.                                                                                                                               |
| #200  | closed       | released     | 0.6.0-beta.1   | `mcp-issues-200-202-implementation`, `agent-management-workbench`              | My MCP merged global/project target counts, details, quick deployment, batch deployment, and selection dialogs shipped in the published prerelease.                                                                                                                                                                                  |
| #199  | closed       | duplicate    |                | `desktop-workspace-live-refresh`                                               | Closed publicly as a duplicate of #198, which retains the broader refresh, draft-protection, statistics, filtering, and cross-workspace acceptance boundary.                                                                                                                                                                         |
| #198  | open         | accepted     |                | `desktop-workspace-live-refresh`                                               | Design-ready local backlog after the historical recovery audit; shared refresh must protect drafts and avoid polling or unbounded watchers.                                                                                                                                                                                          |
| #197  | open         | in_progress  |                | `spec/knowledge/behavior/rules-workspace.md`                                    | Claude user-level scoped Rules discovery and managed workflows are implemented with regression evidence; the broader platform and project-level matrix remains incomplete. |
| #196  | open         | release_pending   | 0.6.0 (unreleased) | `spec/knowledge/behavior/rules-workspace.md`                                 | User-level Claude rules scanning/editing/reopen and backup restore are implemented; regressions cover external changes, missing records, path escapes and native-valid long names. Windows and desktop GUI acceptance remain pending; unpublished, keep remote open. |
| #195  | open         | accepted     |                | `prompt-workspace-completion`                                                  | Design-ready local backlog; media export remains an explicit copy from managed media and does not change canonical storage.                                                                                                                                                                                                          |
| #194  | open         | in_progress  |                | `skills-issue-194-shared-global-target`                                        | The experimental shared target, ownership receipts, CLI/Desktop lifecycle, and duplicate-risk warning are implemented; exact physical-path deduplication and Agent/OS/runtime compatibility evidence remain open gates.                                                                                                              |
| #193 | closed | release_pending | 0.6.0 (draft) | `rules-issue-193-missing-project-reconciliation` | Real preload/IPC/filesystem/SQLite/reopen and isolated macOS Electron delete/rescan/selected cleanup accepted; 128-target measured scans avoid unchanged writes. Windows native/drive-letter and release acceptance not run; unpublished. Re-run evidence: change implementation.md. |
| #192 | closed | release_pending | 0.6.0 (draft) | `desktop-issue-192-copy-action-parity` | Two real Electron copy entrypoints produce identical ordered/variable output and source-only usage after reopen. GUI exposed and fixed intermediate variable clipboard writes; 38 focused tests plus modal red/green and coverage passed. Windows/packaging/full release not run; unpublished. Re-run evidence: change implementation.md. |
| #191  | open         | in_progress  |                | `sync-issue-191-safety-report-contract`                                        | Shared/Desktop/Web parsing accepts current provenance, maps legacy `static`, and rejects malformed reports without writing a backup; restored-authorization and large-inventory release evidence remain open gates.                                                                                                                  |
| #190  | open         | in_progress  |                | `spec/issues/active/ISS-20261013-002-codex-claude-adaptation-audit.md`            | Codex/Claude single-Skill and portable packages, native marketplace registration/install/enable/rescan/uninstall and failed-install retry are verified in isolated CLI profiles. Claude registry owns installed inventory after uninstall; large-package, Windows/GUI and release acceptance remain open. |
| #188 | open | in_progress | | `skills-my-skills-tag-search` | My Skills searchable tag filtering and normalized user/source tag handling are implemented in current main. Existing targeted evidence is recorded in the change; full release and real Desktop acceptance remain open, so this is no longer untriaged. |
| #187  | closed       | released     | 0.6.0-beta.1   | `agent-management-workbench`                                                   | Built-in Oh My Pi registry, paths/assets, MCP/Rules targets, bounded read-only Sessions, and non-secret model/config projection shipped in the published prerelease. Provider usage, credentials, and plugin installation remain separate future scope.                                                                              |
| #186  | closed       | released     | 0.6.0-beta.1   | `desktop-issue-186-zcode-agent-support`                                        | ZCode Skills, Rules, native MCP projection, and global/project presets are included in the published prerelease; the already-closed remote issue now has matching local release state.                                                                                                                                               |
| #185  | open         | in_progress  | 0.5.9          | `self-hosted-skill-sync-reliability`, `self-hosted-web-database-lock-recovery` | Web stale-lock recovery is included in the replacement `v0.5.9` image (GHCR publication verified); the broader local/remote Skill sync and restore work remains open pending deployment and end-to-end confirmation.                                                                                                                 |
| #145 | open | in_progress | | `desktop-tag-manager-usability` | Current main includes tag usage counts, ordering and Prompt filter navigation. Compare the screenshot-specific request and complete Desktop acceptance before local completion. |
| #141  | open         | untriaged    |                |                                                                                | Reports a problem adding Skills to a store.                                                                                                                                                                                                                                                                                          |
| #139  | open         | untriaged    |                |                                                                                | Shares a migration/export-import workflow suggestion for preserving data.                                                                                                                                                                                                                                                            |
| #132  | open         | accepted     |                | `marketplace-expansion`                                                        | Design retained but implementation is deferred; Prompt Store requires its own verified catalog/import contract and is not implemented through the Skill package schema.                                                                                                                                                              |
| #107  | open         | untriaged    |                |                                                                                | Reports an image upload error in Docker deployment.                                                                                                                                                                                                                                                                                  |
| #106  | open         | accepted     |                | `cloud-collaborative-prompt-sharing`                                           | Design retained but implementation is deferred because it requires server-owned workspaces, ACLs, audit, and conflict handling; it never shares the local SQLite file.                                                                                                                                                               |
| #98   | open         | in_progress  |                | `legacy-upgrade-recovery-audit`, `database-migration-safety`                   | The tagged 0.5.2 SQLite fixture preserves four Prompt versions through atomic migration, canonical projection, catalog rebuild, and second reopen. The complete upgrade-snapshot application path remains under `legacy-upgrade-recovery-audit`.                                                                                     |
| #97   | open         | in_progress  |                | `legacy-upgrade-recovery-audit`, `database-migration-safety`                   | The tagged 0.5.1 SQLite fixture, managed safety point, atomic rollback, canonical rebuild, and fresh reopen pass. The historical portable/upgrade recovery path remains under `legacy-upgrade-recovery-audit`.                                                                                                                       |
| #92   | open         | accepted     |                | `windows-code-signing-and-reputation`                                          | Design retained but implementation is deferred until protected certificate/provider setup and a clean Windows signing/reputation test environment are available.                                                                                                                                                                     |
| #89   | open         | in_progress  |                | `legacy-upgrade-recovery-audit`, `database-migration-safety`                   | Tagged 0.4.7/0.4.8 SQLite fixtures preserve Prompt and Skill history through atomic migration, canonical projection, catalog rebuild, and second reopen. The exact historical Windows path transition remains under `legacy-upgrade-recovery-audit`.                                                                                 |
| #79   | open         | in_progress  |                | `webdav-skill-backup-observability`                                            | Current payload already carries Skill metadata, versions, and files; the active change makes those counts visible, records manual backup outcomes, and prevents inactive-provider schedules from looking enabled. Keep open until a published build is verified against a real WebDAV server.                                                                                                          |
| #74 | open | in_progress | | `desktop-startup-folder-restore` | Starting in the last/pinned folder is implemented and tested, but the issue asks for per-folder inclusion/exclusion at startup. That broader hiding policy and folder-side entry are not implemented; do not mark fully solved by startup-folder restore alone. |
| #71   | open         | untriaged    |                |                                                                                | Reports a device-information storage problem when changing devices.                                                                                                                                                                                                                                                                  |
| #64   | open         | untriaged    |                |                                                                                | General request to improve practical usage issues.                                                                                                                                                                                                                                                                                   |
| #44   | open         | accepted     |                | `prompt-workspace-completion`                                                  | Design-ready local backlog; the remaining multi-message authoring request uses additive ordered-message compatibility and its own migration gate.                                                                                                                                                                                    |
| #27   | open         | accepted     |                | `git-backup-transports`                                                        | Design retained but implementation is deferred; GitHub/Gitee remain encrypted portable-snapshot transports, not live record sync or a mergeable database repository.                                                                                                                                                                 |
| #15   | open         | accepted     |                | `mobile-webdav-distribution`                                                   | Design retained but mobile packaging, secure credential storage, WebDAV exchange, and Android/iOS device/release verification are outside the current implementation queue.                                                                                                                                                          |
| #183  | closed       | released     | 0.5.9          | `skill-frontmatter-yaml-parser`                                                | Shared YAML parsing now covers Desktop, CLI, Web, marketplaces, and Skill detail surfaces; lossless rewrites, embedded indentation, and strict unsafe/malformed YAML rejection shipped in the refreshed stable release.                                                                                                              |
| #184  | closed       | released     | 0.5.9          | `cli-desktop-database-concurrency`, `desktop-legacy-lock-recovery`             | Shared SQLite coordination, typed contention handling, Desktop refresh, and ownerless legacy-lock recovery shipped in `0.5.9`.                                                                                                                                                                                                       |
| #181  | closed       | released     | 0.5.9          | `cli-install-manual-fallback`                                                  | Windows `where.exe`, custom npm prefix, and manual CLI path fallbacks shipped in `0.5.9`.                                                                                                                                                                                                                                            |
| #180  | closed       | released     | 0.5.9          | `export-backup-sync-consistency`                                               | Custom Skill/MCP/Plugin store source backup and restore shipped in `0.5.9`.                                                                                                                                                                                                                                                          |
| #179  | closed       | released     | 0.5.9          | `desktop-issue-179-configured-skill-targets`                                   | Configured custom and overridden Agent distribution targets shipped in `0.5.9`.                                                                                                                                                                                                                                                      |
| #178  | closed       | released     | 0.5.9          | `desktop-issue-178-hermes-localappdata`                                        | `%LOCALAPPDATA%` and Hermes Windows Native path handling shipped in `0.5.9`.                                                                                                                                                                                                                                                         |
| #170  | closed       | released     | 0.5.9          | `skill-package-boundary`                                                       | Complete GitHub Skill package installation, including non-`SKILL.md` assets, shipped in `0.5.9`.                                                                                                                                                                                                                                     |
| #169  | closed       | released     | 0.5.9          | `web-prompt-clipboard-copy`                                                    | Web Markdown Prompt clipboard fallback shipped in `0.5.9`.                                                                                                                                                                                                                                                                           |
| #168  | closed       | released     | 0.5.9          | `my-skill-source-update`                                                       | Skill source fingerprint reconciliation and false local-modification fixes shipped in `0.5.9`.                                                                                                                                                                                                                                       |
| #177  | open         | accepted     |                | `marketplace-expansion`                                                        | Reporter confirmed `https://skillhub.cn/`; design is retained but implementation is deferred until an official or versioned protocol can be tested without scraping or guessing.                                                                                                                                                     |
| #176  | closed       | released     | 0.5.9          | `plugin-management`                                                            | Markerless multi-capability Claude bundle detection shipped in `0.5.9` while single-capability false positives remain excluded.                                                                                                                                                                                                      |
| #175  | closed       | released     | 0.5.9-beta.2   | `mcp-management`                                                               | Closed as completed after confirming the published beta includes the requested AGHub-style My/Agent/Store Skill and MCP workbenches.                                                                                                                                                                                                 |
| #167  | closed       | released     | 0.5.9          | `unified-custom-store-sources`                                                 | Store-local search for custom marketplace JSON, Git repository, and local-directory Skill Store sources shipped in `0.5.9`.                                                                                                                                                                                                          |
| #160  | closed       | released     | 0.5.9          | `issue-160-prompt-detail-usability`                                            | Prompt detail editing and folder-count usability improvements shipped in `0.5.9`.                                                                                                                                                                                                                                                    |
| #159  | closed       | released     | 0.5.9          | `web-auth-captcha`                                                             | Desktop-to-Web URL normalization, captcha configuration, and 401 compatibility handling shipped in `0.5.9`.                                                                                                                                                                                                                          |

## Six-Issue Verification — 2026-10-14

| Issue | Local commit | Result |
| --- | --- | --- |
| #226 | `8361b182` | Existing native Plugin path fix verified with mutation red checks, real preload/IPC copy/symlink/reopen/removal and isolated Electron import/distribution/restart; closed. |
| #224 | `145cc35c` | Added independent Qwen Work CN Skill target and corrected canonical managed-link classification; package lifecycle, isolation and Electron regressions pass; closed. |
| #221 | `86490ab5` | Fixed exported database connection rebinding; real export/edit/create/restart passes. Restore still fails in the isolated baseline; original Windows report needs exact version/redacted logs. Commented, not closed. |
| #220 | `035d7b27` | Existing native MCP config fix verified by old importer/projection red checks and actual SQLite reopen plus real IPC regressions; closed. |
| #219 | `2c872ff5` | Exact reported create/move HTTP requests reproduce old 422 and pass fixed code with actual DB reopen and authorization; closed. |
| #217 | `f1912b2d` | Actual Electron install/return reproducer confirms query/page/scroll repair and visible scrollbar; 33 focused store/component cases pass; closed. |

Passing acceptance runs used an isolated tracked-source snapshot plus each issue's scoped
changes, excluding concurrent unrelated working-tree edits. Remote catalog
fixtures and encryption substitutes are explicitly recorded in the owning
topics. No daily profiles, live Agent configuration, release artifacts or remote
Git branches were modified. Snapshot refresh mirrors all remote issues, including
closures made outside this six-issue review.

## Historical Open Issue Review — 2026-10-13

The following review is historical; the current rows and six-issue results above
supersede its older statements about #226, #224, #221, #220, #219 and #217.

- **Local completion already recorded:** #210, #193 and #192. Managed-only Rules import and history/rollback protection are implemented; publication remains pending. #193/#192 functional and isolated macOS Electron acceptance is recorded in their existing implementation notes; Windows and release evidence remain unclaimed.
- **Primary fix present with recorded focused tests, broader acceptance pending:** #219 (folder visibility), #216 (source-only renderer-persistence migration), #191 (safety-report contract), #190 (multi-native Plugin manifests), #188 (My Skills tag search). Their current local status remains in_progress; missing GUI, reporter-profile, lifecycle or release evidence is not promoted to completion.
- **Workflow integrated:** #205 via merged PR #206; scanner execution and current reporting follow-up are separate boundaries.
- **Partial implementations:** #194 shared Skill target still has physical-path/runtime compatibility gates; #145 includes usage/sorting/filter navigation but the screenshot-specific full request lacks current Desktop acceptance; #74 has last/pinned startup selection rather than per-folder hiding.
- **Not confirmed resolved:** #209 needs the reopen-time overwrite reproduction; #221 and historical #89/#97/#98 retain their backup/recovery/upgrade acceptance gaps. #218 is locally repaired with nested-Git regression evidence recorded above; Windows GUI, live-network and publication acceptance remain open.
- **New reports:** #224 remains untriaged. #225 is locally implemented with focused persistence and input-regression evidence recorded above; publication remains pending. #226 is under focused native-format repair; its remaining acceptance is recorded above. #220 has local MCP repairs verified after official-contract comparison and reproduction; native acceptance and remaining client-scope gaps are recorded in ISS-20261013-001.
- The remaining accepted/untriaged requests retain their earlier state. Historical remote closures include completed releases, duplicates (#199) and declined scope (#207); closed count is not a count of implemented fixes.
- This review used current source, commits, domain records, live GitHub issue/PR/release metadata and prior recorded test results. It did not rerun every product test or operate GUI/native clients.

## Update Rules

- Update this file whenever a GitHub issue is triaged, attached to an active change, completed locally, assigned to a release, or publicly closed.
- Do not edit `github-open.md` or `github-closed.md` for local delivery status; those files are regenerated from GitHub.
- Before a release, scan for `local_done` issues and move included items to `release_pending`.
- After a release, move shipped items to `released` and record the actual version; verify remote closure under the issue rules and refresh both GitHub snapshots. Never infer publication from closure.
