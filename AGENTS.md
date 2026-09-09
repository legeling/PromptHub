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

Repository-wide governance lives only in `AGENTS.md`,
`spec-init.topology.yml`, and the routed documents under `spec/*`.
`.agents/skills/*` may provide reusable execution procedures, but they must
defer to those project sources. Do not add parallel project constraints under
`.agents/rules/`, `.agents/workflows/`, generic `docs/rules/`, or tool-specific
instruction files.

### 0.2 Documentation Scope

Use [document-routing-rules.md](spec/rules/document-routing-rules.md) as the
single authority for documentation scope, current requirements, plans, and
history. Update the existing topic in place; documentation volume follows risk.
A non-trivial code change does not by itself require a new change folder.

### 0.3 Existing-Feature Modification Rule

When modifying existing behavior, first identify:

- the owning app/package (`apps/desktop`, `apps/web`, `apps/cli`, `apps/web-cloudflare`, `packages/core`, `packages/db`, or `packages/shared`)
- the current source of truth for data (SQLite, filesystem workspace, SKILL.md, settings, remote sync, or UI state)
- the existing tests or missing regression gap
- the stable doc or active change that defines the boundary

If the implementation and docs disagree, do not silently pick one. Record the discrepancy in the affected topic or existing plan and make the intended source of truth explicit.

### 0.4 New-Feature Addition Rule

For new features, define the boundary before writing code:

- Data: new table/column/index, JSON field, file, directory, or remote payload?
- Contract: new shared type, IPC channel, route, CLI command, or preload method?
- Ownership: should logic live in `packages/core`, `packages/db`, app-specific services, or renderer UI?
- Compatibility: migration path for existing users and rollback behavior.
- Verification: lowest effective test layer plus release harness impact.

Do not put durable business rules only in React components or one-off IPC handlers. Shared behavior belongs in `packages/core`; storage primitives belong in `packages/db`; shared contracts belong in `packages/shared`.

### 0.5 Test-First Rule

Follow [testing-standards.md](spec/rules/testing-standards.md) for test-first
changes, coverage, adversarial cases, real UI evidence, and failure recovery.
Write regression tests before the fix; finish the implementation batch before
running checks. Explain any missing evidence without claiming it passed.

### 0.6 Design Conflicts

Resolve routine choices from current code, tests, docs, and confirmed user
decisions. Ask only when an unresolved choice materially affects scope, user
data, security, ownership, or compatibility. An explicit user decision updates
the authoritative requirement immediately; record any implementation gap there.
Do not ask again merely because an obsolete process document disagrees.

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
- New files should stay below 1,000 lines by default. Crossing 1,000 lines requires a clear reason in the affected topic or existing plan.
- Functions should stay under 50 lines unless the affected topic records why a longer function is clearer and what tests cover it.
- Avoid "god" services, stores, components, and test files. Split by domain responsibility, not by arbitrary helper buckets.
- Prefer small pure helpers for parsing, normalization, identity, and policy decisions; keep side effects in orchestration functions.

Design quality gates:

- Before adding a new abstraction, identify the repeated complexity it removes. Do not add abstractions for a single call site unless it defines a real boundary.
- Before adding a dependency between modules, verify the dependency direction matches the architecture section in this file.
- Before adding state, define who owns it, how it is derived, how it is invalidated, and how reload/rescan/reopen behaves.
- Before adding filesystem or DB behavior, define atomicity, rollback, migration, and recovery behavior.
- Before adding UI behavior, define the source selector/state that list, detail, badge, count, and action surfaces must share.
- If a change violates these rules, stop and either refactor first or record a design conflict for user confirmation.

### 0.8 Documentation and Product Copy Hygiene Rule

Project documents and product surfaces must describe the product, code, decisions, verification, and user-facing behavior. They must not contain agent process narration, private reasoning, inner monologue, draft thinking, or chat-style self-reporting.

Do not write phrases like "I am analyzing", "I think", "I will first", "my reasoning", or hidden chain-of-thought summaries into:

- user-facing UI text, toasts, placeholders, empty states, mock data, screenshots, or release notes
- public repository docs such as `README.md`, localized README files, `docs/*`, `CHANGELOG.md`, and website copy
- internal persistent project records such as `spec/*`, `AGENTS.md`, proposals, designs, tasks, implementation notes, and rules

Docs may record concise decisions, shipped changes, assumptions, risks, commands run, and verification results. They should not preserve the agent's conversational process. Maintainer-only operational details, such as signing certificates, release credentials, or secret-handling steps, belong in internal `spec/` records or secure secret stores, not public README files unless they are explicitly intended for contributors or users.

### 0.9 Mandatory Submission Gate

Before any commit, split commit, history rewrite, or push operation:

1. Read `spec/rules/submission-traceability-rules.md`; the quick summary in Section 11 does not replace the full rule.
2. Run `git status --short` and separate current work from user or parallel-agent changes.
3. Confirm the commit is one independently reversible logical unit with a clear purpose and actual verification evidence.
4. For every non-trivial commit, include a body with the relevant topic, change, or issue reference when one exists and the actual verification status. A Conventional Commit title by itself is not sufficient.
5. Use `Refs #<issue>` before release. Use `Closes #<issue>` only when the containing version is already published and the issue should be closed.

## 1. Project Overview

**PromptHub** is a local-first prompt and AI-skill management monorepo. It includes a cross-platform Electron desktop app, a standalone CLI, a self-hosted web app, and a Cloudflare Worker backend. It allows users to organize, version-control, sync, recover, and test prompts and reusable AI skill definitions.

- **Type:** Local-first monorepo with desktop, CLI, web, and worker distributions
- **License:** AGPL-3.0
- **Version:** 0.6.0-beta.2

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

### 6.1 Documentation

Start at [spec/README.md](spec/README.md) and read only the affected topic.
Documentation scope and lifecycle are owned by
[document-routing-rules.md](spec/rules/document-routing-rules.md).
Public contributor/user documentation stays under `docs/`; internal product
contracts and records stay under `spec/`. Embedded Skill templates are reusable
procedures, not a second set of project rules.

### 6.2 Implementation and Delivery

1. Identify the owner, data authority, intended behavior, and verification.
2. Update affected confirmed requirements in place, marking implementation gaps.
3. Write regression tests, then finish source, tests, config, migration, and
   relevant documentation as one batch before running checks.
4. Run focused checks, then broader checks justified by the affected boundary.
5. Report actual results and limitations; update the existing plan if present.

GitHub issue state is separate from local delivery: `github-open.md` and
`github-closed.md` are remote snapshots; `local-github-status.md` is the local
overlay. Local completion is `local_done` or `release_pending`. Close a remote
issue only after its containing version is published, then refresh snapshots.
See [issue-management-rules.md](spec/rules/issue-management-rules.md).

### 6.3 Data and Storage Change Gate

Before changing persistence or storage, document the following in the affected topic (necessary design may share that file):

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

[testing-standards.md](spec/rules/testing-standards.md) owns test design,
coverage targets, fixtures, and UI evidence requirements.
[Verification](spec/workflow/04-verification/README.md) lists executable checks
and the release harness boundary. Quick checks do not prove release readiness.

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
6. Record migration, rollback, and verification in the affected topic or existing plan.

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
7. **Record contract impact** in the affected topic or existing plan when the endpoint changes user-visible behavior or persistent data.

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
| **Required body**        | Every non-trivial commit body must record its primary change/issue and actual verification status. |
| **Traceable docs**       | Non-trivial commits explain purpose and verification; link the existing topic, plan, or issue when present. |
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
