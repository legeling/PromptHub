# PromptHub — Project Context & Development Rules

## 0. Agent Operating Contract

These rules exist because agents do not retain memory across sessions. Do not rely on prior chat context when the repository already contains a boundary record.

### 0.1 Source-of-Truth Lookup Order

Before non-trivial code changes, read in this order:

1. `AGENTS.md` for global project rules.
2. The relevant stable docs under `spec/knowledge/*` and `spec/rules/*`.
3. Any active change under `spec/changes/active/<change-key>/` that matches the same user problem.
4. The current implementation and tests for the touched module.

If an existing boundary exists, update it. Do not create a competing rule, schema, storage layout, or workflow because it is easier than finding the current one.

### 0.2 Mandatory Change Gate

Create or update an active change folder before implementation when the work touches any of these:

- database schema, migrations, adapters, indexes, or persistence semantics
- filesystem data layout, backup/restore, sync, or recovery
- IPC/API contracts, preload exposure, route contracts, or shared types
- cross-package behavior in `packages/*`
- multi-file feature work, refactors, or user-visible workflow changes

Small local fixes can skip a new change folder only when they do not alter behavior boundaries, storage, public contracts, or user workflows.

### 0.3 Existing-Feature Modification Rule

When modifying existing behavior, first identify:

- the owning app/package (`apps/desktop`, `apps/web`, `apps/cli`, `apps/web-cloudflare`, `packages/core`, `packages/db`, or `packages/shared`)
- the current source of truth for data (SQLite, filesystem workspace, SKILL.md, settings, remote sync, or UI state)
- the existing tests or missing regression gap
- the stable doc or active change that defines the boundary

If the implementation and docs disagree, do not silently pick one. Record the discrepancy in the active change and make the intended source of truth explicit.

### 0.4 New-Feature Addition Rule

For new features, define the boundary before writing code:

- Data: new table/column/index, JSON field, file, directory, or remote payload?
- Contract: new shared type, IPC channel, route, CLI command, or preload method?
- Ownership: should logic live in `packages/core`, `packages/db`, app-specific services, or renderer UI?
- Compatibility: migration path for existing users and rollback behavior.
- Verification: lowest effective test layer plus release harness impact.

Do not put durable business rules only in React components or one-off IPC handlers. Shared behavior belongs in `packages/core`; storage primitives belong in `packages/db`; shared contracts belong in `packages/shared`.

### 0.5 Test-First Rule

For bug fixes and non-trivial features, write or update the failing test before implementation unless the change is documentation-only or pure mechanical cleanup.

The test must prove the real risk:

- For a bug, reproduce the user-visible failure or the broken invariant first.
- For a feature, encode acceptance behavior and at least one relevant failure or boundary path.
- For persistence, assert stored data, migration behavior, and reload/rescan behavior where relevant.
- For UI state, assert the visible state users depend on, not only internal callbacks.
- For filesystem/sync/platform behavior, assert durable side effects, not only function calls.

Coverage is a gate, not decoration:

- New or changed production code must target 100% line, function, branch, and condition coverage in its touched module.
- Critical boundary modules, including database, filesystem persistence, sync, IPC/preload contracts, installer/import/export logic, security, and release harness code, require 100% branch and condition coverage for the changed behavior before merging.
- If the whole legacy file cannot reach 100% immediately, the active change must record the uncovered legacy branches and the PR must still provide 100% coverage for every new branch and changed condition.
- Coverage numbers do not replace adversarial tests. A change can have 100% coverage and still be rejected if it lacks boundary, error, rollback, fuzz, or performance tests for the risk it introduces.

Coverage is not the test plan. For each non-trivial change, choose and record the required test methods:

- Black-box behavior: assert user-visible behavior and durable outputs without relying on implementation details.
- White-box branch/condition: exercise each changed decision branch, guard, fallback, and error path.
- Boundary and fuzz: test malformed inputs, empty values, path traversal, Unicode/special characters, oversized payloads, duplicate identities, and adversarial fixtures relevant to the module.
- Security: test permission boundaries, injection/traversal/SSRF-like inputs, unsafe source handling, symlink behavior, secret handling, and tamper detection where relevant.
- Performance/stress: test large inventories, bulk operations, repeated mutations, concurrency-like calls, and acceptable time/memory bounds for changed critical paths.
- Integration/contract: test DB, filesystem, IPC/preload, CLI/API, sync, and platform boundaries with real adapters or faithful fixtures when mocks would hide the bug.
- Failure/rollback: test partial failure at each external boundary and assert no half-written DB rows, repos, files, status, or UI state remain.

If a test cannot be written before the fix, record why in the active change and identify the verification substitute. "Too hard" is not a sufficient reason.

### 0.6 Design Conflict Stop Rule

Before changing design, compare the proposed approach with existing docs and implementation. Stop and ask the user for confirmation when any of these are true:

- current code and stable docs disagree about the intended behavior
- the requested change conflicts with an existing active change or accepted design boundary
- the fix requires changing the source of truth for data or state
- the feature can be implemented in two materially different ways with different user/data consequences
- preserving backward compatibility would require a migration, fallback, or breaking behavior change

Do not resolve these conflicts by silently choosing the smallest code change. Record the conflict, present the options, and wait for direction.

### 0.7 Code Quality and Architecture Rule

Code quality is part of the product contract. A change is not done merely because it works locally.

Core engineering principles:

- High cohesion: a module should own one clear responsibility and keep related behavior together.
- Low coupling: modules should depend on stable contracts, not each other's internal state, private helpers, or UI details.
- Single source of truth: data ownership must be explicit; do not duplicate durable state across DB, filesystem, settings, and UI state without a sync contract.
- Clear dependency direction: shared packages must not import app-specific code; main/preload/renderer boundaries must remain explicit; UI must not own durable business rules.
- Small surface area: expose the minimum API needed, with typed inputs/outputs and validation at process, filesystem, network, and persistence boundaries.
- Change locality: adding a feature should mostly touch its owning module plus contract/test/docs. If it requires scattered edits, first check whether the design boundary is wrong.
- Refactor before pile-on: if the correct change would make an oversized or mixed-responsibility file worse, split the module or create an active refactor task before adding more behavior.

Size and complexity limits:

- A single source or test file must not exceed 2,000 lines. Existing files above this limit are legacy debt: do not expand them except to extract code or tests into smaller files.
- New files should stay below 1,000 lines by default. Crossing 1,000 lines requires a clear reason in the active change.
- Functions should stay under 50 lines unless the active change records why a longer function is clearer and what tests cover it.
- Avoid "god" services, stores, components, and test files. Split by domain responsibility, not by arbitrary helper buckets.
- Prefer small pure helpers for parsing, normalization, identity, and policy decisions; keep side effects in orchestration functions.

Design quality gates:

- Before adding a new abstraction, identify the repeated complexity it removes. Do not add abstractions for a single call site unless it defines a real boundary.
- Before adding a dependency between modules, verify the dependency direction matches the architecture section in this file.
- Before adding state, define who owns it, how it is derived, how it is invalidated, and how reload/rescan/reopen behaves.
- Before adding filesystem or DB behavior, define atomicity, rollback, migration, and recovery behavior.
- Before adding UI behavior, define the source selector/state that list, detail, badge, count, and action surfaces must share.
- If a change violates these rules, stop and either refactor first or record a design conflict for user confirmation.

## 1. Project Overview

**PromptHub** is a local-first prompt and AI-skill management monorepo. It includes a cross-platform Electron desktop app, a standalone CLI, a self-hosted web app, and a Cloudflare Worker backend. It allows users to organize, version-control, sync, recover, and test prompts and reusable AI skill definitions.

- **Type:** Local-first monorepo with desktop, CLI, web, and worker distributions
- **License:** AGPL-3.0
- **Version:** 0.5.9-beta.1

### Tech Stack

| Category            | Technology                                                         |
| :------------------ | :----------------------------------------------------------------- |
| **Runtime**         | Electron 33                                                        |
| **Frontend**        | React 18, TypeScript 5, Vite 6                                     |
| **Styling**         | Tailwind CSS 3 (design tokens: `bg-card`, `text-muted-foreground`) |
| **Icons**           | Lucide React                                                       |
| **State**           | Zustand 5                                                          |
| **Database**        | SQLite via `node-sqlite3-wasm` adapter in `packages/db`            |
| **Testing**         | Vitest 2 (unit), Playwright 1.57+ (E2E)                            |
| **I18n**            | i18next 24 / react-i18next 15 (7 locales)                          |
| **Package Manager** | pnpm                                                               |

## 2. Architecture

The application follows the standard Electron process model:

### Desktop App (`apps/desktop`)

- Electron main process: `apps/desktop/src/main`
- Renderer React app: `apps/desktop/src/renderer`
- Preload bridge: `apps/desktop/src/preload`
- Desktop-only IPC, native dialogs, updater, local media handling, and Electron shell integration live here.

### Shared Packages (`packages/*`)

- `packages/db`: SQLite schema, adapter, migrations, and DB classes. This is the storage primitive layer.
- `packages/core`: shared business workflows, runtime paths, CLI orchestration, rules workspace, and reusable feature logic.
- `packages/shared`: shared types, constants, platform matrices, IPC channel names, and pure utilities.

Shared logic must not import Electron renderer/main modules. App-specific UI and platform glue can import shared packages, not the reverse.

### Web and CLI Apps

- `apps/cli`: standalone command-line product backed by `packages/core`, `packages/db`, and `packages/shared`.
- `apps/web`: self-hosted Hono/React web app with server routes under `apps/web/src/routes` and client UI under `apps/web/src/client`.
- `apps/web-cloudflare`: Cloudflare Worker sync/backend implementation.

### Data Layer

- **SQLite:** `packages/db/src/schema.ts`, `packages/db/src/init.ts`, and DB classes in `packages/db/src/*.ts`.
- **Runtime paths:** `packages/core/src/runtime-paths.ts` defines the user data layout.
- **Desktop DB entry:** `packages/core/src/database.ts` resolves `prompthub.db` under `getUserDataPath()`.
- **Local Storage:** SQLite stores prompts, versions, folders, skills, skill versions, rules, users, settings, and sync/auth data.
- **Search:** Uses SQLite FTS5 for full-text search (`prompts_fts` virtual table).
- **Sync:** WebDAV support for backup and sync.
- **Skill Files:** Skills stored as SKILL.md files with YAML frontmatter metadata. DB metadata and local repo content must stay synchronized through the relevant sync services.
- **Filesystem Layout:** durable user data lives under `data/`, `config/`, and `logs/` beneath the resolved user data path; legacy paths are resolved only through runtime-path helpers.

## 3. Key Commands

| Command                     | Description                            |
| :-------------------------- | :------------------------------------- |
| `pnpm install`              | Install dependencies                   |
| `pnpm electron:dev`         | Start dev server (Vite + Electron)     |
| `pnpm build`                | Build for production (Main + Renderer) |
| `pnpm electron:build`       | Build and package the application      |
| `pnpm verify:release`       | Run root release harness               |
| `pnpm verify:release:quick` | Run faster root harness profile        |
| `pnpm test:run`             | Run desktop Vitest suite               |
| `pnpm test -- <path> --run` | Run single desktop test file           |
| `pnpm test:e2e`             | Run end-to-end tests (Playwright)      |
| `pnpm lint`                 | Run ESLint                             |
| `pnpm format`               | Format code with Prettier              |

## 4. Directory Structure

```text
PromptHub/
├── apps/
│   ├── desktop/                    # Electron desktop application
│   │   ├── src/main/               # Electron main process, IPC, updater, native services
│   │   ├── src/preload/            # contextBridge API exposed to renderer
│   │   ├── src/renderer/           # React desktop renderer
│   │   ├── tests/unit/             # Desktop unit/component/service tests
│   │   ├── tests/integration/      # Desktop integration tests
│   │   ├── tests/e2e/              # Playwright desktop E2E tests
│   │   └── scripts/                # Desktop packaging, screenshot, budget scripts
│   ├── cli/                        # Standalone `prompthub` CLI
│   │   ├── src/
│   │   ├── tests/
│   │   └── bin/
│   ├── web/                        # Self-hosted Hono + React web app
│   │   ├── src/client/             # Web client UI
│   │   ├── src/routes/             # Server routes
│   │   ├── src/services/           # Web server/client services
│   │   └── tests/
│   └── web-cloudflare/             # Cloudflare Worker backend
│       ├── src/
│       ├── migrations/
│       └── tests/
├── packages/
│   ├── core/                       # Shared workflows, runtime paths, CLI orchestration
│   ├── db/                         # SQLite schema, adapter, migrations, DB classes
│   └── shared/                     # Shared types, constants, pure utilities
├── spec/                           # Internal SSD docs, stable knowledge, active changes
│   ├── changes/active/
│   ├── knowledge/
│   ├── rules/
│   └── workflow/
├── docs/                           # Repository-facing docs
├── scripts/                        # Root project automation
├── .github/                        # CI/release workflows
├── pnpm-workspace.yaml             # Workspace package layout
└── package.json                    # Root scripts and harness entry points
```

Historical single-app paths such as `src/main`, `src/renderer`, and `src/shared` must not be used for new work unless a file actually exists there. Use the monorepo paths above.

## 5. Key Conventions

### IPC Communication

- **Channel Definitions:** Desktop IPC channel strings are defined in `packages/shared/constants/ipc-channels.ts`.
- **Pattern:** Renderer invokes `window.api.method()` → `ipcRenderer.invoke(channel, ...args)` → Main process handles with `ipcMain.handle(channel, handler)`.
- **Naming:** Channels follow `domain:action` format (e.g., `prompt:create`, `skill:update`, `folder:delete`).

### Database Schema

- **Owner:** `packages/db` owns schema, migrations, adapter, and DB classes.
- **Prompts:** Stores title, content, variables (JSON), tags (JSON), and folder association. Supports versioning via `prompt_versions` table.
- **Folders:** Hierarchical structure with `parent_id` and `sort_order` for ordering. Supports CASCADE delete.
- **Skills:** Stores skill metadata, instructions, versioning. Syncs with local SKILL.md files.
- **FTS:** `prompts_fts` virtual table (FTS5) for full-text search on title + content + tags.
- **Migrations:** Existing-user schema changes are handled in `packages/db/src/init.ts`; fresh-install schema is in `packages/db/src/schema.ts`.

### Component Styling

- **Tailwind CSS:** Used exclusively for styling. Design tokens include `bg-card`, `text-muted-foreground`, `border-border`, etc.
- **Theme:** Supports Dark/Light modes via CSS variables and Tailwind's `dark:` prefix.
- **Icons:** `lucide-react` is the standard icon set. No other icon libraries.

### Internationalization

- **Library:** `react-i18next` with `i18next` backend.
- **Usage:** `const { t } = useTranslation();`
- **Keys:** Structured keys with dot notation (e.g., `folder.create`, `common.cancel`, `settings.addNModels`).
- **Locales:** 7 supported: `en`, `zh`, `zh-TW`, `ja`, `fr`, `de`, `es`.
- **All user-facing strings must use i18n.** See Section 8.3.

## 6. Development Workflow

### 6.1 Documentation Operating System (DOS)

PromptHub uses a project-native Documentation Operating System (DOS). Internal SSD assets live under `spec/`, while repository-facing docs stay under `docs/`.

PromptHub now uses `spec-init` directories for stable project docs and an OpenSpec-style change workflow for deltas:

- `spec-init` provides the project-level document boundaries for workflow / knowledge / changes / records
- PromptHub's change-management backbone remains `spec/changes/active/<change-key>/specs/<domain>/spec.md` plus `spec/changes/archive/`; stable truth now lives in `spec/workflow/*`, `spec/knowledge/*`, `spec/rules/`, `spec/releases/`, and related record folders

The expected SSD loop is:

`requirements -> spec -> design -> tasks -> implementation -> sync -> archive`

#### Document Roles

- `spec/workflow/00-intake/`: project-level intake entry for why the work matters, target users, constraints, and non-goals.
- `spec/workflow/01-requirements/`: project-level requirements entry for FR / NFR / AC style requirements.
- `spec/workflow/02-design/`: project-level design entry for architecture, module boundaries, data, interfaces, and tradeoffs.
- `spec/workflow/03-implementation/`: project-level implementation-planning entry for sequencing and milestones.
- `spec/workflow/04-verification/`: project-level verification-planning entry.
- `spec/workflow/05-tasks/`: project-level executable task entry.
- `spec/knowledge/context/`: long-lived context docs for stable terminology, actors, entities, and business boundaries.
- `spec/knowledge/structure/`: long-lived docs for stable system structure and module boundaries.
- `spec/knowledge/behavior/`: long-lived docs for stable workflows, state transitions, and business rules.
- `spec/knowledge/reference/`: long-lived reference docs for schemas, samples, fixtures, and protocols.
- `spec/rules/`: project-level default engineering rules entry.
- `spec/releases/`: project-level release-summary entry.
- `spec/archive/`: project-level archive entry.
- `spec/adr/`: project-level ADR entry.
- `spec/knowledge/context/`: long-lived source-of-truth docs for stable terminology, actors, entities, and product boundaries.
- `spec/knowledge/structure/`: long-lived source-of-truth docs for stable internal architecture and accepted engineering constraints.
- `spec/knowledge/behavior/`: long-lived docs for stable workflows, semantic rules, and derivation boundaries.
- `spec/knowledge/reference/`: long-lived docs for fixed assets such as platform matrices, canonical file mappings, schemas, and durable reference inventories.
- `spec/README.md`: the internal SSD entry point.
- `spec/changes/active/<change-key>/`: active change folders for feature work, larger bug fixes, refactors, and migrations.
- `spec/changes/archive/<date>-<change-key>/`: completed or superseded changes kept for history.
- `spec/changes/legacy/`: recovered historical internal docs that are still useful but are not the current source of truth.
- `spec/issues/active/`: ongoing defects, quality risks, and follow-up issues that are not yet a scoped implementation change.
- `spec/changes/_templates/`: reusable templates for proposal, delta specs, design, tasks, and implementation artifacts.
- `docs/README.md`: the repository-facing docs index for users and contributors.

#### GitHub Issue State Rule

GitHub issue state and local delivery state are separate records.

- `spec/issues/active/github-open.md` and `spec/issues/archive/github-closed.md` are remote-state snapshots only.
- `spec/issues/active/local-github-status.md` is the local triage and delivery overlay.
- Do not close a GitHub issue merely because code, tests, or docs are done locally.
- When an issue is implemented before release, mark it locally as `local_done` or `release_pending` and leave the GitHub issue open.
- Close the GitHub issue only after the target version containing the fix or feature has been published, then refresh the open/closed snapshots.
- If rejecting or merging an issue into another one, record `wontfix` or `duplicate` locally first and close GitHub only after the public explanation is posted.

#### Required Artifacts For Non-Trivial Work

For any non-trivial feature, refactor, migration, cross-process change, or multi-file bug fix, create or update one active change folder under `spec/changes/active/<change-key>/`.

Each active change should contain:

1. `proposal.md` — why the change exists, scope, risks, rollback thinking, and impacted user flows.
2. `specs/<domain>/spec.md` — the intended behavior delta, including added, modified, and removed requirements or scenarios.
3. `design.md` — technical approach, affected modules, data model / IPC / sync / migration impact, and tradeoffs.
4. `tasks.md` — a concrete implementation checklist with verification items.
5. `implementation.md` — what actually shipped, what changed during execution, what was verified, and which stable docs were synced.

Use one or more domain spec files under `specs/` when the change spans multiple stable domains. Do not create a flat top-level `spec.md` file inside the change folder for new work.

#### Workflow Expectations

1. Start with the change folder before writing significant code.
2. Use the `spec-init` document boundaries to decide what kind of document a piece of content belongs in, but keep non-trivial implementation work inside `spec/changes/active/<change-key>/`.
3. Refine `proposal.md`, `specs/<domain>/spec.md`, and `design.md` as understanding improves; the workflow is iterative, not phase-locked.
4. Use `tasks.md` as the implementation checklist and mark items complete as work lands.
5. Update `implementation.md` during or immediately after implementation so the executed work does not live only in git diff or chat history.
6. When the change ships, sync current behavior back into `spec/workflow/*` and `spec/knowledge/*`, and sync stable rules, release summaries, or decisions into `spec/rules/`, `spec/releases/`, or `spec/adr/` where appropriate.
7. After shipping or abandoning the work, move the change folder to `spec/changes/archive/` rather than deleting it.

#### When To Update Existing Change vs Start New One

- Update the existing change when the user problem and intended outcome stay the same, but execution details or scope boundaries evolve.
- Start a new change when the objective materially changes, the original work can stand on its own, or the history would become confusing if kept in one folder.

#### Implementation Discipline

- Do not let requirements live only in chat history when the work is significant.
- Do not confuse the new `spec/workflow/*` and `spec/knowledge/*` project-level entry points with replacements for active change records; they classify document intent, while `spec/changes/active/` remains the execution record for non-trivial work.
- Do not edit `spec/workflow/*`, `spec/knowledge/*`, `spec/rules/`, `spec/releases/`, or `spec/adr/` as if they were scratchpads for active work; active deltas belong in `spec/changes/active/` first.
- Do not treat `tasks.md` as optional for substantial changes; it is the execution contract.
- Do not treat `implementation.md` as optional for substantial changes; it is the executed record of what really landed.
- Do not close a change folder without updating its verification status and follow-up notes.
- Repository-facing documentation should live under `docs/` unless it must remain at the repository root for tooling or platform conventions, such as `README.md`, `CHANGELOG.md`, or `AGENTS.md`. Internal SSD, specs, and architecture records belong in `spec/`.

### 6.2 Engineering Flow

1. **Locate boundary:** Identify the owning app/package, source-of-truth docs, existing tests, and active change record.
2. **Plan:** For non-trivial work, create or update a change folder in `spec/changes/active/` using the templates.
3. **Design data/contract impact:** Before code, write whether the change touches SQLite, filesystem layout, sync payloads, IPC/API, CLI commands, routes, shared types, or i18n.
4. **Modify:** Put shared business logic in `packages/core`, storage primitives in `packages/db`, shared contracts in `packages/shared`, and app-specific UI/platform glue in the relevant `apps/*` package.
5. **IPC/API:** If adding backend access, update shared constants/types, implement the handler/route, expose the bridge/client, and add validation tests.
6. **Test:** Run the lowest effective test layer first, then the relevant harness (`pnpm verify:release:quick` or `pnpm verify:release`) when release risk exists.
7. **Record:** Update `implementation.md` with actual execution, verification, skipped checks, and follow-up notes.
8. **Sync Docs:** Update `spec/workflow/*` when project-level goals or requirements changed, `spec/knowledge/behavior/` or `spec/knowledge/reference/` when stable behavior/assets changed, `spec/knowledge/structure/` when architecture contracts changed, and `docs/` / `README.md` when contributor/user contracts changed.
9. **Commit:** Use Conventional Commits (e.g., `feat: ...`, `fix: ...`, `refactor: ...`, `test: ...`).

### 6.3 Data and Storage Change Gate

Before changing persistence or storage, document the following in the active change:

- current source of truth: SQLite table, filesystem directory, SKILL.md frontmatter, settings key, remote payload, or derived UI state
- schema/layout delta: table/column/index/trigger, JSON shape, directory/file path, or sync contract
- migration and compatibility: how existing users are upgraded, how old data is read, and what happens on partial failure
- rollback/recovery: whether backups, recovery candidates, or data layout migration need updates
- verification: real SQLite tests, path traversal/null-byte tests, backup/restore tests, sync tests, and any release harness impact

Rules for storage ownership:

- SQLite schema, indexes, migrations, and DB classes live in `packages/db`.
- Runtime path decisions live in `packages/core/src/runtime-paths.ts`.
- Shared data contracts live in `packages/shared/types` or `packages/shared/constants`.
- Desktop-only native storage glue lives in `apps/desktop/src/main`.
- Web-specific route/service storage glue lives in `apps/web/src`.
- Never bypass runtime path helpers by hardcoding user data, legacy, or platform paths.

## 7. Testing Standards

### 7.1 Core Principles

> Tests exist to **find bugs**, not to inflate coverage numbers. Every test must have a clear reason to exist — if a test can never fail, it is worthless. If a test only verifies the happy path with obvious inputs, it is insufficient.

| Principle                             | Description                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Real bugs, not rubber stamps**      | Every test must target a scenario that could realistically fail in production. Avoid trivially-passing tests that merely confirm a function returns the same hardcoded value it was given. |
| **Test behavior, not implementation** | Assert on observable outcomes (return values, DB state, side effects), not internal private methods or call counts. Tests that break on harmless refactors are fragile.                    |
| **Root cause verification**           | After fixing a bug, the regression test must reproduce the original failure condition — not merely call the fixed code path.                                                               |
| **No fake implementations**           | Prohibited: `setTimeout` to simulate async, hardcoded mock return values that bypass real logic, `jest.fn().mockReturnValue(expectedResult)` that makes the test a tautology.              |
| **No lazy assertions**                | Prohibited: `expect(result).toBeDefined()` when the actual value matters; `expect(fn).not.toThrow()` without checking the return value; `.toMatchSnapshot()` for dynamic data.             |

### 7.2 Test Categories (All Required for New Modules)

#### 7.2.1 Functional Tests

| Aspect                  | Requirements                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Happy path**          | Cover the primary use case with realistic inputs.                                                                                  |
| **Boundary conditions** | Empty string, null, undefined, zero, negative numbers, MAX_SAFE_INTEGER, empty arrays, single-element arrays.                      |
| **Error paths**         | Invalid inputs must produce correct errors, not silent failures. Verify error messages/types, not just that an error was thrown.   |
| **State transitions**   | For stateful modules (stores, DB, auth): test the full lifecycle (create → read → update → delete) and verify intermediate states. |

#### 7.2.2 Adversarial / Fuzz Tests

| Aspect                    | Requirements                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL injection**         | All user-facing string inputs (title, description, tags, search keywords) must be tested with SQL injection payloads: `'; DROP TABLE x; --`, `" OR 1=1 --`, `UNION SELECT`. Verify the table is intact after each attempt. |
| **XSS-like content**      | Store and retrieve `<script>alert(1)</script>`, HTML entities, and JS event handlers in all text fields.                                                                                                                   |
| **Unicode / CJK / Emoji** | Full round-trip (write → read) with CJK characters, emoji (including multi-codepoint like 🏳️‍🌈), RTL text (Arabic/Hebrew), zero-width characters.                                                                            |
| **Null bytes**            | Test `\x00` in string fields because SQLite adapter behavior can cause silent data loss. Document the observed behavior in tests.                                                                                          |
| **Extreme sizes**         | 10KB+ strings, 100+ element arrays, 1MB payloads for encryption. Verify no crashes and data integrity.                                                                                                                     |
| **Special characters**    | Backslashes, quotes (single/double), newlines, tabs, CRLF, Unicode BOM, control characters (0x01–0x1F).                                                                                                                    |

#### 7.2.3 Security Tests

| Aspect                             | Requirements                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cryptographic tamper detection** | For encrypted data: test bit-flips in IV, auth tag, and ciphertext independently. Verify all produce rejection (null/error), not silent decryption to garbage. |
| **Key/password boundaries**        | Empty password, 10KB password, unicode password, password with null bytes. Verify old password fails after reset.                                              |
| **Timing safety**                  | Where `timingSafeEqual` is used, verify that wrong-length inputs don't crash (Node.js throws if buffers differ in length).                                     |
| **Input validation**               | All IPC handlers must reject malformed inputs. Test with wrong types, missing required fields, extra unknown fields.                                           |
| **Path traversal**                 | File path inputs must be tested with `../`, absolute paths, symlinks, and null bytes.                                                                          |

#### 7.2.4 Performance / Stress Tests

| Aspect                         | Requirements                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Batch operations**           | 100+ creates followed by bulk delete. Verify count accuracy and no orphaned records.                                |
| **Rapid sequential mutations** | 50+ updates to same record in tight loop. Verify final state is deterministic and no version/counter drift.         |
| **Concurrent-like access**     | Multiple operations in same transaction/tick. Verify data consistency (especially for version numbers, sort_order). |
| **State cycling**              | 10+ cycles of set→lock→unlock, create→delete, enable→disable. Verify no state leaks across cycles.                  |

#### 7.2.5 Integration Tests (Database)

| Aspect                    | Requirements                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use real SQLite**       | Database tests MUST use `new DatabaseAdapter(":memory:")` with the real schema (`SCHEMA_TABLES` + `SCHEMA_INDEXES`), NOT mocks. Mocked databases cannot catch SQL syntax errors, constraint violations, or trigger behavior. |
| **Foreign key behavior**  | Test CASCADE deletes, SET NULL behavior, and constraint violations explicitly.                                                                                                                                               |
| **Transaction atomicity** | For operations wrapped in `db.transaction()`: verify that partial failures roll back completely.                                                                                                                             |
| **FTS correctness**       | Full-text search tests must include special FTS5 operators (`AND`, `OR`, `NOT`, `NEAR`, `*`, `^`, `"phrase"`, `column:`) and verify they don't cause SQL errors.                                                             |

### 7.3 Prohibited Anti-Patterns

| Anti-Pattern                                      | Why It's Harmful                           | Correct Approach                                                       |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `expect(result).toBeDefined()` alone              | Passes for any value including wrong ones  | Assert the specific expected value                                     |
| `expect(fn).not.toThrow()` without value check    | Confirms no crash but not correctness      | Assert both no-throw AND correct return value                          |
| Mock that returns the expected value              | Test becomes a tautology (always passes)   | Mock dependencies, assert on SUT behavior                              |
| `as any` / `@ts-ignore` in test code              | Hides type errors that are real bugs       | Fix the types; if testing JS interop, use explicit casts with comments |
| Testing private methods directly                  | Couples test to implementation             | Test through public API                                                |
| `toMatchSnapshot()` for dynamic data              | Snapshot bloat, meaningless diffs          | Use specific assertions                                                |
| Copy-paste test blocks with minor variations      | Hard to maintain, masks missing edge cases | Use `it.each()` or parameterized tests                                 |
| `beforeEach` that creates unnecessary fixtures    | Slow tests, hidden dependencies            | Create fixtures in the specific test that needs them                   |
| Catching errors just to assert `instanceof Error` | Doesn't verify the error message or cause  | Assert `error.message` contains specific text                          |

### 7.4 Test File Organization

```
tests/
├── unit/
│   ├── main/               # Main process tests (DB, services, security)
│   ├── components/          # React component tests (render, interaction)
│   ├── services/            # Frontend service tests (AI clients, etc.)
│   ├── stores/              # Zustand store tests
│   ├── hooks/               # Hook tests
│   └── cli/                 # CLI tests
├── integration/             # Integration tests
├── e2e/                     # Playwright end-to-end tests
├── fixtures/                # Shared test fixtures
├── helpers/                 # Shared test helpers
└── setup.ts                 # Global test setup
```

**Naming convention:** `<module-name>.test.ts` — matches the source file it tests.

**Structure within test files:**

```typescript
describe("ModuleName", () => {
  describe("methodName", () => {
    it("does X when given Y", () => { ... });         // Happy path
    it("returns null for non-existent id", () => { ... }); // Error path
  });
  describe("adversarial inputs", () => {
    // Fuzz / boundary / injection tests grouped together
  });
});
```

### 7.5 Running Tests

| Command                                 | Purpose                        |
| --------------------------------------- | ------------------------------ |
| `pnpm test -- --run`                    | Full test suite (all files)    |
| `pnpm test -- <path> --run`             | Single file                    |
| `pnpm test -- --run --reporter=verbose` | Verbose output with test names |
| `pnpm test -- --run --coverage`         | With coverage report           |

**Rule:** After adding new tests, always run the full suite (`pnpm test -- --run`) to ensure no regressions. Every PR must have 0 test failures and 0 lint errors.

### 7.6 Coverage Targets

| Layer                                                                                                                              | Minimum                                                 | Priority                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| New/changed production code                                                                                                        | 100% lines, functions, branches, and conditions         | **Required** — no untested new behavior |
| Critical boundary modules: database, filesystem persistence, sync, IPC/preload, installer/import/export, security, release harness | 100% branch and condition coverage for touched behavior | **Required** — data/user trust boundary |
| `packages/db/src/`                                                                                                                 | 100% for changed files; legacy gaps must be recorded    | **Critical** — data integrity           |
| `apps/desktop/src/main/security.ts`                                                                                                | 100% for changed files; legacy gaps must be recorded    | **Critical** — encryption correctness   |
| `packages/core/src/` and app services                                                                                              | 100% for changed files; legacy gaps must be recorded    | High — business logic                   |
| `apps/desktop/src/main/ipc/`                                                                                                       | 100% for changed handlers and validation branches       | High — input validation                 |
| `apps/desktop/src/renderer/stores/`                                                                                                | 100% for changed actions and state branches             | High — state management                 |
| `apps/desktop/src/renderer/services/`                                                                                              | 100% for changed services and error paths               | High — client correctness               |
| `apps/desktop/src/renderer/components/`                                                                                            | 100% for changed user-visible states and interactions   | Medium — UI behavior                    |

Coverage acceptance must include branch and condition review, not only line coverage. Any uncovered branch in touched code must be either tested or explicitly documented in the active change with a reason and a follow-up task.

### 7.7 What Makes a Test "Good"

A good test:

1. **Fails when the code is broken** — If you comment out the implementation, the test must fail.
2. **Passes when the code is correct** — No flaky behavior, no timing dependencies.
3. **Documents the expected behavior** — The test name and assertions serve as living documentation.
4. **Catches regressions** — A future developer changing the code incorrectly will be stopped by this test.
5. **Is independent** — Can run in any order, doesn't depend on other tests' side effects.
6. **Is fast** — Unit tests should complete in milliseconds, not seconds.

A bad test:

1. Always passes regardless of implementation.
2. Tests implementation details that change on refactor.
3. Has vague assertions (`toBeDefined`, `toBeTruthy`) when specific values are known.
4. Requires network, filesystem, or timing to pass.
5. Is a copy-paste of another test with one variable changed.

## 8. Code Quality Rules

### 8.1 TypeScript Strictness

| Rule                        | Description                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **No `any`**                | The `any` type is globally prohibited by ESLint. Use proper types, generics, or `unknown` with type guards.    |
| **No `@ts-ignore`**         | Fix the underlying type error instead of suppressing it.                                                       |
| **No `as` type assertions** | Unless truly necessary for interop; must include a comment explaining why.                                     |
| **Explicit return types**   | All exported functions must have explicit return type annotations.                                             |
| **Strict null checks**      | Handle `null` and `undefined` explicitly. No optional chaining as a substitute for proper null handling logic. |

### 8.2 Error Handling

| Rule                        | Description                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **No empty catch blocks**   | Every `catch` must either re-throw, log with full stack, or handle the error meaningfully.                   |
| **No silent failures**      | Functions must not swallow errors and return default values. If an operation can fail, the caller must know. |
| **Specific error messages** | Error messages must include context (what failed, with what input). Not just "Error occurred".               |
| **IPC error propagation**   | IPC handlers must catch errors and return structured error responses, never crash the main process silently. |

### 8.3 Internationalization (i18n) Rules

| Rule                                 | Description                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **No hardcoded user-facing strings** | All text visible to users must go through `t()` from `react-i18next`. This includes button labels, error messages, placeholders, tooltips, and status text.  |
| **No hardcoded Chinese**             | Hardcoded Chinese characters in source code (outside of locale JSON files) are prohibited. This is enforced by regression tests.                             |
| **All 7 locales must be updated**    | When adding a new i18n key, it must be added to ALL locale files: `en.json`, `zh.json`, `zh-TW.json`, `ja.json`, `fr.json`, `de.json`, `es.json`.            |
| **Key naming**                       | Use dot-notation structured keys: `domain.action` (e.g., `skill.formatDirectoryRepo`, `settings.addNModels`).                                                |
| **Interpolation**                    | Use i18next interpolation for dynamic values: `t('settings.addNModels', { count: n })`. Never concatenate translated strings.                                |
| **Backend error messages**           | Error messages in the main process (thrown from IPC handlers, services) should be in English, as they are typically logged, not displayed directly to users. |

### 8.4 Database Rules

| Rule                                       | Description                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parameterized queries only**             | All SQL queries must use parameterized placeholders (`?`). String concatenation for SQL values is absolutely prohibited.                            |
| **Foreign keys enforced**                  | `PRAGMA foreign_keys = ON` must be set. All FK constraints must use explicit `ON DELETE` behavior (CASCADE or SET NULL).                            |
| **Transactions for multi-step operations** | Any operation that involves multiple SQL statements must be wrapped in `db.transaction()`.                                                          |
| **FTS sync**                               | When updating prompts, the FTS index must be kept in sync. Use triggers or explicit FTS update statements.                                          |
| **Schema migrations**                      | All schema changes must go through `packages/db/src/init.ts`. Never modify `packages/db/src/schema.ts` without a corresponding migration and test.  |
| **Adapter boundary**                       | Database code must use the `packages/db/src/adapter.ts` API. Do not bypass it with direct driver calls in app code.                                 |
| **Shared package boundary**                | App code should consume DB classes through `@prompthub/db` / `@prompthub/core`; do not duplicate schema knowledge in renderer components.           |
| **Null byte awareness**                    | SQLite string inputs can lose data around `\x00`. Input validation should strip or reject null bytes before database writes and test this behavior. |

Additional database workflow:

1. Update `packages/db/src/schema.ts` for fresh installs.
2. Add an idempotent migration in `packages/db/src/init.ts` for existing installs.
3. Update the relevant DB class in `packages/db/src/*.ts`.
4. Update shared types in `packages/shared/types` if the field crosses app/package boundaries.
5. Add real SQLite tests using `DatabaseAdapter(":memory:")` plus migration/compatibility tests when existing data is affected.
6. Record migration, rollback, and verification in the active change `implementation.md`.

### 8.5 Security Rules

| Rule                          | Description                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **AES-256-GCM**               | All encryption uses AES-256-GCM with random IV. Never reuse IVs.                                                          |
| **Master password**           | Derived via scrypt (or equivalent KDF). Never stored in plaintext.                                                        |
| **No secrets in logs**        | Passwords, API keys, tokens, and encryption keys must never appear in log output or error messages.                       |
| **IPC input validation**      | All IPC handlers must validate input types and reject malformed payloads before processing.                               |
| **SSRF protection**           | Image download endpoints (`image.ipc.ts`) must validate URLs against SSRF attacks (no internal IPs, no file:// protocol). |
| **Path traversal prevention** | File path inputs must be validated to prevent `../` traversal, absolute path injection, and symlink attacks.              |

### 8.6 Component & UI Rules

| Rule                          | Description                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Reuse existing components** | Check `apps/desktop/src/renderer/components/ui/` or the relevant app UI folder before creating new primitives.                         |
| **No inline styles**          | Use Tailwind classes exclusively. No `style={{ }}` props.                                                                              |
| **Lucide icons only**         | Use `lucide-react` for all icons. Do not import other icon libraries.                                                                  |
| **Accessible**                | All interactive elements must have appropriate ARIA labels. Modals must trap focus.                                                    |
| **Dark mode**                 | All UI must work in both light and dark modes. Use Tailwind's design tokens (e.g., `bg-card`, `text-foreground`) not hardcoded colors. |

### 8.7 Import & Module Rules

| Rule                            | Description                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Package imports**             | Prefer workspace package imports (`@prompthub/core`, `@prompthub/db`, `@prompthub/shared`) for shared behavior.          |
| **App boundary**                | `packages/*` must not import from `apps/*`. App packages may import from `packages/*`.                                   |
| **No circular imports**         | Modules must not have circular dependencies. Main → Shared is OK. Renderer → Shared is OK. Main ↔ Renderer is NEVER OK.  |
| **Shared types only in shared** | Types used by more than one app/package belong in `packages/shared/types`. App-local types stay near the app module.     |
| **IPC channels in constants**   | Desktop IPC channel strings must be defined in `packages/shared/constants/ipc-channels.ts`, never hardcoded in handlers. |

## 9. IPC Development Checklist

When adding a new IPC endpoint:

1. **Define channel** in `packages/shared/constants/ipc-channels.ts`.
2. **Define types** for request/response in `packages/shared/types/` when the contract crosses package boundaries.
3. **Implement handler** in `apps/desktop/src/main/ipc/` with input validation.
4. **Expose in preload** via `apps/desktop/src/preload/` (`contextBridge.exposeInMainWorld`).
5. **Call from renderer** via the typed `window.api` method.
6. **Add tests** for the handler (valid inputs, invalid inputs, error paths).
7. **Record contract impact** in the active change when the endpoint changes user-visible behavior or persistent data.

## 10. Skill System Conventions

### Package Boundary

A Skill is a directory-level package. `SKILL.md` is the required entrypoint inside the package, not the whole Skill.

Valid examples:

```text
writer/
├── SKILL.md
├── scripts/
├── docs/
└── assets/
```

```text
simple-skill/
└── SKILL.md
```

Rules:

- Import/install/sync/export/distribute/deploy paths must preserve the whole Skill directory tree, except explicit ignored entries such as `.git` and `.prompthub`.
- A Skill with only `SKILL.md` is valid, but it is still represented as a directory containing `SKILL.md`.
- Content-only writes (`writeLocalFile("SKILL.md")`, `saveContentToLocalRepo`, or equivalent) are allowed for new UI-authored Skills and editing the entrypoint file. They must not be used as the final persistence path for a store/Git/Gitea/local-directory import that represents a package.
- When source metadata includes `source_url`, branch/directory fields, `canonical_skill_path`, `local_repo_path`, or `directory_fingerprint`, treat the source as a package unless explicitly documented as single-file.
- Tests for Skill import/install must assert managed repo file inventory, not only DB rows or mocked API calls.

### File Format

Every Skill package contains a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: skill-name
description: Short description
version: 1.0.0
tags:
  - tag1
  - tag2
---

# Skill Instructions

Markdown content here...
```

### Sync Rules

- **DB is the source of truth** for metadata displayed in the UI.
- **SKILL.md files** are the source of truth for instructions/content.
- When metadata is edited in the UI (`EditSkillModal`), both DB and SKILL.md frontmatter are updated (`syncFrontmatterToRepo()`).
- When SKILL.md file changes on disk, the DB is synced via `syncSkillFromRepo()`.
- The `METADATA_KEYS` constant in `skill-repo-sync.ts` defines which fields are considered metadata: `name`, `description`, `version`, `tags`, `author`, `model`.

### Validation

- Skill names must match `/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/` (lowercase, hyphens, no leading/trailing hyphens).
- SKILL.md must have valid YAML frontmatter with required `name` field.
- `parseSkillMd()` in `skill-validator.ts` handles parsing; edge cases (empty frontmatter, missing delimiters) are documented in tests.

## 11. Git & Commit Conventions

Detailed submission, traceability, document ID, issue reference, and PR rules live in `spec/rules/submission-traceability-rules.md`. This section is the quick operating summary.

| Rule                     | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Conventional Commits** | `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `style:`.        |
| **Scope optional**       | `feat(skill): add frontmatter sync` or `fix: correct Gemini routing`.               |
| **Imperative mood**      | "add feature" not "added feature" or "adds feature".                                |
| **No auto-commit**       | AI agents must never commit without explicit user instruction.                      |
| **Atomic commits**       | Each commit should represent one logical change. Don't mix features with bug fixes. |
| **Traceable docs**       | Non-trivial commits should reference the active change and maintain `FR -> DES -> TEST -> T`. |
| **Issue references**     | Use `Refs #123` before release; use `Closes #123` only when the published release should close the issue. |
| **All tests must pass**  | Relevant lint / typecheck / test / build commands must pass, or blockers must be recorded before committing. |

## 12. Known Caveats & Gotchas

| Issue                         | Details                                                                                                                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------- |
| **SQLite null byte handling** | Null bytes in text fields can cause silent data loss depending on adapter/runtime behavior. Strip or reject `\x00` before database writes.                                                                                                         |
| **FTS5 special operators**    | Search queries containing `AND`, `OR`, `NOT`, `NEAR`, `*`, `^`, `"`, or `column:` are interpreted as FTS5 operators and may cause syntax errors if not properly escaped.                                                                           |
| **Electron process boundary** | Objects passed via IPC are serialized (structured clone). Functions, class instances, and circular references cannot cross the IPC boundary.                                                                                                       |
| **Skill sync race condition** | `useEffect` in `SkillFullDetailPage` triggers `syncSkillFromRepo()` on `updated_at` change, which can overwrite metadata edits if the SKILL.md file hasn't been updated yet. This is mitigated by `syncFrontmatterToRepo()` in the update handler. |
| **Empty string vs null**      | Some DB methods convert `""` to `null` via `value                                                                                                                                                                                                  |     | null`. Be explicit about whether empty strings should be preserved. |
| **Flaky time-based tests**    | Avoid relying on `Date.now()` for ordering. Use explicit timestamps or deterministic sequencing in tests.                                                                                                                                          |
