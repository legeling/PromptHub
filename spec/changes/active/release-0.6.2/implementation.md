# PromptHub 0.6.2 release acceptance

## Product

Delivery

## Status

review-pending

## Scope and sequence

Publish the implemented 0.6.2 Desktop, CLI, self-hosted Web and Worker source changes. Preserve unrelated scratch evidence outside commits. The ongoing Agent and foundation redesigns retain their explicit unfinished requirements; this release does not claim those entire roadmaps are complete.

1. Review the accumulated data recovery and Agent changes; record user-visible changes in CHANGELOG.md.
2. Run the full root release harness, CLI tarball verification and website metadata/build checks. Electron tests use isolated profiles and hidden windows.
3. Fix actual failures with regression coverage, then verify affected gates. Commit independently reversible logical units and push.
4. Create the 0.6.2 tag only after the local gate passes. Require CI platform build, signing/notarization, Windows startup and artifact integrity checks before promoting the draft.
5. Verify published CLI, Desktop assets, self-hosted container tags, repository docs and official website readback. Do not replace customer services or invent a Worker deployment target.

## Evidence

Local release gate passed: 40/40 checks, exit 0, 1,741.7 seconds, concurrency two. Command: `pnpm verify:release --concurrency 2`. Task logs: /private/var/folders/mg/8kvpxvzs54g_ygxpmpzkzy1h0000gn/T/prompthub-release-062-dfDjRw. Candidate tag v0.6.2 points to 0fbac670; CI run 40461243995 failed. No release or image has been published.

## Resource and data boundary

Reuse installed pnpm dependencies. Root harness concurrency is two with its existing test-heavy resource group and per-check deadlines. No daily-user profile is used. Full workspace snapshots copy SQLite plus managed files in linear I/O with streamed file hashing; rollback and old-data migrations are verified by real storage tests. Release publication follows spec/releases/release-rules.md.

## Candidate corrections

- Initial full gate found the App route at 119.05 KiB gzip against the unchanged 80 KiB budget. Bundle analysis traces eager Skill state and YAML parsing through workspace refresh. Resume now loads the refresh workflow on demand; the existing byte budget remains the regression assertion.
- The causal-sync startup test requires native visibility and is now tagged accordingly. Local hidden runs exclude it; the release CI already enables native windows inside Xvfb. Explicit per-test headed options cannot bypass the runner opt-in. Prompt history screenshots now capture hidden windows without showing or focusing them. The initial local smoke group was interrupted after discovering the visibility override; its partial result does not approve the candidate.
- The standalone Astro website now pins the same pnpm 9.15.0 toolchain as the repository, avoiding accidental pnpm 11 bootstrap. Its metadata tests and production build passed after restoring missing dependencies; stable metadata still selects 0.6.1 until publication.

- Full Desktop integration exercised 418 passing cases; the collection assertion failed because a native-only file is intentionally excluded in hidden mode. Collection now verifies the complete native catalog separately without launching windows, and the hidden catalog excludes only that native-only file.
- Extended E2E found obsolete fixtures that wrote a canonical authority marker without a database and still inspected retired provider JSON mirrors. Agent lifecycle cases now use normal first startup and inspect the actual SQLite owner, with restart, deletion, secret exclusion and unavailable-encryption rollback assertions retained. Antigravity desktop/CLI discovery and Plugin action labels follow their current contracts.
- The full Desktop unit run exercised 6,596 cases. Eleven assertions in nine files still assumed the pre-split Antigravity identity, the old backup capability message, or a TopBar without its required Toast provider. All nine corrected files passed together (92 cases); test type checking passed. Shared Rule coverage now verifies the resolved native file on all three operating systems instead of excluding an Agent ID.
- Native Settings flows passed for selective exports with and without history, local ZIP restore, and WebDAV/self-hosted/S3 restore followed by restart. Each remote case preserves an otherwise unknown nested data file. The extended E2E suite also found obsolete JSON/workspace path assertions and the retired self-hosted POST endpoint; corrections retain real SQLite, package bytes and repeated restart checks.
- The final affected E2E batch passed all 11 cases, including provider persistence and encrypted/unavailable credential storage, Plugin distribution, and three workspace refresh scenarios. Prompt CLI writes, Skill file drafts and Rules conflicts use real native entrypoints and isolated storage. No local window is shown or focused.
- Native provider checks passed 18 cases across four integration files using installed Codex, OpenCode, Claude and Antigravity processes against isolated deterministic gateways. This proves local configuration, activation, requests, restart and rollback; it does not certify the reporter's external gateway.

## Local release gate — 2026-10-27

All eight Desktop unit shards, native storage integration, built-artifact smoke, shared/Core/CLI/Web/Worker/Mobile checks, performance budgets, typechecks, lint and builds passed in one complete final run. Separate CLI package verification, website metadata tests/build and the extended hidden E2E affected rechecks passed. Specification governance passed after the native refresh evidence update. Remote platform packaging and publication are the next required gates.

## Remote candidate failure — 2026-10-27

CI run 40461243995 blocked publication. Windows x64 upgrade moved the legacy database but retained its cached runtime path; startup opened the stale path and failed the storage publication connection check. Layout marker publication now invalidates runtime storage paths before startup or recovery reopens storage. A real SQLite regression primes the legacy cache, migrates populated storage and reads the original row across two opens. Packaged Windows smoke now checks that row and the absence of a recreated root database after each launch.

Linux Electron smoke exposed two auto-dismiss toast click races and a Rules refresh race with initial loading. Tests wait for the failure toast to disappear and original rule to render before the next action. Export failure/retry, archive contents, restart and conflict byte assertions remain intact. Corrected local checks passed: 47 migration/path/canonical startup cases, all five affected hidden Electron flows, test typecheck, focused lint and Desktop build. Cross-package quick checks and corrected platform gates are pending; failed candidate artifacts must not be promoted.

## Additional Skill changes — 2026-10-27

The release also includes nested GitLab namespace parsing, clone-based discovery,
complete-package materialization and localized import guidance. Existing Gitea
page/raw URLs must continue resolving to the repository root. The earlier local
quick run overlapped these edits and was stopped; its results cannot certify the
final tree. Three macOS Plugin fixtures now resolve the OS temporary directory
alias before exercising publication; explicit symlink rejection assertions remain.
The corrected tree passed the shared suite, 21 Core Git/Plugin cases and 156 Desktop source routing/installation cases, including real HTTP and redirected SSH integration. The final full gate must run against this tree.
