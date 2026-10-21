# 0.6.1 preparation evidence

## First replacement CI and corrections (2026-10-21)

The next Windows run at `c93e7cbe` reproduced the new extended-length regression
as well as native disable: `realpath` preserves the namespace prefix. Both
resolved paths are therefore compared in the same Windows namespace. Directory
alias, wrong-file and concurrent-edit cases already passed on that runner.

Candidate `9656c60cf6f573620e2ee9c689c2bf3004d304e4`, run
[39563236040](https://github.com/legeling/PromptHub/actions/runs/39563236040),
did not pass and must not be published. Windows x64 native Plugin disable failed
to recognize its user-config layer. The correction resolves both paths through
the filesystem and retains config conflict checks, with alias, wrong-file,
concurrent-edit and Windows extended-path regressions.

Two Desktop unit groups contained five obsolete expectations: the Git clone
signal argument and renderer acquisition assertions predated the main-owned
whole-package install path. Assertions now check the canonical request,
propagated acquisition failure and returned installed fingerprint. Existing
whole-package integration coverage remains in place.

The built Desktop smoke ran 20 scenarios: 18 passed; two completed their restart,
data and interaction assertions but timed out in Chromium's screenshot command.
Failure artifacts show the persisted Prompts. Those two evidence captures now
use the current Electron BrowserWindow's native capture, rejecting empty images;
no assertion or screenshot requirement is removed. Corrected CI acceptance is
still required.

Focused repair validation passed 12 Core cases (including the real macOS native
Codex lifecycle; one Windows-only path case skipped) and 57 Desktop/workflow
cases, Core source and Desktop test typechecks, Desktop lint and specification
governance. All six checks passed in 49.5 seconds. Electron capture and Windows
path acceptance remain assigned to the isolated CI runners.

## Replacement publication resumed (2026-10-21)

Maintainer authorization now includes scoped submission, push, final candidate
verification, protected replacement of the existing 0.6.1 tag, publication and
distribution synchronization. The earlier pause is superseded; publication
remains conditional on current-candidate gates.

The two remote SignPath test commits were merged without rewriting history.
All three affected local files were byte-identical to remote main before and
after the merge. The test certificate workflow remains outside production
release artifacts. The candidate retains existing product fixes, tests and
documentation reorganization; pre-existing `output/` is excluded.

Preparation validation passed specification governance, verification-harness
tests, release-workflow tests, both affected CLI fixture suites and CI/version
configuration checks in 20.8 seconds. The preceding assessment's 16 static and
160 focused passing cases cover the unchanged product code; its native test
skip is still explicit. The release workflow adds a Windows x64 native Codex
fixture (0.163.0) for existing command/runtime/plugin lifecycle tests, with an
isolated home and cleanup. That gate must pass on Windows before publication.
Current release notes include the later Plugin feedback, native management,
selective Git acquisition and Skill file refresh changes. Stable download
metadata remains 0.6.0 until the replacement is public.

Full verification and platform packaging will run on the committed candidate
in isolated CI runners, including Electron interaction under the CI virtual
display. No local user application or profile is used for those checks.
Preparation evidence is retained under
`/private/var/folders/mg/8kvpxvzs54g_ygxpmpzkzy1h0000gn/T/prompthub-061-publish-T5BK5Y/`.

## Release readiness assessment (2026-10-21)

Decision: not ready for publication; ready to proceed to complete candidate
acceptance. This assessment does not resume publication or authorize submission,
push, tag replacement, uploads or deployment.

Candidate: local HEAD `78279239b5856db429aa2d069e2100c38c9a5fc2` plus the existing
uncommitted work. HEAD contains 11 commits after the original `v0.6.1` commit.
The read-only remote check returned latest stable `v0.6.0`, HTTP 404 for the
`v0.6.1` Release, and the unchanged annotated tag object
`e04faa061abb3119bc8319b8ab877398e0bfb502`. Remote main was
`0329370a8bf2102db4613f1c8f235d7e56117143`; no CI approval for this local candidate
was established. The successful original release and Windows test-signing runs
are not current-candidate acceptance.

Current diagnostic verification passed all 19 selected checks in 247.2 seconds,
serially, through the existing verification executor and its bounded process-tree
cleanup. This is a selected diagnostic run, not the complete quick or release
profile. It includes all 16 quick-profile static/governance checks and:

- Core credential migration, empty credentials, encrypted vault, SQLite settings,
  database byte-stable reopen and Git package acquisition: 55 passed; one opt-in
  native Codex lifecycle test skipped (`PROMPTHUB_NATIVE_AGENT_TESTS` unset).
- Desktop settings replacement through registered IPC/preload and reopen:
  40 passed.
- Desktop startup error copy, proxy startup, Plugin marketplace/distribution/store
  feedback and Skill editor package refresh/draft preservation: 65 passed.

All 4,801 existing candidate files retained identical SHA-256 values throughout
the checks. Product/test/harness whitespace checking passed. No product source
was changed by this assessment. No GUI automation, full application build,
complete integration/unit suites, performance gates or platform packaging was
run. Prior focused UI evidence remains scoped to its recorded candidate.

Before publication, freeze the final included changes and pass the complete
release harness on that candidate; obtain current Windows x64 two-start packaged
upgrade and macOS signing/notarization/Gatekeeper evidence plus the remaining
platform build gates. The new Windows native Codex Plugin lifecycle still lacks
Windows 11 installation/enable-disable/removal acceptance, as recorded in
[Plugins](../../../knowledge/behavior/plugins.md#windows-native-runtime-discovery-244).
Reconcile release notes with the final included Skill/Plugin changes. Same-version
replacement still requires manual installation for existing 0.6.1 users and
expected-old-value protection when replacing the original tag after authorization.

Reproducible runner, exact command results, candidate hashes and stability report
are retained at
`/private/var/folders/mg/8kvpxvzs54g_ygxpmpzkzy1h0000gn/T/prompthub-061-assess-98J52k/`.
The runner is `assess.mjs`; the result is `assessment.json`. Temporary test
profiles and the disposable Node compile cache were removed; no assessment
process remains running. This entry was added after the frozen-file checks.

## Replacement preparation (2026-10-19)

Publication paused by maintainer. The final local invocation was cancelled after
16 checks passed, including Core tests/storage performance, CLI tests within the
unchanged suite budget, and Desktop lint/source/test typechecks. Desktop
integration was interrupted; the remaining checks are cancelled or blocked, not
passing. All 4,762 candidate files remained unchanged during verification.
The verification process exited and its isolated temporary profiles were removed.
Reports remain in `/private/tmp/prompthub-061-replacement-cx4PXp/`; no replacement
commit, push, tag mutation or asset publication occurred. Full replacement release
acceptance remains incomplete and cannot be inferred from these partial results.

The replacement includes Core settings credential upgrade and Desktop startup
error diagnostics. Focused evidence is owned by the desktop-settings topic and
data-recovery topic: 175 credential/adjacent cases and 23 diagnostic/startup
cases passed before release preparation, with typechecks and production build.
These are not replacement release acceptance. The original release gates below
must not be reused as evidence for changed product code.

The remote Release API returns 404; release listing starts at 0.6.0. The original
v0.6.1 tag object remains e04faa061abb3119bc8319b8ab877398e0bfb502. No remote
deletion, tag mutation or asset upload has occurred in this replacement batch.
Only pre-existing untracked output/ is excluded from submission. Product
versions stay 0.6.1; no dependency or lockfile update is required. Public notes
and seven-language installation guidance cover same-version manual replacement.
Existing screenshots remain historical feature illustrations; none claims the
new startup-error state. Isolated Electron UI automation is authorized. The
additional app smoke covers visible error details, redacted OS clipboard bytes
and reload after an injected IPC failure; prior clipboard formats are restored.
The cohesive smoke body exceeds 50 lines to keep failure setup, UI assertions
and clipboard/profile cleanup in one test. Its first run reached the real error
page but expected English before saved-language hydration; the fixture now pins
the browser locale as well as saved settings. Product language behavior is unchanged.
The governance quick check detected a stale change index after reopening the
release plan; the standard index generator refreshed it.

The first complete invocation used the platform's aliased temporary path instead
of the earlier physical-path wrapper. Core hit 300 seconds; CLI reported five
symlink-parent fixture failures. The run was stopped after collecting these
failures, without changing its 4,762 frozen candidate files. Remaining checks
are cancelled/blocked, not passing. One known task-owned interrupted fixture was
removed; the subsequent wrapper owns and removes its entire temporary root.

The isolated timing diagnostic passed all 148 Core files / 1,224 cases in 328.1
seconds. The maintainer approved raising the registry's Core process deadline
from 300 to 600 seconds. Only this test-process deadline changes; cases, workers,
assertions and the independent Core performance budget remain unchanged. Revert
the single registry value to restore the former deadline. CLI's physical-path
rerun passed all 175 assertions but exceeded its unchanged 75-second suite budget
(88.2 seconds measured by its teardown); this remains a failed gate pending
verification at stable load, not permission to raise that performance budget.

## Initial candidate and changes

Base: `de0f63541faf88bea6e0421b11ea70583c093570`. Initial preparation identified
unpublished 0.6.1 while published downloads and stable metadata remained 0.6.0.
The two product repairs are detail-page Apply callback arguments and Skill rename
conflict preflight/compensation. Other test changes follow current contracts.
Initial preparation changed no schema, dependency version, release tag or
published artifact. Publication results below supersede that initial state.

## Verification

Reports are retained under `output/release-0.6.1-preparation-20261019/`.

- Baseline Desktop: 45 passed / 24 failed across 11 selected files.
- First repair batch: 97/98 Desktop cases; Web install bridge 15/15.
- Final detail/CRUD focused batch: 56/56. Isolated old-source regression proof:
  both new bug regressions failed against original product sources.
- Version alignment, website sync tests and Desktop source/test typechecks passed.
- First full `verify:release --concurrency 2`: 32 passed, 5 failed, 2 timed out,
  1 blocked, 1,891 seconds. Complete JSON/log are `release-gate-first.*`.
- This full run passed Desktop real-boundary integration (572 seconds), 13 hidden
  Electron E2E cases, seven unit shards, Web tests/build/HTTP smoke, shared and
  Mobile checks. Unit shard 2 failed only the stale startup error-text assertion.
- CLI typecheck/test and Worker typecheck/build/runtime tests could not resolve
  declared dependencies. `pnpm install --offline --frozen-lockfile --ignore-scripts`
  restored missing links in 456 ms using existing packages; lockfile unchanged.
- Core test hit its existing 300-second harness limit. This failure also blocked
  the dependent performance check. No passing result is inferred from partial logs.

All eight focused repair checks passed: CLI/Worker typechecks, three Desktop
startup cases, CLI source import parity, the complete Worker suite, Worker dry-run
build, CLI tarball proof and the Core timing diagnostic. Core completed in
282.8 seconds when run alone, below the official 300-second limit; the diagnostic
allowed 600 seconds only to collect a complete result. The registry and official
budget remain unchanged. CLI tarball proof exercised the packed entrypoint with
only production dependencies, persisted Agent configuration and MCP apply/remove.
Evidence: `focused-final.json`, `focused-final.log`, `focused-final-context.json`.

The second complete gate ran serially: 31 checks passed, Desktop integration
hit its 600-second process limit, and eight dependent unit shards were blocked.
Core passed in 280.1 seconds under its unchanged 300-second limit; CLI, Worker
and hidden Electron checks passed. All 4,756 candidate files remained unchanged.
Evidence: `release-gate-second.*`, `second-candidate-before.json` and
`second-source-stability.json`.

Desktop integration had passed the same candidate in 572 seconds in the first
run. The second run's retained output contained no assertion failure and showed
slower storage cases near the end of the suite. Its central process timeout is
now 900 seconds to allow completion; workers, assertions, selected cases and the
separate product performance budgets are unchanged. The dedicated CI group still
has a 20-minute outer limit. Reverting this configuration restores the 600-second
process deadline without changing product behavior or data.

The final complete gate passed all 40 checks in 2,099.6 seconds, with concurrency
1 and all 4,756 candidate files unchanged. The official release CLI/registry was
executed through the bounded wrapper; no surfaces or layers were excluded.
Evidence: `release-gate-final.json`, `release-gate-final.log`,
`final-candidate-before.json`, `final-source-stability.json`.

| Boundary | Final result |
| --- | --- |
| Core | 146 files / 1,202 cases; independent storage performance budget passed |
| CLI | 38 files / 175 cases; lint, types and build passed |
| Desktop integration | 61 files / 362 cases passed in 624 seconds; 3 files / 5 cases intentionally skipped by existing platform/opt-in conditions |
| Desktop unit | All eight shards: 753 files / 6,498 cases passed |
| Electron built artifact | 13 hidden smoke cases passed, including real Skill distribution and cold reopen |
| Desktop static/build | Source and test types, lint, build, performance and bundle budgets passed |
| Self-hosted Web | 89 files / 496 cases; static checks, build and live HTTP smoke passed |
| Worker | 14 files / 48 cases; static checks and dry-run build passed |
| Mobile | 7 files / 38 cases and typecheck passed |
| Governance/shared | All selected checks passed |

The integration deadline change also passed `test:verification-harness` and
`spec:test` before the final gate. Temporary verification roots were removed on
each run's exit. Post-gate edits only record these results and remaining steps;
they do not change the verified product, test or harness code.

## Unverified release boundaries

Hidden E2E does not cover the three explicitly tagged native-window scenarios.
Integration also keeps its existing opt-in native Agent tests and Windows-only
notification test excluded on this macOS run (five cases across three files).
Final-candidate Windows x64 two-start upgrade, Windows ARM64/Linux packaging,
macOS x64/ARM64 signing/notarization/ticket/Gatekeeper checks and update hashes
still need platform CI evidence. Historical 0.6.0 binaries cannot satisfy this.
No commit, push, tag, release upload or publication is included in this preparation.

## Publication preparation (2026-10-19)

Public 0.6.1 notes now describe observable features, improvements and fixes in
Chinese and English. The stable release rule owns this writing contract; AGENTS
and release-sync link to it. GitHub draft creation uses the curated notes file
without appending generated commit/PR summaries.

Validation: release-workflow and updater-real-scenario passed 18 cases; the
verification harness passed 37 cases; spec governance, version alignment (5)
and website release sync (4) passed. One initial pnpm invocation rejected its
argument syntax before running tests; the corrected exec invocation passed.
Product source is unchanged since the complete local 40-check success. The
final pushed workflow and candidate still require complete CI/platform evidence.

## Published candidate (2026-10-19)

Tag v0.6.1 targets 132dfcf177ce0e2b402b897dd15b7e692609de3f. CI run
39232265152 passed all 40 checks, 16 Electron cases and five platform builds.
Both macOS architectures passed signed/notarized ZIP and DMG verification;
Windows x64 passed two packaged upgrade starts. Desktop integration passed
362 cases with five existing platform/opt-in skips. Seven downloaded manifests
match GitHub digests, file references, supplied sizes and curated version notes;
binary SHA512 verification passed in the release job.

GitHub publication at 09:59:50 UTC exposes 20 assets and marks 0.6.1 latest stable.
The Self-Hosted Web run 39234204977 and release-job-only rerun for Homebrew are
in progress. R2 publishing has no configured credentials and remains skipped.
No npm registry, Worker deployment or Mobile store submission is implied.

The release-job-only rerun passed. Homebrew readback confirms version 0.6.1 and
both DMG SHA256 values match GitHub assets. Public metadata validation passed
spec governance, five version checks and four website release-sync checks.

## Final delivery

Self-Hosted Web run 39234204977 passed verification and Docker publication.
Direct GHCR manifest reads confirm `0.6.1` and `latest` share digest
`sha256:44bcc168d69831d14ebe155fe5c5eda55fdf66db9ede559e49e5a2cda23f3f6c`.
Vercel production deployment 7170895691 succeeded at stable-metadata commit
3f871379e5ae011955fe9f9d797ed02497bc2692. Local public-page HTTP readback was
inconclusive due network errors; no visual/browser acceptance is inferred.
Homebrew and GitHub stable publication are verified; R2 remains unconfigured.
No task-owned local development service, tunnel or test process is retained.

## Documentation availability reconciliation (2026-10-21)

GitHub latest is v0.6.0 and the v0.6.1 Release returns 404. Seven localized
README badges/downloads and generated website metadata now select 0.6.0;
0.6.1 replacement copy is explicitly pending. Historical original-package
evidence and local replacement changes are preserved. Product versions remain
0.6.1; screenshots and runtime locale strings are unaffected.

Website synchronization passed. Version/release-metadata tests passed 9/9, and
the governance-only quick profile exited 0. These are documentation consistency
checks, not replacement-candidate or platform acceptance. No publication resumed.
