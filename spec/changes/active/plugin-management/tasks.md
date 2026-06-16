# Tasks

- [x] Create active change docs for Plugin management planning.
- [x] Add delta spec for Plugin as a first-class distribution surface.
- [x] Add stable knowledge docs for Plugin behavior and Codex extension surface mapping.
- [x] Sync Plugin references into the spec index and Agent platform asset reference.
- [x] Define built-in OpenAI curated and PromptHub official marketplace source URLs.
- [x] Add PromptHub official marketplace JSON entry point at `.agents/plugins/marketplace.json`.
- [x] Define Agent bundle adapter matrix across Codex, Claude Code, Cursor, Gemini CLI, Kiro, GitHub Copilot / VS Code Agent Plugins, runtime-only OpenCode/Cline, Windsurf/Devin, Roo, Cherry Studio, and pending targets.
- [x] Add detailed Plugin Agent Adapter reference with target package markers, install surfaces, adapter outputs, disabled targets, and evidence sources.
- [x] Tighten Plugin semantic gate so single-skill packages and runtime hook modules are not treated as full Plugin bundles.
- [x] Decide Plugin source of truth for MVP: `config/plugin-library.json`, with later SQLite/hybrid migration left open for child bindings and sync.
- [x] Define shared plugin contracts in `packages/shared`.
- [x] Implement marketplace manifest parsing and semantic bundle classification in `packages/core` with no code execution.
- [x] Implement install/delete metadata persistence for marketplace plugins.
- [x] Add lazy Codex marketplace manifest preview with version, author, inventory, semantic classification, manifest URL, package path, policy metadata, and Codex deep link.
- [x] Make the Plugin Store default to the Codex official `openai-curated` source while keeping an all-sources filter.
- [x] Download marketplace plugins into PromptHub's managed `data/plugins` workspace during desktop install using Git transport, with installed records pointing at managed/local package paths.
- [x] Clean PromptHub-managed plugin package files on uninstall without deleting external child assets or user-owned paths.
- [x] Add desktop IPC/preload API for plugin management.
- [x] Build Plugin module UI: My Plugins, Plugin Store, Plugin Targets.
- [x] Align Agent Plugin with Agent Skill's workbench pattern instead of a detached compatibility-card grid.
- [x] Move Plugin search into the global top bar, remove in-page category filters, and simplify Plugin cards to whole-card detail entry.
- [x] Render Plugin manifest display name, short description, and long overview in the store detail modal after preview loads.
- [x] Render Plugin manifest official icons/logos, brand color, and richer card descriptions from preview metadata, with capped background enrichment for the first visible Official Store entries.
- [x] Fix Official Store preview prefetch so the visible batch enriches every card instead of only the first card after React effect cleanup.
- [x] Persist Plugin Store manifest preview metadata in a local cache so reopening the store shows official icons/descriptions without refetching every manifest.
- [x] Simplify Official Store card badges by removing redundant official trust chips from official-source cards and making inventory counts human-readable.
- [x] Rename the store surface to `Plugins Store` / `Plugins 商店` while keeping concrete source provenance as `Codex Official Store` / `Codex 官方商店`.
- [x] Keep card inventory focused on user-facing capabilities and omit `Apps` connector chips from store cards while preserving full inventory in detail.
- [x] Expand directory-based Codex manifest `skills` fields through the GitHub repository tree so official plugins with multiple nested `SKILL.md` files do not display as one Skill.
- [x] Align the first-level Plugin Store sidebar entry with Skill Store by removing marketplace item-count pills from that navigation row.
- [x] Replace installed Plugin detail modal with a full My Plugins detail page, including preview/source/files tabs and Agent Plugin target selection entry.
- [x] Align installed Plugin detail Files tab height with the Skill inline file editor layout so the editor fills the available page area after sidebar resize/collapse.
- [x] Align installed Plugin detail distribution panel with the Skill platform integration panel and persist manifest long descriptions for the detail preview.
- [x] Align My Plugins installed cards with the large My Skill gallery card scale instead of compact list cards.
- [x] Align My Plugins list controls and card hover behavior with My Skills: distribution-status/source filters, text batch-manage button, distributed target badges, and quick open/distribute/folder/delete actions.
- [x] Make My Plugins distribute actions use the paper-plane icon and open a direct Agent target picker instead of routing users to the Agent Plugin workbench.
- [x] Move My Plugins distribution/source filters into the header panel and remove the redundant card detail-eye action so installed Plugin cards match My Skills interaction density.
- [x] Replace placeholder Plugin target selection with real Plugin package distribution through core/main IPC, supporting copy and symlink modes.
- [x] Resolve enabled Agent Plugin targets to configured Agent plugin directories and record successful `distributedTargetIds`.
- [x] Extend Agent Configuration settings with MCP config and Plugin directory relative paths, including derived path previews for built-in and custom agents.
- [x] Add Plugin module to desktop home navigation and home-module settings.
- [x] Add i18n coverage for Plugin UI across all supported desktop locales.
- [ ] Reuse Skill/MCP distribution flows for child assets.
- [ ] Add Agent Assistant callable action contract for plugin install/distribute.
- [ ] Add full regression coverage for path traversal, symlink escape, duplicate identity, rollback, large inventories, SSH source scanning, and no execution during scan.

## MVP Verification Completed

- [x] Core Plugin library tests cover marketplace parsing, manifest inventory extraction, semantic bundle classification, single-skill rejection, runtime-module rejection, JSON library persistence, and target matrix disabled states.
- [x] Core Plugin library tests cover directory-based official Skill inventory expansion through GitHub tree fixtures.
- [x] Settings desktop workspace tests cover adding Plugin into legacy default home modules and preserving user-hidden modules.
- [x] Sidebar and appearance settings tests pass with Plugin added to the home module set.
- [x] PluginManager component tests cover the Agent Plugin split layout, My Plugins inventory list, disabled-target detail state, Plugins Store naming, official provenance badges, and card-level inventory chips.
- [x] PluginManager component tests cover Skill-style My Plugins filters, large installed-card hover target badges, and hover quick actions.
- [x] PluginManager component tests cover direct Agent target selection from both installed Plugin detail and My Plugins card paper-plane actions.
- [x] PluginManager component tests cover My Plugins header-mounted filters and absence of a separate detail-eye quick action.
- [x] Core Plugin library tests cover package copy distribution to resolved Agent Plugin paths, unsupported target rejection, and `distributedTargetIds` persistence.
- [x] Skill Settings tests pass after adding derived MCP config and Plugin directory path previews.
- [x] Desktop typecheck passes with new IPC/preload/renderer contracts.

## Traceability

- `T-PLUGIN-001`: Define Plugin shared types and package/source/inventory model. Covers `FR-PLUGIN-001`, `DES-PLUGIN-001`, `TEST-PLUGIN-001`.
- `T-PLUGIN-002`: Implement static source intake for store, Git HTTPS, Git SSH, HTTP(S), and local folder. Covers `FR-PLUGIN-003`, `DES-PLUGIN-004`, `TEST-PLUGIN-002`.
- `T-PLUGIN-003`: Implement manifest and inventory scan with no code execution and semantic bundle classification. Covers `FR-PLUGIN-001`, `FR-PLUGIN-004`, `FR-PLUGIN-005`, `DES-PLUGIN-005`, `TEST-PLUGIN-003`, `TEST-PLUGIN-007`.
- `T-PLUGIN-004`: Implement install/update/uninstall and child asset distribution rollback. Covers `FR-PLUGIN-006`, `DES-PLUGIN-002`, `DES-PLUGIN-004`, `TEST-PLUGIN-004`.
- `T-PLUGIN-005`: Expose Assistant-callable scan/install/distribute actions behind the same confirmations as UI. Covers `FR-PLUGIN-008`, `DES-PLUGIN-001`, `TEST-PLUGIN-005`.
- `T-PLUGIN-006`: Implement Plugin Targets compatibility UI with `Native`, `Adapter`, `RuntimeOnly`, and `Composite` target statuses. Covers `FR-PLUGIN-009`, `DES-PLUGIN-006`, `TEST-PLUGIN-006`.

## Verification Plan

- `TEST-PLUGIN-001`: Plugin fixture with multiple child assets renders as Plugin inventory, not one Skill.
- `TEST-PLUGIN-002`: SSH Git source scan uses local git path and does not require anonymous GitHub API metadata.
- `TEST-PLUGIN-003`: Malicious fixture with scripts, path traversal, null byte, and symlink escape is rejected without executing code.
- `TEST-PLUGIN-004`: Partial install failure leaves no half-written plugin metadata, repo files, or child bindings.
- `TEST-PLUGIN-005`: Assistant action tests prove install/distribute requests call the same API and preserve confirmation gates.
- `TEST-PLUGIN-006`: Compatibility matrix tests prove Codex appears as native; Claude Code/Cursor/Gemini/Kiro/GitHub Copilot appear as adapter candidates; OpenCode/Cline appear as runtime-only disabled targets; Windsurf/Roo/Cherry Studio appear as composite or lower-priority targets; and evidence-limited targets remain pending/disabled.
- `TEST-PLUGIN-007`: Semantic gate tests prove single `SKILL.md` sources and single JS/TS hook modules are not rendered as full Plugin bundles.
