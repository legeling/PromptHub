# PromptHub — Project Context & Development Rules

## 1. Project Overview

**PromptHub** is a local-first, cross-platform desktop application for managing AI prompts. It allows users to organize, version control, and test prompts across multiple AI models. It also includes a **Skill system** for managing reusable AI skill definitions (SKILL.md files with frontmatter metadata).

- **Type:** Desktop Application (Electron)
- **License:** AGPL-3.0
- **Version:** 0.5.5

### Tech Stack

| Category            | Technology                                                         |
| :------------------ | :----------------------------------------------------------------- |
| **Runtime**         | Electron 33                                                        |
| **Frontend**        | React 18, TypeScript 5, Vite 6                                     |
| **Styling**         | Tailwind CSS 3 (design tokens: `bg-card`, `text-muted-foreground`) |
| **Icons**           | Lucide React                                                       |
| **State**           | Zustand 5                                                          |
| **Database**        | SQLite (via `better-sqlite3` in main process)                      |
| **Testing**         | Vitest 2 (unit), Playwright 1.57+ (E2E)                            |
| **I18n**            | i18next 24 / react-i18next 15 (7 locales)                          |
| **Package Manager** | pnpm                                                               |

## 2. Architecture

The application follows the standard Electron process model:

### Main Process (`src/main`)

- Handles native OS interactions, file system access, database operations, and security (encryption).
- **Entry:** `src/main/index.ts`
- **Database:** Direct SQLite access via `better-sqlite3`. Schema defined in `src/main/database/schema.ts`. Adapter in `src/main/database/sqlite.ts`.
- **IPC:** Exposes functionality to the renderer via `ipcMain.handle()` handlers registered in `src/main/ipc/`.
- **Security:** Master password, encryption/decryption in `src/main/security.ts`.
- **Services:** Business logic for skills (installer, validator, repo sync, sanitizer) in `src/main/services/`.

### Renderer Process (`src/renderer`)

- A React SPA responsible for the UI/UX.
- **Entry:** `src/renderer/main.tsx`
- **Communication:** Uses `window.api` (exposed via `contextBridge` in `src/preload/index.ts`) to call Main process methods.
- **State:** Zustand stores in `src/renderer/stores/` (prompt, folder, skill, settings, ui).
- **Services:** Frontend services in `src/renderer/services/` (AI client, WebDAV, skill platform sync, etc.).

### Data Layer

- **Local Storage:** SQLite database stores prompts, versions, folders, skills, skill versions, and settings.
- **Search:** Uses SQLite FTS5 for full-text search (`prompts_fts` virtual table).
- **Sync:** WebDAV support for backup and sync.
- **Skill Files:** Skills stored as SKILL.md files with YAML frontmatter metadata, synced between DB and local repo via `skill-repo-sync.ts`.

## 3. Key Commands

| Command                     | Description                            |
| :-------------------------- | :------------------------------------- |
| `pnpm install`              | Install dependencies                   |
| `pnpm electron:dev`         | Start dev server (Vite + Electron)     |
| `pnpm build`                | Build for production (Main + Renderer) |
| `pnpm electron:build`       | Build and package the application      |
| `pnpm test -- --run`        | Run full unit test suite (Vitest)      |
| `pnpm test -- <path> --run` | Run single test file                   |
| `pnpm test:e2e`             | Run end-to-end tests (Playwright)      |
| `pnpm lint`                 | Run ESLint                             |
| `pnpm format`               | Format code with Prettier              |

## 4. Directory Structure

```text
PromptHub/
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── database/               # SQLite schema, adapters, DB classes
│   │   │   ├── schema.ts           # DDL definitions (tables + indexes)
│   │   │   ├── sqlite.ts           # DatabaseAdapter (better-sqlite3 wrapper)
│   │   │   ├── index.ts            # DB initialization + schema migrations
│   │   │   ├── prompt.ts           # PromptDB (CRUD, versioning, FTS)
│   │   │   ├── folder.ts           # FolderDB (CRUD, reorder, hierarchy)
│   │   │   └── skill.ts            # SkillDB (CRUD, versioning)
│   │   ├── ipc/                    # IPC handler implementations
│   │   │   ├── index.ts            # Handler registration
│   │   │   ├── prompt.ipc.ts       # Prompt IPC handlers
│   │   │   ├── folder.ipc.ts       # Folder IPC handlers
│   │   │   ├── skill.ipc.ts        # Skill IPC entry (delegates to skill/)
│   │   │   ├── skill/              # Skill IPC sub-handlers
│   │   │   │   ├── crud-handlers.ts
│   │   │   │   ├── local-repo-handlers.ts
│   │   │   │   ├── platform-handlers.ts
│   │   │   │   ├── version-handlers.ts
│   │   │   │   └── shared.ts
│   │   │   ├── ai.ipc.ts           # AI model IPC handlers
│   │   │   ├── image.ipc.ts        # Image IPC + SSRF protection
│   │   │   ├── security.ipc.ts     # Encryption/master password handlers
│   │   │   └── settings.ipc.ts     # Settings IPC handlers
│   │   ├── services/               # Business logic services
│   │   │   ├── skill-installer.ts  # Skill install/export (largest service)
│   │   │   ├── skill-validator.ts  # SKILL.md parsing + validation
│   │   │   ├── skill-repo-sync.ts  # DB ↔ local repo frontmatter sync
│   │   │   ├── skill-import-sanitize.ts
│   │   │   └── skill-installer-utils.ts
│   │   ├── security.ts             # Master password, AES-256-GCM encrypt/decrypt
│   │   ├── webdav.ts               # WebDAV sync
│   │   ├── updater.ts              # Auto-updater
│   │   └── index.ts                # Entry point
│   ├── renderer/                   # React Frontend
│   │   ├── components/             # UI Components
│   │   │   ├── ui/                 # Reusable UI primitives (Modal, etc.)
│   │   │   ├── settings/           # Settings pages (AI settings, etc.)
│   │   │   ├── skill/              # Skill management UI
│   │   │   ├── prompt/             # Prompt editor UI
│   │   │   ├── folder/             # Folder tree UI
│   │   │   ├── layout/             # App layout components
│   │   │   └── resources/          # Resource components
│   │   ├── hooks/                  # Custom React Hooks
│   │   ├── services/               # Frontend services
│   │   │   ├── ai.ts               # AI client (multi-provider routing)
│   │   │   ├── webdav.ts           # WebDAV client
│   │   │   ├── skill-*.ts          # Skill-related frontend services
│   │   │   └── database-backup.ts  # Backup/restore
│   │   ├── stores/                 # Zustand stores
│   │   │   ├── prompt.store.ts
│   │   │   ├── folder.store.ts
│   │   │   ├── skill.store.ts
│   │   │   ├── settings.store.ts
│   │   │   └── ui.store.ts
│   │   ├── i18n/                   # Localization
│   │   │   └── locales/            # 7 locales: en, zh, zh-TW, ja, fr, de, es
│   │   └── styles/                 # Global styles
│   ├── preload/                    # Electron Preload Scripts
│   └── shared/                     # Shared Types and Constants
│       ├── constants/              # IPC channel names, skill registry, etc.
│       │   └── ipc-channels.ts     # All IPC channel string constants
│       └── types/                  # TypeScript interfaces
│           ├── prompt.ts           # Prompt, Variable, PromptVersion, DTOs
│           ├── folder.ts           # Folder, DTOs
│           ├── skill.ts            # Skill, UpdateSkillParams, DTOs
│           ├── ai.ts               # AI model/endpoint types
│           └── settings.ts         # Settings types
├── tests/                          # Test suites
│   ├── unit/                       # Vitest unit tests
│   │   ├── main/                   # Main process tests (DB, services, security)
│   │   ├── components/             # React component tests
│   │   ├── services/               # Frontend service tests
│   │   ├── stores/                 # Zustand store tests
│   │   ├── hooks/                  # Hook tests
│   │   └── cli/                    # CLI tests
│   ├── integration/                # Integration tests
│   ├── e2e/                        # Playwright E2E tests
│   ├── fixtures/                   # Test fixtures
│   ├── helpers/                    # Test helpers
│   └── setup.ts                    # Global test setup
├── resources/                      # Static assets (icons)
├── electron-builder.json           # Packaging config
├── vitest.config.ts                # Vitest config (jsdom, aliases)
└── package.json
```

## 5. Key Conventions

### IPC Communication

- **Channel Definitions:** All IPC channel strings are defined in `src/shared/constants/ipc-channels.ts`.
- **Pattern:** Renderer invokes `window.api.method()` → `ipcRenderer.invoke(channel, ...args)` → Main process handles with `ipcMain.handle(channel, handler)`.
- **Naming:** Channels follow `domain:action` format (e.g., `prompt:create`, `skill:update`, `folder:delete`).

### Database Schema

- **Prompts:** Stores title, content, variables (JSON), tags (JSON), and folder association. Supports versioning via `prompt_versions` table.
- **Folders:** Hierarchical structure with `parent_id` and `sort_order` for ordering. Supports CASCADE delete.
- **Skills:** Stores skill metadata, instructions, versioning. Syncs with local SKILL.md files.
- **FTS:** `prompts_fts` virtual table (FTS5) for full-text search on title + content + tags.
- **Migrations:** Schema versioning handled in `src/main/database/index.ts`.

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

The structure is intentionally aligned with OpenSpec: stable specs live in `spec/specs/`, active delta specs live under `spec/changes/active/<change-key>/specs/<domain>/spec.md`, finished changes move to `spec/changes/archive/`, and the workflow is iterative rather than phase-locked.

The expected SSD loop is:

`requirements -> spec -> design -> tasks -> implementation -> sync -> archive`

#### Document Roles

- `spec/specs/`: long-lived source-of-truth specs for current system behavior by domain.
- `spec/architecture/`: long-lived source-of-truth docs for stable internal architecture and accepted engineering constraints.
- `spec/README.md`: the internal SSD entry point.
- `spec/changes/active/<change-key>/`: active change folders for feature work, larger bug fixes, refactors, and migrations.
- `spec/changes/archive/<date>-<change-key>/`: completed or superseded changes kept for history.
- `spec/changes/legacy/`: recovered historical internal docs that are still useful but are not the current source of truth.
- `spec/issues/active/`: ongoing defects, quality risks, and follow-up issues that are not yet a scoped implementation change.
- `spec/changes/_templates/`: reusable templates for proposal, delta specs, design, tasks, and implementation artifacts.
- `docs/README.md`: the repository-facing docs index for users and contributors.

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
2. Refine `proposal.md`, `specs/<domain>/spec.md`, and `design.md` as understanding improves; the workflow is iterative, not phase-locked.
3. Use `tasks.md` as the implementation checklist and mark items complete as work lands.
4. Update `implementation.md` during or immediately after implementation so the executed work does not live only in git diff or chat history.
5. When the change ships, sync current behavior back into `spec/specs/` and stable engineering guidance back into `spec/architecture/` where appropriate.
6. After shipping or abandoning the work, move the change folder to `spec/changes/archive/` rather than deleting it.

#### When To Update Existing Change vs Start New One

- Update the existing change when the user problem and intended outcome stay the same, but execution details or scope boundaries evolve.
- Start a new change when the objective materially changes, the original work can stand on its own, or the history would become confusing if kept in one folder.

#### Implementation Discipline

- Do not let requirements live only in chat history when the work is significant.
- Do not edit `spec/specs/` or `spec/architecture/` as if they were scratchpads for active work; active deltas belong in `spec/changes/active/` first.
- Do not treat `tasks.md` as optional for substantial changes; it is the execution contract.
- Do not treat `implementation.md` as optional for substantial changes; it is the executed record of what really landed.
- Do not close a change folder without updating its verification status and follow-up notes.
- Repository-facing documentation should live under `docs/` unless it must remain at the repository root for tooling or platform conventions, such as `README.md`, `CHANGELOG.md`, or `AGENTS.md`. Internal SSD, specs, and architecture records belong in `spec/`.

### 6.2 Engineering Flow

1. **Plan:** For non-trivial work, create or update a change folder in `spec/changes/active/` using the templates.
2. **Modify:** Edit React components in `renderer` or backend logic in `main`.
3. **IPC:** If adding new features requiring backend access, update `ipc-channels.ts`, implement handler in `main/ipc`, and expose via `preload`.
4. **Test:** Run `pnpm test -- --run` to verify logic. Run `pnpm lint` to verify code quality.
5. **Record:** Update `implementation.md` with the actual execution path, verification, and follow-up notes.
6. **Sync Docs:** Update `spec/specs/` when shipped behavior changed, update `spec/architecture/` when the shipped internal architecture contract changed, and update user-facing docs in `docs/` or `README.md` when the contributor/user contract changed.
7. **Commit:** Use Conventional Commits (e.g., `feat: ...`, `fix: ...`, `refactor: ...`, `test: ...`).

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
| **Null bytes**            | Test `\x00` in string fields — SQLite truncates at null bytes via `better-sqlite3`, causing silent data loss. Document this behavior in tests.                                                                             |
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

| Layer                      | Minimum | Priority                              |
| -------------------------- | ------- | ------------------------------------- |
| `src/main/database/`       | 80%+    | **Critical** — data integrity         |
| `src/main/security.ts`     | 90%+    | **Critical** — encryption correctness |
| `src/main/services/`       | 70%+    | High — business logic                 |
| `src/main/ipc/`            | 60%+    | High — input validation               |
| `src/renderer/stores/`     | 60%+    | Medium — state management             |
| `src/renderer/services/`   | 80%+    | High — AI client correctness          |
| `src/renderer/components/` | 40%+    | Lower — UI interactions               |

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

| Rule                                       | Description                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parameterized queries only**             | All SQL queries must use parameterized placeholders (`?`). String concatenation for SQL values is absolutely prohibited.                             |
| **Foreign keys enforced**                  | `PRAGMA foreign_keys = ON` must be set. All FK constraints must use explicit `ON DELETE` behavior (CASCADE or SET NULL).                             |
| **Transactions for multi-step operations** | Any operation that involves multiple SQL statements must be wrapped in `db.transaction()`.                                                           |
| **FTS sync**                               | When updating prompts, the FTS index must be kept in sync. Use triggers or explicit FTS update statements.                                           |
| **Schema migrations**                      | All schema changes must go through the migration system in `src/main/database/index.ts`. Never modify `schema.ts` without a corresponding migration. |
| **Null byte awareness**                    | `better-sqlite3` truncates strings at `\x00`. Input validation should strip null bytes from user input before database writes.                       |

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
| **Reuse existing components** | Check `src/renderer/components/ui/` before creating new UI primitives. Use the existing `Modal`, `Button`, etc.                        |
| **No inline styles**          | Use Tailwind classes exclusively. No `style={{ }}` props.                                                                              |
| **Lucide icons only**         | Use `lucide-react` for all icons. Do not import other icon libraries.                                                                  |
| **Accessible**                | All interactive elements must have appropriate ARIA labels. Modals must trap focus.                                                    |
| **Dark mode**                 | All UI must work in both light and dark modes. Use Tailwind's design tokens (e.g., `bg-card`, `text-foreground`) not hardcoded colors. |

### 8.7 Import & Module Rules

| Rule                               | Description                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Path aliases**                   | Use `@/` for `src/main/`, `@renderer/` for `src/renderer/`, `@shared/` for `src/shared/`.                               |
| **No circular imports**            | Modules must not have circular dependencies. Main → Shared is OK. Renderer → Shared is OK. Main ↔ Renderer is NEVER OK. |
| **Shared types only in `shared/`** | Types used by both main and renderer must be in `src/shared/types/`.                                                    |
| **IPC channels in constants**      | All IPC channel strings must be defined in `src/shared/constants/ipc-channels.ts`, never hardcoded in handlers.         |

## 9. IPC Development Checklist

When adding a new IPC endpoint:

1. **Define channel** in `src/shared/constants/ipc-channels.ts`.
2. **Define types** for request/response in `src/shared/types/`.
3. **Implement handler** in `src/main/ipc/` with input validation.
4. **Expose in preload** via `src/preload/index.ts` (`contextBridge.exposeInMainWorld`).
5. **Call from renderer** via `window.api.newMethod()`.
6. **Add tests** for the handler (valid inputs, invalid inputs, error paths).

## 10. Skill System Conventions

### File Format

Skills are stored as SKILL.md files with YAML frontmatter:

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

| Rule                     | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Conventional Commits** | `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `perf:`, `style:`.        |
| **Scope optional**       | `feat(skill): add frontmatter sync` or `fix: correct Gemini routing`.               |
| **Imperative mood**      | "add feature" not "added feature" or "adds feature".                                |
| **No auto-commit**       | AI agents must never commit without explicit user instruction.                      |
| **Atomic commits**       | Each commit should represent one logical change. Don't mix features with bug fixes. |
| **All tests must pass**  | `pnpm test -- --run` and `pnpm lint` must both pass before committing.              |

## 12. Known Caveats & Gotchas

| Issue                           | Details                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------- |
| **SQLite null byte truncation** | `better-sqlite3` silently truncates strings at `\x00`. Always strip null bytes from user input.                                                                                                                                                    |
| **FTS5 special operators**      | Search queries containing `AND`, `OR`, `NOT`, `NEAR`, `*`, `^`, `"`, or `column:` are interpreted as FTS5 operators and may cause syntax errors if not properly escaped.                                                                           |
| **Electron process boundary**   | Objects passed via IPC are serialized (structured clone). Functions, class instances, and circular references cannot cross the IPC boundary.                                                                                                       |
| **Skill sync race condition**   | `useEffect` in `SkillFullDetailPage` triggers `syncSkillFromRepo()` on `updated_at` change, which can overwrite metadata edits if the SKILL.md file hasn't been updated yet. This is mitigated by `syncFrontmatterToRepo()` in the update handler. |
| **Empty string vs null**        | Some DB methods convert `""` to `null` via `value                                                                                                                                                                                                  |     | null`. Be explicit about whether empty strings should be preserved. |
| **Flaky time-based tests**      | Avoid relying on `Date.now()` for ordering. Use explicit timestamps or deterministic sequencing in tests.                                                                                                                                          |
