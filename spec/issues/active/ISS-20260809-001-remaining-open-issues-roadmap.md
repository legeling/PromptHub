# Remaining Open Issues Roadmap

## Record

- ID: `ISS-20260809-001`
- Status: open
- Last triage update: 2026-08-20
- Source snapshot: `spec/issues/active/github-open.md` dated 2026-08-20
- Local delivery overlay: `spec/issues/active/local-github-status.md`
- Purpose: separate remote GitHub state from actual remaining product work and
  route every unresolved issue to one authoritative change or investigation.

## Current Execution Cut

The #210 backup-import boundary is locally complete: shared import restores only
managed state, preserves external targets, retains bounded recoverable history,
and rolls back failed publication. GitHub remains open until release. #209 is
now the highest-priority unresolved Rules correctness boundary because its exact
close, external edit, and reopen trigger still requires current-build evidence.

The shared database migration mechanism was completed and archived on
2026-08-12 under `2026-08-12-database-migration-safety`. The current executable
queue is the tagged historical recovery corpus under
`legacy-upgrade-recovery-audit`; accepted design and external-dependency
backlogs below are not active implementation changes.

The #89/#97/#98 audit remains the tagged historical evidence corpus. It verifies
legacy path, backup, and Prompt-history behavior against the redesigned runner,
but it does not define or delay current migration safety work.

## Classification

| Class                                      | Issues                                      | Local meaning                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivered database migration safety        | #89, #97, #98 as regression evidence        | Completed mechanism work is archived under `2026-08-12-database-migration-safety`; historical recovery remains separate.                             |
| Current historical audit                   | #89, #97, #98                               | Tagged fixtures under `legacy-upgrade-recovery-audit`; do not claim issue completion before end-to-end evidence.                                     |
| Locally completed Rules restore defect     | #210                                        | Managed-only import, bounded history, rollback, Desktop fallback, and CLI restore coverage are complete; keep open until release.                    |
| Accepted Rules reopen correctness defect   | #209                                        | Preserve external edits and reproduce the current-build reopen trigger before deciding whether it shared #210's historical caller path.              |
| Existing correctness work already underway | #185, #190, #191, #192, #193, #194, #203    | Preserve their current changes and verification gates; do not expand them inside the historical audit.                                               |
| Local design backlog                       | #44, #74, #195, #196, #197, #198            | Designs are retained and implementation can be scheduled after the historical audit as independently reversible work.                                |
| External or operational dependency backlog | #15, #27, #92, #106, #132, #177             | Accepted and designed, but not in the current implementation queue.                                                                                  |
| New integration or security review         | #204, #205                                  | Verify the external `npx skills` contract and review PR #206's scanner supply chain, permissions, maintenance, and signal quality before acceptance. |
| Untriaged or support follow-up             | #64, #71, #107, #139, #141, #145, #188 | Require current reproduction/capability evidence before routing or claiming delivery; broad feedback alone is not an implementation plan.            |

Issues #187 and #200 through #202 shipped in the public `0.6.0-beta.1`
prerelease and are now remotely closed. Issue #199 was publicly linked to #198
and closed as a duplicate. Issue #207 was closed as an out-of-scope submission
to a tools/resources list that this repository does not maintain.

## Current Program

| Order | Program                        | Issues          | Authoritative change                 | Exit condition                                                                                                       |
| ----- | ------------------------------ | --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 0     | Rules reopen investigation     | #209            | `rules-managed-copies`               | Current-build reopen trigger, regression, fix if still present, and release evidence complete.                       |
| 1     | Conflict-safe Rules restore    | #210            | `rules-managed-copies`               | Locally complete; publish a containing version and close the GitHub issue.                                           |
| 1     | Migration baseline             | Shared SQLite   | archived `database-migration-safety` | Completed: empty/current/legacy/partial/newer states and migration steps have executable fixtures.                   |
| 2     | Atomic migration core          | Shared SQLite   | archived `database-migration-safety` | Completed: ordered compatibility, rollback, host reconciliation, and safety-point tests are recorded.                |
| 3     | Tagged historical corpus       | #89, #97, #98   | `legacy-upgrade-recovery-audit`      | Deterministic v0.4.7/v0.4.8/v0.5.1/v0.5.2 path, backup, and Prompt-history fixtures pass through the current runner. |
| 4     | Migration/recovery convergence | Shared + issues | Both recovery changes                | Stable migration/recovery docs and local issue evidence match verified restart and rollback behavior.                |

## Local Design Backlog

| Program                     | Issues         | Authoritative change                             | Scheduling condition                                                                        |
| --------------------------- | -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Workspace live refresh      | #198           | archived design `desktop-workspace-live-refresh` | Start after historical recovery work; preserve drafts and avoid polling/watchers.           |
| Agent Rules source matrix   | #196, #197     | archived design `rules-agent-source-matrix`      | Start when official/versioned source evidence is assembled.                                 |
| Prompt workspace completion | #44, #74, #195 | archived design `prompt-workspace-completion`    | Ship the three tracks independently; multi-message storage requires its own migration gate. |

Existing work for #185, #190 through #194, and #203 keeps its own active change,
tests, and convergence gates. This roadmap does not merge those changes into the
historical audit or declare them paused/completed.

The #209/#210 Rules restore reports remain tracked by `rules-managed-copies`.
The stable managed-only import contract and bounded history policy are now
implemented locally for #210. #209 remains independent until its reopen-time
caller is reproduced on the current build.

## Deferred Dependency Backlog

| Program                      | Issues     | Authoritative change                                  | Reason for deferral                                                                                 |
| ---------------------------- | ---------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Windows trust and signing    | #92        | archived design `windows-code-signing-and-reputation` | Requires protected certificate/provider setup and clean Windows release infrastructure.             |
| Mobile WebDAV distribution   | #15        | archived design `mobile-webdav-distribution`          | Requires Android/iOS packaging, secure mobile credentials, and store/device verification.           |
| Collaborative Prompt sharing | #106       | archived design `cloud-collaborative-prompt-sharing`  | Requires a server-owned workspace, ACL, audit, and conflict service rather than a local-only patch. |
| Marketplace expansion        | #132, #177 | archived design `marketplace-expansion`               | Requires verified external contracts and must not rely on guessed endpoints or scraping.            |
| Git backup transports        | #27        | archived design `git-backup-transports`               | Requires remote credentials, encrypted snapshot transport, and GitHub/Gitee integration evidence.   |

These changes remain design records so their data, security, and compatibility
boundaries are not lost. `accepted` means valid backlog work, not implementation
in progress.

## Shared Architecture Decisions

1. PromptHub-owned libraries, SQLite rows, or managed workspaces are canonical;
   Agent files, caches, views, and remote transports are projections.
2. Version history, whole-product backup, online synchronization, target write
   recovery, and legacy upgrade recovery are distinct concepts.
3. Shared SQLite compatibility uses one ordered manifest; host filesystem
   reconciliation is not recorded as a schema migration.
4. External mutations use validate, stage, atomic publish, verify, and rollback.
5. Inventories use pagination, lazy detail loading, bounded traversal, and
   finite concurrency. No unbounded watcher, cache, retry loop, or scan is
   allowed.
6. New platform paths and third-party protocols require official documentation
   or a versioned executable fixture. A plausible directory name is not proof.
7. Each active change maintains `FR -> DES -> TEST -> T` traceability and remains
   open until implementation, verification, documentation, issue state, and
   release state converge.

## Sequencing

1. Reproduce #209's exact reopen trigger on the current build without assuming
   it still reaches the historical #210 importer.
2. Release the completed #210 managed-first restore boundary after the normal
   release gates pass, then close the GitHub issue.
3. Build the current shared SQLite migration fixture and failure-injection matrix.
4. Implement ordered compatibility, atomic migration, managed safety points,
   host reconciliation, and the Desktop stage coordinator.
5. Run the #89/#97/#98 historical fixtures through the verified mechanism.
6. Converge migration/recovery evidence and stable documentation.
7. Resume independently reversible local backlog work.
8. Schedule signing, mobile, collaboration, marketplace, and Git transports
   only when their external credentials, protocols, and test environments are
   available.

## Non-Goals

- Closing GitHub issues merely because a design exists locally.
- Treating a prerelease tag as a stable public release without publication
  evidence.
- Combining all remaining issues into one implementation branch or commit.
- Replacing existing active changes that already own the same user problem.
- Keeping external-dependency work marked `in_progress` when only its design is
  complete.
