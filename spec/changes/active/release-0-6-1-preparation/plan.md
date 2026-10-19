# 0.6.1 release preparation

## Status

Local preparation verified; platform acceptance pending.

## Scope and authority

Prepare the current main branch for stable 0.6.1. Release policy is owned by
`spec/releases/release-rules.md`; package/distribution behavior remains owned by
the Skills and resource-library topics. Published stable downloads remain 0.6.0
until publication. Delivery scope now includes submission, push and deployment;
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

- [ ] Submit independently reversible fix, test, release and writing-policy changes.
- [ ] Push the candidate and run all verification groups plus five platform builds.
- [ ] Verify artifacts and publish 0.6.1; synchronize public downloads and deployment.

## Verification and recovery

Use existing pnpm dependencies and bounded test workers. Isolated temporary
profiles must be disposed on success and failure; never use personal data.
Full verification must be rerun after repairs, not inferred from focused tests.
Native Windows starts, signed/notarized macOS artifacts and other platform
packages require evidence for the final candidate. No schema change is planned
by release preparation; existing main-branch migrations retain their tests.
Reverting this preparation must preserve all earlier main-branch changes and
existing user data. Test reports live under `output/release-0.6.1-preparation-20261019/`.
