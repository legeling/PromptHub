# PromptHub Project Rules

> Project-level rules, automatically loaded into every session context.

## Project Overview

- **Architecture**: pnpm monorepo (`apps/` + `packages/`)
- **Tech Stack**: Electron 33 + React 18 + TypeScript 5 + Vite 6 + Tailwind CSS 3
- **Database**: node-sqlite3-wasm (pure WASM SQLite, wrapped by `@prompthub/db`)
- **State**: Zustand 5
- **Package Manager**: pnpm (npm/yarn prohibited)
- **Testing**: Vitest (unit) + Playwright (E2E)
- **I18n**: i18next / react-i18next (7 locales: en, zh, zh-TW, ja, fr, de, es)

## Monorepo Structure

```
PromptHub/                          # Root (AGPL-3.0)
├── apps/
│   └── desktop/                    # @prompthub/desktop — Electron app
│       ├── src/main/               # Main process (IPC, services, security)
│       ├── src/renderer/           # React SPA (components, stores, hooks)
│       ├── src/preload/            # Electron preload scripts
│       └── tests/                  # Unit / integration / E2E tests
├── packages/
│   ├── shared/                     # @prompthub/shared (MIT) — types + constants
│   └── db/                         # @prompthub/db (MIT) — database layer
│       └── src/                    # schema, adapter, prompt, folder, skill, init
├── website/                        # Static landing site (independent, not in workspace)
└── docs/                           # Project documentation
```

## Key Commands (all run from repo root)

```bash
pnpm electron:dev     # Start Electron dev mode
pnpm build            # Production build (main + renderer + CLI)
pnpm lint             # ESLint (must pass before commit)
pnpm test:run         # Full unit test suite (Vitest)
pnpm test:e2e         # Playwright E2E tests
```

## Mandatory Rules

- Never auto `git commit/push` — wait for explicit user instruction
- No `.md` files in `src/` — docs go in `docs/`
- No mock data, TODO placeholders, empty catch blocks
- Run `pnpm lint` after every frontend change
- Sync all related files when modifying a feature (components, types, store, i18n, tests)
- All user-facing strings must use i18n (`t()`) — no hardcoded Chinese in source code
- All 7 locales must be updated when adding i18n keys

## Code Standards

- TypeScript: prefer `interface`, prohibit `any` / `@ts-ignore` / `as any`
- Naming: `camelCase` for functions/variables, `PascalCase` for components/classes/interfaces, `UPPER_SNAKE_CASE` for constants
- IPC channels defined in `packages/shared/src/constants/ipc-channels.ts`
- Database queries must use parameterized placeholders (`?`), never string concatenation
- Path aliases: `@/` = `src/main/`, `@renderer/` = `src/renderer/`, `@shared/` = `packages/shared/src/`

## For complete development rules, see `AGENTS.md`.
