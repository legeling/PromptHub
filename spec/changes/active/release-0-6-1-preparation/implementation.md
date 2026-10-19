# 0.6.1 preparation evidence

## Candidate and changes

Base: `de0f63541faf88bea6e0421b11ea70583c093570`. Product versions identify
unpublished 0.6.1; published downloads and generated stable metadata remain 0.6.0.
The two product repairs are detail-page Apply callback arguments and Skill rename
conflict preflight/compensation. Other test changes follow current contracts.
No schema, dependency version, release tag or published artifact was changed.

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
