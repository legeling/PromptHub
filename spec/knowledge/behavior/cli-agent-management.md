# CLI Agent Management

## Stable Boundary

- PromptHub CLI exposes Agent management as the top-level `agent` resource.
- Agent identities come from the canonical built-in/custom platform registry; the CLI does not create a separate Agent Profile catalog.
- Agent-related CLI mutations use the same SQLite `settings` keys as desktop: `builtinAgentOverrides`, `customAgents`, `customAgentRootPaths`, `disabledPlatformIds`, `agentIdentityPreferences`, and the built-in root-path compatibility projection.
- CLI inventory and detail reuse `packages/core/src/agent-management` and the shared capability inventory. Capability states remain `supported`, `partial`, `planned`, or `unsupported` and must not be promoted by presentation code.

## Supported Workflow

- `agent list|get` inspects enabled built-in/custom Agents, detection/configuration status, resolved paths, lifecycle, and capabilities. Disabled Agents are available only through explicit `--include-disabled` queries.
- `agent enable|disable` changes visibility without deleting platform assets.
- `agent add|update|delete` manages custom Agent records. Delete preserves the external root and runtime data.
- `agent configure` manages built-in or custom asset paths; `reset` is built-in-only because custom Agent roots remain required. Custom records may also change paths through `update`.
- `agent config list|read` inspects Agent-native configuration through the shared Core discovery service. Reads are bounded, redact likely secrets, and never modify the source file. Disabled Agents require `--include-disabled`.
- `agent identity get|set` changes the Codex/ChatGPT display preference without changing the stable `codex` platform id.

## CLI path and output regression boundary

- `agent add|update|configure --root` resolves relative inputs against the invoking working directory before persistence. Subsequent commands and processes use the stored absolute root. Existing relative records are not relocated automatically: explicitly configure their intended root again. Reverting the CLI change does not relocate assets or invalidate absolute records.
- Skill distribution, removal, status and implicit scanning use the shared Agent inventory, including configured asset subpaths and environment roots. Agent visibility is not permission to delete assets; explicit removal can still address a disabled Agent.
- `plugin delete --remove-targets` resolves recorded distribution targets using the same package layout as Desktop. Codex/Claude first use the shared native uninstall/registry-verification workflow; a vendor failure preserves the library and package. Without that option, external targets remain intact. An unresolved or unsafe target must fail before deleting library metadata. Native command execution and resource bounds have one Core owner; Desktop retains only its root-configuration adapter.
- MCP command responses, including `env-import`, redact credential values; explicit projection writes real credentials only to the chosen target. `mcp check` checks configuration, not a live protocol handshake.

These CLI corrections do not add storage schemas, provider configuration editing, process lifecycle management or automatic relocation. Workspace export/import uses the existing MCP SQLite snapshot owner, including credential redaction and historical files, instead of treating the retired `library.json` as authoritative. The bundle version stays unchanged; historical inputs use the existing MCP storage migration boundary. No live workspace migration is performed by these CLI fixes.

AI command regression coverage preserves existing behavior: `route-clear` removes only the selected route; `provider-delete` removes the provider profile while retaining self-contained model configurations and their routes. Model removal remains the separate `model-delete` operation.

Regression entrypoints: CLI `agent-root-distribution`, `mcp-command-credentials`, `mcp-process-lifecycle`, `plugin-target-cleanup` and `ai-delete-regressions` tests. Multi-step tests keep one real SQLite/filesystem fixture through reopen and failure to make state preservation observable; these workflow bodies may exceed 50 lines. OS key storage and vendor CLI behavior are injected in credential/native-uninstall tests; they do not claim vendor or OS acceptance. The package-profile gate builds, packs, extracts and invokes the real shipped bin with only declared production dependencies reused locally, without installing globally or using source/tsx fallback.

CLI integration tests share an in-memory master-key-store boundary so fixture credentials do not persist in the user's OS keychain. Workspace sync workflows use the suite's shared per-test timeout rather than a separate shorter override. The total suite runtime budget remains unchanged.

Verified on 2026-10-14 in an isolated source snapshot with existing dependencies: `pnpm --filter @prompthub/cli test` passed 31 files / 159 tests in 68.9 seconds; CLI typecheck, lint and build passed. `pnpm --filter @prompthub/cli verify:package` passed the extracted-tarball bin workflow on macOS. Related Core MCP projection/history/env/sync-policy and Plugin tests passed 36 cases; Desktop native-command/Plugin adapter tests passed 26 cases, and Desktop typecheck passed. The verification-harness suite passed 23 cases. This evidence does not establish GUI, Windows/Linux package, OS keychain or live vendor CLI acceptance.

## Safety And Ownership

- Agent relative asset paths reject absolute paths, traversal segments and NUL before persistence.
- Custom Agent ids must not collide with built-ins or other custom Agents; custom roots are unique case-insensitively.
- A mutation validates the complete next state and writes affected settings in one transaction.
- Registry commands do not edit Agent-native config, secrets, sessions, usage data, appearance state, executables, or package-manager state. Native configuration writes require a portable encrypted-backup boundary before they can be added to the standalone CLI.
- Native configuration reads reject traversal, absolute and excluded paths, symlinked roots/segments, oversized files, and files outside the discovered or declared configuration set.
