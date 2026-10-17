# Implementation

Status: review-pending — real Windows packaged UI acceptance remains

## Implemented Changes

- 2026-10-17 authentication follow-up: package download callbacks now use the
  existing settings credential reader. Configured GitHub tokens authenticate
  zipball API requests; anonymous downloads retain codeload. Redirects never
  forward the token to archive hosts. Git/SSH continue to use local credentials.
- SSH scans preserve the original clone URL for later install/update and use
  Git on self-hosted servers as well as GitHub. Canonical source identity stays
  unchanged; existing HTTPS records are not inferred to be former SSH sources.
- Catalog, package, import and branch errors distinguish API authentication,
  rate limits, repository/ref access, SSH key/host verification, TLS and network
  failures. Git reasons are classified before truncating diagnostics; HTTP
  fallback reasons take precedence over an earlier Git failure. Settings now
  explain where tokens apply and how to use an SSH import URL in all 7 locales.

- 2026-10-17 follow-up: explicit-directory archive fallback extracts only the selected complete Skill package before applying per-package budgets; unrelated repository files no longer trip the 500-file limit. GitHub archive requests use codeload directly. Remote snapshot IPC/preload now preserves bounded error codes through Electron serialization, and renderer feedback localizes common proxy/network/package/storage failures. No global Git/proxy settings are changed.

- Added one Git-first/HTTPS-archive fallback materializer shared by remote Skill
  install, fingerprint and snapshot paths. GitHub, GitLab.com and
  Gitea-compatible archive routes remain one deterministic attempt per source.
- Reused the existing bounded remote byte fetcher and safe ZIP extractor; the
  extracted checkout still enters the same selector, package validation,
  safety review, fingerprint, staging, replacement and rollback pipeline.
- Added `git-unavailable` and `git-http-fallback-failed` as additive bounded
  failure reasons under the existing `SOURCE_UNAVAILABLE` lifecycle code.
- Added localized terminal install/update copy and missing-Git guidance for
  custom-store branch discovery while preserving manual branch entry.
- Extended the stable Skill transport contract and added regression row
  `SR-035`.
- Added unit and real-filesystem fixtures for Git absence, clone failure, HTTP
  success, dual failure, credentials, SSH exclusion, GitLab/default refs,
  malformed archive roots, unsafe archives, complete package inventory,
  cleanup, lifecycle propagation and renderer copy.

## Verification

### 2026-10-17 Token and SSH follow-up

- `skill-github-auth-install.test.ts`: 4 functional integration cases passed
  through preload, registered IPC, actual settings persistence, SQLite and files.
  They cover stored-token reuse after reopen, complete binary package import,
  authentication failure without partial installation, corrected-token retry,
  and SSH scan → install → reopen for GitHub and Gitea. HTTP/Git remote boundaries
  use synthetic credentials and fixtures; no private account or live SSH key was
  used. The previous archive installation integration also passed (3 cases).
- Remote HTTP tests verify the Authorization header on the archive API and its
  removal on the signed codeload redirect. Error and catalog tests cover 401,
  403, rate limits, partial-catalog authentication failure, SSH errors and bounded
  diagnostics. A focused Git/source-update selection passed 19 cases, and the
  remote-content/scan selection passed 16 cases.
- Source typechecking and focused ESLint passed. Broader test selection exposed
  14 existing Windows path expectations in unrelated platform helpers and 2
  Cherry Studio fixture failures. These are outside the GitHub/SSH transport
  change and remain unresolved. Initial whole-test typechecking also encountered
  malformed concurrent `prompt-test-history.spec.ts` content. On retry that
  syntax issue was gone, but MCP shared-distribution tests still had 7 type
  errors (`McpTransport` and Testing Library role options); the modified
  GitHub/SSH files reported no type errors. Renderer/main/preload production
  build and diff whitespace checks passed.
- The live public archive probe was repeated after the credential changes:
  `notion-meeting-intelligence` and `algorithmic-art` both downloaded through
  real HTTP, installed into isolated storage, and survived database reopen.
- Logs are in OS temp `prompthub-github-auth-20261017/`. No GUI was controlled;
  real private-repository authentication and interactive SSH remain unverified.

### 2026-10-17 download and error-feedback follow-up (Windows)

- Focused unit regression: 146 tests passed across archive extraction/guards,
  remote package adaptation, real filesystem replacement, snapshot IPC, localized
  error feedback, locale consistency and detail utilities. Existing POSIX-only
  path assertions were made portable; a chmod-based failure fixture was replaced
  with a filesystem-copy failure after a partial write so Windows exercises
  rollback rather than silently succeeding.
- Public preload → registered IPC → real SQLite/filesystem integration: 3 tests
  passed. Both store directory layouts preserve complete packages while ignoring
  600 unrelated repository files; reopening preserves the installed records.
  Proxy/timeout failure returns a bounded code, creates no partial Skill, cleans
  staging and permits retry.
- Live HTTP verification: the real remote downloader fetched the official
  OpenAI `notion-meeting-intelligence` and Anthropic `algorithmic-art` packages
  using codeload after an injected Git failure. Both installed through the public
  package operation API into an isolated profile and remained readable after
  database reopen. The isolated profile was removed. No Skill scripts ran.
- Focused ESLint, source/test TypeScript checking, diff whitespace checks and
  renderer/main/preload production builds passed. Detailed command logs and the live probe are retained
  under the OS temporary directory `prompthub-skill-install-20261017/`.
- Packaged GUI behavior remains unverified; the user chose to inspect the UI.

### Original fallback implementation verification

- Focused Vitest first pass: 193 assertions passed and one new real-filesystem
  fixture failed because jsdom-side dynamic ZIP generation retained only its
  binary entry. The fixture was replaced with a fixed four-file ZIP and only
  that affected test was rerun; it passed.
- Focused coverage pass: 7 files, 194 tests passed. New
  `skill-package-transport-error.ts` and `skill-git-error.ts` reached 100% line,
  branch and function coverage. `skill-installer-remote-package.ts` reached
  100% lines/functions and 97.97% branches; uncovered lines 92 and 373 are
  unchanged legacy fallback branches for default source-key formatting and a
  repository-root snapshot path.
- `pnpm --filter @prompthub/desktop typecheck`: passed.
- Focused ESLint over all changed source/test files: passed with zero warnings.
- Focused Prettier check passed after mechanically formatting only nine
  task-owned files; pre-existing dirty locale edits were not reformatted.
- `pnpm lint:file-size`: passed; new files remain below limits and legacy files
  did not grow beyond the enforced ceiling.
- Desktop i18n regression: 5 files, 42 tests passed.
- `pnpm build`: passed for renderer, main and preload production bundles.
- `git diff --check`: passed.
- `pnpm spec:traceability`: passed for 15 active changes.
- `pnpm spec:index:check`: passed with no change-index drift.
- Live HTTP fallback smoke: with the running Node process `PATH` set to an
  intentionally nonexistent directory, `mattpocock/skills` `ask-matt` installed
  through the real GitHub archive endpoint into an isolated temporary user-data
  root and contained `SKILL.md`. The temporary root was removed afterward.

## Validation Boundary

- A real Windows x64 packaged build was not launched or controlled. The user
  chose to inspect the UI. The original verification ran on macOS; the follow-up
  above exercises Windows service/API behavior but does not prove packaged PATH
  inheritance or toast layout.
- The change therefore remains review-pending rather than archived. Exit
  condition: install one GitHub store Skill on a clean Windows packaged build
  without Git, then force both Git/HTTP failure and confirm the localized
  recovery message and manual-branch hint in the running UI.

## Static Audit Findings

- Git-backed Skill install/update/check share the same remote package adapter
  and are addressed together.
- Branch discovery remains Git-only because archive download cannot enumerate
  refs; missing Git now receives localized recovery guidance while manual branch
  entry remains available.
- Plugin HTTPS Git import has actionable Git copy but no archive fallback; it is
  a separate package-domain follow-up recorded as `ISS-20260902-001`.
- CLI Skill Git install and Git backup/push operations are intentionally not
  changed by this Desktop package-materialization fix; their explicit
  prerequisite/fallback decision is also tracked by `ISS-20260902-001`.
- Remote Git package tests did not cover an absent ambient Git executable plus
  a successful alternative transport.

## Issue State

GitHub issue #211 is closed after the reporter confirmed that installing Git
restores current behavior. This change improves the product so Git absence is
recoverable for eligible HTTPS sources and actionable otherwise. Local issue
snapshot files were already modified before this change and are not overwritten
without a conflict-free convergence step.
