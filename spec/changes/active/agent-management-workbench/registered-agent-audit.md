# Registered Agent audit — 2026-10-14

Scope: all 37 `AGENT_DEFINITIONS` entries, effective capability gates, shared
configuration/root resolution, provider ownership, MCP/Skills/Rules/Plugins,
session entrypoints/resume, quota caching and existing recovery tests. This is a
PromptHub source/isolated-fixture audit, not certification of 37 installed native
applications or a fresh upstream protocol audit. Existing disabled/planned
capabilities remain disabled. No live user configuration or credentials are
modified and no user CLI update/install command is run.

## Registry coverage

Every row is included in the registry/root regression. P = enabled Provider,
S = enabled sessions (including partial readers), U = enabled quota,
A = enabled appearance. A dash means no enabled depth capability, not no assets.
Existing platform asset declarations, support gates and tests remain the
authority; a declared file path alone is not native acceptance evidence.

| Registered id | Enabled depth | Main audit boundary |
| --- | --- | --- |
| claude | P S U | Config/MCP scoped roots, ownership, credentials, session index |
| deepseek-harness | — | Plugin-owned harness, no independent asset writes |
| copilot | S | Partial snapshot reader; VS Code target independent |
| cursor | S | Snapshot reader, MCP override |
| cherry-studio | S | Selected-root SQLite session reader |
| doubao | — | Path/asset discovery only |
| windsurf | S | MCP/rules asset root distinct from transcript root |
| kiro | S | Environment/selected root, partial sessions |
| gemini | S | MCP/extensions, selected-root session index and backup |
| antigravity | P S U | Desktop assets distinct from CLI model/session root |
| trae | — | Path/asset discovery only |
| trae-cn | — | Independent identity, path/asset discovery |
| trae-work | — | Independent identity, path/asset discovery |
| trae-work-cn | — | Independent identity, path/asset discovery |
| opencode | P S | Merged provider config and native ownership; CLI session source |
| pi | P S | Native catalog, shared MCP targets, scoped resume |
| oh-my-pi | S | Independent YAML config/plugin root, scoped resume |
| cline | S | Selected-root partial snapshot reader/MCP |
| codex | P S U A | Root/cache/resume, provider ownership, encrypted recovery |
| kimi | S U | Current root, OAuth ownership, scoped resume/cache |
| reasonix | S | Discovery-only TOML MCP; explicit session root |
| augment | S | MCP and selected session root |
| zcode | — | MCP preset and asset paths |
| grok | S | Environment MCP root and scoped resume |
| qwen | S | Relative environment root, explicit runtime root/list/resume |
| kilo | S | MCP config and XDG session storage are different roots |
| amp | — | MCP preset and asset paths |
| openclaw | S | MCP config and selected session root |
| copaw | S | Explicit root vs native runtime defaults |
| autoclaw | — | Path/asset discovery only |
| nanoclaw | S | Explicit root vs native runtime defaults |
| qclaw | — | Path/asset discovery only |
| qoder | S | MCP and selected session root |
| qoderwork | — | Independent identity, path/asset discovery |
| hermes | S | Explicit root vs native runtime defaults |
| codebuddy | — | MCP preset and asset paths |
| workbuddy | — | MCP preset and asset paths |

## Confirmed defects and changes

1. Most primary MCP presets duplicated default paths and ignored Agent overrides;
   Desktop forwarded only three overrides, CLI forwarded none. All 22 existing
   primary targets now resolve via registry metadata and persisted overrides.
   The five shared/application targets remain independent. No new target is enabled.
2. Core default root resolution ignored Qwen's declared relative environment-root
   contract. It now agrees with inventory/desktop discovery without extending
   relative-root support to other Agents.
3. Desktop session factory discarded supported root options. Gemini, Augment,
   Cherry Studio and Qoder now receive selected roots; Gemini backup descriptors
   and indexing use the same root. Six separate runtime-root adapters honor
   explicit user overrides while retaining their native defaults otherwise.
4. Qwen's native list subprocess and resume command lost the selected runtime
   scope. Both now receive `QWEN_RUNTIME_DIR`; filesystem containment stays enforced.
5. Codex, Grok and Pi-family resume commands lost their selected native roots.
   The typed/validated resume environment now carries those roots. Shell quoting
   and launch-artifact cleanup are tested without opening a terminal application.
6. Codex quota caching was keyed only by Agent id and could show a previous
   root's quota. The shared cache scope now includes the resolved root, captured
   once before query dispatch. No new TTL, retry or request limit is introduced.
7. Renderer quota cache and effect dependencies used only Agent id. Cache keys
   now include the selected root; changing roots triggers a new request and hides
   the previous root's state immediately. Late responses from a departed root are
   ignored. Old unscoped derived cache entries are not imported as account truth.
8. Workspace panels were keyed only by Agent id, so changing that Agent's root
   could retain the previous session/config/provider panel state. The workspace
   panel identity now includes the selected root; root changes reset child state
   and the asset-detail header state while preserving the selected workspace tab.

Earlier Kimi/OpenCode fixes are recorded in `implementation.md`; this audit
does not claim unrelated dirty-checkout fixes as its own work.

## Data and recovery

No schema, native config rewrite, installation, account migration or persisted
MCP binding migration. Existing bound deployments keep their saved target paths;
new preset selections use current Agent overrides. Source rollback restores the
previous resolver behavior, without rewriting user files. New tests use temporary
homes/SQLite/native fixtures and remove them in teardown. Existing atomic-write,
external-change detection and encrypted-backup tests are included in verification.

## Verification

Final scoped result: **2,796 distinct tests passed, 4 native-gated tests skipped**
across 308 selected files, consolidated from the broad runs and affected-file
reruns below. This is not a claim that one all-green full-repository command ran.

| Check | Final scoped evidence |
| --- | --- |
| Desktop unit/service/component | 245 files / 2,430 passed |
| Desktop integration | 33 selected files / 192 passed / 4 skipped |
| Core Agent/MCP | 18 files / 123 passed |
| CLI Agent/MCP/plugin workflows | 6 files / 14 passed |
| Shared Agent contracts | 6 files / 37 passed |
| Desktop and CLI TypeScript | Passed |
| Affected-file ESLint and `git diff --check` | Passed |
| `pnpm build` | Passed: renderer, main and preload |

The initial 237-file Desktop unit run reported 2,284 passed / 26 failed. The
failures exposed one MCP preset ordering regression, stale Qwen resume/Kimi path
expectations and stale installer mocks/derived-root assertions. The original
preset order was restored; assertions now enforce current native-root contracts.
The ten-file repair batch passed 196 tests. The final workspace/cache/plugin
batch passed another 40 tests (overlap excluded from the totals above).

The first wide integration attempt reached the task's five-minute process limit
without a final report and is not counted as a pass. The bounded rerun completed
in 224 seconds: 186 passed / 2 failed / 4 skipped. Both failures were test
contract mismatches: macOS canonical `/private/var` paths versus `/var` aliases,
and an attempted Codex-to-Antigravity conversion despite the native-manifest
requirement. Tests now compare canonical package paths and assert that unsupported
conversion fails without creating a target. Both passed their focused rerun;
production path containment and plugin format guards were not relaxed.

The integration evidence includes 35 directory-platform Skill copy/link,
inventory, reopen and uninstall workflows; 28 MCP workflows; 23 Rules workflows;
provider activation/recovery; plugin child Skill/MCP imports; and selected-root
settings/session persistence. Historical plugin child-Skill import failure was
not reproduced in the current package-lifecycle integration tests.

New and extended regression entrypoints:

- `agent-registry-root-contract.test.ts`: all registry roots, environment contracts,
  primary-vs-shared MCP targets, Codex account-root cache isolation.
- `agent-registry-entrypoints.test.ts`: real preload/registered MCP IPC, persisted
  roots and reopen; real Gemini session factory/index/SQLite/readback and reopen.
- CLI `mcp-agent-root.test.ts`: configure Agent → preset apply → file readback → remove.
- Existing session fixtures assert scoped resume; launcher executes a real shell
  with a harmless executable and checks literal environment values and cleanup.
- Renderer hook regression changes roots while the old request is in flight and
  checks visible state and persistent cache isolation after the late response.
- Workspace regression switches the selected Agent's root after loading a real
  component transcript, then checks a new list request, cleared transcript and
  preserved sessions tab (the IPC response itself is a fixture).

Focused reproduction from repository root:

```sh
pnpm --dir apps/desktop exec vitest run tests/unit/main/agent-registry-root-contract.test.ts tests/unit/main/agent-session-index-operations.test.ts tests/unit/services/agent-terminal-launcher.test.ts tests/unit/components/agent-usage-root.test.tsx tests/unit/components/agents-workspace.test.tsx tests/integration/agent-registry-entrypoints.test.ts tests/integration/release-acceptance-agents-assets-plugin-mcp.test.ts tests/integration/release-acceptance-agents-assets-plugins.test.ts
pnpm --dir apps/cli exec vitest run tests/mcp-agent-root.test.ts
pnpm --dir apps/desktop exec tsc --noEmit -p tsconfig.test.json
pnpm --dir apps/cli exec tsc --noEmit
pnpm build
```

No dev server or native application was started. Verification processes exited;
test fixtures close SQLite and remove their temporary homes. The interrupted
run's identified fixture was removed without touching pre-existing resources.
Shared dirty-checkout edits were preserved; no commit, push or branch was created.

## Explicitly unverified or limited

The later screenshot follow-up found two additional defect areas outside the
original fixture coverage: usage transport bypassed system proxy settings, and
fixed-height card metadata/native provider titles clipped at the user's layout.
They are repaired with a separate 196-test scoped verification recorded in
`implementation.md` under “Screenshot follow-up: quota proxy and clipped labels”.
Those results do not retroactively turn this audit into native GUI/account
acceptance; the original totals above remain the original audit's evidence.

- No GUI automation, Electron native window interaction, signed installer or packaged
  application acceptance; no Windows/Linux native execution or terminal launch.
- Four native-gated cases were deliberately not enabled: three in
  `native-plugin-installation.test.ts` and one in `antigravity-mcp-native.test.ts`.
  The complete release harness and unrelated repository suites were not run.
- No real-account login, OAuth renewal, paid model request, live quota query,
  real package install/update or upstream CLI resume. Provider/network tests use
  controlled fixtures at those external boundaries.
- No fresh version-by-version upstream audit for all 37 products. Paths whose
  stable reference marks evidence limited/inferred retain that limitation.
- OpenCode MCP effective merging across JSON/JSONC, environment/project overlays,
  and native session data-root ownership need dedicated upstream/runtime acceptance.
- Kilo and Windsurf use session roots distinct from their asset roots; a generic
  asset-root override is not treated as authorization to invent a native storage mapping.
- Antigravity desktop quota/credential selection has a separate local application
  scope; a custom asset root is not evidence of switching that running account.
- Existing same-root account replacement within the cache TTL is not a new
  account-change invalidation contract. Force refresh remains the current mechanism.
- Disabled provider/usage/appearance capabilities and discovery-only MCP declarations
  are not claimed as working native adapters.
