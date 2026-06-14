# Tasks

- [x] Create active change docs for Plugin management planning.
- [x] Add delta spec for Plugin as a first-class distribution surface.
- [x] Add stable knowledge docs for Plugin behavior and Codex extension surface mapping.
- [x] Sync Plugin references into the spec index and Agent platform asset reference.
- [ ] Decide Plugin source of truth: JSON library, SQLite, or hybrid DB metadata plus repo directory.
- [ ] Define shared plugin contracts in `packages/shared`.
- [ ] Implement static plugin source scan in `packages/core` with no code execution.
- [ ] Implement install/update/uninstall rollback semantics.
- [ ] Add desktop IPC/preload API for plugin management.
- [ ] Build Plugin module UI: My Plugins, Plugin Store, Plugin Detail, Agent Plugins.
- [ ] Reuse Skill/MCP distribution flows for child assets.
- [ ] Add Agent Assistant callable action contract for plugin install/distribute.
- [ ] Add regression tests for manifest parsing, path traversal, symlink escape, duplicate identity, rollback, large inventories, SSH source scanning, and no execution during scan.

## Traceability

- `T-PLUGIN-001`: Define Plugin shared types and package/source/inventory model. Covers `FR-PLUGIN-001`, `DES-PLUGIN-001`, `TEST-PLUGIN-001`.
- `T-PLUGIN-002`: Implement static source intake for store, Git HTTPS, Git SSH, HTTP(S), and local folder. Covers `FR-PLUGIN-003`, `DES-PLUGIN-004`, `TEST-PLUGIN-002`.
- `T-PLUGIN-003`: Implement manifest and inventory scan with no code execution. Covers `FR-PLUGIN-004`, `FR-PLUGIN-005`, `DES-PLUGIN-005`, `TEST-PLUGIN-003`.
- `T-PLUGIN-004`: Implement install/update/uninstall and child asset distribution rollback. Covers `FR-PLUGIN-006`, `DES-PLUGIN-002`, `DES-PLUGIN-004`, `TEST-PLUGIN-004`.
- `T-PLUGIN-005`: Expose Assistant-callable scan/install/distribute actions behind the same confirmations as UI. Covers `FR-PLUGIN-008`, `DES-PLUGIN-001`, `TEST-PLUGIN-005`.

## Verification Plan

- `TEST-PLUGIN-001`: Plugin fixture with multiple child assets renders as Plugin inventory, not one Skill.
- `TEST-PLUGIN-002`: SSH Git source scan uses local git path and does not require anonymous GitHub API metadata.
- `TEST-PLUGIN-003`: Malicious fixture with scripts, path traversal, null byte, and symlink escape is rejected without executing code.
- `TEST-PLUGIN-004`: Partial install failure leaves no half-written plugin metadata, repo files, or child bindings.
- `TEST-PLUGIN-005`: Assistant action tests prove install/distribute requests call the same API and preserve confirmation gates.
