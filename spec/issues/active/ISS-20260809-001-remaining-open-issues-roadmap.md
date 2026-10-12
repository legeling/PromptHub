# Remaining Open Issues Roadmap

## Record

- ID: `ISS-20260809-001`
- Status: open
- Last triage update: 2026-10-03
- Source snapshot: `spec/issues/active/github-open.md` dated 2026-10-03
- Local delivery overlay: `spec/issues/active/local-github-status.md`
- Scope: 42 open issues, excluding pull requests. All report bodies were read;
  code, reproduction and acceptance checks below remain issue-specific.
- Purpose: separate remote state from local implementation and release evidence.

## Current Execution Cut

The maintainer requested sequential review and implementation on 2026-10-03.
This replaces the historical-audit-only queue. Work starts with startup blockers,
data preservation and existing-feature failures, then checks already implemented
features before adding missing capabilities. One issue remains independently
reversible; synchronization or an existing commit does not prove acceptance.

Current first batch: #216 legacy renderer cache migration. The reporter names
`Renderer persistence snapshot exceeds byte limit` after upgrading macOS
0.5.9-beta.2 to 0.6.0-beta.2. Track the bounded correction and evidence in
`foundation-integrity-redesign/storage-inventory.md`. Next inspect #218's nested
Git package update and #221's exact backup failure before selecting fixes.

#210 retains its existing local completion evidence, but remains remotely open
until release. #89/#97/#98 retain their historical-fixture gates. New naming/data
models, signing credentials and third-party integrations require their own
confirmed contracts; this queue does not authorize speculative implementations.

## Per-Issue Review Queue

“Implemented” below means present in current source or an existing local record,
not released or independently accepted in this review.

| Issue | Report and current evidence | Next action / acceptance boundary |
| --- | --- | --- |
| #216 | Startup blocked by renderer snapshot byte limit; cache-heavy store payload identified | Source-only collection regression, real Core publication/reopen, malformed input and failure preservation; actual macOS upgrade remains separate |
| #218 | Nested Git Skill import succeeds but update requests a directory without root SKILL.md | Trace installed package versus upstream subdirectory; full nested/binary inventory and update/rollback fixture |
| #221 | Windows 0.5.9 backup/import failure; “6.0.12” creation failure also mentioned, no textual error | Inspect attached errors and validate reported version/entrypoint; do not assume #191 or #185 is the cause |
| #209 | External CLAUDE.md edited while app closed is overwritten on reopen | Isolated exact reopen reproduction; keep distinct from #210 until the caller is known |
| #210 | Managed-only Rules restore and recoverable history already locally implemented | Preserve prior evidence and complete release gates; no remote closure yet |
| #191 | Backup rejects safetyReport.scanMethod | Existing provenance conversion plus restored-authorization and large-inventory gates |
| #185 | Repeated self-hosted Skill restore and local source_url backup failures | Existing sync/restore work needs end-to-end and deployment evidence |
| #89 | Windows upgrade appears to lose original data | Tagged path-transition fixture and complete recovery entrypoint |
| #97 | 0.5.1 backup cannot be used in 0.5.2 | Distinguish portable backup and upgrade snapshot; historical recovery/reopen evidence |
| #98 | Intermediate Prompt versions disappear after upgrade | Full ordered history and requested intermediate rollback through public entrypoint |
| #219 | Web default shared Folder rejects private-default Prompt | Current f783066e covers inferred create/update visibility; compare explicit-visibility/access tests with report, retain build limitation |
| #217 | MCP Registry loses search results and scroll when returning from installation | Inspect unmount/state ownership; preserve query/results/position through actual navigation |
| #193 | Deleted project Rule remains after scan | Existing missing-target reconciliation needs stress/write-count and Desktop evidence |
| #192 | Two Copy Prompt actions disagree with custom output | Existing shared output path needs remaining focused and Desktop acceptance |
| #190 | Multi-native Plugin shows Codex but omits Claude | Existing manifest discovery needs lifecycle, package-size and Desktop evidence |
| #141 | Custom Skill Store displays no Skills | Identify source and exact listing failure; screenshot alone is insufficient to select a code fix |
| #107 | Docker HTTP image upload/paste fails on crypto.randomUUID | Trace file picker and UUID secure-context assumption separately; test web media upload |
| #64 | Old Windows release reports security-key failure and inaccessible image upload | Split credential error from upload/placement; compare current behavior and available error evidence |
| #188 | My Skills searchable tag filtering | Implemented in skills-my-skills-tag-search; retain release/GUI gaps rather than duplicate feature |
| #145 | Tag management screenshot request | Usage counts/sort/filter navigation already implemented; compare exact visual requirements |
| #139 | Export/import migration advice from 0.4.8 to 0.5.x | Backup guidance exists; confirm warnings and data preservation, not evidence every upgrade is safe |
| #71 | Moving devices without login: data/media survival | Check current portable backup instructions and full media roundtrip |
| #79 | Skills do not sync to WebDAV | Reproduce complete package/version roundtrip, not just DB metadata |
| #44 | Windows autostart ignores minimized option; secondary system-copy/multi-shot suggestions | Test launch visibility separately; do not substitute multi-message design for primary defect |
| #74 | Exclude selected folders from startup view | Existing pinned/last-folder restore is not equivalent to per-folder exclusion; resolve exact product behavior before adding settings |
| #195 | Download/export each Prompt reference image | Managed-media explicit export workflow and byte-preserving test |
| #198 | Refresh Desktop after external CLI/database writes without restart | Shared refresh, list/detail/count consistency and draft protection |
| #196 | Claude user-level rules directory not discovered | Verified native rules path/format fixture, first case under #197 |
| #197 | Cross-Agent user/project scoped Rule directories | Official/versioned path matrix; preserve native semantics and scan/delete behavior |
| #194 | Experimental shared .agents/skills target | Existing lifecycle remains gated by exact-path deduplication and verified Agent/OS consumption |
| #203 | Generated Agent backup/adapter files pollute external directories | Existing MCP history/projection boundary; previewed legacy cleanup, no unconfirmed deletion |
| #220 | Antigravity 2.16.0 MCP support | Verify current official configuration path/schema before changing adapters |
| #215 | Reduce Git transfer with partial clone and sparse checkout | Measure existing package transport; preserve selected directory and full package with no invented fallback chain |
| #204 | Import installed npx skills configuration | Verify actual versioned upstream layout and metadata; report's suggested paths are not an authoritative contract |
| #205 | Third-party report-only PR security scanner proposal | Review supply chain, permissions, overlap and maintenance; no automatic workflow installation |
| #212 | Rename Rules to Instructions and add scoped Rules | Compare #196/#197 and current domain; public naming, storage and migration decisions must be confirmed |
| #92 | Windows Smart App Control blocks unsigned installer | Protected signing/provider setup and clean Windows release verification required |
| #15 | Android/iOS copy-oriented client with WebDAV | Mobile packaging, credentials and device distribution requirements |
| #106 | Cloud multi-user sharing and private/public Prompts | Server-owned ACL, workspace, audit and conflict requirements; not a local DB patch |
| #132 | Prompt marketplace | Verified catalog/import contract distinct from Skill packages |
| #177 | SkillHub integration | Verified official source/API/package contract |
| #27 | GitHub/Gitee backup transport | Credentials, encrypted snapshot format and remote integration contract |

## Existing Ownership

- Storage and upgrade: `foundation-integrity-redesign` is authoritative for the
  SQLite/actual-files boundary; `legacy-upgrade-recovery-audit` supplies historical
  evidence. Old file-authority assumptions cannot override the accepted foundation.
- #209/#210: `rules-managed-copies`.
- #185, #190–#194, #203: preserve their existing active changes and tests as listed
  in the local overlay; do not merge them into a generic issue implementation.
- #188: `skills-my-skills-tag-search`; #145: `desktop-tag-manager-usability`.
- #74: review the scope gap in `desktop-startup-folder-restore` against the
  report before treating its pinned/last-folder feature as complete coverage.
- #198: retained `desktop-workspace-live-refresh` design.
- #196/#197: retained `rules-agent-source-matrix` design.
- #195 and #44's secondary suggestions: retained `prompt-workspace-completion`.

## Deferred Dependency Backlog

| Program | Issues | Retained design | Required evidence |
| --- | --- | --- | --- |
| Windows trust and signing | #92 | windows-code-signing-and-reputation | Certificate/provider access and clean Windows verification |
| Mobile WebDAV distribution | #15 | mobile-webdav-distribution | Android/iOS packaging and secure device validation |
| Collaborative Prompt sharing | #106 | cloud-collaborative-prompt-sharing | Server-owned ACL, audit and conflict contract |
| Marketplace expansion | #132, #177 | marketplace-expansion | Verified external catalogs and import contracts |
| Git backup transports | #27 | git-backup-transports | Credentials, encryption and provider integration evidence |

These are accepted backlog designs, not evidence implementation has started.

## Shared Decisions And Acceptance

1. Use the accepted foundation ownership, existing domain owner and current
   contracts. Do not add competing storage or protocol implementations.
2. Keep version history, backup, live sync, target recovery and upgrade recovery
   distinct; validate package bytes and relationships, not only row counts.
3. Use isolated fixtures, actual public entrypoints and close/reopen checks where
   persistence is involved. GUI automation requires explicit user authorization.
4. New platform paths/protocols need official or versioned executable evidence.
5. Follow `spec/rules/document-routing-rules.md` and
   `spec/rules/testing-standards.md`; documentation depth follows actual risk,
   without requiring a new multi-file change for every defect.
6. Record real commands, assertions, replaced boundaries and remaining acceptance
   in the owning topic. Keep remote snapshots separate from local delivery.
7. Do not commit, push, publish or close remote issues without authorization and
   applicable submission/release gates.

## Non-Goals

- Closing an issue because a plan, patch or prerelease tag exists.
- Treating all reporter environments as fixed by one synthetic fixture.
- Replacing existing owners or combining all issues into one inseparable change.
- Installing external scanners, changing credentials or deleting live user data
  as part of triage.
