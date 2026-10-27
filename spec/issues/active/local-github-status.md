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

### Generation history batch deletion — 2026-10-27 (#248)

`released` in 0.6.2: history cards and the batch action menu now expose confirmed deletion,
including failed batches. SQLite records and originals are deleted through the
existing recoverable publication path; Prompt media copies remain. Cancel/retry,
failure rollback, pending cleanup, late results and reopen are covered. 108 desktop
and 19 Core focused cases pass, plus two real isolated macOS Electron flows in
light/dark themes, repeated successfully before submission with explicit history
tab/empty-state assertions after restart. Typecheck, scoped lint and production
build pass. GitHub confirmed #248 closed on 2026-10-27. Tagged run 40486270039 also passed both Windows packaged deletion flows. See
[acceptance and commands](../../changes/active/desktop-image-generation-workbench/implementation.md#history-batch-deletion-248).

### IndexedDB startup recovery — 2026-10-27 (#247)

`released` in 0.6.2: the startup repair passed macOS acceptance and all three Windows x64 actual NSIS install/uninstall/reinstall recovery workflows in run 40488658011. Verification submission closes #247; remote closure is checked separately.

The same startup error was reproduced before the fix. Normalized merge now
accepts unrelated SQLite records and equivalent timestamps; true conflicts have
explicit recovery choices with both originals preserved, atomic writes/readback
and a SQL receipt preventing replay. 30 Core, 34 desktop and 51 related regression
cases pass; 3 real Electron workflows pass through repeated full-process restarts,
with additional dark-theme acceptance. All cases and workflows passed again before
submission. Exact commands and remaining boundaries:
[data recovery acceptance](../../knowledge/behavior/data-recovery.md#acceptance--2026-10-27).

### Workspace refresh acceptance — 2026-10-27 (#198)

`released` in 0.6.2: the built Electron app passed all three isolated hidden-window
refresh scenarios, including independent CLI writes, Prompt and Skill draft
cancel/discard, deleted selection and Rules conflict preservation. Earlier real
storage integration covers filters/counts, slow reads and failure recovery.
See [Desktop acceptance](../../knowledge/behavior/desktop.md#workspace-manual-refresh-198).
GitHub confirmed #198 closed at 2026-10-27 06:27:36 UTC after pushing
`ebb7d66c`. Published 0.6.2 points to `6e43b17a`; tagged CI, signing, packaged startup and artifact verification passed.

### Claude gateway import follow-up — 2026-10-26 (#246)

The remaining default-auth defect is locally repaired: new third-party Claude
imports use Auth Token by default; official Anthropic imports use API Key.
Explicit choices and saved profiles remain unchanged. Existing API-key imports
for Bearer gateways need their credential type edited to Auth Token and reactivated.

Installed Claude 2.1.307 completed a fresh unsigned-in interactive terminal turn
and a second turn after reopening, using the imported native configuration and a
local deterministic gateway. Authorized isolated Electron import/default-choice,
activation, native request and full restart also passed. 58 distinct scoped tests
passed across focused runs, with old-default failure sensitivity demonstrated.
See [acceptance record](../../changes/active/agent-management-workbench/tasks.md#claude-gateway-default-and-interactive-acceptance--2026-10-26-246).

The default-auth repair is included in published 0.6.2, committed in `3291609c`. #246 remains
remotely open; the reporter's gateway and Windows interactive/API-key approval
have not been tested. These are not implied by local synthetic-gateway success.
The broader extension/managed-scope gaps remain separate workbench tasks.

### Batched submission and remote readback — 2026-10-23

This entry supersedes the commit/push and remote-state statements in the dated
audits below, without extending their functional acceptance boundaries.

- Pushed 16 commits to `origin/main` through `e144e34d`: eight existing local
  commits and eight new logical batches. Remote branch hash matched the local
  commit. No tag, package publication or deployment was performed.
- New batches: provider locale structure `44828da7`, native Agent extensions
  `7a700b06`, workspace refresh `01eba15a`, GUI-launched CLI environment
  `82b3a84d`, tag ordering `b4b4b577`, complete custom-store card regression
  `afb59d6b`, acceptance records `a4ab6cfb`, and development version `e144e34d`.
- Remote snapshot: 220 issues, 26 open / 194 closed. Automatic closure confirmed
  for #245 (`aedff96e`), #185 (`c4369236`), #145 (`b4b4b577`) and #141
  (`afb59d6b`). The new fixes remain `local_done`, pending publication; #141's
  original rendering fix was already included in 0.5.7, while its separate
  loading-race fix and stronger regression are now pushed.
- #198 remains open / `in_progress`: implementation and automated verification
  are pushed, but native Electron refresh/draft-confirmation acceptance remains.
  #246 remains open / `in_progress`: configuration/authentication repairs and
  extension support are pushed; reporter gateway/Windows and the remaining
  cross-Agent execution/UI checks are not complete.
- Submission verification: 23 focused files / 217 tests passed, including real
  preload/SQLite/filesystem integration. Desktop source and test typechecks,
  scoped ESLint, production build, all three governance quick checks and all
  four website release-metadata tests passed. Seven locale JSON files parse;
  outgoing whitespace and common credential/private-key pattern checks passed.
  Prior native acceptance is retained; native CLI/GUI checks were not rerun for
  this submission. Existing bundler/deprecation warnings remain.
- Historical `output/` acceptance artifacts were preserved outside Git. No
  development server or native application was started for submission.

Reproduce the focused submission batch (excluding opt-in native CLI tests):

```sh
git diff --name-only afd3a323 e144e34d -- apps/desktop/tests \
  | rg '\.test\.tsx?$' \
  | rg -v '/(claude-native-assets|opencode-native-extensions)\.test\.ts$' \
  | sed 's#^apps/desktop/##' \
  | xargs pnpm --filter @prompthub/desktop exec vitest run --minWorkers=1 --maxWorkers=1 --silent
pnpm --filter @prompthub/desktop typecheck
pnpm --filter @prompthub/desktop typecheck:tests
pnpm --filter @prompthub/desktop build
pnpm verify:release:quick --surface governance --concurrency 1
pnpm --dir website test:release-sync
```

### Media and WebDAV follow-up — 2026-10-22

| Issue | Local outcome | Remaining boundary |
| --- | --- | --- |
| #107 | Fix `c4a3a8d5` now also passes isolated Chrome GUI acceptance over ordinary HTTP with `crypto.randomUUID` unavailable: image/video chooser, real clipboard paste, preview, save/reload/reopen and cancelled selection. Earlier 61 focused Web checks remain the regression baseline. | Reporter Docker image/Windows and private-network image hosting are not certified. HTTPS/SSRF restrictions and previously broken references are unchanged. No push. |
| #79 | GUI acceptance found and repaired post-publication media/settings writes against a closed database. Legacy and incremental restore now use one complete snapshot; 64 focused checks, source/test typechecks, scoped lint and desktop build pass. Both formats restore 1 Skill / 5 files / 2 versions exactly after cold reopen; malformed manifest preserves all local bytes/history. A fresh peer adopts the online baseline through UI and retains the identical package after restart. | Controlled local WebDAV transport, not a reporter/vendor server. S3 shares the repair and passes focused tests but was not GUI-tested. Existing `.prompthubignore` filtering is retained. No push or remote issue mutation. |

See [the scoped verification record](ISS-20260809-001-remaining-open-issues-roadmap.md#media-and-webdav-follow-up--2026-10-22). No remote issue mutation was made.

### Tag management and custom store follow-up — 2026-10-23

- Remote readback: #145 and #141 remain open; no commit, push or remote mutation in this follow-up.
- #145: local_done, pending release. Original screenshots request insertion and drag ordering. Authorized isolated macOS acceptance passes creation, append-order preservation, rename, deletion/reference protection, native drag, consecutive keyboard movement with focus retained, light/dark layout, and full-process restart. Acceptance also exposed and repaired stale-list overwrite after creation. No schema change.
- #141: existing fix accepted. Original blank catalog is traced to `showCatalog: false` in v0.5.6; `e63f9e26` restores `true` in v0.5.7. The 15-card regression detects the injected old defect. Current authorized GUI acceptance adds `https://github.com/anthropics/skills` as `my`, loads all 20 current entries, searches their content, and retains identical card names after full-process restart. `f51eee2f` fixes a separate loading race.
- Evidence and repeatable commands: [current follow-up](ISS-20260809-001-remaining-open-issues-roadmap.md#tag-management-and-custom-store-follow-up--2026-10-23).

### Seven-issue audit — 2026-10-22

This dated audit supersedes the older per-issue acceptance descriptions below.
Remote readback: 30 open / 190 closed. No push or deployment was performed.

| Issue | GitHub state | Local outcome | Remaining boundary |
| --- | --- | --- | --- |
| #245 | open | local_done, `aedff96e` (`Closes #245`) | Real macOS provider deletion/Toast/restart passed; local commit is not pushed. |
| #246 | open | local repair committed, `f2326479` (`Refs #246`) | Native two-header/model/rollback tests pass; reporter gateway and Windows login behavior unverified. |
| #244 | open | released in replacement 0.6.1 | Mac native lifecycle and GUI distribution pass; Windows Store-only GUI remains unverified. |
| #209 | closed | existing fix accepted | Real macOS external-edit/restart/conflict resolution passed; closure read back at 09:38:48Z. |
| #190 | closed | existing dual-manifest fix accepted | Exact Git URL imports and displays Codex/Claude Native targets on macOS after inheriting existing proxy routing. Harmless fixture native install/restart passes; Windows and upstream Hook execution not claimed. |
| #185 | open | local_done, `c4369236` (`Closes #185`) | Binary snapshot route fixed; three live restore/restart cycles pass. Matching Web must be deployed; local commit is not pushed. |
| #141 | open | current source/cache pass, `f51eee2f` (`Refs #141`) | Real original source loads 20 entries and retains cache after restart; historical 15-count empty list not reproduced. |

Commands and evidence are recorded in the [current audit](ISS-20260809-001-remaining-open-issues-roadmap.md#current-seven-issue-acceptance-and-submission).

### Provider follow-up — 2026-10-22

| Issue | GitHub state | Local status | Target release | Remaining boundary |
| --- | --- | --- | --- | --- |
| #245 | open | local_done | Unassigned | User confirmed Settings → AI Configuration. Delete confirmation, associated-model/default cleanup, edit-name preservation and real SQLite reopen/failure recovery pass locally. Native GUI/Windows and publication remain unverified; Agent profiles remain independent. See the [verification record](ISS-20260809-001-remaining-open-issues-roadmap.md#provider-follow-up--2026-10-22). |
| #246 | open | in_progress | Unassigned | Import auth, provider-kind and model precedence fixes verified locally. Claude Definitions supports SubAgent CRUD and scoped Hooks editing. CLI 2.1.307 consumed Skills/Rules, called MCP, loaded/updated/removed a Plugin, executed a harmless Hook and spawned/completed a native child. Isolated Electron save/reopen/delete passed. Reporter gateway/Windows, interactive trust/approval and managed/effective-scope diagnostics remain unverified. See agent-management-workbench/tasks.md for commands and boundaries. |

### Replacement 0.6.1 follow-up — 2026-10-21

The verified marketplace fixes for #242/#243 and native runtime/config-path
fixes for #244 are pushed and included in stable replacement 0.6.1 at 60db70df.
Fourteen native Codex tests pass on Windows x64, alongside the packaged two-start
upgrade. Windows 11 Store GUI acceptance remains separate and pending.
Remote states were read back on 2026-10-21: #242 closed, #243 closed,
#244 open. No issue state was changed by this publication. The #196
sidebar identity fix is also included in 0.6.1.

| Issue | GitHub state | Local status | Target release | Remaining boundary |
| --- | --- | --- | --- | --- |
| #244 | open | in_progress | 0.6.1 | Runtime/config fixes released and Windows native CLI verified; real Windows 11 Store GUI installation, enable/disable and removal remain pending. |

### Published 0.6.0 review — 2026-10-19

Remote snapshot: **36 open / 181 closed / 217 issues**. New since 2026-10-16:
#240, #241, #242 and #243. User-authorized follow-up comments and closures of
#241/#216/#210/#191/#188 were verified on 2026-10-19. The later authorized push
of `f1faa73f` automatically closed #196; remote closure was verified separately.

GitHub confirms stable v0.6.0 published on 2026-10-18 at commit
`36401160d6370320cbc98e3421ff3be580aa0a9b`. The remote tag and successful
tag CI were checked directly. The local v0.6.0 tag is stale; current main
contains post-release resource changes, so neither is used as a release proxy.

[The complete 42-report review](ISS-20260809-001-remaining-open-issues-roadmap.md)
owns the evidence and remaining acceptance boundaries. Real Electron follow-up
confirmed the five closed reports, but found #196's same-platform sidebar loss;
that fix is committed and pushed, but unpublished. #239 remains open pending native Windows
verification despite its corrected local-ID implementation. Other open issues
remain partial, unreproduced or unmet.

Completed 0.6.0 rows below now say `released`; this records publication of
their verified scope, not fresh GUI, reporter-profile or all-platform acceptance.
Historical verification sections retain their dated evidence, not current
publication claims.

### Historical #237 / #238 verification — 2026-10-15

The following execution record is historical. Both scoped fixes are now included
in the published 0.6.0; the current overlay table and release review supersede
its former draft/pending statements.

| Issue | Local status | Verified scope / remaining boundary |
| --- | --- | --- |
| #238 | release_pending | Remote skills.sh search replaces partial-leaderboard filtering; ranked matches remain visible, errors and stale requests are isolated, repository + selector installation is retained. Domain-only hosted catalogs still have no package installer: mixed responses diagnose omitted hosted results; hosted-only responses fail explicitly. |
| #237 | release_pending | Plugins list/count/detail/picker share the enabled-Agent selection; capability flags remain unchanged. Antigravity reads independent IDE and CLI inventories without creating directories or changing distribution paths. Native CLI registration/install remains outside this fix. |
| #236 | untriaged | Left open as requested; this change neither fixes nor closes the Windows prompt-crash report. |

These issues were open at the targeted remote check on 2026-10-15. Their
separate fix commits reached the default branch on 2026-10-16, and GitHub
confirmed #237/#238 closed at 08:11 UTC. #236 remains open. The fixes are assigned
to the unpublished 0.6.0 draft; remote closure does not establish publication.
The aggregate snapshots are refreshed from the same live issue capture.

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

2026-10-20 follow-up: after reviewing the macOS regression results and explicit
platform/report-specific limits, the maintainer authorized local issue-scoped
commits with `Closes` for #240, #239, #236 and #221. These references take effect
only after a later push to the default branch. The open rows below retain the
last verified remote state and outstanding verification limits; local submission
does not establish remote closure, publication or additional platform acceptance.

| Issue | GitHub state | Local status | Target release | Change                                                                         | Notes                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------ | ------------ | -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #243 | closed | local_done | 0.6.1 | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 2026-10-20 已按授权关闭，0.6.1 待重新发布；真实上游复现再次通过。`63189663` 已提交推送 Claude 字符串目录、外部 Git、ref/sha 与原生 manifest；真实 code-review 安装及 SQLite 重开、supabase 固定 revision 预览通过。未发布或做 GUI/Agent 原生加载验收；Git 预览数量仍限 manifest 声明。 |
| #242 | closed | local_done | 0.6.1 | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 2026-10-20 已按授权关闭，0.6.1 待重新发布；真实上游复现再次通过。`63189663` 已提交推送 Antigravity ZIP 下载、SHA-256 校验、安全解包及整包入库；真实 gdocs 安装/重开、异常保全和重试通过。未发布或做 GUI/Agent 原生加载验收。 |
| #241 | closed | released | 0.6.0 | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 修复已发布：Skill 首屏计数/角标不一致。2026-10-19 真实 Electron 复测后，已按用户授权评论 0.6.0 修复说明并关闭；远端状态已核实。 |
| #240 | open | local_done |  | `ISS-20260809-001-remaining-open-issues-roadmap.md` | `e4461bce` 首次 Agent 扫描修复已复核；2026-10-20 隔离 macOS Electron 冷启动空 Agent 多选、Copy/Symlink 安装、完整文件及重开状态通过。另有 26 项选择/扫描组件回归；Linux 原机及替换版本发布仍待验收。 |
| #239 | open | released | 0.6.0 | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 市场 ID 与本地目录 ID 已分离；真实 macOS IPC 安装、版本文件、重开通过。Windows 原生复测未完成；维护者已授权通过后续推送自动关闭，尚未核实远端关闭。 |
| #236 | open | local_done |  | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 2026-10-19 用户反馈 Windows 新建 Prompt 已不再崩溃；2026-10-20 隔离 macOS Electron 真实编辑器在重启前后创建、二次重开及既有编辑/版本恢复流程通过。未复现原 Windows 崩溃、未确定其根因；维护者已接受该验收边界并授权后续推送自动关闭。 |
| #238 | closed | released | 0.6.0 | `spec/knowledge/behavior/skills.md` | Remote skills.sh search shipped in 3745dca8; historical verification above retains hosted-source and native-install limits. |
| #237 | closed | released | 0.6.0 | `spec/knowledge/reference/agent-platforms.md` | Enabled-Agent visibility and Antigravity IDE/CLI discovery shipped in f9ffbd58; historical verification above retains native loader and CLI registration limits. |
| #229 | closed | released | 0.6.0 | `spec/knowledge/behavior/skills.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Native file-write IPC/preload return void. Real editor save/readback/reopen regression passes; isolated Electron viewer retains saved text and byte size after restart. |
| #235 | closed | released | 0.6.0 | `mcp-version-history-and-projection-safety` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Forward/reverse Tab, disabled-control exclusion, confirmation cancellation and post-mutation focus are repaired. Independent regression/confirmation tests (3), source/test types, scoped lint and build pass; isolated Electron keyboard/confirmed restore acceptance passes without target-file writes. Desktop transient UI only; |
| #234 | closed | released | 0.6.0 | `mcp-version-history-and-projection-safety` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: SQLite adoption and immutable history are shared by Desktop and fresh CLI. Verified legacy upgrade, recovery, redaction, backup/restore, selected-record mutations, concurrent built-CLI writers, native macOS keyring and isolated GUI history/edit/distribution/restart. Web read-only and backup checks pass. Complete fix uses Closes #234; remote closure and publication remain separate. #203 and #220 native Windows/OAuth scope are not closed. |
| #233 | closed | released | 0.6.0 | `mcp-version-history-and-projection-safety` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Shared TOML removal clears paired empty managed blocks and preserves unrelated sections/comments. Three-cycle regression detects the original orphan opening marker; isolated Codex GUI distribution/uninstall and restart readback pass. |
| #232 | closed | released | 0.6.0 | `mcp-version-history-and-projection-safety` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Health UI translates stable codes in all seven locales; Core/CLI diagnostics use English without literal environment/placeholder values. English GUI error and old-renderer mutation regression pass. Static health is not MCP protocol connection acceptance. |
| #231 | closed | released | 0.6.0 | `mcp-version-history-and-projection-safety` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Saved MCP with no description uses a dedicated localized empty state. Component regression fails against the original selection hint; isolated English Electron detail view passes. |
| #230 | closed | released | 0.6.0 | `mcp-version-history-and-projection-safety` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Corrected the stale Agent detail-import test to assert the exact target/name createFromSource request, reject createServer/importFile calls and observe detail selection. #220 source contract is delivered in bd4ad7f3; 9 component cases and the combined 204-unit/9-IPC snapshot pass. Component IPC results are mocked; real storage/crypto boundaries are separately covered. |
| #228 | closed | released | 0.6.0 | `spec/knowledge/behavior/skills.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: All scan import callers use the package lifecycle. Copy/Link full-tree, binary, user/source tags, baseline, reopen, linked metadata editing/rollback and external-source preservation pass; Plugin child integration and isolated native folder/import/edit/delete GUI pass. CLI/Web related tests pass. |
| #227 | closed | released | 0.6.0 | `spec/knowledge/behavior/skills.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Renderer migration waits for deferred authority publication and database/IPC rebinding. Fresh-profile create, retry/reopen regressions and isolated first-launch Electron GUI pass. CLI/Web initialization checked. |
| #226 | closed | released | 0.6.0 | `spec/knowledge/behavior/plugins.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Original path/manifest fix: 37a20820. Report-specific preload/registered IPC copy and symlink workflows pass with canonical persistence, root resolution, inventory reopen and safe removal. Restoring the old version-directory behavior makes both cases fail at the target-path assertion. Fresh-profile Electron local import, actual target picker, byte-preserving flat IDE layout and process restart pass. The reported IDE configuration defect is complete; Windows loader, Zotero execution, CLI/project Plugin support and publication are not claimed. Remote closure is verified separately. |
| #225 | closed | released | 0.6.0 | `spec/knowledge/behavior/prompt-workspace.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: System-only Prompt saving and merged-content validation are implemented across Desktop, CLI, self-hosted Web, Cloudflare Worker and Mobile. 28 new regressions and 254 focused cases pass, including real persistence/reopen and rejected-edit history preservation; source/test typechecks and scoped lint pass. Full shared-worktree file-size gate is blocked by unrelated parallel mcp-config.ts growth. GUI, real-model and release acceptance remain open; |
| #224 | closed | released | 0.6.0 | `spec/knowledge/reference/agent-platforms.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Independent Qwen Work CN registration and official icon; scan/import/source update/full-package redistribution/reopen and canonical managed-link classification verified. Red: unknown platform and managed-link misclassification. Green: 3 new + 17 shared integration, 86 unit, 6 platform-contract and 1 isolated Electron workflow tests; types/lint/build pass. Windows native Junction and Qwen Work runtime execution not run; |
| #221 | open | local_done | 0.6.0 (partial) | `ISS-20261014-001-backup-connection-rebind.md` | `2da40ad6` 历史备份兼容与 `96528645` 启动冲突恢复已提交推送；2026-10-20 当前/历史备份 21 项集成通过，隔离 macOS Electron 设置页导出、取消/确认恢复、重开及导出后持续写入通过。维护者已接受该验收边界并授权后续推送自动关闭；替换版本尚未发布，报告者原包及 Windows 原始现场验收仍开放。 |
| #220 | closed | released | 0.6.0 | `ISS-20261013-001-antigravity-adaptation-audit` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Native configuration fix bd4ad7f3 confirmed by pre-fix empty-import and native-field-loss red checks. Added actual SQLite close/reopen regression; 9 focused unit and 7 real registered IPC/storage cases pass. OS encryption is substituted in integration; Windows native execution and remote OAuth login are unverified, separate from configuration support. |
| #219 | closed | released | 0.6.0 | `spec/knowledge/behavior/web.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Fix f783066e confirmed with the exact reported HTTP bodies for create and move; both reproduce 422 under the pre-fix expressions and pass current code. Actual SQLite close/reopen, list/detail and permission checks pass; existing 17 route and 11 service cases and Web typecheck pass. Browser/reporter Docker deployment not exercised; |
| #218 | closed | released | 0.6.0 | `spec/knowledge/behavior/skills.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Canonical managed-path recovery now restores the complete package by Skill id instead of using an obsolete repository checkout; sync returns the post-recovery record even when content is unchanged. Five new nested-Git regressions and 107 focused cases pass, including binary/attachment-only update, reopen, removed/existing checkout recovery, and failed-source package/history preservation. Restoring the old path implementation reproduces the reported regular-root-SKILL.md exception. Desktop source/test typecheck, scoped lint and new-test formatting pass. Desktop IPC only; CLI/Web do not consume that IPC. Windows GUI, live-network and release acceptance not run; |
| #217 | closed | released | 0.6.0 | `spec/knowledge/behavior/desktop.md` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Real isolated Electron reproduced lost query, second page, scroll position and hidden scrollbar. Split market/library search, retain the active browse position in memory, and restore the native scrollbar. Two-page real-install/return regression passes, as do 33 store/component cases, source/test types, build and scoped lint. Remote catalog is a fixture; no native MCP execution or release claim. |
| #216 | closed | released | 0.6.0 | `foundation-integrity-redesign/storage-inventory.md` | 修复已发布：升级 Loading / renderer snapshot 超限。2026-10-19 真实 Electron 复测后，已按用户授权评论 0.6.0 修复说明并关闭；远端状态已核实。 |
| #215 | closed | release_pending |  | `spec/knowledge/behavior/skills.md#git-directory-acquisition-215` | 本地提交 `98be080f`：Skill/Plugin 精确目录获取、固定提交和 CLI 商店完整包安装/更新完成；隔离复核补修 CLI 路径别名重复复制，413 项回归、类型与 scoped ESLint 通过。2026-10-21 已评论验证边界并关闭，远端 CLOSED 已核实。未推送、未发布；Windows/GUI/完整发布门禁未执行，本地包体测量不代表普遍提速。 |
| #212 | open | in_progress | 0.6.0 (partial) | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 部分完成：Instructions 与 Scoped Rules 拆分。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #211 | closed | accepted | | `skills-issue-211-git-http-fallback` | Remote closure is confirmed. Existing implementation notes record the reporter's Git-install workaround; package fallback changes still require their own current verification and release evidence. |
| #210 | closed | released | 0.6.0 | `rules-managed-copies` | 修复已发布：恢复覆盖外部规则及丢历史。2026-10-19 真实 Electron 复测后，已按用户授权评论 0.6.0 修复说明并关闭；远端状态已核实。 |
| #209 | open | untriaged |  | `rules-managed-copies` | 真实存储关闭、外部修改、两次启动初始化/扫描均保留目标字节并报冲突；原生应用、旧 profile 和自动远端同步仍待确认。 |
| #207  | closed       | wontfix      |                |                                                                                | IdeaHunter was submitted as a tools/resources-list entry, but PromptHub is a product repository rather than a curated tools list. Closed publicly as out of scope.                                                                                                                                                                   |
| #205 | open | in_progress | 0.6.0 (partial) | PR #206 | 部分完成：第三方 PR 安全扫描建议。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #204 | open | accepted |  | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 未解决：迁移 npx skills 配置。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #203 | open | in_progress | 0.6.0 (partial) | `mcp-version-history-and-projection-safety` | 部分完成：集中管理所有辅助/备份文件。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #202  | closed       | released     | 0.6.0-beta.1   | `mcp-issues-200-202-implementation`                                            | Environment/header references, target-specific rendering, reference health warnings, direct/reference UI, and redaction across renderer/IPC/preview/apply/remove/backup/sync shipped in the published prerelease.                                                                                                                    |
| #201  | closed       | released     | 0.6.0-beta.1   | `mcp-issues-200-202-implementation`, `pi-agent-separation`                     | Pi shared, `.agents`, native, and project MCP targets shipped in the published prerelease. PromptHub writes compatible `mcpServers` JSON but does not execute the adapter or claim runtime precedence.                                                                                                                               |
| #200  | closed       | released     | 0.6.0-beta.1   | `mcp-issues-200-202-implementation`, `agent-management-workbench`              | My MCP merged global/project target counts, details, quick deployment, batch deployment, and selection dialogs shipped in the published prerelease.                                                                                                                                                                                  |
| #199  | closed       | duplicate    |                | `desktop-workspace-live-refresh`                                               | Closed publicly as a duplicate of #198, which retains the broader refresh, draft-protection, statistics, filtering, and cross-workspace acceptance boundary.                                                                                                                                                                         |
| #198 | closed | released | 0.6.2 | [Desktop refresh](../../knowledge/behavior/desktop.md#workspace-manual-refresh-198) | Three hidden native refresh/draft workflows passed; published tag passed all 40 checks and five platform builds. |
| #197 | open | in_progress | 0.6.0 (partial) | `spec/knowledge/behavior/rules-workspace.md` | 部分完成：跨 Agent 规则目录矩阵。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #196 | closed | local_done | Next patch | `spec/knowledge/behavior/rules-workspace.md` | `f1faa73f` 修复同平台文件被侧栏去重；35 项定向测试、3 项旧实现红测、类型/构建和隔离 Electron 选择/搜索/重扫/重开通过。提交推送后自动关闭并核实；尚未发布，不属于 0.6.0 二进制修复。 |
| #195 | open | accepted |  | `prompt-workspace-completion` | 未解决：导出每张 Prompt 参考图片。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #194 | open | in_progress | 0.6.0 (partial) | `skills-issue-194-shared-global-target` | 部分完成：共享 ~/.agents/skills。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #193 | closed | released | 0.6.0 | `rules-issue-193-missing-project-reconciliation` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Real preload/IPC/filesystem/SQLite/reopen and isolated macOS Electron delete/rescan/selected cleanup accepted; 128-target measured scans avoid unchanged writes. Windows native/drive-letter and release acceptance not run; Re-run evidence: change implementation.md. |
| #192 | closed | released | 0.6.0 | `desktop-issue-192-copy-action-parity` | Published in 0.6.0 (36401160); remote closure confirmed. Historical scoped verification: Two real Electron copy entrypoints produce identical ordered/variable output and source-only usage after reopen. GUI exposed and fixed intermediate variable clipboard writes; 38 focused tests plus modal red/green and coverage passed. Windows/packaging/full release not run; Re-run evidence: change implementation.md. |
| #191 | closed | released | 0.6.0 | `sync-issue-191-safety-report-contract` | 修复已发布：safetyReport.scanMethod 拒绝备份。2026-10-19 真实 Electron 复测后，已按用户授权评论 0.6.0 修复说明并关闭；远端状态已核实。 |
| #190 | open | in_progress | 0.6.0 (partial) | `spec/issues/active/ISS-20261013-002-codex-claude-adaptation-audit.md` | 部分完成：原生 Claude Plugin 未识别。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #188 | closed | released | 0.6.0 | `skills-my-skills-tag-search` | 修复已发布：我的 Skill 标签搜索。2026-10-19 真实 Electron 复测后，已按用户授权评论 0.6.0 修复说明并关闭；远端状态已核实。 |
| #187  | closed       | released     | 0.6.0-beta.1   | `agent-management-workbench`                                                   | Built-in Oh My Pi registry, paths/assets, MCP/Rules targets, bounded read-only Sessions, and non-secret model/config projection shipped in the published prerelease. Provider usage, credentials, and plugin installation remain separate future scope.                                                                              |
| #186  | closed       | released     | 0.6.0-beta.1   | `desktop-issue-186-zcode-agent-support`                                        | ZCode Skills, Rules, native MCP projection, and global/project presets are included in the published prerelease; the already-closed remote issue now has matching local release state.                                                                                                                                               |
| #185 | open | in_progress | 0.6.0 (partial) | `self-hosted-skill-sync-reliability`, `self-hosted-web-database-lock-recovery` | 部分完成：自部署 Skill 反复恢复/本地 URL 失败。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #145 | open | in_progress | 0.6.0 (partial) | `desktop-tag-manager-usability` | 部分完成：标签管理界面改进。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #141 | open | untriaged |  | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 待复现：自定义 Skill 商店无结果。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #139 | open | in_progress | 0.6.0 (partial) | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 部分完成：导出/导入迁移经验。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #132 | open | accepted |  | `marketplace-expansion` | 未解决：Prompt 商店。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #107 | open | in_progress | 0.6.0 (partial) | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 部分完成：Docker HTTP 图片上传/粘贴。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #106 | open | in_progress | 0.6.0 (partial) | `cloud-collaborative-prompt-sharing` | 部分完成：云部署多用户共享/私有。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #98 | open | untriaged |  | `legacy-upgrade-recovery-audit`, `database-migration-safety` | 待复现：0.5.2 中间 Prompt 历史丢失。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #97 | open | untriaged |  | `legacy-upgrade-recovery-audit`, `database-migration-safety` | 待复现：0.5.1 备份无法用于 0.5.2。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #92 | open | accepted |  | `windows-code-signing-and-reputation` | 未解决：Windows Smart App Control 阻止安装。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #89 | open | untriaged |  | `legacy-upgrade-recovery-audit`, `database-migration-safety` | 待复现：Windows 升级后数据不可见。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #79 | open | in_progress | 0.6.0 (partial) | `webdav-skill-backup-observability` | 部分完成：Skill WebDAV 同步。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #74 | open | in_progress | 0.6.0 (partial) | `desktop-startup-folder-restore` | 部分完成：启动时隐藏指定文件夹。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #71 | open | in_progress | 0.6.0 (partial) | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 部分完成：无登录换设备如何保留数据。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #64 | open | in_progress | 0.6.0 (partial) | `ISS-20260809-001-remaining-open-issues-roadmap.md` | 部分完成：旧版安全密钥、图片上传及入口。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #44 | open | in_progress | 0.6.0 (partial) | `prompt-workspace-completion` | 部分完成：Windows 自启最小化及附加建议。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #27 | open | accepted |  | `git-backup-transports` | 未解决：GitHub/Gitee 数据备份。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #15 | open | accepted |  | `mobile-webdav-distribution` | 未解决：可分发 Android/iOS 客户端。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #183  | closed       | released     | 0.5.9          | `skill-frontmatter-yaml-parser`                                                | Shared YAML parsing now covers Desktop, CLI, Web, marketplaces, and Skill detail surfaces; lossless rewrites, embedded indentation, and strict unsafe/malformed YAML rejection shipped in the refreshed stable release.                                                                                                              |
| #184  | closed       | released     | 0.5.9          | `cli-desktop-database-concurrency`, `desktop-legacy-lock-recovery`             | Shared SQLite coordination, typed contention handling, Desktop refresh, and ownerless legacy-lock recovery shipped in `0.5.9`.                                                                                                                                                                                                       |
| #181  | closed       | released     | 0.5.9          | `cli-install-manual-fallback`                                                  | Windows `where.exe`, custom npm prefix, and manual CLI path fallbacks shipped in `0.5.9`.                                                                                                                                                                                                                                            |
| #180  | closed       | released     | 0.5.9          | `export-backup-sync-consistency`                                               | Custom Skill/MCP/Plugin store source backup and restore shipped in `0.5.9`.                                                                                                                                                                                                                                                          |
| #179  | closed       | released     | 0.5.9          | `desktop-issue-179-configured-skill-targets`                                   | Configured custom and overridden Agent distribution targets shipped in `0.5.9`.                                                                                                                                                                                                                                                      |
| #178  | closed       | released     | 0.5.9          | `desktop-issue-178-hermes-localappdata`                                        | `%LOCALAPPDATA%` and Hermes Windows Native path handling shipped in `0.5.9`.                                                                                                                                                                                                                                                         |
| #170  | closed       | released     | 0.5.9          | `skill-package-boundary`                                                       | Complete GitHub Skill package installation, including non-`SKILL.md` assets, shipped in `0.5.9`.                                                                                                                                                                                                                                     |
| #169  | closed       | released     | 0.5.9          | `web-prompt-clipboard-copy`                                                    | Web Markdown Prompt clipboard fallback shipped in `0.5.9`.                                                                                                                                                                                                                                                                           |
| #168  | closed       | released     | 0.5.9          | `my-skill-source-update`                                                       | Skill source fingerprint reconciliation and false local-modification fixes shipped in `0.5.9`.                                                                                                                                                                                                                                       |
| #177 | open | accepted |  | `marketplace-expansion` | 未解决：SkillHub 集成。证据与未验收范围见上方链接的 2026-10-19 逐项审查；本轮未更改远端状态。 |
| #176  | closed       | released     | 0.5.9          | `plugin-management`                                                            | Markerless multi-capability Claude bundle detection shipped in `0.5.9` while single-capability false positives remain excluded.                                                                                                                                                                                                      |
| #175  | closed       | released     | 0.5.9-beta.2   | `mcp-management`                                                               | Closed as completed after confirming the published beta includes the requested AGHub-style My/Agent/Store Skill and MCP workbenches.                                                                                                                                                                                                 |
| #167  | closed       | released     | 0.5.9          | `unified-custom-store-sources`                                                 | Store-local search for custom marketplace JSON, Git repository, and local-directory Skill Store sources shipped in `0.5.9`.                                                                                                                                                                                                          |
| #160  | closed       | released     | 0.5.9          | `issue-160-prompt-detail-usability`                                            | Prompt detail editing and folder-count usability improvements shipped in `0.5.9`.                                                                                                                                                                                                                                                    |
| #159  | closed       | released     | 0.5.9          | `web-auth-captcha`                                                             | Desktop-to-Web URL normalization, captcha configuration, and 401 compatibility handling shipped in `0.5.9`.                                                                                                                                                                                                                          |

## Historical Six-Issue Verification — 2026-10-14

These results describe the 2026-10-14 baseline. All six commits are now in the
published 0.6.0. The #221 restore failure below is historical; current triage
is in the overlay and the 2026-10-19 review, not a claim of present failure.

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
