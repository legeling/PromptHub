# Gemini Context: PromptHub

## 1. Project Overview
**PromptHub** is a local-first, cross-platform desktop application for managing AI prompts. It allows users to organize, version control, and test prompts across multiple AI models.

- **Type:** Desktop Application (Electron)
- **License:** AGPL-3.0
- **Version:** 0.3.3

### Tech Stack
- **Runtime:** Electron 33
- **Frontend:** React 18, TypeScript 5, Vite
- **Styling:** Tailwind CSS (with design tokens like `bg-card`, `text-muted-foreground`)
- **Icons:** Lucide React
- **State Management:** Zustand
- **Database:** SQLite (`better-sqlite3`)
- **Testing:** Vitest (Unit), Playwright (E2E)
- **I18n:** i18next / react-i18next

## 2. Architecture
The application follows the standard Electron process model:

### Main Process (`src/main`)
- Handles native OS interactions, file system access, and database operations.
- **Entry:** `src/main/index.ts`
- **Database:** Direct SQLite access via `better-sqlite3`. Schema defined in `src/main/database/schema.ts`.
- **IPC:** Exposes functionality to the renderer via `ipcMain` handlers.

### Renderer Process (`src/renderer`)
- A React SPA responsible for the UI/UX.
- **Entry:** `src/renderer/main.tsx`
- **Communication:** Uses `window.api` (exposed via `contextBridge` in `src/preload/index.ts`) to call Main process methods.

### Data Layer
- **Local Storage:** SQLite database (`prompthub.db`) stores prompts, versions, folders, and settings.
- **Search:** Uses SQLite FTS5 for full-text search.
- **Sync:** WebDAV support for backup and sync.

## 3. Key Commands

| Command | Description |
| :--- | :--- |
| `pnpm install` | Install dependencies |
| `pnpm electron:dev` | Start dev server (Vite + Electron) |
| `pnpm build` | Build for production (Main + Renderer) |
| `pnpm electron:build` | Build and package the application |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:e2e` | Run end-to-end tests (Playwright) |
| `pnpm lint` | Run ESLint |
| `pnpm format` | Format code with Prettier |

## 4. Directory Structure

```text
PromptHub/
├── src/
│   ├── main/                 # Electron Main Process
│   │   ├── database/         # SQLite schema and helpers
│   │   ├── ipc/              # IPC handlers implementation
│   │   ├── services/         # Business logic (e.g., AI integration)
│   │   └── index.ts          # Entry point
│   ├── renderer/             # React Frontend
│   │   ├── components/       # UI Components
│   │   ├── hooks/            # Custom React Hooks
│   │   ├── services/         # Frontend services (AI clients, etc.)
│   │   ├── stores/           # Zustand stores
│   │   └── i18n/             # Localization
│   ├── preload/              # Electron Preload Scripts
│   └── shared/               # Shared Types and Constants
│       ├── constants/        # IPC channel names, etc.
│       └── types/            # TS interfaces (Folder, Prompt)
├── resources/                # Static assets (icons)
├── tests/                    # Test suites
│   ├── unit/                 # Vitest specs
│   └── e2e/                  # Playwright specs
├── electron-builder.json     # Packaging config
└── package.json              # Dependencies and scripts
```

## 5. Key Conventions

### IPC Communication
- **Channel Definitions:** All IPC channel strings are defined in `src/shared/constants/ipc-channels.ts`.
- **Pattern:** Renderer invokes `window.api.method()`, which calls `ipcRenderer.invoke()`. Main process handles with `ipcMain.handle()`.

### Database Schema
- **Prompts:** Stores title, content, variables, tags, and folder association.
- **Prompt Versions:** Stores history of prompt changes (`prompt_versions` table).
- **Folders:** Hierarchical structure with `parent_id`.
- **FTS:** `prompts_fts` virtual table for search.

### Component Styling
- **Tailwind CSS:** Used exclusively.
- **Theme:** Supports Dark/Light modes using CSS variables/Tailwind classes (e.g., `dark:` prefix or class-based strategy).
- **Icons:** `lucide-react` is the standard icon set.

### Internationalization
- **Library:** `react-i18next`
- **Usage:** `const { t } = useTranslation();`
- **Keys:** Structured keys (e.g., `folder.create`, `common.cancel`).

## 6. Development Workflow
1.  **Modify:** Edit React components in `renderer` or backend logic in `main`.
2.  **IPC:** If adding new features requiring backend access, update `ipc-channels.ts`, implement handler in `main/ipc`, and expose via `preload`.
3.  **Test:** Run `pnpm test` for logic verification.
4.  **Commit:** Use Conventional Commits (e.g., `feat: ...`, `fix: ...`).
