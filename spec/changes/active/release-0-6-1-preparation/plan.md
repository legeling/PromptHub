# 0.6.1 release preparation

## Product

Delivery

## Status

in_progress. Replacement publication authorized on 2026-10-21, including
candidate preparation, scoped commits, push, protected tag replacement and
publication after complete candidate/platform acceptance. The 2026-10-19 pause
is lifted. Preserve existing work and exclude pre-existing scratch output.
Earlier publication evidence below applies only to the original candidate.

## Replacement acceptance (2026-10-19)

- [ ] Submit the credential migration and startup diagnostic changes separately.
- [ ] Synchronize curated release notes, localized manual replacement guidance and website metadata.
- [ ] Pass current full verification, isolated startup UI checks and platform packaging/signing gates.
- [ ] Update v0.6.1 using an expected-old-value lease, verify uploaded artifacts, then publish.
- [ ] Confirm website, Homebrew and self-hosted distribution results for the replacement.

The 2026-10-21 candidate also includes native Codex Plugin management and Windows
runtime discovery, selective complete Git package acquisition, Plugin feedback,
Skill editor cache refresh, byte-stable database reopen and documentation
classification/lifecycle cleanup. The Windows x64 build now runs existing native
command/runtime/lifecycle cases using an isolated pinned Codex 0.163.0 fixture;
no account or model invocation is involved. Its runner/profile and installer
acceptance do not establish Windows 11 Store UI acceptance. The manual SignPath
test remains separate from production artifacts.

Remote recheck returned 404 for the v0.6.1 Release, while the tag still exists
at tag object e04faa061abb3119bc8319b8ab877398e0bfb502 (commit 132dfcf1).
No remote deletion is part of this preparation. Preserve the old tag identity
for recovery; never replace it if another writer changes it. Existing 0.6.1
installations require manual replacement because semver is unchanged.
Isolated Electron UI automation was explicitly authorized for this replacement.
The startup diagnostic smoke injects one failed storage IPC response, then uses
the real preload, startup page, Copy action and OS clipboard, restoring clipboard
formats and disposing the isolated profile. This proves diagnostic UI behavior,
not a new migration scenario; disk migration/reopen/rollback remains Core coverage.

## Scope and authority

Prepare the current main branch for stable 0.6.1. Release policy is owned by
`spec/releases/release-rules.md`; package/distribution behavior remains owned by
the Skills and resource-library topics. Published stable downloads now select 0.6.1. Delivery scope now includes submission, push and deployment;
publication requires successful candidate and platform gates.

## Work

- [x] Reconcile the failed resource-batch tests against the current contracts;
  repair confirmed defects and preserve normal workflow and rollback assertions.
- [x] Align product versions, release notes, localized development identity and
  website metadata without advertising unpublished downloads.
- [x] Run focused tests and static checks, then the complete release harness on
  the final candidate. Record failures, skips and platform boundaries separately.
- [x] Prepare the release record and exact remaining packaging/publication steps.

## Baseline

Main `de0f6354` is synchronized with origin. Only the pre-existing untracked
`output/` directory was present. Product manifests still identify 0.6.0.
The last full CI at `9a415d4f` failed in desktop unit/integration, Web and E2E,
and macOS ARM ticket validation. These historical failures are not assumed to
be current defects without reproduction and contract review.

Local recheck on 2026-10-19 reproduces three failures in
`skill-manager-large-dataset.test.tsx` and `skill-library-platform-files.test.ts`.
The former lacks the current store status fixture; the latter edits a deployed
package before requesting rename, conflicting with external-change protection.
Normal rename, conflict preservation and failed final commit remain required.

## Repair batch

Restore current status fixtures, separate apply/redistribute callbacks, assert
MCP parse errors, preserve original imported Qwen packages, and verify Plugin
receipts independently from package bytes. Resolve macOS temporary path aliases
in the isolated fixture so the target-parent safety check remains intact.
Rename checks all installed target conflicts before mutation and compensates only
completed operations. Detail-page Apply no longer forwards a MouseEvent into the
redistribution boolean; existing Electron lifecycle assertions cover this defect.

First repaired pass: 97/98 Desktop cases and 15/15 Web bridge cases passed;
the remaining IPC assertion expected redeployment after a refused removal and is
corrected to require unchanged old identity plus cleanup of the newly created target.
Version/website checks and Desktop source/test TypeScript checks passed before the
subsequent detail-button regression/fix. The full gate will verify the final batch.
User authorized isolated hidden Electron/Playwright automation on 2026-10-19.

The first full gate completed in 1,891 seconds: 32 passed, 5 failed, 2 timed out,
and Core performance was blocked by Core test timeout. Desktop integration passed
in 572 seconds and all 13 hidden Electron E2E cases passed. Desktop unit shard 2
contained one stale error-message assertion at the current startup migration
boundary; it now checks `PromptWorkspaceRecoveryRequired` while retaining source
preservation. Historical v1 migration tests keep their original contract.
CLI and Worker failures traced to missing local dependency links already declared
in the frozen lockfile. Offline pnpm synchronization restored them without changing
the lockfile or downloading packages. All eight focused repair checks passed;
the isolated Core run completed in 282.8 seconds, within its unchanged official
300-second budget. Final verification uses serial execution and frozen-file
hashes. Detailed evidence is in `implementation.md`.

Second full gate: 31 passed; Desktop integration hit its 600-second process
limit, blocking eight unit shards. Candidate file hashes remained identical.
The same suite passed in 572 seconds in the first run. Its central process
deadline is raised to 900 seconds without changing workers, cases, assertions
or separate performance budgets.

Final full verification passed all 40 checks in 2,099.6 seconds with concurrency
1. Desktop integration completed in 624 seconds, all eight unit shards passed,
and 13 hidden Electron E2E cases passed. All 4,756 frozen candidate files remained
unchanged. CLI tarball proof also passed independently on the same product code.
The five existing platform/opt-in integration skips and three native-window E2E
exclusions remain explicit in the implementation record.

Delivery scope expanded on 2026-10-19 to commit, push and deploy 0.6.1. Public
notes describe user-visible changes only and follow the stable release-note
contract. The workflow no longer appends generated commit/PR summaries.

- [x] Submit independently reversible fix, test, release and writing-policy changes.
- [x] Push the candidate and run all verification groups plus five platform builds.
- [x] Verify artifacts and publish 0.6.1.
- [x] Synchronize public downloads, Homebrew and self-hosted image deployment.

## Verification and recovery

Use existing pnpm dependencies and bounded test workers. Isolated temporary
profiles must be disposed on success and failure; never use personal data.
Full verification must be rerun after repairs, not inferred from focused tests.
Native Windows starts, signed/notarized macOS artifacts and other platform
packages require evidence for the final candidate. No schema change is planned
by release preparation; existing main-branch migrations retain their tests.
Reverting this preparation must preserve all earlier main-branch changes and
existing user data. Test reports live under `output/release-0.6.1-preparation-20261019/`.
