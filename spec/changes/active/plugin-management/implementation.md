# Implementation

## Shipped

- Added a Plugin management active change with proposal, design, delta spec, tasks, and implementation record.
- Added stable Plugin behavior documentation defining Plugin as a first-class PromptHub distribution surface.
- Added Codex extension surface reference documentation mapping Skill, Plugin, MCP server, and App/connector boundaries.
- Updated the spec index and Agent platform reference to include Plugin as a durable extension surface.
- Added the built-in marketplace source plan for OpenAI's public `openai-curated` plugin marketplace and PromptHub's own `prompthub-official` marketplace.
- Added `.agents/plugins/marketplace.json` as the PromptHub official marketplace entry point.
- Replaced the too-narrow "Codex-native only" stance with an Agent bundle adapter matrix. Codex is native; Claude Code, Cursor, Gemini CLI, Kiro, and GitHub Copilot / VS Code Agent Plugins are adapter targets; OpenCode and Cline are runtime-only disabled targets; Windsurf/Devin, Roo, and Cherry Studio are composite/lower-priority targets; evidence-limited targets remain pending/disabled.
- Tightened Plugin semantics so single-skill packages and single runtime hook/function modules are not treated as full PromptHub Plugin bundles.
- Added `spec/knowledge/reference/plugin-agent-adapter-matrix.md` as the durable adapter reference for target package markers, install surfaces, generated outputs, disabled targets, and evidence links.
- Implemented shared Plugin contracts in `packages/shared/types/plugin.ts`.
- Implemented `CorePluginLibraryService` in `packages/core/src/plugin-library.ts`.
  - Stores installed Plugin metadata in `<userData>/config/plugin-library.json`.
  - Ships OpenAI `openai-curated` and PromptHub `prompthub-official` built-in marketplace sources.
  - Reads marketplace JSON, resolves Codex plugin manifests, extracts inventory, and enforces the Plugin semantic gate.
  - Exposes lazy marketplace manifest preview with inventory, semantic classification, manifest URL, package path, policy metadata, and Codex detail links.
  - Desktop install can materialize Git-backed marketplace packages into `<userData>/data/plugins/<plugin-id>/repo` without using the GitHub REST API path.
  - Uninstall removes only PromptHub-managed plugin package files when a managed path is recorded.
  - Rejects single-skill packages and runtime-only hook/module packages as full PromptHub Plugins.
  - Exposes the Plugin target matrix with enabled native/adapter targets and disabled runtime-only/composite/pending targets.
- Added desktop Plugin IPC/preload API and renderer Zustand store.
- Added desktop Plugin UI module with `My Plugins`, `Plugin Store`, and `Plugin Targets` views.
  - The Plugin Store defaults to the Codex official `openai-curated` source and keeps an all-sources filter.
  - Store cards can preview manifest details lazily and copy Codex deep links.
- Reworked the `Agent Plugin` view to match the existing `Agent Skill` workspace pattern:
  - Agent Plugin now renders as a left agent target list and right selected-target detail panel instead of a compatibility-card grid.
  - Enabled native/adapter targets remain selectable; runtime-only/composite/pending targets remain visible and greyed out with their unsupported reason in the detail panel.
  - The right panel shows My Plugins inventory cards for the selected supported target and routes users to the Official Store when no Plugin bundle is installed yet.
- Updated the visible UI terminology so the product surface uses `Plugins`, `My Plugins`, `Official Store`, and `Agent Plugin` instead of localized "插件/插件目标" labels.
- Moved Plugin search into the global app top bar while keeping Prompt quick-add/new controls hidden on the Plugins page.
- Removed the Plugin Store content area's in-page search form and category chips; store source selection now comes from the Plugin navigation/sidebar state instead of duplicated list-top filters.
- Simplified My Plugins and Official Store cards so the whole card opens detail and the list no longer renders separate right-side view/install/delete action buttons.
- Fixed Plugin Store detail previews to use manifest-enriched display name and short description, and added an Overview section for the manifest `interface.longDescription`.
- Extended Plugin preview metadata with official manifest presentation fields:
  - `interface.composerIcon` and `interface.logo` are resolved to raw source URLs when they are HTTP(S) URLs or safe package-local relative asset paths.
  - `interface.brandColor` is persisted as a validated hex color.
  - Official Store cards and Plugin detail modals render the resolved icon/logo instead of a letter placeholder when available.
  - Store cards show two-line manifest descriptions and background-enrich the first visible batch of missing entries without fetching the entire marketplace at once.
  - Fixed the background-enrichment effect so React cleanup after the first preview no longer cancels the rest of the visible batch. Visible Official Store cards now dispatch preview requests concurrently and clear only the in-flight marker after each request settles.
- Added Plugin navigation to the desktop home rail/sidebar and the Appearance settings home-module list.
- Added Plugin i18n keys across all seven desktop locales.

## Verification

- `pnpm --filter @prompthub/desktop test:run tests/unit/main/plugin-library.test.ts tests/unit/stores/settings-desktop-workspace.test.ts -- --runInBand`
- `pnpm --filter @prompthub/desktop test:run tests/unit/main/ipc-index.test.ts -- --runInBand`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop test:run tests/unit/components/sidebar.test.tsx tests/unit/components/appearance-settings.test.tsx -- --runInBand`
- `pnpm --filter @prompthub/desktop test:run tests/unit/components/plugin-manager.test.tsx tests/unit/components/top-bar.test.tsx -- --runInBand`
- `pnpm --filter @prompthub/desktop test:run tests/unit/main/plugin-library.test.ts tests/unit/components/plugin-manager.test.tsx -- --runInBand`
- `pnpm --filter @prompthub/desktop test:run tests/unit/components/plugin-manager.test.tsx -- --runInBand`
- `pnpm --filter @prompthub/desktop build`
- `pnpm exec prettier --check apps/desktop/src/renderer/stores/plugin.store.ts apps/desktop/src/renderer/components/layout/Sidebar.tsx apps/desktop/src/renderer/components/layout/TopBar.tsx apps/desktop/src/renderer/components/plugin/PluginManager.tsx apps/desktop/tests/unit/components/plugin-manager.test.tsx apps/desktop/tests/unit/components/top-bar.test.tsx spec/changes/active/plugin-management/specs/plugins/spec.md spec/changes/active/plugin-management/tasks.md spec/changes/active/plugin-management/implementation.md`
- `pnpm exec prettier --check packages/shared/types/plugin.ts packages/core/src/plugin-library.ts apps/desktop/src/main/ipc/plugin.ipc.ts apps/desktop/src/preload/api/plugin.ts apps/desktop/src/renderer/stores/plugin.store.ts apps/desktop/src/renderer/components/plugin/PluginManager.tsx apps/desktop/tests/unit/main/plugin-library.test.ts apps/desktop/src/renderer/i18n/locales/en.json apps/desktop/src/renderer/i18n/locales/zh.json apps/desktop/src/renderer/i18n/locales/zh-TW.json apps/desktop/src/renderer/i18n/locales/ja.json apps/desktop/src/renderer/i18n/locales/fr.json apps/desktop/src/renderer/i18n/locales/de.json apps/desktop/src/renderer/i18n/locales/es.json spec/changes/active/plugin-management/proposal.md spec/changes/active/plugin-management/design.md spec/changes/active/plugin-management/specs/plugins/spec.md spec/changes/active/plugin-management/tasks.md spec/changes/active/plugin-management/implementation.md spec/knowledge/behavior/plugins.md .agents/plugins/marketplace.json`
- `node -e 'for (const f of ["en","zh","zh-TW","ja","fr","de","es"]) JSON.parse(require("fs").readFileSync("apps/desktop/src/renderer/i18n/locales/"+f+".json","utf8")); console.log("locales ok")'`
- `git diff --check`
- Verified against current project document routing rules and existing Skill/MCP boundary docs.
- Verified local Codex CLI exposes plugin marketplace management commands and currently lists `openai-curated` as a configured marketplace.
- Verified `https://raw.githubusercontent.com/openai/plugins/main/.agents/plugins/marketplace.json` is public JSON with marketplace name `openai-curated` and display name `Codex official`.
- Verified the current `openai-curated` marketplace contains 173 entries on 2026-06-15.
- Verified current OpenAI curated sample manifests:
  - `plugins/linear/.codex-plugin/plugin.json` contains package-level `skills` plus `apps` inventory.
  - `plugins/slack/.codex-plugin/plugin.json` contains package-level `skills` plus `apps` inventory.
  - `plugins/openai-developers/.codex-plugin/plugin.json` contains package-level `skills`, `apps`, and `mcpServers` inventory.
- Verified `https://raw.githubusercontent.com/openai/plugins/main/plugins/slack/.codex-plugin/plugin.json` uses package-level `skills` plus `apps` inventory, matching the complete-bundle semantic gate.
- Verified official or primary docs for the relevant bundle concepts: Claude Code plugins, Gemini CLI extensions, Cursor plugins, Kiro powers, GitHub Copilot CLI plugins, VS Code Agent Plugins, and Windsurf/Cascade separate assets.
- Verified OpenCode and Cline docs use "plugin" for runtime hook/module or `AgentPlugin` entrypoint mechanisms, so they are documented as runtime-only disabled targets rather than first-version bundle adapters.
- OpenAI Codex manual helper returned a current local manual at `/var/folders/9x/th9myr3d15lfc6zlzr54nlw40000gn/T/openai-docs-cache/codex-manual.md`; the relevant sections used were `Build plugins`, `Plugins`, and Codex plugin deep links. Public official Codex pages:
  - `https://developers.openai.com/codex/skills`
  - `https://developers.openai.com/codex/plugins`
  - `https://developers.openai.com/codex/plugins/build`

## Synced Docs

- `spec/knowledge/behavior/plugins.md`
- `spec/knowledge/reference/codex-extension-surfaces.md`
- `spec/knowledge/reference/plugin-agent-adapter-matrix.md`
- `spec/knowledge/behavior/README.md`
- `spec/knowledge/reference/README.md`
- `spec/knowledge/reference/agent-platforms.md`
- `spec/README.md`

## Follow-ups

- Implement custom Git/SSH/HTTP/local source scan UI and installer.
- Implement Plugin child asset import/distribution through existing Skill and MCP flows.
- Add path traversal, symlink escape, rollback, duplicate identity, large inventory, SSH source, and no-code-execution tests before expanding installer writes.
- Decide how Plugin-managed child assets should be updated or removed after they have been copied into My Skills/My MCP or distributed to external agent targets.
- Decide whether plugin library metadata should migrate from JSON to SQLite/hybrid storage when child bindings, update history, sync, or Assistant actions ship.
