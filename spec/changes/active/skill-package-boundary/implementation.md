# Implementation Notes

## Investigation

Read:

- `spec/knowledge/behavior/skills.md`
- `spec/knowledge/structure/skill-system-design.md`
- `apps/desktop/src/main/services/skill-installer.ts`
- `apps/desktop/src/main/services/skill-installer-repo.ts`
- `apps/desktop/src/renderer/stores/skill.store.ts`
- `apps/desktop/src/renderer/components/skill/store-remote-sync.ts`
- `apps/desktop/src/renderer/services/github-skill-store.ts`

## Findings

- Stable structure docs already describe Skill as a portable package with optional scripts/resources.
- Stable behavior docs only explicitly required full-directory copy for project-local distribution; they did not state it as the global import/install invariant.
- `AGENTS.md` still said “Skills are stored as SKILL.md files,” which is too weak and encourages content-only implementations.
- Main services already have directory-level APIs, but renderer store installation can create a DB row and write only `SKILL.md`.
- Custom Git/Gitea remote scan is clone-backed only during preview; the clone is deleted before install, so install loses access to the full package.

## Implemented

- Added `SkillInstaller.saveRemoteGitSkillToLocalRepoBySkillId()` to clone a Git/Gitea source during install, resolve the target Skill directory, and copy the complete package into the managed repo.
- Added `skill:saveRemoteGitToRepo` IPC plus preload API so the renderer can request package-level remote persistence instead of writing only `SKILL.md`.
- Updated registry install/update orchestration so custom Git/Gitea package sources with directory/canonical/fingerprint metadata use clone-backed package persistence, then `syncFromRepo`.
- Kept content-only `SKILL.md` writes for explicit content flows such as user-authored skills and GitHub raw-content sources that do not advertise package metadata.
- Filtered `.git` and `.prompthub` internal directories when copying package sources into the managed repo.
- Upgraded manual Skill creation: when the user leaves instructions blank, PromptHub now creates a starter `SKILL.md` with frontmatter, workflow, verification guidance, and package notes for `references/`, `scripts/`, and `assets/`.
- Replaced the placeholder built-in `skill-creator` content with package-aware best practices and removed its `content_url` so the built-in guidance is not overwritten by remote placeholder content.
- Added a built-in `prompthub-cli-operator` Skill that teaches agents to inspect and operate PromptHub via CLI commands, including `prompthub skill repo-files` and safety rules for destructive operations.
- Tightened package install atomicity: if a registry entry requires clone-backed package persistence and that persistence fails, PromptHub now rolls back the just-created DB skill and surfaces the install error instead of leaving a half-installed `SKILL.md`-only skill.
- Strengthened `AGENTS.md`, `spec/rules/testing-standards.md`, and `spec/rules/tdd-design-gate.md` so new or changed production code targets 100% line, function, branch, and condition coverage, with critical boundary modules requiring 100% branch and condition coverage for touched behavior.
- Audited and tightened full-package safety scan prompt construction:
  - Ordinary text files such as `docs/*.md` and `references/*.md` are now included in the AI prompt, not just `SKILL.md` and script/config extensions.
  - Repository structure and static content findings from the local package scan are preserved as preflight evidence in the AI prompt instead of being discarded after file counting.
  - Package prompt content is bounded by deterministic per-file and total content budgets, with explicit truncation/omission notices so large packages fail visibly instead of silently narrowing review scope.
  - Safety scan keeps symlink/path escape filtering in the real filesystem reader; the regression test verifies escaped symlink content is not included in the scan prompt.
- Fixed Skill UI consistency regressions:
  - Sidebar and TopBar now treat the unopened official store as an empty catalog instead of exposing built-in registry counts or search results.
  - Skill list rows now render cached platform install status immediately but still refresh the current visible Skill ids, so post-install status cannot stay grey from a stale module cache.
  - Skill file tree directory buttons now expose `aria-expanded` and keep the existing recursive toggle behavior for synthetic folders created from nested package file paths.
- Fixed custom Git/Gitea store refresh for private/self-hosted repositories:
  - Remote HTTP fetches still block private network addresses by default.
  - User-selected Git/Gitea repository scans now pass an explicit `allowPrivateNetwork` option for non-GitHub hosts so a private Gitea domain resolving to RFC1918 addresses can refresh the Skill store.
  - User-selected private Git/Gitea repository scans now preserve and allow `http://192.168.x.x[:port]/owner/repo` style URLs while public HTTP URLs remain blocked.
  - Git clone and remote branch listing share the same private-network HTTP boundary, so refresh, branch selection, and install do not disagree.
  - `localhost` hostnames remain blocked even when private-network access or private HTTP is explicitly requested.
- Fixed installed Skill update/check-update for private/self-hosted sources:
  - `skill:fetchRemoteContent` and byte fetches now consult installed Skill `source_url` / `content_url` records before opting into private network access.
  - Exact installed `content_url` matches and URLs within an installed `source_url` path scope may use private-network fetching, including private HTTP.
  - Arbitrary internal URLs outside installed Skill source scope still use the default SSRF policy and remain blocked.
- Fixed Skill store install pending feedback:
  - Store cards now match pending install state by `source_id`, then `source_url`, then `slug`, so Claude Code / OpenAI Codex entries without a stable source id still show the spinner.
  - Pending install state now takes precedence over the installed check badge, and the installed section also receives the pending key, so cards do not jump straight to a green check while install is still in progress.
  - Store install pending state now tracks a map of source keys instead of a single source id, so concurrent quick installs keep independent spinners until each async install finishes.
  - Store detail reads the same pending state as store cards, so opening a skill while it is installing shows the installing state and blocks duplicate install clicks.
  - Store detail no longer closes from backdrop clicks; users must use the explicit close action, so an expanded detail view does not collapse from accidental outside clicks.
  - Store detail footer actions now use one button system for check update, update, remove, imported status, and install states while preserving semantic colors.

## Verification

- `pnpm --filter @prompthub/desktop test:run tests/unit/components/create-skill-modal.test.tsx`
  - Passed: 1 file, 7 tests.
- `pnpm --filter @prompthub/desktop test:run tests/unit/services/skill-registry-builtins.test.ts tests/unit/components/create-skill-modal.test.tsx tests/unit/main/skill-installer.test.ts tests/unit/stores/skill.store.test.ts`
  - Passed: 4 files, 195 tests.
- `pnpm --filter @prompthub/desktop test:run tests/unit/main/skill-safety-scan.test.ts tests/unit/components/skill-file-editor.test.tsx`
  - Passed: 2 files, 10 tests.
- After formatting: `pnpm --filter @prompthub/desktop test:run tests/unit/services/skill-registry-builtins.test.ts tests/unit/components/create-skill-modal.test.tsx tests/unit/main/skill-installer.test.ts tests/unit/stores/skill.store.test.ts tests/unit/main/skill-safety-scan.test.ts tests/unit/components/skill-file-editor.test.tsx`
  - Passed: 6 files, 205 tests.
- Package and installed-state regression pass after the Claude Code installed-state fix:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/components/skill-store-installed-state.test.tsx tests/unit/stores/skill-registry-selectors.test.ts tests/unit/services/skill-store-update.test.ts tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/main/skill-local-repo-ipc.test.ts tests/unit/stores/skill.store.test.ts`
  - Passed: 6 files, 60 tests.
- Full-package safety scan prompt regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/main/skill-safety-scan.test.ts`
  - Passed: 1 file, 13 tests.
- Installed batch safety scan regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/stores/skill.store.test.ts`
  - Passed: 1 file, 42 tests.
- Full desktop Vitest suite:
  - `pnpm --filter @prompthub/desktop test:run`
  - Failed: 11 files failed, 171 passed; 25 tests failed, 1528 passed.
  - Observed failures are outside the Skill UI consistency change area: integration tests whose `settings.store` mocks are missing `AI_SCENARIO_MODEL_ROUTE` or `SKILL_LIST_PAGE_SIZE_OPTIONS`, `skill-store-custom-sources.test.tsx` expecting the old official-store empty text, `skill-filter*.test.ts` / `skill-stats.test.ts` expecting deployed name matching instead of id matching, `skill-platform-sync.test.ts` expecting `skillName` payloads instead of `skillId`, and `skill-db-versioning.test.ts` hitting a duplicate `source_url` migration column.
- Type and lint:
  - `pnpm --filter @prompthub/desktop typecheck`
  - Passed.
  - `pnpm --filter @prompthub/desktop lint`
  - Passed.
- Skill UI regression suite:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/components/sidebar.test.tsx tests/unit/components/skill-view-tags.test.tsx tests/unit/components/skill-file-editor.test.tsx tests/unit/components/top-bar.test.tsx tests/unit/components/skill-store-installed-state.test.tsx`
  - Passed: 5 files, 44 tests.
  - Note: Vitest still prints a React `act` warning from the Skill list platform-status async effect in one test, but the asserted stale-status transition passes.
- Private Gitea refresh regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/main/skill-installer-remote.test.ts tests/unit/main/skill-installer.test.ts tests/unit/main/skill-installer-utils.test.ts`
  - Passed: 3 files, 240 tests.
- Installed private Gitea update regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/main/skill-installer.test.ts`
  - Passed: 1 file, 165 tests.
- Installed private Gitea update white-box matrix:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/components/skill-code-highlight.test.ts tests/unit/components/skill-file-editor.test.tsx tests/unit/components/skill-file-icons.test.ts tests/unit/main/skill-installer.test.ts`
  - Passed: 4 files, 177 tests.
- Store install pending UI regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx`
  - Passed: 2 files, 42 tests.
- Store install pending concurrency/detail regression:
  - `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx --testNamePattern "quick-install spinner|shared install pending|SkillStoreCard"`
  - Passed: 2 files, 16 tests.
- Type check:
  - `pnpm --filter @prompthub/desktop typecheck`
  - Passed.
- Public store package fidelity regression:
  - `pnpm test:run tests/unit/stores/skill.store.test.ts tests/unit/services/skills-sh-store.test.ts tests/unit/services/clawhub-store.test.ts tests/unit/main/skill-local-repo-ipc.test.ts tests/unit/main/skill-installer-remote-git-package.test.ts` from `apps/desktop`
  - Passed: 5 files, 88 tests.
- Non-standard `skills.sh` repo regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/services/skills-sh-store.test.ts tests/unit/stores/skill.store.test.ts tests/unit/main/skill-installer-remote-git-package.test.ts tests/unit/components/skill-store-remote.test.tsx`
  - Passed: 4 files, 122 tests.
- Source update stale-baseline and detail layout regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/services/skill-store-update.test.ts tests/unit/components/skill-i18n-smoke.test.tsx`
  - Passed: 2 files, 31 tests.
- Store update-check regression:
  - `pnpm --filter @prompthub/desktop test:run tests/unit/stores/skill.store.test.ts`
  - Passed: 1 file, 52 tests.

Regression coverage added:

- Main-process full-package custom Git/Gitea install copies `SKILL.md`, `docs/guide.md`, `scripts/setup.sh`, and `assets/icon.png`.
- Main-process clone-backed install now uses an equivalent local Git fixture, proving the package survives Git checkout before managed-repo copy.
- Package import boundary tests cover `.git`/`.prompthub` filtering, symlink filtering, path traversal rejection, missing `SKILL.md`, ambiguous multi-skill repositories, temp clone cleanup, and a 300-file package stress case.
- IPC tests cover `skill:saveRemoteGitToRepo` validation, missing skill handling, package save delegation, directory fingerprint computation, and DB persistence.
- Renderer store install for custom Git package metadata calls `saveRemoteGitToRepo` and `syncFromRepo`, and does not persist the package by writing only `SKILL.md`.
- Renderer store tests cover directory derivation from `canonical_skill_path`, GitHub raw-content single-file compatibility, and rollback when clone-backed package persistence fails.
- Built-in registry test ensures `skill-creator` contains package guidance and `prompthub-cli-operator` contains key CLI operations and safety rules.
- Create modal test ensures blank manual instructions generate a package-aware starter `SKILL.md`.
- Safety scan now distinguishes remote/pre-install scans from installed package scans:
  - Remote entries with internal or blocked source URLs still fail before AI when no managed local repo exists.
  - Installed Skills with `local_repo_path` are scanned from the managed package directory even when their custom Gitea source URL is internal; the source issue is passed to AI as provenance context.
  - Store detail safety scan now uses the installed Skill content and `local_repo_path` when the store entry is already imported, so nested package files participate in the AI scan.
- Added safety scan regressions for installed internal-Gitea packages and for store detail passing the managed package path.
- Added private Gitea refresh regressions proving default remote fetches still block private network addresses while non-GitHub repository scans explicitly allow them, including direct `http://192.168.x.x:port/...` repositories.
- Added installed private Gitea update regressions proving installed `content_url` fetches opt into private network access while same-network unrelated URLs do not.
- Expanded installed private Gitea update white-box coverage for exact `content_url`, `source_url` path-scope matching with trailing slashes, byte fetches, same-origin sibling path rejection, different-origin/port rejection, and DB lookup failure fallback to default SSRF policy.
- Added Skill store card regressions proving quick-install pending state shows a spinner for source-id and source-url identities and remains visible even if the card is already classified as installed.
- Added prompt-sensitive safety scan coverage for ordinary package docs/reference files, repository preflight evidence, prompt budget/truncation behavior, and real filesystem symlink escape filtering.
- Added store batch scan coverage for preserving `local_repo_path` when scanning installed managed packages.
- Added Sidebar regression coverage that the unopened official store shows a zero-count source.
- Added TopBar regression coverage that remote store catalog search still works while official unopened registry skills are not searchable.
- Added Skill list regression coverage that an already-rendered row refreshes stale platform install state after a later status read.
- Added Skill file browser regression coverage that nested synthetic folders from package paths can be expanded to reveal files.
- Added `skills.sh` package metadata so parsed entries install from the upstream GitHub `skills/<skill-name>` directory instead of only writing the parsed `SKILL.md`.
- Corrected `skills.sh` package metadata for non-standard repositories:
  - Repositories literally named `skills` still pass `skills/<skill-name>` as the package directory.
  - Other repositories such as `vercel-labs/agent-skills` no longer guess `skills/<skill-name>` because the public skill name can differ from the folder name.
  - Main-process remote Git install now resolves omitted package directories by scanning cloned `SKILL.md` files and matching target skill name / logical name / variant key against frontmatter name and directory names.
  - Ambiguous or unmatched multi-skill repositories still fail and roll back rather than falling back to a single cached `SKILL.md`.
- Fixed store quick-install error copy so package persistence failures are shown as install failures, not safety scan failures.
- Fixed source update checks for package-installed Skills where the stored install baseline hash can be stale after zip/Git package sync: when local `SKILL.md` content already matches current remote content, update status is now `up-to-date` rather than `local-modified`.
- Adjusted Skill detail right-column layout so the personal notes title is outside the notes card, matching the surrounding section title hierarchy.
- Added ClawHub package metadata so parsed entries install from the official zip download URL.
- Added `skill:saveRemoteZipToRepo` IPC/preload/main-service support, including zip extraction, path traversal rejection, ignored-file filtering, managed repo persistence, fingerprint update, and temp directory cleanup.
- Added marketplace-json `package_url` / `zip_url` / `download_url` support for third-party registries that expose a full package archive.
- Fixed GitHub install cleanup after managed repo migration:
  - Successful `installFromGithub()` now removes the temporary clone directory after the full package has been copied into the managed repo.
  - Post-create failures now clean the managed container, remove the temporary clone, and roll back the just-created DB row.
  - Added regressions for clone cleanup and DB rollback after post-create persistence failure.
- Fixed remote store inflight query races:
  - Inflight load keys now include the active skills.sh filter / search query or ClawHub search query.
  - Completed skills.sh / ClawHub loads compare their result query with the latest selected query before writing store state, so slower old requests cannot overwrite the active filter.
  - Added a race test where the `All` skills.sh request remains pending while `Next.js` loads and the old request resolves last.

Additional verification:

- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts --testNamePattern "temporary clone|post-create persistence fails"`
  - Passed: 1 file, 2 tests.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx --testNamePattern "does not merge inflight skills.sh loads"`
  - Passed: 1 file, 1 test.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/main/skill-installer.test.ts`
  - Passed: 1 file, 174 tests.
- `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/skill-store-remote.test.tsx`
  - Passed: 1 file, 51 tests.
- `pnpm --filter @prompthub/desktop exec tsc --noEmit --pretty false`
  - Passed.
- `git diff --check`
  - Passed.

## Docs Synced

- `AGENTS.md`
- `spec/knowledge/behavior/skills.md`
- `spec/knowledge/structure/skill-system-design.md`
- `spec/knowledge/structure/skill-system-design-zh.md`
- `spec/knowledge/reference/skill-regression-test-matrix.md`
- `spec/changes/active/skill-package-boundary/proposal.md`
- `spec/changes/active/skill-package-boundary/specs/skills/spec.md`
- `spec/changes/active/skill-package-boundary/tasks.md`

## Follow-Up

- Run the full desktop unit suite before release packaging.
- Add an E2E install-from-custom-Gitea fixture if CI can provide a local Git server or deterministic bare repo fixture.
