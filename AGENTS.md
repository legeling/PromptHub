# Repository Guidelines

## Project Structure & Module Organization
- `src/main/`: Electron main process (IPC, menus, updater, SQLite).
- `src/preload/`: preload bridge and IPC-safe APIs.
- `src/renderer/`: React UI (components, i18n, stores, services, styles).
- `src/shared/`: shared types/constants for main and renderer.
- `resources/`: app icons and static assets.
- `tests/unit/` and `tests/e2e/`: Vitest unit tests and Playwright E2E specs.
- `docs/`, `website/`, `scripts/`: docs, marketing site, and maintenance scripts.
- Root configs: `vite.config.ts`, `vite.web.config.ts`, `electron-builder.json`, `vitest.config.ts`, `playwright.config.ts`.

## Build, Test, and Development Commands
- `pnpm install`: install dependencies (pnpm is the expected package manager).
- `pnpm dev`: run Vite dev server for the renderer.
- `pnpm electron:dev`: run renderer + Electron app together for local desktop dev.
- `pnpm dev:web`: run the web-targeted Vite config.
- `pnpm build`: build renderer assets with Vite.
- `pnpm electron:build` (or `electron:build:mac|win|linux`): package the desktop app.
- `pnpm rebuild`: rebuild native deps (e.g., `better-sqlite3`) after Electron updates.
- `pnpm lint`, `pnpm format`, `pnpm typecheck`: code quality gates.

## Coding Style & Naming Conventions
- TypeScript + React; keep patterns consistent with existing files in `src/`.
- Indentation is 2 spaces and semicolons are used; run `pnpm format` before PRs.
- React components and files use PascalCase (e.g., `MainContent.tsx`).
- Functions/variables use `camelCase`; folders are lower-case or kebab-case.

## Testing Guidelines
- Unit/integration: Vitest (`tests/unit/**/*.test.ts`), run with `pnpm test` or `pnpm test:run`.
- Coverage: `pnpm test:coverage` for coverage reports.
- E2E: Playwright specs in `tests/e2e/**/*.spec.ts`, run `pnpm test:e2e`.
- Add tests for new behavior and regressions; target the closest module (service/store/UI).

## Commit & Pull Request Guidelines
- Commit history commonly follows Conventional Commits (`feat:`, `fix:`, `chore:`) with optional scopes (e.g., `fix(ui): ...`); release commits may use `Release x.y.z` or `v0.x`.
- Preferred branch prefixes: `feature/`, `fix/`, `docs/`, `refactor/`.
- PRs should link relevant issues, describe the change, pass tests, and update docs when needed. Fill the PR template if present.
