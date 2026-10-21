# Implementation

## Product

Desktop

## Status

in progress. Platform adapters and acceptance tasks remain in tasks.md.

- Code changes: registry, core Managed Agent query, shared workspace shell, allowlisted native config, bounded read-only session adapters, Provider Profile persistence, Provider adapter registry, three-way reconciliation and asset aggregation foundations, complete Claude/Codex/Gemini/Kimi/Qwen/OpenCode/Grok Provider adapters, current Oh My Pi compatibility, and the Codex Appearance adapter implemented

## Doubao Work Skill target (2026-09-02)

- `FR-AGENT-137 -> DES-AGENT-156 -> TEST-AGENT-218 -> T-AGENT-227`.
- Registered Doubao Work as a built-in, launchable macOS Agent and routed the
  existing whole-package Skill lifecycle to the verified
  `workspace/.user_skills` directory. The sibling product-owned `.skills`
  inventory and shared Codex/Agents directories remain outside the target.
- Provider, MCP, Rules, Plugins, Config Files, Sessions, Usage, and maintenance
  were intentionally not inferred. The UI reuses the existing Doubao provider
  mark without adding a second brand asset. Windows/Linux application-data
  templates remain overrideable and are not claimed as locally verified.
- Verification passed: focused registry/capability/icon suites (3 files, 42
  tests), the affected icon rerun after existing-asset reuse (19 tests), all 48
  shared-package tests, Desktop and Shared typechecks, affected ESLint,
  Prettier, file-size governance, traceability, generated change-index check,
  diff hygiene, and the Desktop production build.
- A live macOS cycle against Doubao 2.27.10 used the production installer
  service to copy a temporary whole-package Skill, including a nested reference
  file, into the real `.user_skills` target. Doubao discovered the Skill,
  uploaded it, and reported `READY`; replacing it with a V2 package was detected
  as a local edit and returned to `READY` after upload.
- Production uninstall removed the local package, returned the PromptHub status
  to not installed, and Doubao's My Skills search returned zero results. The
  real `.user_skills` directory was restored to its empty baseline, temporary
  fixtures were removed, and the Doubao processes started for the check were
  stopped. Doubao attempted the associated cloud deletion, but its cached
  record remained `DELETE_PENDING` during the bounded test window, so remote
  deletion convergence is not yet claimed. Doubao also refreshed product-owned
  `.skills` content while running; PromptHub never targeted that directory.

## Plugin local-source projection correction (2026-08-25)

- `FR-AGENT-136 -> DES-AGENT-155 -> TEST-AGENT-217 -> T-AGENT-226`.
- Completed. The canonical bundle remains the durable Plugin authority; only
  the original bounded absolute local source locator is stored in the existing
  device-owned projection. Legacy projections remain readable, and missing,
  malformed, or symbolic-link source roots fail before publication.
- Verification passed: 19 canonical tests with focused coverage, 51 related
  Plugin tests, Core and Desktop typechecks, traceability, Prettier, production
  build, and one real Electron lifecycle covering import, package durability,
  distribution/removal, restart, source update, old-package snapshot, delete,
  and final restart absence.
- The real update exposed a separate snapshot-order defect; its root cause,
  fix, and verification are recorded in `ISS-20260825-007` and committed
  independently.

## Plugin canonical materialization correction (2026-08-25)

- `FR-AGENT-135 -> DES-AGENT-154 -> TEST-AGENT-216 -> T-AGENT-225`.
- Canonical-mode Plugin imports, source updates, Git packages, and snapshot
  restores now materialize outside `data/plugins`. Storage publishes the package
  into its stable-ID canonical bundle, returns the reread canonical paths, and
  removes the consumed materialization. Legacy metadata mode keeps its existing
  layout.
- Verification status is recorded in
  `ISS-20260825-005-plugin-canonical-materialization-collision.md`.
- Verification passed: 14 canonical Plugin tests, 51 related Plugin tests,
  core and desktop typechecks, Prettier, traceability, production build, and one
  real Electron import, distribution, removal, restart, delete, and
  final-restart lifecycle. The same run exposed a separate local-source
  projection gap recorded as
  `ISS-20260825-006-plugin-local-source-projection-missing.md`.

## Non-secret MCP encryption-gate correction (2026-08-25)

- `FR-AGENT-134 -> DES-AGENT-153 -> TEST-AGENT-215 -> T-AGENT-224`.
- Canonical MCP secret-store staging now requires device encryption only when
  the transaction contains extracted secret values. Empty secret maps can use
  the full canonical lifecycle in unsigned runtimes; non-empty secrets retain
  the existing fail-closed boundary.
- Verification status is recorded in
  `ISS-20260825-004-mcp-non-secret-encryption-gate.md`.
- Verification passed: 5 focused secret-store tests, 17 canonical MCP library
  tests, desktop typecheck, Prettier, traceability, production build, and one
  real Electron lifecycle covering create/read/update, two restarts, canonical
  bundle durability, delete, and final absence.

## Undetected Agent usage side-effect correction (2026-08-25)

- `FR-AGENT-133 -> DES-AGENT-152 -> TEST-AGENT-214 -> T-AGENT-223`.
- The shared main-process usage service now verifies the resolved Agent root
  before any adapter work. An absent Agent cannot trigger credential reads,
  process discovery, an Antigravity background helper, or network requests
  through startup tray refresh.
- Verification passed: 120 focused usage-service tests, desktop typecheck,
  traceability, production build, and one real Electron startup/tray scan. Full
  evidence is recorded in
  `ISS-20260825-003-agent-usage-undetected-side-effect.md`.

## Provider display-label identity correction (2026-08-25)

- `FR-AGENT-132 -> DES-AGENT-151 -> TEST-AGENT-213 -> T-AGENT-222`.
- Removed the active case-insensitive Provider name index and added the
  `allow_duplicate_agent_provider_profile_names_v1` migration. Stable profile
  IDs remain the identity across DB rows, canonical bundles, restart, and
  projection rebuild. Canonical rebuild no longer archives same-name profiles
  through a name-derived winner; no name-derived renderer or IPC behavior was
  added.
- Verification passed: 14 desktop DB/migration tests, 22 core canonical
  projection tests, desktop and core typechecks, traceability, production build,
  and 4 real Electron Provider workbench tests.

## Skill delete ownership correction (2026-08-25)

- `FR-AGENT-131 -> DES-AGENT-150 -> TEST-AGENT-212 -> T-AGENT-221`.
- Kept the existing managed/external deletion boundary and corrected the detail,
  batch, and seven-locale confirmation copy. Managed packages and version state
  are deleted; linked external source folders are preserved.
- Focused Vitest passed 23 tests, the desktop production build passed, and the
  real Electron Skill lifecycle passed with two restarts plus durable DB and
  filesystem assertions.

## DeepSeek Harness Agent management order upgrade (2026-08-14)

- Reproduced the missing-looking Agent row with an older persisted order that
  predates `deepseek-harness`: the new registry item was appended after every
  saved entry instead of being merged near Codex.
- Added one registry-aware preference merge shared by Skill ordering and Agent
  Management. DeepSeek Harness now enters older orders immediately after Codex
  while all previously saved relative ordering remains intact.
- Kept title and icon ownership in the shared platform registry and
  `PlatformIcon`; the management row therefore uses `DeepSeek Harness` and the
  official theme-aware fish mark rather than a renderer-local fallback.
- Focused Agent ordering and Settings component tests passed 25/25; the official
  PlatformIcon suite passed 18/18. Desktop typecheck, affected ESLint,
  repository spec governance, `git diff --check`, and all 29 checks in
  `pnpm verify:release:quick` passed. Full CI remains pending until the commits
  are pushed.

## Shared polymorphic Provider & Model workbench (2026-08-01)

- Replaced the `AgentsWorkspace` Pi-only branch with one `AgentProviderModelWorkbench` entry for every Agent. The entry selects the native catalog or unified Provider Profile adapter without creating separate product navigation or page ownership.
- Applied the same card-based master/detail visual contract to Pi providers, Provider Profiles and current native provider state: left white provider cards, a right provider information card, model inventory below and bottom-aligned create actions.
- Moved Pi `defaultThinkingLevel` out of provider metadata and into the current model row. The persisted Pi setting remains global because that is Pi's native contract, but the UI now presents it as model invocation configuration rather than provider identity.
- Kept existing Profile connection/model tests for supported Agent adapters and added a real Pi model-test adapter. Pi resolves managed `auth.json` or `$ENV` credentials only in main memory, dispatches through the existing OpenAI/Responses/Anthropic/Google probe layer, requires quota confirmation and returns only redacted timing/status/output fields.
- Focused verification: 123 tests passed across shared workspace, Provider Profile, Pi catalog/write/test and IPC paths; desktop typecheck and affected ESLint passed.

## Pi custom Provider and model editing (2026-08-01)

- Added custom Pi Provider update for `baseUrl` and API protocol while preserving models, environment references and unknown provider fields.
- Added custom Pi model update and rename for display name, `contextWindow`, `maxTokens` and `reasoning`, while preserving unknown model fields and rejecting duplicate IDs.
- Added dedicated provider/model update IPC channels, main-process payload validation and typed preload methods; renderer payloads remain non-secret.
- Added provider and per-model edit actions to the Pi right detail pane. Credential replacement remains a separate write-only action.
- Added real-file write tests, IPC routing/validation tests and renderer interaction tests. Focused result: 57 tests passed; desktop typecheck, affected ESLint and `git diff --check` passed.

## Pi Provider workbench visual correction (2026-08-01)

- Reproduced the Chinese UI regression where newly added Pi metadata labels rendered as raw `agents.piModels.*` keys.
- Added a seven-locale key contract test and completed API protocol, endpoint, configuration source, credential source, model source, output limit and thinking-level labels.
- Extracted the Pi provider detail into `AgentPiProviderDetail.tsx` and reorganized it into provider identity/actions, metadata, default thinking and model inventory sections while preserving the left-provider/right-detail split.
- Built-in and custom sources are now explicit; destructive custom-provider removal is a secondary icon action rather than a competing primary button.
- Verified with 26 focused component tests, desktop TypeScript, affected ESLint and `git diff --check`.

## Provider Profile deep-link batch (2026-07-29)

- Added `DES-AGENT-061` in `deep-link-designs.md` to define the first
  versioned `prompthub://import` slice.
- The design adapts CC Switch's preview-and-confirm workflow but keeps parsing,
  persistence, secure credential custody and activation inside PromptHub's
  existing shared/Electron/Provider boundaries.
- The first allowed object type is `provider-profile`. Existing Skill, MCP,
  Rule and Plugin domains remain rejected until their owning contracts expose
  an equivalent portable preview.
- Literal credentials are rejected rather than accepted through an OS-visible
  URL. The deep link may declare `requiresSecret`; the user adds that secret
  through PromptHub's existing secure form after import.
- No database, backup, native Agent configuration or credential contract
  changes in this batch. Implementation and `TEST-AGENT-079` are pending.

## CC Switch reuse clarification (2026-07-29)

- Reconfirmed the external research checkout at
  `/Users/lingxiaotian/Programs/public/cc-switch` is the MIT `v3.18.0`
  baseline (`606e7bbe75db7f8285f7a3be006fac22b5d22796`); the remote tag inventory
  contained no later stable tag at verification time.
- CC Switch remains an approved Provider and credential workflow reference.
  Selective source-level reuse is allowed for a bounded component when its
  provenance, license, ownership boundary and PromptHub tests are recorded.
  Whole-repository copying and bundling the checkout into an application
  `public/` directory remain prohibited.
- No CC Switch runtime source, dependency or asset was incorporated in this
  documentation batch. Existing PromptHub Profile, `safeStorage`, DB, IPC and
  activation services remain the implementation source of truth.

## Provider endpoint credential exclusion (2026-07-29)

- Completed `FR-AGENT-045`, `DES-AGENT-051`, `TEST-AGENT-070` and
  `T-AGENT-106`. Provider endpoint and credential inputs remain distinct:
  endpoint metadata now accepts only bounded HTTP(S) URLs without embedded
  userinfo, fragments or control characters.
- The shared validator protects SQLite create, update and row projection.
  The Profile form uses the same boundary before IPC and shows localized
  feedback in all seven locales. Validation flags are computed independently
  from the post-submit display state, so the first Save click cannot bypass
  endpoint, provider-id, environment-key or platform-specific model guards.
- A legacy unsafe row fails closed with a stable
  `AGENT_PROVIDER_ENDPOINT_INVALID` error whose text contains no endpoint or
  credential. No automatic legacy-row rewrite was added because choosing
  between discard, secure-store extraction and manual repair is a separate
  credential migration decision.
- Test-first verification began with the missing shared export and a real
  SQLite assertion that accepted URL credentials. The completed shared suite
  has 100% line, branch and function coverage for the public config/endpoint
  validator; the focused DB/Profile service/IPC suite passes 38 tests, the
  Profile form suite passes 3 tests, and the seven-locale regression passes 7
  tests. No CC Switch runtime code or asset was incorporated.

## Provider public JSON persistence boundary (2026-07-29)

- Completed `FR-AGENT-046`, `DES-AGENT-052`, `TEST-AGENT-071` and
  `T-AGENT-107`. Profile config, model mapping parameters and Provider audit
  snapshots now use the same bounded public-JSON validator on SQLite writes
  and reads.
- Expanded the sensitive-key policy to cover API/auth tokens, private keys,
  authorization headers and secure-store references without rejecting public
  readiness fields such as `credentialStatus` and `secretRequired`.
- Provider baseline recovery now reuses the shared policy instead of a weaker
  local regex. Direct writes and legacy/external rows containing credentials
  fail closed with stable errors; failed snapshot writes leave no row and no
  error includes the rejected credential.
- Test-first verification reproduced both the accepted unsafe snapshot and the
  accepted `apiToken` baseline before implementation. The shared suite passes
  with 100% line, branch and function coverage; the focused DB and activation
  repository suites pass 17 tests. No schema, migration, credential copy,
  runtime dependency or CC Switch source was added.

## Provider Profile portable full backup (2026-07-29)

- Completed `FR-AGENT-048`, `DES-AGENT-054`, `TEST-AGENT-073` and
  `T-AGENT-109`. Full desktop backups may now carry one optional version-one
  Agent section containing Provider Profile public metadata, model mappings
  and bounded redacted activation snapshots.
- The shared parser allows at most 1,000 Profiles, 100 mappings per Profile
  and 5,000 snapshots. It rejects extra fields, credential-bearing public JSON,
  secure-store/native-backup references, duplicate durable identities and
  broken snapshot references before mutation.
- Export is main-owned and excludes secret values, secret references, local
  encrypted-config backup references, Agent roots, session indexes and
  transcript bodies. Restore replaces Agent rows in one SQLite transaction,
  preserves Profile/snapshot ids, clears local backup refs and reports
  same-device available versus missing credentials through Profile ids only.
  Legacy backups without the optional section leave existing Agent data
  untouched.
- Test-first verification initially failed because the shared parser,
  main-process service, IPC/preload methods and desktop backup section did not
  exist. The completed shared gate passes 10 tests with 100% line, branch and
  function coverage for both backup and public-config validators. The
  main-service/IPC/preload/renderer gate passes 4 files / 16 tests with 100%
  line, branch, function and statement coverage for the new service and IPC;
  the broader backup regression passes 5 files / 62 tests.
- Shared, database and desktop typechecks, affected desktop ESLint, Prettier,
  `pnpm spec:test` and `git diff --check` pass. New and touched batch files
  remain below 1,500 lines. The repository file-size gate still reports three
  pre-existing unrelated preferred-limit violations:
  `SkillStore.tsx` (1,536), `SkillStoreDetail.tsx` (1,536) and
  `agent-provider-profile-workbench.test.tsx` (1,512); none was expanded by
  this batch.
- `T-AGENT-023` remains open for Agent selective export, session-source
  preferences and cross-device path repair; this batch does not claim those
  capabilities.

## Agent-aware selective and Full Backup ZIP export (2026-07-29)

- Completed `FR-AGENT-049`, `DES-AGENT-055`, `TEST-AGENT-074` and
  `T-AGENT-110`. Data Settings now exposes a default-enabled, independently
  selectable Agents scope in all seven locales. It controls only the portable
  Provider Profile section and does not absorb Settings or owning-domain
  Skills/MCP/Rules/Plugins data.
- Fixed a verified implementation discrepancy: direct JSON export included
  `agentManagement`, but Full Backup and pre-upgrade ZIP export reused a
  selective scope that had no Agent bit and therefore dropped the section.
  Both complete flows now pass `agents: true`.
- Disabling Agents omits the section and skips the main-process export call,
  avoiding unnecessary DB/secure-boundary work and preventing an excluded
  domain from blocking an otherwise valid selective export. Older envelopes
  without the scope bit remain importable because restore keys off the optional
  payload section.
- Test-first verification failed five assertions across Full Backup,
  pre-upgrade backup, selective payload and the settings selector. A second
  red test showed the disabled scope still queried Agent management. The
  completed focused gate passes 3 files / 34 tests. The broader backup,
  settings and seven-locale regression gate passes 8 files / 96 tests.
  Desktop typecheck, affected desktop ESLint, Prettier, `pnpm spec:test` and
  `git diff --check` pass. The repository file-size gate remains red only for
  the same three unrelated preferred-limit violations:
  `SkillStore.tsx` (1,536), `SkillStoreDetail.tsx` (1,536) and
  `agent-provider-profile-workbench.test.tsx` (1,512); none was expanded by
  this batch. This export-scope batch left session-source preferences and
  cross-device path repair to the following portability batch.

## Portable session preference rebinding (2026-07-29)

- Completed `FR-AGENT-050`, `DES-AGENT-056`, `TEST-AGENT-075`,
  `T-AGENT-111` and the remaining `T-AGENT-023` / `TEST-AGENT-014`
  compatibility boundary. The optional Agent backup section now carries only
  bounded `platformId`, `adapterId` and `enabled` session preferences.
- Export queries at most 129 newest-first device-local source rows to enforce
  the 128-row bound, keeps the newest preference per platform and serializes it
  only when the current main-process registry resolves a persistent session
  descriptor. Roots, adapter versions, cursors, scan state, annotations,
  indexed metadata and transcript content remain excluded.
- Restore resolves each preference against the current device descriptor and
  registers the current root and adapter version. Unsupported preferences are
  reported as bounded keys without creating placeholder paths. A legacy Agent
  section without preferences leaves current session settings unchanged.
- Provider replacement and all resolved session preference writes share one
  outer SQLite transaction. An injected session write failure proves Provider,
  mapping, snapshot and session state roll back together.
- Test-first failures covered missing optional-format support, absent export and
  restore wiring, preference-only Agent sections, unsupported sources and
  cross-domain rollback. The completed shared suite passes 12 tests with 100%
  line, branch and function coverage. The broader desktop gate passes 10 files
  / 89 tests; dedicated service and descriptor coverage passes 2 files / 20
  tests with 100% statement, line, branch and function coverage.
- Shared, database and desktop typechecks, affected desktop ESLint, Prettier,
  `pnpm spec:test` and `git diff --check` pass. All batch source and test files
  remain below 1,000 lines. The repository file-size gate remains red only for
  the same three unrelated preferred-limit violations:
  `SkillStore.tsx` (1,536), `SkillStoreDetail.tsx` (1,536) and
  `agent-provider-profile-workbench.test.tsx` (1,512).
- A regression run exposed that the first descriptor resolver path initialized
  the configured PromptHub database through an unrelated platform-context
  dependency. The resolver now constructs the verified Claude/Gemini session
  descriptor directly from the current home and an absolute Claude override,
  performs no PromptHub database access and returns `null` for unsupported
  persistent indexes. Both the live database and the automatically created
  pre-migration recovery copy passed SQLite integrity checks; the recovery copy
  was preserved rather than deleted or used to overwrite current user data.

## Completed Documentation

- 建立以现有预置 Agent 为一级对象的 Agent Management Workbench active change。
- 将 Agent Profile/Persona 降为后续组合能力，不再作为第一阶段主数据模型。
- 核对 CC Switch 官方能力并记录 current/target/phase 覆盖矩阵。
- 明确 Provider Profile、模型映射、原生配置导入、三方对账、安全切换、验证和回滚边界。
- 明确 Skill、MCP、Rules、Plugin 继续由原资产域拥有，Agent 页面只聚合状态并调用 owning service。
- 记录会话索引、模型测试、tray、backup、CLI lifecycle、deep link、proxy 分期。
- 记录 secure secret、filesystem、IPC、process、network 和 privacy 边界。
- 完成统一 Agent list/detail shell、十个稳定一级 tabs、capability 置灰规则、各页面状态、响应式布局和 renderer 组件拆分设计。
- 生成并纳入 `assets/agent-workbench-overview.png` 作为第一版获批视觉基线，同时在 `ui-design.md` 区分规范性结构与示例数据。
- 建立 `FR -> DES -> TEST -> T` 追踪关系和 test-first 实施顺序。
- 完成 31 个内置平台的 machine-readable capability inventory：深度 adapter 逐平台显式声明，路径与 launch 能力从 canonical registry 派生，custom Agent 不继承相似目录的深度协议；renderer 的 provider/session/usage 状态不再维护第二份平台 allowlist。
- 新增 Managed Agent projection，从启用 built-in/custom 平台、检测结果、路径覆盖与用户置顶派生统一列表；用户禁用的平台在 projection 边界排除。
- 新增一级 Agents 导航、仅搜索列表和统一详情 Shell；移除低价值的状态筛选与备用排序控件，默认排序保持置顶、检测/配置、常用优先级和名称稳定顺序。
- 桌面首页默认顺序调整为 `Prompts -> Agents -> Skills -> MCP -> Plugins -> Rules`；新用户直接使用新顺序，settings v17 一次性迁移旧的完整默认顺序和更早的三模块默认顺序，迁移后的完整自定义顺序保持不变。
- Overview、Skills、MCP、Rules、Plugins、Maintenance 使用现有真实路径和 owning module；Provider、Sessions 按平台 adapter 独立启用，Usage 在 adapter 完成前保持 planned/disabled。
- 更新桌面模块持久化迁移、托盘 `agent:manage` 命令和 7 locales。
- 根据首轮视觉验收重做 Agent 工作区层级：列表改为带边框、图标、状态、路径和明确选中态的操作卡片；详情头部补齐上下文主操作、图标操作和更接近获批稿的摘要/路径结构。
- 删除通用 Assets tab；Skill、MCP、Rules、Plugin 直接提升为顶部一级页签，每个页面独立显示真实清单、数量、路径、语义色和空状态，不增加二级菜单。
- 重做详情区域视觉层级：不透明 header/card surface、彩色 summary band、资产域语义色、明确的 active tab 和独立内容面板，避免浅色主题下整片灰化。
- 启用 capability-aware `Config Files` 一级页签：仅已声明并验证配置路径的平台可操作，其余平台继续置灰，不因路径未知而猜测文件名。
- 为 Claude Code、Codex CLI、Gemini CLI、OpenCode、Cline、Kimi、Reasonix、Augment、ZCode、Grok Build、CodeBuddy 和 WorkBuddy 接入已验证的用户级配置文件声明。
- 新增 `agent:*` main/preload IPC 域；main process 解析 Agent root，拒绝绝对路径、盘符、空字节、`..` 和未声明文件，并复用现有 realpath/symlink 受控文件 IO。
- 复用 `SkillFileEditor` 的受限模式：支持读取、编辑和保存允许的文本配置，允许保存缺失的声明文件；隐藏任意新建、重命名、删除和目录操作，不触发 Skill WebDAV 保存同步。
- Config Files 页提供已有 shell path action 的“打开 Agent 文件夹”入口；本批不创建 PromptHub 配置快照、版本或恢复记录。
- Electron E2E 使用隔离临时 HOME 和无敏感信息 fixture，避免测试或截图读取开发机真实 Agent 配置。
- 新增 Claude、Codex、Gemini、OpenCode、OpenClaw 非敏感模型配置 adapter：结构化读取平台原生配置，只更新模型相关字段，保存前建立本地备份，写后重新解析验证；Codex 明示 TOML 注释/排版可能变化。
- Provider 状态只返回供应商、脱敏 endpoint、模型和凭据 readiness；endpoint 会移除 user info、query 和 fragment，API key/token 不进入 renderer、日志或普通配置快照。
- 新增 Claude、Gemini、OpenCode 只读 session adapter：Claude/Gemini 使用限定根目录、文件数、metadata/detail bytes 和 entry bytes 的容错文件读取；OpenCode 使用 `session list --format json` 与 `export --sanitize`，不递归扫描其数据目录。
- OpenCode metadata listing now uses the bounded, read-only `opencode db`
  projection because `session list` filters by the caller's working directory
  and returned a false empty state when PromptHub launched elsewhere. The same
  query returns one page plus total/message/size metadata; sanitized export,
  native delete, and native resume ownership are unchanged.
- OpenCode follow-up verification passed the 12-test session service suite,
  desktop typecheck, targeted ESLint, `git diff --check`, traceability, and the
  production renderer/main/preload build. A read-only live probe from `/tmp`
  returned the current global session with 4 messages and 3,145 bytes in 0.44s,
  while cwd-scoped `session list` returned no rows there.
- Sessions 页支持本地列表、搜索、按需 transcript、截断提示和恢复命令复制；不编辑 transcript，不提供通用 raw-file 删除。
- Provider & Model 和 Sessions 按 capability 启用，其他平台继续显示但对应 tab 置灰，不把“平台可见”与“深度管理已实现”混为一谈。
- 将 Kimi 平台从旧版 `kimi-cli` 假设升级到独立 Kimi Code：保持稳定 `kimi` identity，默认根目录改为 `~/.kimi-code`，并按 PromptHub override、`KIMI_CODE_HOME`、current default、`KIMI_SHARE_DIR`、legacy `~/.kimi` 的优先级兼容已有安装。
- Kimi Config Files 现声明 `config.toml`、`tui.toml`、`mcp.json`，资产根声明 `skills/`、`plugins/` 和 `AGENTS.md`；renderer 使用 main process 返回的已解析根目录，避免检测、资产和配置页面各自推断路径。
- 新增 Kimi TOML model adapter：只读取/更新 `default_model` 及其非敏感 provider 元数据，过滤 key/token，使用备份、原子写入、重新解析和 `kimi doctor config <path>` 验证；验证失败自动恢复原文件。
- 新增独立 Kimi session adapter：从追加式 `session_index.jsonl` 的有界尾部读取最新索引，按上限读取 `sessions/<id>/state.json` 与 `agents/main/wire.jsonl`，识别官方 wire event，隔离畸形行并拒绝路径/realpath/软链接越界。会话正文只读，恢复命令为 `kimi --session <id>`。
- Kimi Electron E2E 使用隔离 HOME 构造 current root、TOML 和 wire fixture，验证 Provider & Model、Sessions、transcript 与现有统一 Agent UI；本批没有新增用户文案，继续复用已覆盖 7 locales 的通用标签。
- 新增稳定的 Appearance 一级页签；Codex 启用原生外观、桌面皮肤和 Pet 三个同页区域，其他 Agent 继续显示同一页签并按 capability 置灰，不引入 Assets 或二级菜单。
- 桌面皮肤固定复用 Codex Dream Skin `1.2.0`、commit `3af1d6d62f3a0388cc640d2f497ac3100998938e` 的 MIT 运行时快照；仅携带运行代码、许可证和中性 Dream Portal 主题，不包含名人、角色、赞助或其他权利不明确的预设。
- Theme service 使用 Dream Skin `theme.json + local image` 目录合同，覆盖严格校验、受限预览、导入/导出、原子 active staging、应用、恢复、删除、advisory last-applied state 和失败回滚；main process 调用上游 macOS/Windows start、verify、restore 入口，通过 loopback CDP 注入，不修改 Codex 应用包、`app.asar` 或签名。
- Pet service 直接管理 resolved Codex root 下的 `pets/<id>`，只接受受控 `pet.json` 与 PNG/WebP spritesheet；扫描、预览、原子导入、导出和确认删除均拒绝路径穿越、软链接、畸形或超限输入，不复制到 SQLite、backup 或 sync。
- Pet 卡片不再把整张 spritesheet 当普通图片显示；renderer 根据清单版本按 v1 `8x9`、v2 `8x11` 合同裁切首行，以 Codex 的六帧 idle 节奏循环播放。系统启用 reduced motion 时固定在首帧，不额外生成或持久化 GIF 副本。
- 内置 `codex` 的默认用户可见名称统一为 `Codex`，移除 `CLI` 后缀；设置页新增 Codex/ChatGPT 名称与图标两组独立选择及实时预览。稳定平台 id、`~/.codex`、provider、session、asset、appearance 与 IPC 合同保持不变。
- ChatGPT 图标不再复用通用 OpenAI provider 标识；改为打包本机 ChatGPT.app `Assets.car` 中完整的 1024x1024 Aqua / Dark Aqua Blossom 资源，并由 PromptHub 当前主题切换，运行时不读取外部应用包。
- Codex/ChatGPT 名称与图标分段控件采用实色主色背景、主色描边、对比文字和显式勾选标记，选中状态不再依赖难以分辨的浅阴影；保留 `aria-pressed` 与键盘焦点状态。
- `agentIdentityPreferences.codex` 作为非敏感展示设置进入 Zustand 持久化和既有 settings snapshot；hydrate 对名称和图标逐字段执行 `codex | chatgpt` 白名单规范化，拒绝任意路径、data URL 或远程图标。Managed Agent 投影在排序、搜索和 list/detail 渲染前统一解析名称和图标，并在设置变更后即时刷新内存投影。
- 为避免继续扩张超长设置文件，将原有 GitHub Token 设置区等价抽到 `GithubTokenSettings.tsx`；`SkillSettings.tsx` 从 1565 行降至 1488 行，既有交互回归保持通过。
- Appearance main IPC、preload API、renderer hook 和 UI section 独立分层；7 locales 已同步，electron-builder 将固定 Dream Skin 运行时作为 unpacked extra resource 携带，并保留 LICENSE、NOTICE、版本和上游 commit 记录。
- 依据 Google 2026-05-19 官方迁移公告修正产品生命周期：Antigravity CLI (`agy`) 与 Antigravity 2.0 是普通用户当前入口；Gemini CLI 自 2026-06-18 起停止服务 Free、Google AI Pro 和 Ultra 用户，仅保留企业、Google Cloud 和付费 API Key 支持。
- 将 `antigravity` 标记为 current 并排在 `gemini` 前；内置显示名统一为 `Antigravity` 与 `Gemini`，不携带 `CLI` 后缀；`gemini` 标记为 enterprise-legacy 并指向 Antigravity，在详情中显示 7 locales 的迁移提示，但不在列表或标题旁重复显示兼容标签；同时保留原 id、路径和 adapter，避免破坏企业用户与既有资产。
- 将 Antigravity 管理根从桌面运行态 `~/.gemini/antigravity` 修正为官方共享定制根 `~/.gemini/config`，声明 `skills/`、`mcp_config.json`、`plugins/` 和共享 `~/.gemini/GEMINI.md`；CLI/桌面会话、缓存、凭据、更新器和 artifact 继续由产品运行时拥有。
- 完成 Qwen Code 第一批实现：以独立 built-in id `qwen` 接入平台 registry 和官方图标；按 `PromptHub override -> QWEN_HOME -> ~/.qwen` 解析配置根，并保持 `QWEN_RUNTIME_DIR` 仅用于会话运行态。Skills 同时发现原生 `<root>/skills` 与只读兼容 `~/.agents/skills`，MCP 支持用户/项目 `settings.json` 的 `mcpServers`，Rules 支持全局 `QWEN.md`，Extensions 按父 bundle 发现，Provider/Model 只投影脱敏字段，Sessions 使用有界原生 CLI 列表和受控 JSONL 读取。原始 `settings.json` 不进入 Config Files 编辑器，Usage 保持 planned；项目 SubAgent/Commands 专用工作区和完整 Electron E2E 仍属于 `TEST-AGENT-036` 后续门禁。
- 完成 Oh My Pi (#187) 第一批实现：以独立 built-in id `oh-my-pi` 接入平台 registry，默认根为 `~/.omp/agent`，并支持 `PI_CODING_AGENT_DIR`；声明 `skills/`、`RULES.md`、`mcp.json`、项目 `.omp/mcp.json`、兄弟 `../plugins` 和 allowlisted config files。MCP 使用原生 `mcpServers` JSON key。新增有界只读 JSONL session adapter：只扫描 `<root>/sessions` 下一层的项目 transcript，读取标题、cwd、模型和可见 user/assistant/tool 记录，统计畸形行，拒绝嵌套 subagent、软链接和不安全 id，并提供 `omp --resume <id>` 元数据。Provider/Usage、凭据、插件安装和 profile/XDG 扩展保持 planned，不写入或同步 Oh My Pi transcript。
- Agent 详情头部 ⋯ 菜单的“打开 Agent 设置”改为工作台内“编辑 Agent”弹窗，不再切换到应用设置页。弹窗复用 `BuiltinAgentEditor` 与现有 settings actions：内置 Agent 编辑 root/Skills/MCP/Rules/Agents/Config/可用 Plugin 路径及 Codex 身份，自定义 Agent 同时编辑名称和启用状态；Reset 只重置草稿，Save 后沿原同步链路刷新 managed Agent projection。
- 移除 Agent 详情头部重复的“管理 Skills”主按钮；右上角仅保留启动 Agent、刷新和更多操作，Skills 统一从 Overview 卡片或顶部 Skills 页签进入。
- 补齐常用 Agent 的只读历史会话：`codex` 同时索引 active/archived rollout JSONL 并按 session id 去重，ChatGPT 展示身份继续复用同一稳定 id 和 `~/.codex`；Grok Build 读取限定的 summary/chat history；OpenClaw 从每个 Agent 的 `sessions.json` 定位受控 transcript；Qwen Code 使用原生有界 JSON 列表后只读取 runtime root 内的 realpath。四个 adapter 均限制扫描数、metadata/detail bytes 和单条文本长度，隔离畸形记录，不编辑或同步平台 transcript。
- Sessions capability 现在对 Claude、Codex、Gemini、Grok Build、Kimi Code、OpenClaw、OpenCode、Qwen Code、Oh My Pi 启用；Windsurf、Copilot、Cline、Cursor 和 Antigravity CLI 对各自有证据的本地 transcript/store 提供 partial、只读浏览。Antigravity 只读取当前 CLI `.db` identity、cache 项目映射和 generated transcript projection；legacy desktop `.pb` 与 SQLite protobuf body 保持排除。OpenCode 原生命令在当前工作区没有会话并返回空 stdout 时按空列表处理，不再误报解析失败。
- Sessions capability 现在也对 Oh My Pi 启用；其 JSONL adapter 使用固定上限和直接项目目录扫描，nested subagent transcripts 保持排除。Oh My Pi 不会因为具备 Sessions 而自动获得 provider、usage 或 plugin installation 能力。

## Native Config Evidence

- Codex CLI: `~/.codex/config.toml` and project `.codex/config.toml` — <https://learn.chatgpt.com/docs/config-file/config-reference>
- Claude Code: user `~/.claude/settings.json`, project `.claude/settings.json` and local settings — <https://code.claude.com/docs/en/configuration>
- Gemini CLI: user `~/.gemini/settings.json` and workspace `.gemini/settings.json` — <https://geminicli.com/docs/cli/settings/>
- Google Antigravity: shared customizations `~/.gemini/config`, CLI runtime `~/.gemini/antigravity-cli`, desktop runtime `~/.gemini/antigravity` — <https://antigravity.google/docs/skills>, <https://antigravity.google/docs/mcp>, <https://antigravity.google/docs/plugins>, and <https://antigravity.google/docs/cli-using>
- OpenCode: user `~/.config/opencode/opencode.json` and project `opencode.json` — <https://opencode.ai/docs/config/>
- Oh My Pi: user `~/.omp/agent/mcp.json`, project `.omp/mcp.json`, Skills and sessions — <https://github.com/can1357/oh-my-pi/blob/main/docs/skills.md> and <https://github.com/can1357/oh-my-pi/blob/main/docs/session-switching-and-recent-listing.md>
- Cline: user settings under `~/.cline/data/settings/`; credential-bearing `providers.json` is excluded from the raw editor — <https://docs.cline.bot/getting-started/config>
- Additional built-in declarations follow the verified platform inventory in `spec/knowledge/reference/agent-platforms.md`; evidence-limited platforms keep Config Files disabled.
- Claude Code model/session behavior — <https://code.claude.com/docs/en/model-config> and <https://code.claude.com/docs/en/sessions>
- Gemini CLI session storage, resume, listing, deletion and retention — <https://geminicli.com/docs/cli/session-management/>
- OpenCode config/model and session CLI — <https://dev.opencode.ai/docs/config/>, <https://dev.opencode.ai/docs/cli/>, and <https://dev.opencode.ai/docs/troubleshooting/>
- Kimi Code data locations, config, providers, sessions and CLI — <https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html>, <https://moonshotai.github.io/kimi-code/en/configuration/config-files.html>, <https://moonshotai.github.io/kimi-code/en/configuration/providers.html>, <https://moonshotai.github.io/kimi-code/en/guides/sessions.html>, and <https://moonshotai.github.io/kimi-code/en/reference/kimi-command.html>
- Qwen Code settings, Skills, SubAgents, MCP, memory, Commands, Extensions, and sessions — <https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/sub-agents.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/mcp.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/memory.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/commands.md>, <https://github.com/QwenLM/qwen-code/blob/main/docs/users/extension/introduction.md>, and <https://github.com/QwenLM/qwen-code/tree/main/packages/cli/src/commands/sessions>
- Qwen Code icon provenance: upstream `QwenLM/qwen-code` commit `760ffd7a4dc4db7834c68fba6533fa15e17accaa`, `packages/desktop/apps/electron/resources/brands/qwen-code/icon.png`; bundled asset SHA-256 `02dac7ae657ddd32793b55cb63c00497807d1b6cf55343cea2b97120d048839a`.

## Product Decisions Recorded

- Confirmed: built-in/custom Agent platforms are the first-class managed objects.
- Confirmed: the product aims to cover most CC Switch core capabilities while preserving PromptHub asset-management strengths.
- Confirmed: every enabled preset Agent is shown; disabled Agents are hidden, while common, detected, configured, and pinned Agents are prioritized and deep adapters expand independently.
- Recommended, pending confirmation: proxy/failover and OAuth capabilities use separate changes.
- Recommended, pending confirmation: Agent Profile/Persona is deferred beyond the first delivery.

## Verification

- Common Agent history batch (2026-07-22, `FR-AGENT-030`, `DES-AGENT-026`, `TEST-AGENT-038`, `T-AGENT-067`):
  - Focused main/renderer regression passed: 4 files / 36 tests; the isolated Sessions workspace interaction passed: 1 test. The full workspace component file has one unrelated i18n-state failure in the built-in Agent edit-dialog title and was not claimed green.
  - Scoped ESLint, desktop typecheck, production build, Prettier, and `git diff --check` passed. The build retained the existing Rollup chunk-size and mixed static/dynamic import warnings.
  - Read-only current-machine smoke returned metadata without transcript contents: Codex 294 sessions, Grok Build 13, OpenClaw 1, Gemini 58, and Kimi Code 7. OpenCode returned an empty native list and Qwen was not installed on this machine; both cases remain covered by fixtures.
  - V8 coverage for the new adapter/service focus was 95.19% statements, 66.15% branches, 97.01% functions, and 95.19% lines. The remaining uncovered paths are defensive filesystem/format fallbacks; changed behavioral paths are covered, but the repository's 100% branch target is not yet met and remains a merge-gate risk.

- Qwen Code first-class Agent batch (2026-07-22, `FR-AGENT-029`, `DES-AGENT-025`, partial `TEST-AGENT-036`, `T-AGENT-063` in progress):
  - Registry/path: distinct `qwen` identity, official 512x512 icon, default ordering, `QWEN_HOME` override including the documented relative-to-CWD behavior, and strict separation from `QWEN_RUNTIME_DIR`.
  - Assets: complete-package native Skill discovery under `<root>/skills`, read-only compatibility discovery under `~/.agents/skills`, user/project MCP presets, global Qwen rule, and extension parent-bundle inventory. Compatibility Skills can be imported into PromptHub but cannot be uninstalled through the native Qwen target action.
  - Provider/session: structured model inspection and updates preserve unrelated JSON while excluding raw secret-bearing settings from renderer file editing; session listing uses `qwen sessions list --json --limit`, bounds output, isolates malformed rows, validates transcript realpaths, and emits the native `qwen --resume <id>` command.
  - Persistence: Qwen runtime sessions, transcripts, logs, memory, todos, tokens, and auth caches remain platform-owned and are not added to PromptHub database backup/sync payloads.
  - Verification so far: affected Qwen registry/path/model/session/Skill/MCP/Rules/Plugin/icon/UI/backup suites passed (15 files / 258 tests); desktop, shared, and core typechecks passed; seven-locale regression passed (5 files / 36 tests); scoped ESLint, Spec governance/index checks, changed-file formatting, and the desktop production build passed. The build retains only existing chunk-size and mixed static/dynamic import warnings. The file-size gate now reports only the unchanged vendored Dream Skin `injector.mjs` at 1,822 lines; `skill-installer.ts` is 1,431 lines and the database-backup test was reduced to exactly 1,500 lines. Full `TEST-AGENT-036` Electron E2E and the full desktop suite remain pending and are not claimed as complete.

- Oh My Pi first-class Agent batch (2026-07-25, issue #187, `FR-AGENT-033`, `DES-AGENT-029`, `TEST-AGENT-042`, `T-AGENT-071`):
  - Registry and asset boundary: `oh-my-pi` uses `~/.omp/agent` or `PI_CODING_AGENT_DIR`, native `skills/`, `RULES.md`, `mcp.json`, project `.omp/mcp.json`, and a derived sibling plugin path. Generic Terminal icon fallback is used because no bundled official bitmap was added in this batch.
  - Session boundary: the adapter scans only direct project JSONL files below `sessions/`, caps header/metadata/detail reads, deduplicates safe session ids, isolates malformed rows, filters non-visible records, rejects symlinks/path escapes, and returns `omp --resume` metadata without executing or mutating the runtime.
  - Verification: focused Oh My Pi platform/MCP/session tests passed (5 files / 23 tests); the related Agent/MCP/Rules/renderer regression passed (12 files / 122 tests); desktop, core, and shared typechecks, scoped ESLint, Prettier, spec governance/index checks, file-size limits, `git diff --check`, and the desktop production build passed. Focused adapter coverage measured 100% statements, 100% functions, and 78.66% branches; remaining defensive branch variants are documented for follow-up before the active change can converge. Provider, Usage, credentials and plugin package installation remain planned.

- Oh My Pi non-secret model batch (2026-07-27, `FR-AGENT-034`, `DES-AGENT-030`, `TEST-AGENT-043`, `T-AGENT-072`):
  - Model projection reads the preferred `config.yml` or `config.yaml` fallback and the optional `models.yml` catalog from the resolved `~/.omp/agent` root. It returns only the selected `provider/model`, allowlisted model selectors, sanitized `baseUrl`, and presence-only credential readiness; API keys, headers, OAuth data, model metadata, and unknown fields never cross the IPC contract.
  - Updating a model changes only `modelRoles.default`, preserves unrelated YAML/comments as supported by the YAML document writer, creates the existing per-Agent backup, uses atomic replacement, re-reads and verifies, and restores the exact original bytes if verification fails. Secret-bearing `models.yml` remains excluded from the raw Config Files editor; credentials, provider activation, usage/quota, and plugin package installation remain out of scope.
  - Verification: focused model/platform/managed-Agent regression passed (3 files / 31 tests), including missing/config.yaml fallback, malformed and oversized YAML, secret redaction, endpoint sanitization, backup, unknown-field/comment preservation, missing-file creation, invalid selector bounds, credential readiness, and rollback when the provider catalog is invalid. The full desktop unit suite passed (407 files / 3,778 tests); desktop, core, and shared typechecks, scoped desktop ESLint, spec governance, file-size checks, `git diff --check`, and the desktop production build passed. Focused whole-module V8 coverage reached 94.68% statements, 85.29% branches, 100% functions, and 94.68% lines; every added Oh My Pi decision branch is exercised, while untouched legacy Codex/Kimi/JSON recovery branches keep the whole legacy module below the repository-wide 100% branch target. The build retains only the existing chunk-size and mixed static/dynamic import warnings.
  - Evidence re-audit (2026-07-28): upstream revision `cc00ab161b2721e50d8a96a0dc9552abfd258b8b` confirms that native stored API keys/OAuth accounts and broker snapshots are owned by Oh My Pi through `<root>/agent.db`, with additional runtime/environment resolution. The capability therefore remains accurately `partial`: PromptHub supports verified non-secret model selection, but does not read or mutate `agent.db`, migrate native credentials, or claim full Profile endpoint/credential activation. Public contracts were reused as evidence; no upstream source was copied or vendored.

- Skill asset cards batch (2026-07-22, `FR-AGENT-028`, `DES-AGENT-024`, `TEST-AGENT-034`, `T-AGENT-060`):
  - Renderer-only change: the direct Skills tab renders `AgentSkillAssetPanel` through `AgentAssetsWorkspace` — a toolbar (domain title, search, all/managed/unmanaged/copy/symlink filter chips, refresh, and an "Install My Skill" primary action) above a responsive card grid; direct MCP, Rules, and Plugins tabs keep the compact row inventory.
  - Badge semantics reuse `agentScanState[agent.id]` plus `getSkillScanStatus` exactly as `SkillAgentsView`: managed skills show an emerald "In My Skills" badge, external installs amber, otherwise the copy/symlink install badge; platform built-ins show a Built-in badge and no uninstall action; the first three tags render as small badges.
  - Actions map one-to-one to existing flows: open folder via `window.electron.openPath`, adopt into My Skills via `useSkillStore.importScannedSkills` with the SKILL.md hydration pattern from `handleImportAgentSkill`, open a managed skill by switching to the Skills module (`setAppModule("skill")` + `setStoreView("my-skills")` + `selectSkill`), install library skills through `SkillLibraryImportModal` with the agent skills dir as the fixed target (export skillmd then `installMd`/`installMdSymlink`), and uninstall through `skillApi.uninstallPlatformSkill` behind a destructive `ConfirmDialog` with a built-in guard. Card clicks drill into `SkillFullDetailPage` with `overrideSkill` (`buildProjectDetailSkill`), `agentContext`, and `agentActions`, replacing the right pane with a back action to the grid; the drill-in state lives in `AgentAssetsWorkspace`.
  - No i18n key changes: every label reuses existing `skill.*` / `agents.*` keys already present in all seven locales.
  - Tests: `agent-assets-workspace.test.tsx` extended to 15 cases covering the five badge states, tag truncation, filter chips, adopt + hydration arguments, uninstall confirmation and built-in block, the library modal fixed target, folder opening, the Skills-module jump, detail drill-in with `agentContext`, and the existing domain/search regressions; `agents-workspace.test.tsx` mocks `useToast` because the workspace now embeds the toast-driven panel. Full components suite passed (173 files / 1305 tests), i18n smoke/hardcode regression passed, scoped ESLint and `tsc --noEmit` passed; full desktop suite green (406 files / 3763 tests).

- Polymorphic multi-agent quota batch (2026-07-21, `FR-AGENT-027`, `DES-AGENT-023`):
  - Contract: `AgentUsageQuota` replaces fixed window fields with `metrics: AgentUsageMetric[]` (`kind: "window" | "quota"`, optional amounts/unit).
  - Main process: `agent-usage-service.ts` now routes six adapters — Claude and Codex re-mapped to metrics, plus Kimi (`api.kimi.com/coding/v1/usages`, weekly + rolling + membership level, verified live), Antigravity and Gemini (Cloud Code Assist `loadCodeAssist` + per-model remaining fractions + tier), and Copilot (`copilot_internal/user`, premium/chat snapshots + plan). Shared DI, 60s cache, timeout/error taxonomy, token isolation; expired local tokens fail guided without refresh.
  - Renderer: `AgentUsageBanner` renders windows as rings and quotas as progress bars (used/total/unit, remaining thresholds), caps model-quota lists with a "+N more" summary, and localizes known metric ids; usage capability flips to supported for `kimi`, `antigravity`, `gemini`, `copilot`.
  - Tests: 45 new adapter tests (`TEST-AGENT-032`), banner/managed-agents suites migrated plus new polymorphic cases (`TEST-AGENT-033`); main suite 110 files/1578 tests green; three pre-existing failures caused by a parallel PlatformIcon change were fixed by making the codex-icon assertions cardinality-tolerant; i18n regression, ESLint, and `tsc --noEmit` green; full desktop suite green (405 files / 3734 tests).
  - Contract migration fix (2026-07-21): `readCachedQuota` now rejects cached entries without a `metrics` array (written by the pre-polymorphic contract) and the banner guards `Array.isArray(quota.metrics)`, fixing a white-screen crash on launch for users with old-format usage caches; regression test seeds an old-format cache entry; full desktop suite green (405 files / 3735 tests).
  - Adapter follow-up fixes (2026-07-21): the Antigravity adapter falls back to the shared `~/.gemini/oauth_creds.json` for Antigravity 2.0 installs (the 1.x token file no longer exists there); guided-state copy (`noCredentials`/`expired`) is agent-aware via `{{agent}}` interpolation across all seven locales instead of hardcoding Claude Code. Known limitation recorded: Gemini CLI and Kimi legacy credential fallbacks use short-lived access tokens, and PromptHub does not refresh those provider tokens itself. Full desktop suite green (405 files / 3739 tests).
  - Antigravity desktop-session correction (2026-07-22, `TEST-AGENT-035`, `T-AGENT-061`): quota discovery now prefers the running Antigravity language server's authenticated loopback `GetUserStatus` response, maps monthly prompt credits and per-model quota buckets, and reports the current tier without exporting or refreshing OAuth credentials. Process discovery requires an Antigravity marker, a bounded CSRF argument, and loopback-only listening ports; requests use fixed time and response-size limits, and secrets never enter IPC, logs, or error payloads. A stale Keychain access token with a refresh token is treated as a renewable desktop session rather than a logout, so a stopped app reports `antigravity-not-running` instead of the misleading `expired` state. Real-machine verification returned `Google AI Pro`, one prompt-credit metric, and eleven model quota metrics; the temporary Antigravity instance used for verification was then stopped. Focused usage regression passed (6 files / 147 tests), together with scoped ESLint, `pnpm typecheck`, `pnpm build`, and the full desktop suite (406 files / 3762 tests).
  - Antigravity grouped-quota and launch follow-up (2026-07-22, `TEST-AGENT-037`, `T-AGENT-065`): the live adapter now combines `GetUserStatus` with the language server's `RetrieveUserQuotaSummary`, producing four window metrics (Gemini weekly/5h and Claude/GPT weekly/5h) plus one monthly prompt-credit total. The renderer shows every reset window as a remaining-quota ring and reserves progress bars for metrics with numeric used/total values. The header and Antigravity guidance can open or focus declared desktop apps through a main-process platform allowlist; no renderer path or shell string crosses IPC. Current-machine read-only verification while the user's Antigravity instance remained running returned `Google AI Pro` and exactly the expected one total plus four windows. Focused regression passed (7 files / 144 tests), the 7-locale regression passed (5 files / 36 tests), and scoped ESLint, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The full desktop run completed with 3768/3777 tests passing; its nine failures are confined to the concurrently added but not yet implemented Qwen registry/model/session/icon/MCP expectations tracked by `TEST-AGENT-036`, so they are not masked or reclassified as part of this follow-up.
  - Antigravity background-quota correction (2026-07-22, `TEST-AGENT-041`, `T-AGENT-070`): closing the Antigravity desktop window no longer blocks current quota. On macOS, when no trusted running language service is found, PromptHub starts the installed application's allowlisted native helper with fixed arguments, the sanitized installed app version, telemetry and the built-in Chrome DevTools MCP disabled, a reserved HTTP loopback port and an ephemeral CSRF token; it retries only bounded startup-readiness failures, requests grouped quota before optional account status, and always terminates the helper with a bounded `SIGTERM`/`SIGKILL` sequence. No OAuth client credential is copied or refreshed by PromptHub. A production-function probe with Antigravity 2.3.1 stopped returned `Google AI Pro`, one monthly-credit total and four weekly/five-hour windows in 10.6 seconds; the temporary helper was then confirmed absent from the process list. Focused regression passed (2 files / 67 tests), covering process-discovery fallbacks, path allowlisting, dynamic versioning, HTTP/gRPC port separation, bounded readiness retry, optional status, failure cleanup and force termination.

- Agent sidebar visibility polish (2026-07-21): removed status/sort selectors, filtered disabled built-in platforms at the shared managed-Agent projection, refreshed an already-loaded workspace after Agent settings mutations, aligned the row pin action at the centered right edge, and removed the decorative frame around the selected Agent icon. Test-first regressions cover search-only chrome, disabled projection, selected-Agent fallback, pin placement, frameless identity rendering, and settings-triggered refresh. Targeted suites passed (3 files / 41 tests), `pnpm typecheck`, scoped ESLint, `pnpm build`, browser screenshot inspection at the existing Vite server, and the full desktop suite passed (404 files / 3683 tests). The browser-only preview has no Electron platform API and therefore verified the sidebar structure/empty state; populated rows are covered by component tests.
- Agent row spacing follow-up (2026-07-21): moved the centered pin action from `right-7` to `right-2` and made the 64px detail identity slot frameless while preserving its stable dimensions. The focused Agent workspace suite passed (1 file / 18 tests), scoped ESLint passed, and `pnpm build` passed. `pnpm typecheck` was attempted but is currently blocked by concurrent Agent usage work whose production code references shared `AgentUsageWindow`, `fiveHour`, `sevenDay`, and `sevenDayOpus` fields that are not yet present in the shared contract.
- Codex icon quality follow-up (2026-07-21): replaced the bundled 64x64 Codex artwork with the installed official application's 1024x1024 light and dark assets, switched `PlatformIcon` to theme-aware Codex rendering, and added an asset-dimension/theme regression. The focused PlatformIcon suite passed (1 file / 12 tests), scoped ESLint, Prettier, and `pnpm build` passed. A combined run with the concurrently changing Agent workspace suite exposed an unrelated in-progress usage-contract mismatch (`quota.metrics` absent in the older test fixture); the isolated icon suite remains green. `pnpm typecheck` was attempted and remains blocked by the concurrent usage implementation referencing `AgentUsageWindow` and legacy `fiveHour` fields that are absent from the current shared contract.
- Gemini label simplification (2026-07-22): removed the enterprise-compatibility badge from both the Agent list and detail title while retaining the explicit consumer cutoff, enterprise/paid-key exception, and Antigravity migration guidance in the detail description. A focused renderer regression confirms neither surface repeats the badge text; scoped ESLint, Prettier, `pnpm typecheck`, and `pnpm build` passed.
- Usage banner batch (2026-07-21, DES-AGENT-022 revision):
  - The standalone Usage tab is removed (tab bar 7 -> 6); the overview navigation grid loses its usage cell. `AgentUsagePanel.tsx` is replaced by `AgentUsageBanner.tsx`: a capability-gated banner at the top of the Overview with SVG ring gauges per quota window (threshold-toned strokes, centered percentage, `role="img"` labels), reset countdowns, plan badge, provider-reported label, manual refresh, and compact guided states including the custom-provider state. Single-window responses render without placeholders.
  - Follow-up polish (2026-07-21): the banner uses a white (`bg-card`) surface; it renders immediately with 0% placeholder rings and swaps in real values without a layout shift (stale-while-revalidate in `use-agent-usage`); rings now display remaining quota (100 - used) with thresholds evaluated on the remaining value (<=30% warning, <=10% critical), plus a localized "remaining" caption next to each window label.
  - Follow-up polish 2 (2026-07-21): the overview content area is uniformly white (`bg-card` on the scroll region) so the banner and dashboard read as one surface; usage results are cached per agent in renderer `localStorage` (ok-status only, agentId-matched), so the banner shows the last known quota instantly on startup/agent switch and animates the ring arc (`stroke-dasharray` transition) when fresh data lands.
  - Claude custom-gateway parity (2026-07-21): the Claude usage adapter short-circuits to `custom-provider-active` when `settings.json` configures `ANTHROPIC_BASE_URL` or a cloud-provider flag (mirroring the Codex rule), so gateway users no longer see a misleading "credentials expired" prompt; the Overview Provider & Model cell shows the sanitized gateway endpoint and model for any agent whose model config reports a non-default provider with an endpoint.
  - Tests: 11 banner tests (`TEST-AGENT-031`) plus follow-up placeholder/no-shift/cache suites, workspace/overview suites updated, one stale e2e assertion fixed; components suite green; i18n regression, ESLint, and `tsc --noEmit` green; full desktop suite green (404 files / 3675 tests).

- Codex quota and provider-aware overview batch (2026-07-21, `FR-AGENT-026`, `DES-AGENT-022`):
  - Main process: `agent-usage-service.ts` gains a Codex adapter (`codex-oauth-v1`) — active-`model_provider` short-circuit (`custom-provider-active`, zero network), `auth.json` credential read, `GET chatgpt.com/backend-api/wham/usage` with Bearer + `ChatGPT-Account-Id`, windows classified by `limit_window_seconds` (never slot position, quotio#356), `plan_type` mapping, 401/403 -> expired, same token isolation and 60s cache as the Claude adapter.
  - Renderer: overview capability grid removed; paths list rows gain open-folder actions; Provider & Model cell shows the custom provider's sanitized base URL + model when a third-party provider is active; usage cell and Usage tab render a dedicated custom-provider state; `usage` capability flips to supported for `codex`.
  - Tests: 26 Codex adapter tests (`TEST-AGENT-029`), overview/usage panel and capability tests updated (`TEST-AGENT-030`); main suite 109 files/1530 tests green, components+services 242 files/1778 tests green; i18n regression, ESLint, and `tsc --noEmit` green; full desktop suite green (404 files / 3660 tests).

- Desktop-native workspace layout batch (2026-07-20, `FR-AGENT-025`, `DES-AGENT-021`):
  - Shell: `AgentWorkspacePanel` drops the webpage canvas (outer page margins, `max-w-6xl`, page-level scroll); every tab renders edge-to-edge with a fixed compact toolbar and an internal scroll region. The final tab bar is Overview, Skills, MCP, Rules, Plugins, Provider & Model, Appearance, Config Files, and Sessions; the Maintenance tab is retired into the header overflow menu (refresh, open settings) built on the shared ContextMenu component.
  - Assets: `AgentAssetsWorkspace.tsx` replaces `AgentAssetsPanel.tsx` as the shared domain renderer, while Skills/MCP/Rules/Plugins remain direct top-level tabs. No generic Assets tab or secondary navigation remains; Overview asset cells navigate directly to the owning tab.
  - Per-tab compactification: Config Files (toolbar + full-height editor), Appearance (toolbar + status strip + grids), Usage (side-by-side window cards), Sessions (edge-to-edge two-pane), Overview (self-scrolling dashboard, summary cards kept as the allowed exception).
  - Provider & Model: master-detail (`AgentProviderModelPanel.tsx`, 718 lines) — left provider list (built-in OpenAI subscription + third-party entries + add action), right detail pane (native config + model selection for built-in; baseUrl/wireApi/key state/profile/test/set-default/edit/delete for third-party); `AgentCodexProvidersSection.tsx` removed with no dead code; form dialog reused. Non-Codex agents get the same shell with only the built-in entry.
  - Tests: workspace shell, assets workspace, overview navigation, and provider master-detail suites updated/added (`TEST-AGENT-028`); the pre-existing async flake in the provider panel test was fixed with `findBy*`/`waitFor`; components suite green (173 files / 1263 tests), i18n regression, ESLint, and `tsc --noEmit` green; full desktop suite green (403 files / 3618 tests).

- Codex third-party provider batch (2026-07-20, `FR-AGENT-024`, `DES-AGENT-020`):
  - Contract: `AgentCodexProvider`/`AgentCodexProviderList`/`UpsertAgentCodexProviderInput`/`AgentCodexProviderTestResult` types, `agent:providers:list|upsert|remove|setDefault|test` channels, preload `agent.listProviders/upsertProvider/removeProvider/setDefaultProvider/testProvider`.
  - Main process: `agent-secret-store.ts` (safeStorage-encrypted `agent-secrets.json`, 0600, atomic writes, fail-closed, main-only); `agent-codex-provider-service.ts` + `codex-toml-editor.ts` (text-level TOML edits preserving comments and unrelated keys byte-for-byte; backup/digest/atomic-write/verify/rollback pipeline reused from `agent-model-config.ts`; managed keys projected to `experimental_bearer_token`, `env_key` supported; reserved ids rejected; active-provider removal refused; default `model_provider` switching; connectivity test with SSRF guard and loopback exemption, redacted categorized results). `agent-codex-provider-error.ts` carries categorized codes; IPC sanitizes unknown errors.
  - Renderer: `AgentCodexProvidersSection.tsx` + `AgentCodexProviderFormDialog.tsx` on the Provider & Model tab (Codex only): provider list with key-readiness states, add/edit dialog with write-only key field and env-var alternative, delete guard, set-default/restore-OpenAI, inline test results; `agents.providers.*` keys in all seven locales.
  - Tests: 9 secret-store + 58 provider-service main tests (`TEST-AGENT-025`/`TEST-AGENT-026`), 21 renderer tests (`TEST-AGENT-027`); main suite 108 files/1497 tests green, components 171 files/1245 tests green; i18n regression, ESLint, and `tsc --noEmit` green; full desktop suite green (401 files / 3599 tests).

- Overview navigation hub and Claude quota batch (2026-07-20, `FR-AGENT-022`/`FR-AGENT-023`, `DES-AGENT-019`):
  - Contract: `AgentUsageQuota`/`AgentUsageWindow` types in `packages/shared/types/agent.ts`, `AGENT_USAGE_GET` channel, preload `agent.getUsage`.
  - Main process: `agent-usage-service.ts` resolves the Claude Code OAuth credential (keychain legacy name, hashed-suffix variant, `<root>/.credentials.json`, honoring root overrides via the existing platform registry), queries `api.anthropic.com/api/oauth/usage` with a 10s timeout, maps `five_hour`/`seven_day`/`seven_day_opus`, caches results 60s in memory, and keeps the token inside the main process (no persistence, no IPC, no logs, no refresh). Registered in `agent.ipc.ts` with categorized fallback responses.
  - Renderer: `AgentOverviewPanel.tsx` (649 lines) replaces the static overview with nine live navigation cells (Skills/MCP/Rules/Plugins/Sessions/Provider/Appearance/Usage/Config Files), click-to-tab navigation via `onNavigate`, disabled cells that never invoke IPC, and a collapsed paths region; `AgentsWorkspace.tsx` shrinks 568 -> 289 lines; tab metadata extracted to `agent-workspace-tabs.ts`. `AgentUsagePanel.tsx` + `use-agent-usage.ts` render the 5h/7d/Opus windows with threshold-toned progress bars, reset countdowns, provider-reported label, manual refresh, and guided no-credentials/expired/unavailable states. `buildCapabilities` marks `usage` supported for `claude` only.
  - i18n: `agents.overviewNav.*` and `agents.usageTab.*` keys added to all seven locales.
  - Tests: 25 main-process quota tests (`TEST-AGENT-023`) and 12 renderer tests (`TEST-AGENT-024`) added; targeted suites green (main 106 files/1435 tests, components 170 files/1224 tests); i18n hardcode regression, ESLint, and `tsc --noEmit` green; full desktop suite green (398 files / 3511 tests).

- Workspace visual-tone neutralization (2026-07-20): per-domain decorative accent colors in the Agent workspace were replaced with neutral design tokens so the module matches the rest of the desktop UI. Tab selection now uses `border-primary text-foreground` for every tab; overview summary cells use `bg-muted/15` with muted icons; asset domain panels, config-files header, and provider/model header use `border-border`/`bg-muted`/`text-muted-foreground`; session list icon and user transcript bubbles use muted tones. Semantic status colors (emerald = healthy/saved/active, amber = warning, destructive = error) are unchanged. Files: `AgentsWorkspace.tsx`, `AgentAssetsPanel.tsx`, `AgentConfigFilesPanel.tsx`, `AgentProviderModelPanel.tsx`, `AgentSessionsPanel.tsx`.
  - `pnpm test -- tests/unit/components/agents-workspace.test.tsx --run`: passed, 10 tests.
  - Targeted ESLint on `src/renderer/components/agent/`: passed.
  - `pnpm --dir apps/desktop typecheck`: passed.

- Desktop home order regression: the settings-store suite passed, 32 files /
  240 tests; the targeted navigation service, Appearance settings, and Sidebar
  rendering suite also passed, 3 files / 16 tests. The new default, both
  historical defaults, post-migration customization, and a customized complete
  order are covered.
- Desktop typecheck and targeted ESLint for the changed navigation/settings
  modules passed.
- Documentation structure:
  - Command: `find spec/changes/active/agent-management-workbench -type f -maxdepth 4 -print`
  - Result: passed; proposal, delta spec, architecture design, screen-level UI design, coverage matrix, tasks and implementation records are present.
- Traceability:
  - Command: `rg -n 'FR-AGENT|NFR-AGENT|DES-AGENT|TEST-AGENT|T-AGENT' spec/changes/active/agent-management-workbench`
  - Result: passed; requirements, designs, verification contracts and tasks have explicit ids and a coverage table.
- Formatting:
  - Command: `pnpm exec prettier --check "spec/changes/active/agent-management-workbench/**/*.md"`
  - Result: passed.
- Code/test execution:
  - Agent model/session/IPC/workspace regression: passed, 5 files / 30 tests.
  - The regression covers JSON, JSONC and TOML model updates; secret and endpoint redaction; atomic writes, backup and rollback behavior; Claude/Gemini/OpenCode session discovery; malformed session isolation; IPC validation; and renderer loading/saving behavior.
  - `pnpm --dir apps/desktop typecheck`
  - Result: passed.
  - Targeted ESLint for changed Agent modules: passed.
  - Locale JSON parse for all 7 locales: passed.
  - `pnpm --dir apps/desktop build`
  - Result: passed; only the existing Vite chunk-size warnings remain.
  - `pnpm --dir apps/desktop exec playwright test tests/e2e/agent-workspace.spec.ts`
  - Result: passed, 1 test. It uses an isolated temporary HOME, updates the Claude model through real IPC, reads isolated Claude and Kimi sessions, inspects Kimi TOML model state, edits `settings.json`, verifies disk content and captures provider, session and narrow-layout screenshots. The screenshots were checked for blank content, clipping and incoherent overlap.
  - Appearance targeted regression: passed, 7 files / 39 tests. Dream Skin schema/image validation, path and symlink rejection, bounded import/export, atomic active staging, platform start/verify/restore orchestration, failed state commit rollback, invalid stored themes, Pet scan/preview/import/export/delete, IPC validation, package resources, capability state and the shared top-level tab are covered.
  - Pet atlas preview regression: passed, 2 files / 13 tests. It covers missing-version v1 normalization, explicit v2 preservation, invalid version rejection, v1/v2 background geometry, six-frame idle advancement, removal of the full-atlas image element and reduced-motion frame pinning.
  - Pet atlas preview checks: `pnpm typecheck`, targeted ESLint, changed-file Prettier, `git diff --check`, and the desktop production build passed. The workspace navigation conflict was subsequently resolved by restoring direct Skills/MCP/Rules/Plugins tabs and removing the generic Assets tab; the focused Agent Electron E2E now passes through Skills, MCP, Provider, Sessions, and Appearance.
  - Codex identity placement correction: removed the standalone settings section and embedded controlled name/icon fields in the built-in Codex Agent editor. The fields now share the existing Save, Cancel, and Reset lifecycle with root and asset paths; the Agent configuration row uses the resolved identity.
  - Codex identity targeted regression: passed, 6 files / 64 tests. `SkillSettings` contributes 18 tests covering the row-local editor, deferred Save, Cancel discard, Reset-to-default, existing root/path editing, collapse behavior and Plugin-path capability filtering.
  - Placement correction gates: desktop typecheck, targeted ESLint, changed-file Prettier, active-change Markdown Prettier, `git diff --check`, and the desktop production build passed. The build retains only the existing Vite chunk-size and mixed static/dynamic import warnings.
  - Placement correction full regression: `pnpm test:run` passed, 404 files / 3,671 tests. Existing intentional failure-path logs and React `act(...)` warnings remain visible but do not fail the suite.
  - In-workspace Agent edit regression: `agents-workspace.test.tsx` passed, 1 file / 21 tests. It covers built-in current values, platform-default Reset, override Save, modal close without navigation, retained refresh action, removal of the duplicated header Skills action, custom Agent name/enabled/path Save, custom Reset, and validation failure remaining in the dialog.
  - In-workspace edit visual E2E: isolated-HOME Electron Playwright passed, 1 test. It opens Claude Code, asserts the header has no duplicated Manage Skills button, invokes Edit Agent from the overflow menu, verifies the effective root in the modal, captures the complete dialog, cancels, and confirms the Claude workspace remains visible. The inspected 1280x820 screenshot had no blank content, clipping, or incoherent overlap.
  - In-workspace edit gates: seven-locale i18n regression passed (5 files / 36 tests); targeted ESLint, root desktop typecheck, active-change spec governance, desktop production build, changed-file Prettier, and `git diff --check` passed. Build output retains only the existing Vite chunk-size and mixed static/dynamic import warnings.
  - File-size gate: extracting `BuiltinAgentEditor` reduced the touched `SkillSettings.tsx` to 1,399 lines, below the 1,500-line preferred limit. The pinned Dream Skin macOS injector remains an audited 1,822-line upstream snapshot below the 2,000-line hard limit; its exact size is recorded in the legacy baseline so future growth still fails the gate.
  - Appearance coverage probe: 88.74% statements and 79.83% branches across the selected main/UI modules; the three Dream Skin main services reach 90.69% statements and 80.85% branches. Changed public actions, compatibility failures and security rejection paths have direct regressions; remaining uncovered branches are primarily low-level parser variants and injected filesystem failures.
  - Appearance Electron E2E: passed, 1 test. An isolated Dream Skin directory and Pet are rendered in the top-level Appearance page; the first run detected an incorrect development resource path, which was fixed before the passing run. No live skin was applied to the developer's Codex installation.
  - Vendored Dream Skin payload checks: macOS and Windows entry scripts passed syntax checks and their default `--check-payload` validation. The macOS payload reported runtime `1.2.0`, theme `dream-portal` and image size `2168x725`.
  - Isolated macOS arm64 `electron-builder --dir` packaging passed. The unpacked resource contains runtime version `1.2.0` and both macOS and Windows start/restore entry points outside `app.asar`.
  - Current-machine read-only inventory probe: 16 valid Codex Pets, 0 invalid Pets; no live skin was applied and no real Codex files were modified.
  - `pnpm test:run`
  - Latest full-workspace result: passed, 393 files / 3466 tests. The first run exposed a stale settings-snapshot integration mock from the concurrent data-safety work; after the mock was aligned with the exported sensitive-field contract, its targeted test and the complete suite passed.
  - Previous Agent batch result: passed, 385 files / 3369 tests.
  - Kimi upgrade batch result: 387 files / 3420 tests passed; one unrelated `data-settings-backup-sync.test.tsx` assertion timed out under the full parallel run. The same file then passed in isolation, 1 file / 11 tests, including the failed import-preview scenario.
  - Kimi targeted regression: passed, 7 files / 123 tests. It covers root precedence, resolved-root IPC projection, current asset declarations, TOML inspect/update/redaction/backup/native-validation rollback, bounded newest-first session indexing, oversized indexes, official wire parsing, malformed records and symlink/path escape rejection.
  - Google platform registry regression: superseded by the 2026-07-21 lifecycle correction below; the earlier assertion incorrectly treated ongoing enterprise releases as general consumer availability.
  - Google lifecycle correction (2026-07-21): tests cover Antigravity-first ordering, suffix-free `Antigravity` / `Gemini` display names, `current` / `enterprise-legacy` projection, replacement metadata, preserved Gemini paths and adapters, the consumer cutoff notice with enterprise/paid API exceptions, and all seven locales.
    - `pnpm exec vitest run tests/unit/services/managed-agents.test.ts tests/unit/renderer/agent-root-paths.test.ts --reporter=dot`: passed, 2 files / 26 tests.
    - `pnpm --filter @prompthub/desktop exec vitest run tests/unit/components/agents-workspace.test.tsx --reporter=dot`: passed, 1 file / 14 tests; existing async overview cells still emit React `act(...)` warnings.
    - `pnpm --filter @prompthub/shared typecheck` and `pnpm --filter @prompthub/desktop typecheck`: passed.
    - Seven-locale JSON parse and i18n hardcode/init regression (2 files / 5 tests): passed.
    - Targeted ESLint, changed-file Prettier, `pnpm spec:test`, `pnpm spec:index:check`, `git diff --check`, and the desktop production build: passed.
  - `pnpm --filter @prompthub/shared typecheck` and `pnpm --dir apps/desktop typecheck`: passed.
  - `pnpm spec:index:check`: passed.
  - `pnpm lint:file-size`
  - Result: the new Kimi session module is 355 lines and all changed production files remain below policy limits. The repository-wide command remains blocked by the pre-existing 1511-line `apps/desktop/tests/unit/services/database-backup.test.ts`; targeted ESLint for this change passed.
  - `git diff --check`
  - Result: passed.

## Analyze

- Governance and capability-inventory batch (2026-07-28, `FR-AGENT-002`, `DES-AGENT-032`, `TEST-AGENT-045`, `T-AGENT-006`, `T-AGENT-009`, `T-AGENT-010`, `T-AGENT-073`):
  - Unified the active change at `implement`, resolved the credential/session/high-risk/persona decisions, and kept proxy, protocol conversion, failover, request interception, and OAuth account pools outside this change.
  - Removed duplicate trace ids by retaining quota as `FR-AGENT-027` / `DES-AGENT-023`, retaining Provider UI as `TEST-AGENT-027`, and moving Codex presentation identity to `FR-AGENT-035` / `DES-AGENT-031` / `TEST-AGENT-044`.
  - Rebuilt the traceability table with explicit full ids. A definition/trace audit reported zero duplicate definitions and zero unreferenced FR/NFR, DES, TEST, or T ids.
  - Added a shared 31-platform capability inventory and renderer projection. The focused red test failed before the module existed; after implementation, 2 files / 19 tests passed.
  - `@prompthub/shared` and desktop typechecks passed. Desktop affected lint passed; shared affected lint passed with the desktop flat config explicitly selected. `pnpm spec:test`, `pnpm spec:index:check`, and the file-size gate passed.
  - Full desktop, integration, E2E, and release-quick suites were not run for this documentation/contract batch; they remain required at the later delivery and convergence gates.

- Provider Profile persistence foundation (2026-07-28, `FR-AGENT-003` to `FR-AGENT-006`, `DES-AGENT-004`, `TEST-AGENT-003`, `T-AGENT-074`; partial `T-AGENT-012`):
  - Added shared typed records and inputs for Provider Profiles, model mappings, and redacted activation snapshots. Contracts contain `secretRef` only and no secret-value field.
  - Added `agent_provider_profiles`, `agent_provider_model_mappings`, and `agent_provider_snapshots` to fresh schema and existing-user initialization. Migration `agent_provider_profiles_v1` is idempotent, participates in the pre-migration backup gate, and does not import or mutate native Agent configuration.
  - Added platform/archive/update and snapshot-history query indexes. Provider identity uses the stable profile ID, so exact-case and case-only duplicate display names can coexist. Profile deletion cascades mappings and preserves audit snapshots with `provider_profile_id = NULL`.
  - Added `AgentProviderProfileDB` CRUD, archive, monotonic optimistic timestamp checks, mapping upsert, bounded snapshot history, and transactional profile-with-mappings creation.
  - The failing regression initially reported six failures because the DB class/tables/migration did not exist. The completed focused suite passed 8 tests; the migration/locking/source-update regression passed 3 files / 19 tests. DB, shared, and desktop typechecks, affected lint, and the file-size gate passed.
  - Session source/index schema remains open under `T-AGENT-012`. Provider activation, secure secret resolution, renderer IPC, backup payload integration, and native config reconciliation are not claimed by this persistence batch.

- Provider adapter registry and three-way reconciliation foundation (2026-07-28, `FR-AGENT-003` to `FR-AGENT-007`, `DES-AGENT-005`, `DES-AGENT-006`, `TEST-AGENT-006`, `T-AGENT-075`; partial `T-AGENT-011` and `T-AGENT-013`):
  - Added shared serializable provider comparable-state, desired-state, field-decision, activation-plan, adapter-context, import-preview, apply-receipt, verification, and rollback-result contracts. Secret values are not part of these contracts.
  - Added a capability-oriented core registry whose provider adapter is optional. It rejects duplicate platform registrations, platform-id mismatches, and blank adapter versions while retaining explicit empty registrations without inventing support.
  - Added pure field-level three-way reconciliation across baseline, native current state, and desired PromptHub state. It distinguishes preserve, apply, backfill, external modification, conflict, unsupported fields, and blocked prerequisites; decisions are stable-sorted and input objects remain unchanged.
  - The failing regression initially reported six failures because the registry and reconciliation modules did not exist. The completed focused suite passed 7 tests, and focused V8 coverage reached 100% statements, branches, functions, and lines for `packages/core/src/agent-management`.
  - The full core suite passed 11 files / 76 tests; the full desktop suite passed 416 files / 3,830 tests. Core, shared, and desktop typechecks, affected lint, Spec governance/index checks, formatting, `git diff --check`, and the file-size gate passed.
  - Native filesystem apply/verify/rollback implementations, Provider Profile IPC, unified Agent query, asset aggregation, and concrete platform adapter registration are not claimed by this batch. Existing expected failure-injection logs and React `act(...)` warnings remain visible in the desktop suite but did not fail it.

- Core Agent query and asset aggregation foundation (2026-07-28, `FR-AGENT-001`, `FR-AGENT-002`, `FR-AGENT-008`, `DES-AGENT-002`, `DES-AGENT-007`, `T-AGENT-076`; partial `T-AGENT-013` and `TEST-AGENT-008`):
  - Moved Managed Agent identity projection, path derivation, capability projection, ordering, and filtering from the desktop renderer into `packages/core`. Renderer service modules now provide compatibility exports, so the existing Zustand store and UI use the same core query without a second platform list.
  - Added a stateless `AgentAssetAggregationService` for Skill, MCP, Rule, and Plugin domains. Every list refresh calls the registered owning-domain adapter, preserves a fixed four-domain result shape, isolates unsupported and failed domains, returns only generic error codes, and holds no canonical asset content.
  - Asset action planning/application delegates only to the matching owning adapter. Duplicate adapters, malformed inventories, invalid identifiers/options, unsupported domains, non-ready plans, adapter failures, and cross-domain plan/result substitutions are rejected without exposing adapter error text.
  - The focused red suite initially failed all 6 tests because neither core query nor aggregation service existed. The completed suite passes 11 tests with 100% statements, branches, functions, and lines for both new modules; the existing desktop Managed Agent projection suite passes 15 tests unchanged.
  - The full core suite passed 12 files / 87 tests and the full desktop suite passed 416 files / 3,830 tests. Core, shared, and desktop typechecks, affected lint, Spec governance/index checks, formatting, `git diff --check`, and the file-size gate passed. Expected failure-injection logs and existing React `act(...)` warnings remained non-failing.
  - Concrete renderer/main Skill, MCP, Rule, and Plugin adapters are not yet connected to this orchestrator, so `TEST-AGENT-008` remains open and no asset action behavior is claimed by this batch.

- Agent asset owning-domain integration (2026-07-28, `FR-AGENT-008`, `DES-AGENT-007`, `TEST-AGENT-008`, `T-AGENT-013`):
  - Added concrete renderer application adapters for Skill, MCP, Rules, and Plugin. Every read calls the corresponding owning Zustand store; the Agent domain does not persist a second asset list, count, assignment, or status.
  - The overview and direct asset tabs now consume the same aggregate selector. Refresh invokes the owning domain loader, subsequent store changes are reflected without stale cached inventory, and a validation failure becomes a localized generic failure state instead of a false empty result or leaked adapter error.
  - Existing Skill import, uninstall, detail, and library-install actions continue to call the Skill domain. The aggregate action contract rejects changed nested options and cross-domain results; domains without an Agent-inline action return `unsupported` and never claim a successful mutation.
  - The initial red tests failed because the renderer adapters did not exist and because action plans could replace nested option values. The completed focused suites pass 3 files / 36 tests. Focused V8 coverage is 100% statements, branches, functions, and lines for both `asset-aggregation.ts` and `agent-asset-domain-adapters.ts`.
  - The full core suite passed 12 files / 88 tests and the full desktop suite passed 417 files / 3,837 tests. Core, shared, and desktop typechecks, affected lint, formatting, and the desktop production build passed. Existing failure-injection output and React `act(...)` warnings remain non-failing test debt outside this batch.

- Provider Profile main-only safety and CRUD boundary (2026-07-28, `FR-AGENT-003`, `FR-AGENT-006`, `DES-AGENT-004`, partial `TEST-AGENT-004`, `T-AGENT-077`; partial `T-AGENT-011`, `T-AGENT-015`, and `T-AGENT-020`):
  - Added a bounded public-configuration validator for Profile config and model-mapping parameters. It accepts JSON-compatible values only and rejects cycles, non-finite numbers, non-plain objects, oversized depth/node/key/string input, and credential-bearing keys before SQLite serialization.
  - Added `AgentProviderProfileService` as the main-only write boundary. Renderer requests never control `secretRef`; new references use `agent-provider:<profile-id>`, secrets are write-only, list responses expose only `none` / `available` / `missing`, and duplicate/export never copy or serialize credentials.
  - Profile plus mapping updates now use one SQLite transaction with optimistic concurrency. Secret replacement, clearing, deletion, and profile creation use compensating restoration when either the encrypted secret file or SQLite mutation fails, with dedicated rollback-failure codes rather than raw path/database errors.
  - Added batched secret-presence and model-mapping lookups to avoid per-profile secret-file reads and unbounded SQLite parameter lists.
  - Added seven Provider Profile CRUD/duplicate/export IPC channels, preload methods, database-rebind registration, and a generic error boundary that emits only stable `AGENT_PROVIDER_*` codes.
  - Focused verification passed: shared public-config tests at 100% line/branch/function coverage; Provider Profile service 23 tests and 100% line/branch/function coverage; IPC 2 tests with changed branches covered; secret store, DB, and IPC-index integration brought the focused batch to 46 passing tests. Shared, DB, core, and desktop typechecks passed. Affected ESLint passed; full desktop/E2E/release gates remain required after renderer activation and platform adapters are connected.

- Provider import, reconciliation and verified activation application boundary (2026-07-28, `FR-AGENT-003` to `FR-AGENT-006`, `DES-AGENT-005`, `DES-AGENT-006`, partial `TEST-AGENT-004` to `TEST-AGENT-007`, `T-AGENT-078`; completes `T-AGENT-020`, advances `T-AGENT-011` and `T-AGENT-015`):
  - Added renderer-safe import/preview/activate request contracts and explicit per-field resolutions. Backfill, external modification and conflict decisions require `preserve-current` or `use-profile`; stale native digests, incomplete decisions, unsupported fields and no-op activation fail closed.
  - Native import previews are bounded and validated before crossing core. Profile config, comparable state and model-mapping parameters reject secret/token keys, unsafe prototypes, cycles and oversized values. Adapter failures become stable codes without path or credential text.
  - Added main-owned platform-context resolution so the renderer submits only Agent/profile ids, expected digest and field decisions. Three new IPC channels compose the core activation service with the SQLite repository and eight evidence-backed model-only adapters: Claude, Codex, Gemini, Kimi, OpenCode, OpenClaw, Qwen and Oh My Pi. Antigravity and other platforms remain unsupported until a stable writer is evidenced.
  - Model-only adapters reject endpoint, secret-reference and non-native protocol profiles instead of reporting partial writes as success. Successful activation retains the existing backup, atomic write, concurrent digest check, re-read verification, audit snapshot and rollback path.
  - Added the non-persistent renderer `agent-provider.store.ts` as the single Provider Profile query/action projection. It supports bounded platform loads with stale-response isolation, CRUD, explicit native import adoption, activation preview and verified result handling; it stores no root path or credential and redacts non-stable errors.
  - Focused verification passed: core activation service 19 tests at 100% statement/branch/function/line coverage; model adapter, activation IPC, platform-context service, renderer store, Profile IPC and public-config validator each reached 100% focused coverage. The combined desktop boundary suite passed 11 files / 85 tests; core reconciliation/activation passed 2 files / 26 tests. Shared, core, DB and desktop typechecks plus affected ESLint passed. Full desktop, integration, Electron E2E and release-quick gates remain open until the Provider Profile UI and priority full adapters are complete.

- Provider Profile renderer workbench batch (2026-07-28, `FR-AGENT-003` to `FR-AGENT-006`, `DES-AGENT-004` to `DES-AGENT-006`, `TEST-AGENT-046`, `T-AGENT-080`; advances `T-AGENT-079`):
  - Added a non-Codex Provider & Model split view backed only by the existing Provider Profile IPC/store boundary. The renderer lists public Profile records, exposes `none` / `available` / `missing` credential readiness, and supports create, edit, rename, create copy, confirmed delete and credential-free text copy without storing a second durable copy. The detail action bar no longer exposes archive; the existing storage primitive remains outside this renderer workflow.
  - Profile editing supports platform protocol, endpoint, primary/secondary model routes and write-only credential replace/preserve/clear actions. Editing now preserves adapter-owned validated `config` rather than replacing imported extension data with an empty object; existing secret values and `secretRef` never return to the form.
  - Native import remains an explicit preview/confirm flow. Activation renders current versus desired values, requires a decision for each backfill/external/conflict field, blocks incomplete or unsupported plans, and keeps verified, restored or rollback-unverified diagnostics visible. Renderer failures are collapsed to stable public messages.
  - Seven locales share the complete `agents.providerProfiles` key tree. The new component test harness gates async Profile loading inside React `act`, so this batch adds no new asynchronous state warnings; existing warnings in the legacy Codex provider panel remain migration debt.
  - Focused verification passed: Profile workbench/store 2 files / 22 tests with 100% statements and lines, 98.62% branches and 98.41% functions across the three new UI modules plus the store; the store and activation/import dialogs reached 100% statement/branch/function/line coverage. The combined new/legacy provider UI regression passed 3 files / 47 tests. Desktop typecheck and scoped ESLint passed. Remaining uncovered branches are defensive no-selection/null-result guards; full desktop, Electron E2E and release-quick remain open.
  - At this intermediate checkpoint, Codex still rendered the legacy `AgentProviderModelPanel` to avoid removing then-shipped third-party endpoint/key management before its native TOML projection was migrated. The later Codex convergence batch below completed `T-AGENT-079`, moved Codex to the Profile DB and stable `agent-provider:<id>` secret ownership, and removed that renderer fact source.

- Capability guidance and workspace tab accessibility batch (2026-07-28, `NFR-AGENT-006`, `TEST-AGENT-047`, `T-AGENT-082`; advances `TEST-AGENT-017` and `T-AGENT-079`):
  - Planned and unsupported capabilities now expose distinct, localized guidance in disabled workspace tabs and Overview navigation cells. Disabled capabilities remain non-interactive and do not invoke Provider/model IPC.
  - The Agent workspace tablist now uses one focusable active tab and roving focus across enabled tabs. ArrowLeft/ArrowRight wrap, Home/End select the boundary tab, and each active tab identifies the shared tabpanel through `aria-controls`/`aria-labelledby`.
  - Seven locales include the planned and unsupported explanations. The focused workspace test reproduces a Cline planned Provider tab, verifies no Profile/model IPC call, and covers the keyboard navigation contract.
  - Verification passed: the workspace suite passed 23 tests; the combined workspace, unified Profile workbench and legacy Provider panel regression passed 3 files / 62 tests. Focused coverage for the three touched workspace modules was 95.89% statements/lines, 87% branches and 83.72% functions; the capability-status helper reached 100%, and every new keyboard/guidance decision has a direct assertion while uncovered lines belong to existing workspace branches. Desktop typecheck and affected ESLint passed. Electron E2E and release-quick remain open.
  - This batch deliberately does not migrate Codex. The existing `codex-provider:*` credential ownership and native TOML projection conflict with the unified Profile DB/`agent-provider:<profileId>` boundary; changing that source of truth requires an explicit migration and user confirmation before implementation.

- Agent renderer async test-harness batch (2026-07-28, `NFR-AGENT-006`, `TEST-AGENT-048`, `T-AGENT-083`; advances `TEST-AGENT-017`):
  - Added an explicit, default-off `settleAsyncEffects` option to the shared i18n renderer test helper. Tests opt in only when mounted Agent components intentionally resolve initial IPC promises into React state; existing callers keep the previous behavior.
  - The workspace harness now settles Overview session/provider cells before assertions and after keyboard navigation re-enters Overview. A regression captures `console.error` and rejects any unwrapped `act(...)` warning.
  - The legacy Codex Provider panel uses the same opt-in settlement boundary, removing its prior asynchronous state warnings without changing production Provider behavior or credential ownership.
  - Verification passed: workspace 24 tests and legacy Provider panel 25 tests completed without React state-update warnings; the combined workspace, unified Profile workbench and legacy Provider panel regression passed 3 files / 63 tests. Desktop typecheck and affected ESLint passed. This batch is test-only and does not reduce the remaining Codex migration or Electron E2E scope.

- CC Switch Provider/credential reference audit (2026-07-28; prepares
  `TEST-AGENT-049`, `T-AGENT-084` and `T-AGENT-079`):
  - Updated the existing sibling source checkout
    `/Users/lingxiaotian/Programs/public/cc-switch` to stable tag `v3.18.0`,
    commit `606e7bbe75db7f8285f7a3be006fac22b5d22796`; the checkout is clean and
    intentionally remains outside PromptHub build-facing `public/`
    directories.
  - Audited the MIT license plus Provider SQLite schema, explicit import
    commands, Provider service/live projection and Codex atomic-write/restore
    paths. PromptHub will reuse the consent/import/switch/rollback workflow
    while retaining safeStorage-based main-only credential custody; CC
    Switch's credential-bearing SQLite `settings_config` is not adopted.
  - Recorded the user-confirmed source-of-truth migration: unified Profile DB
    is the PromptHub management owner, native config is the runtime projection,
    and legacy `codex-provider:*` custody is migrated only after a redacted
    review and explicit consent with batch compensation.
  - The audit itself changed no production code or user data. The subsequent
    consent-gated migration batch below implements only credential ownership
    transfer; full Codex activation and renderer convergence remain open under
    `T-AGENT-084`.

- Codex legacy Provider credential migration batch (2026-07-28;
  `FR-AGENT-024`, `DES-AGENT-020`, partial `TEST-AGENT-049` and
  `T-AGENT-084`):
  - Added a main-only source inspection service for legacy PromptHub-managed,
    environment-variable and native-inline Codex credentials. The renderer
    receives a redacted preview with readiness state and native-file digest,
    never credential values or secret references.
  - Added explicit selection and consent UI in the legacy Codex Provider panel.
    No source is selected by default; choosing **Later** performs no write.
    Confirmation creates unified Provider Profiles and transfers eligible
    credentials to `agent-provider:<profileId>` custody without rewriting
    `config.toml`.
  - Migration rejects stale native digests, duplicate or malformed provider
    ids, unsupported Agents and concurrent runs. Existing unified profiles are
    reused idempotently. Batch failure restores cleared legacy credentials and
    deletes created profiles and their new secret references.
  - Added two typed IPC channels and preload methods with bounded input
    validation and stable public errors. All seven locales include the review,
    consent, source and rollback-safe failure copy.
  - Focused verification passed at this intermediate checkpoint: migration/service regression 2 files / 90
    tests; migration IPC and renderer integration 3 files / 33 tests; shared
    and desktop typechecks passed. The migration service reached 100%
    statements, lines and functions with 99.08% branches; the IPC boundary
    reached 100% across all metrics; the consent UI reached 100% statements
    and lines with 97.22% branches and 90% functions. Full Codex activation,
    removal of the legacy renderer and Electron consent-flow E2E remain open,
    so `TEST-AGENT-049` and `T-AGENT-084` were not marked complete in this
    intermediate batch. The subsequent Codex convergence batch completed both.

- Codex unified Provider activation and renderer convergence (2026-07-28;
  `FR-AGENT-024`, `DES-AGENT-020`, `TEST-AGENT-025`,
  `TEST-AGENT-049`, `T-AGENT-079`, `T-AGENT-084`; advances
  `T-AGENT-015` and `T-AGENT-018`):
  - Added the full Codex Provider Profile adapter for
    `inspect/import/plan/apply/verify/rollback`. The Profile DB and model
    mappings are the management source; `config.toml` is a reviewed runtime
    projection. Provider id, endpoint, protocol, model mapping, stale digest
    and secret readiness all fail closed before a write.
  - Codex activation resolves write-only credentials in main, creates a
    safeStorage-encrypted device-local backup, preserves unrelated TOML and
    `auth.json`, writes atomically with mode `0600`, re-reads the native state,
    and restores the prior content after write or semantic verification
    failure. The renderer receives readiness and stable result codes only.
  - Routed Codex through the same `AgentProviderProfileWorkbench` as other
    supported Agents and removed the legacy Provider form/panel plus its
    renderer IPC/preload mutation surface. The remaining legacy main service is
    migration inspection only, so no second Provider management source remains.
  - Corrected two production-only regressions found by the Electron gate:
    Agent renderer value imports now target pure `packages/core` submodules
    instead of evaluating the Node/database barrel, and Plugin targets whose
    optional installed inventory is absent now project an empty list instead of
    crashing the selected Agent workspace.
  - Verification passed: focused Codex adapter/encrypted-backup coverage is
    17 tests with 100% statements, branches, functions and lines; the combined
    migration, adapter, workbench, workspace, overview and asset regression is
    9 files / 114 tests. Shared, core and desktop typechecks, affected ESLint,
    desktop production build, renderer runtime-boundary scan and
    `git diff --check` passed. The spec index and governance suites also passed.
  - The isolated Electron E2E passed after exercising the real consent flow for
    a native-inline legacy credential, confirming migration leaves
    `config.toml` byte-identical, importing a Claude native model into a
    Profile, creating a write-only Codex Profile, resolving activation fields,
    writing the selected Provider to temporary native TOML and confirming no
    secret text appears in the renderer.

- Codex unified Provider connection inventory check (2026-07-28;
  `FR-AGENT-011`, `DES-AGENT-009`, `TEST-AGENT-012`,
  `TEST-AGENT-026`, `T-AGENT-018`; leaves the explicit streaming subset under
  `T-AGENT-085`):
  - Added an optional adapter `testConnection` contract and a unified
    activation-service orchestration path. It resolves the stored Profile and
    model mapping without inspecting or mutating native Agent configuration.
  - The Codex adapter resolves managed or environment credentials only in
    main, then delegates to a bounded OpenAI-compatible `/models` probe. Public
    endpoints require HTTPS; explicit loopback HTTP is allowed; other
    private/internal targets, redirects and malformed endpoints fail closed.
    DNS is validated and pinned for direct requests. The request has zero
    retries, an 8-second total timeout and a 1 MiB streamed response limit.
  - Added a typed IPC/preload method and a Codex-only connection section in the
    unified Provider Profile detail. Results expose only status, endpoint
    origin, model inventory/presence and elapsed time. Credentials, response
    bodies, query values and native paths do not cross IPC.
  - Verification passed: core activation 22 tests; desktop connectivity,
    Codex adapter, IPC, store and workbench 52 tests; locale regression 7
    tests; shared/core/desktop typechecks; affected desktop ESLint; production
    build; and the real Electron Agent workspace E2E with a temporary local
    OpenAI-compatible server. The connectivity helper and changed core
    activation service each reached 100% statements, branches, functions and
    lines. All temporary servers and Electron processes were closed.
  - The check proves endpoint/auth/model inventory only. It does not perform a
    billable inference or claim first-token latency; that explicit streaming
    workflow remains open under `T-AGENT-085`.

- Codex explicit streaming Provider model test (2026-07-28;
  `FR-AGENT-011`, `DES-AGENT-009`, `TEST-AGENT-012`, `T-AGENT-085`):
  - Added the optional adapter/core model-test contract and typed
    IPC/preload/store boundary. The main process resolves the stored Profile,
    primary mapping and managed or environment credential without reading or
    mutating the active native Agent configuration.
  - Added bounded OpenAI Responses and Chat Completions SSE probes using one
    fixed minimal prompt and an 8-token output cap. The request reuses the
    connection check's HTTPS/loopback, DNS pinning and SSRF policy, follows no
    redirects, applies 5-second connect, 8-second first-token and 20-second
    total deadlines, retries at most once, and limits responses to 256 KiB.
  - Results record model, status, total latency, first-token latency, retry
    count and reported token usage. Only a control-character-free,
    credential-redacted 256-character preview crosses IPC. Authentication,
    quota, rate limit, missing model, HTTP, protocol, network, timeout,
    cancellation and size failures remain structured stable categories.
  - The unified Profile workbench keeps connection inventory and model
    inference as separate actions. Model inference requires explicit quota
    confirmation, offers cancellation, and displays only the redacted result.
    Selecting another Profile, clearing the workflow or destroying the
    renderer aborts the main-owned request and removes its scoped controller.
  - Verification passed: the focused desktop regression passed 8 files / 77
    tests and core activation passed 24 tests; locale regression covered all 7
    locales. Shared, core and desktop typechecks, affected ESLint, Prettier and
    the desktop production build passed. The model-test helper reached 100%
    statements, branches, functions and lines. The isolated Electron Agent
    workspace E2E used a temporary local OpenAI-compatible SSE server to
    create a write-only Profile, confirm quota use, run the real streaming
    request, render the result and verify the credential never appeared in the
    renderer. All temporary servers and Electron processes were closed.

- Scalable session browsing batch (2026-07-22, `FR-AGENT-032`, `DES-AGENT-028`):
  - Main/preload contract: `agent:sessions:list` now accepts a validated non-negative `offset`; all supported filesystem and native adapters return the requested bounded window. Native CLIs without cursors receive only `offset + limit + 1` as the discovery bound.
  - Renderer: History loads 50 metadata records initially, advances source offsets independently of filtered/invalid rows, deduplicates appended pages by stable session id, and isolates off-screen list/transcript layout with `content-visibility: auto`. Transcript reads remain lazy and capped at 2 MiB / 64 KiB per entry; only 80 entries are mounted initially and later batches require explicit expansion.
  - Empty state: a successful empty native source is explained separately from adapter errors and unsupported Agents. OpenCode remains native-CLI owned through the bounded read-only `opencode db` projection; plugin caches and sidecars are not treated as conversations.
  - Verification: `TEST-AGENT-040` passed with offset validation, OpenCode native pagination, 50-of-120 metadata paging, deduplicated append, stale-page isolation during Agent changes, 80-of-120 progressive transcript mounting, truncation notice, off-screen rendering isolation, and localized native-empty guidance. The focused service/IPC/component suite passed 23 tests; the major-adapter/overview/workspace regression passed 35 tests. A read-only current-machine probe over 294 Codex sessions loaded 50 metadata rows in 170.5 ms and the second 50-row page in 252 ms. Focused coverage across the session service/adapters/panel reached 93.71% statements, 93.02% functions, and 67.84% branches; new paging/empty/stale-result conditions have direct tests, while remaining gaps are legacy parser and injected filesystem-error variants. Desktop typecheck, targeted lint, formatting, `git diff --check`, and the desktop production build passed. Live Electron inspection confirmed the current OpenCode native source displays `0 / 0` with the explicit empty explanation rather than a parser error.

- Claude Code unified Provider activation and native Anthropic tests
  (2026-07-28; `FR-AGENT-003` to `FR-AGENT-007`,
  `FR-AGENT-011`, `DES-AGENT-004` to `DES-AGENT-006`,
  `DES-AGENT-009`, `T-AGENT-017`):
  - Added the complete Claude `settings.json` adapter for
    inspect/import/plan/apply/verify/rollback. It preserves unrelated JSONC,
    rejects symlinks, oversized or malformed input, detects concurrent native
    edits, stores encrypted device-local backups, writes atomically, re-reads
    semantic state and restores the exact prior file after failure.
  - Unified Profiles support direct Anthropic and Anthropic-compatible
    gateways with an explicit `ANTHROPIC_API_KEY` or
    `ANTHROPIC_AUTH_TOKEN` credential kind. The secret is resolved only in
    main. Platform-native Claude authentication removes PromptHub-managed
    direct-provider env keys and never reads or rewrites Claude-owned
    `.credentials.json`. Bedrock, Vertex and Foundry imports remain read-only.
  - Added bounded native Anthropic `/v1/models` and `/v1/messages` SSE probes
    with HTTPS/explicit-loopback policy, DNS validation/pinning, no redirects,
    8-second connection inventory timeout, 5-second connect, 8-second
    first-token and 20-second total model deadlines, one bounded retry,
    cancellation, response caps and credential-redacted previews. IP TLS
    endpoints omit invalid SNI server names.
  - The Provider form defaults Claude to Anthropic Messages, exposes the two
    credential kinds in all seven locales and clears a managed credential when
    the user switches to platform-native auth.
  - Verification passed: the focused adapter and Anthropic probe suites passed
    23 tests and both production modules reached 100% statement, branch,
    function and line coverage. The combined Provider/activation/UI/locale
    regression passed 8 files / 85 tests. Desktop typecheck, affected ESLint,
    Prettier, file-size checks, production build and `git diff --check` passed.
    The isolated Agent workspace Electron E2E passed (1 test) and closed its
    temporary app/server resources. No process, server or temporary directory
    remains. The full desktop suite and release-quick remain open for the
    larger active change.

- Gemini CLI enterprise/paid Provider activation
  (2026-07-28; `FR-AGENT-011`, `DES-AGENT-009`,
  `TEST-AGENT-050`, `T-AGENT-019`):
  - Verified the public `google-gemini/gemini-cli` implementation at commit
    `bef6119500b0238ad84f6396d2a6cabda9991554`. PromptHub uses the documented
    `settings.json`, `.env`, auth-type and Gemini API contracts as evidence; no
    upstream source is copied or vendored.
  - Added a complete two-file adapter for inspect/import/plan/apply/verify/
    rollback. JSONC edits are limited to `model.name` and
    `security.auth.selectedType`; environment edits are limited to
    `GEMINI_API_KEY` and `GOOGLE_GEMINI_BASE_URL`. One encrypted bundle protects
    both files, both are checked for concurrent changes, and any partial write
    or failed reread restores the exact prior pair.
  - Paid API profiles use the main-only `GEMINI_API_KEY` secret and native
    `/v1beta/models` plus `streamGenerateContent` probes. OAuth personal,
    Vertex AI, compute ADC, Cloud Shell and gateway authentication stay
    platform-owned: PromptHub preserves those modes and neither borrows nor
    tests their credentials.
  - The unified Profile form now defaults Gemini to `google-gemini` /
    `google-generative-ai`, clears managed credentials when switching to a
    native mode, records the selected native auth type and exposes the verified
    protocol label in all seven locales. Gemini remains an enterprise/paid
    compatibility target; Antigravity remains the consumer entry.
  - Focused verification passed 9 files / 100 tests after adversarial and
    locale expansion. The two new production modules reached 100% statements
    and lines; the adapter also reached 100% functions and 99%+ branches,
    while the network probe reached 96%+ functions and 94%+ branches.
    Remaining uncovered probe branches are transport-injection/default-TLS
    variants, not untested security or rollback decisions. Desktop typecheck,
    affected ESLint, Prettier, production build and isolated Agent workspace
    Electron E2E passed; Playwright closed its app process. The repository-wide
    file-size gate remains red only for concurrent Skill work:
    `SkillStore.tsx` and `SkillStoreDetail.tsx` are each 1,536 lines. Neither
    file belongs to this Provider batch; all Gemini source and test files are
    below the 1,000-line default.

- Kimi Code unified Provider activation
  (2026-07-28; `FR-AGENT-003` to `FR-AGENT-006`,
  `FR-AGENT-011`, `DES-AGENT-033`, `TEST-AGENT-051`,
  `T-AGENT-086`):
  - Verified the official Kimi Code provider, config-file and environment
    contracts and the public `MoonshotAI/kimi-cli` implementation at revision
    `4a550effdfcb29a25a5d325bf935296cc50cd417`. PromptHub reuses the documented
    TOML contract and existing bounded Provider probes; no upstream source was
    copied or vendored.
  - Added a full `config.toml` adapter for inspect/import/plan/apply/verify/
    rollback/test. Direct `kimi`, `openai`, `openai_responses`, `anthropic` and
    `google-genai` profiles project one provider entry, one model entry and
    `default_model`, while preserving unrelated semantic TOML fields. Provider
    id, model alias, upstream model id and context size are validated before a
    main-only secret is resolved.
  - Kimi `/login`, provider OAuth, provider environment, custom credential
    headers and Vertex ADC remain platform-owned and read-only. Inspect/import,
    snapshots, renderer state, logs and ordinary exports expose only redacted
    ownership/status metadata. A regression test found and closed a boundary
    where `vertexai` could otherwise be treated as a direct plaintext-key
    profile.
  - Activation rejects malformed, oversized, symlinked, path-unsafe and
    concurrently modified files. It writes atomically, stores the exact prior
    bytes in an encrypted device-local backup, optionally runs bounded
    `kimi doctor config <path>`, re-reads the native state, and restores the
    original bytes or file absence after validation, verification or later
    rollback failure.
  - Direct connection and explicit streaming model tests dispatch to the
    existing OpenAI-compatible, Anthropic and Google Gemini probes. Kimi adds
    no proxy, OAuth pool, protocol converter or separate network policy.
  - The unified Profile form now exposes the official provider types, provider
    id, model alias, upstream model id and context limit. Direct keys remain
    write-only; platform-native authentication hides the credential input. New
    labels and validation errors are present in all seven locales.
  - Focused Kimi verification passed 3 files / 27 tests. The three new
    main-process modules reached 100% statements, branches, functions and
    lines. The broader Provider/Profile/activation/UI/i18n regression passed
    26 files / 253 tests. Shared and desktop typechecks, affected desktop
    ESLint, Prettier, the desktop production build, and the isolated Agent
    workspace Electron E2E passed; Playwright closed its Electron process and
    test server.
  - All Kimi source and test files remain below the 1,000-line default. The
    repository-wide file-size gate is still blocked only by concurrent Skill
    work: `SkillStore.tsx` and `SkillStoreDetail.tsx` are each 1,536 lines and
    were not modified by this Provider batch.

- Qwen Code v4 Provider activation
  (2026-07-28; `FR-AGENT-003` to `FR-AGENT-006`,
  `FR-AGENT-011`, `DES-AGENT-034`, `TEST-AGENT-052`,
  `T-AGENT-087`):
  - Verified the current `settings.json`, `.env`, authentication, custom
    provider and model-provider contracts against the official
    `QwenLM/qwen-code` documentation and public implementation at revision
    `bfd4c8e519f96ca5bdc6cdd9f7a635b9345dbf11`. PromptHub reuses only the
    documented contract and its existing Provider infrastructure; no upstream
    source was copied or vendored.
  - Added inspect/import/plan/apply/verify/rollback/test for the current
    `$version: 4` bare-array `modelProviders` shape. Direct OpenAI-compatible,
    Anthropic and Google GenAI Profiles preserve provider/model extension
    fields, map custom ids through `providerProtocol`, select the same provider
    and model through native settings, and project the managed credential only
    to the user `.env`.
  - Vertex ADC, legacy Qwen OAuth, automatic Alibaba Coding Plan ownership and
    credentials not owned by a Profile remain platform-owned and read-only.
    Deprecated inline auth fields are removed during direct activation;
    plaintext credentials never cross IPC, enter snapshots, logs or ordinary
    exports.
  - Settings and environment files share one bounded digest and one encrypted
    exact-byte backup. The adapter rejects malformed, oversized, symlinked,
    path-unsafe and concurrently modified inputs, uses atomic replacements,
    restores both files after partial failure, and semantically re-reads both
    files before reporting success.
  - Extracted one main-process protocol probe dispatcher for the existing
    OpenAI chat/responses, Anthropic Messages and Google GenAI probes, plus a
    shared comment-preserving dotenv codec. Gemini now reuses the same dotenv
    boundary instead of maintaining a duplicate parser.
  - The unified Profile form exposes the Qwen provider id, official protocol,
    environment-key name, endpoint, primary model and write-only credential.
    Platform-native entries hide credential and endpoint controls. Validation
    and labels are present in all seven locales.
  - Focused Qwen/Kimi/Gemini verification passed 7 files / 83 tests; the full
    Provider/Profile/activation regression passed 27 files / 316 tests. Qwen
    adapter, shared probe dispatcher and dotenv codec reached 100% statements,
    branches, functions and lines. Desktop/shared typechecks, affected ESLint,
    Prettier, spec governance, production build and the real Agent workspace
    Electron E2E passed. The E2E created and activated a Qwen direct Profile,
    verified the native v4 provider/model projection, preserved an unrelated
    `.env` entry, observed the managed credential only on disk, and confirmed
    it never appeared in renderer text. Playwright closed its Electron process.
  - The Qwen adapter is 990 lines and every new or changed Qwen source/test
    file remains below the 1,500-line batch limit. Existing concurrent Skill
    files above that preference were not modified by this Provider batch.

- OpenCode current-v1 Provider activation
  (2026-07-28; `FR-AGENT-003` to `FR-AGENT-006`,
  `FR-AGENT-011`, `DES-AGENT-035`, `TEST-AGENT-053`,
  `T-AGENT-088`):
  - Verified the stable singular `provider` / `model` / `small_model` config
    contract and XDG data-root `auth.json` ownership against official OpenCode
    docs, installed OpenCode `1.18.3`, and public `anomalyco/opencode`
    revision `017a5977d2107092007623e507fc5c6eb337d3b2`. No upstream source was
    copied or vendored.
  - Added a dedicated adapter and pure native codec for
    inspect/import/plan/apply/verify/rollback/test. The adapter follows
    `opencode.jsonc`, `opencode.json`, `config.json` precedence, preserves
    JSONC comments and unrelated provider/model fields, and writes only the
    documented `@ai-sdk/openai-compatible` Chat or `@ai-sdk/openai` Responses
    custom-provider shapes.
  - Direct activation stores the PromptHub-owned API key only as
    `{ type: "api", key }` in main-resolved XDG `auth.json`. Native API,
    OAuth, well-known, environment, file, cloud and unsupported-package
    credentials are imported as redacted read-only state and are never
    borrowed for connectivity tests. Existing authorization headers and the
    experimental plural-v2 `providers` contract fail closed.
  - Config and auth share one bounded digest and one encrypted exact-byte
    backup. Both files reject malformed, oversized and symlink inputs; stale
    or partially failed writes restore the exact prior pair before returning
    an error. Semantic reread verifies provider/package/endpoint/model/auth
    identity without exposing credential values.
  - The unified Profile form now offers the two supported runtime packages
    without asking users to type npm package names. It requires provider id,
    endpoint, primary model and a write-only credential; imported native
    Profiles remain visibly read-only. The capability inventory now marks
    OpenCode Provider & Model supported, while the generic model-only fallback
    remains available only to platforms without a full adapter.
  - Focused OpenCode/Profile verification passed 6 files / 70 tests; the
    complete Provider regression passed 30 files / 426 tests. The OpenCode
    adapter and native codec reached 100% statements, branches, functions and
    lines. Desktop/shared typechecks, affected ESLint, Prettier, production
    build and the real Agent workspace Electron E2E passed. The E2E activated
    a direct Profile against isolated config and XDG auth fixtures, preserved
    native OAuth and unrelated config state, and confirmed neither native nor
    managed secrets appeared in renderer text. Playwright closed its Electron
    process and local provider server.
  - The adapter is 821 lines, the codec is 240 lines, and every new OpenCode
    source or test file remains below the 1,500-line batch limit.

- GitHub Copilot CLI current asset and model-only boundary
  (2026-07-28; `FR-AGENT-036`, `DES-AGENT-036`, `TEST-AGENT-054`,
  `T-AGENT-089`):
  - Re-audited the installed Copilot CLI `1.0.48` and GitHub's public CLI
    configuration references. PromptHub reuses documented contracts only; no
    upstream source is copied or vendored.
  - The canonical registry now resolves `COPILOT_HOME` before `~/.copilot` and
    exposes the documented user-owned Skills, SubAgents, MCP, Rules, installed
    Plugin discovery, and `settings.json` paths. Platform-managed auth,
    `config.json`, permissions, sessions, MCP secrets, logs, and Plugin
    registration metadata remain excluded.
  - Added a JSONC-preserving model-only adapter for the top-level
    `settings.json` `model` preference. It supports missing-file creation,
    bounded input validation, symlink rejection, exact backup, stale-plan
    rejection, atomic replacement, semantic reread, and rollback while
    preserving comments and unrelated fields.
  - Copilot BYOK remains environment-only, so endpoint, secret, and non-native
    protocol Profiles fail closed. The capability is intentionally `partial`,
    not a full Provider adapter.
  - Focused verification passed 6 files / 69 tests after documentation
    convergence. Desktop and shared typechecks, the shared contract suite,
    affected desktop ESLint, targeted Prettier, spec governance, and
    `git diff --check` passed.
  - The isolated Copilot suite passed 5 tests under V8 coverage. The shared
    legacy `agent-model-config.ts` and generic Provider adapter remain below
    whole-file 100% because the report includes unrelated platform branches;
    the Copilot root, JSONC model, missing, malformed, oversized, symlink,
    stale-plan, apply, verify, rollback, and environment-only BYOK decisions
    are all exercised by `TEST-AGENT-054` and the common adapter suite.

- GitHub Copilot native Plugin installation truth gate
  (2026-07-28; `FR-AGENT-037`, `DES-AGENT-037`, `TEST-AGENT-055`,
  `T-AGENT-090`):
  - Corrected the target matrix so Copilot remains visible as an Adapter but is
    disabled until PromptHub has a real `copilot plugin install` integration.
    Direct distribution now fails in the shared target gate before path
    resolution or filesystem mutation.
  - Preserved read-only discovery of valid packages under the documented
    `installed-plugins/<name>/<version>/` tree. PromptHub no longer equates a
    generated `plugin.json` or a copied directory with native registration.
  - The focused Plugin regression passed 5 files / 57 tests, including
    fail-before-write and installed-package discovery. Desktop/core typechecks
    and affected test ESLint passed. The existing PluginManager component suite
    still emits pre-existing React `act(...)` warnings despite passing; this
    batch did not modify that component or suppress the warning.

- Cursor current asset and native Plugin truth boundary
  (2026-07-28; `FR-AGENT-038`, `DES-AGENT-038`, `TEST-AGENT-056`,
  `T-AGENT-091`):
  - Corrected the canonical Cursor user asset projection to
    `~/.cursor/skills`, `~/.cursor/agents`, `~/.cursor/mcp.json`, and
    `~/.cursor/plugins`. Removed the fabricated `plugins/cache/prompthub`
    target and did not invent a global Rules or generic Config Files path.
  - Kept Provider, Usage, and Maintenance planned. Sessions were planned at
    this earlier boundary and are superseded by the later evidence-backed
    read-only transcript adapter. Private Cursor settings databases,
    authentication, checkpoints, snapshots, caches, logs, and runtime state
    remain excluded.
  - Preserved bounded read-only discovery of Marketplace-cache packages and
    local test packages. Cursor remains visible as a Plugin adapter but direct
    distribution now fails before target resolution or filesystem mutation;
    package generation is no longer presented as native installation. The
    corrected Plugin root is scanned once rather than through two equivalent
    recursive roots.
  - Test-first verification demonstrated four failures against the prior
    behavior. After implementation, the focused suite passed 5 files / 63
    tests. Shared, core, and desktop typechecks passed; affected desktop test
    ESLint, targeted Prettier, spec governance, and `git diff --check` passed.
    Shared/core have no package-level ESLint configuration, so their two
    constant-only source edits were checked by TypeScript and Prettier rather
    than a fabricated lint invocation.

- Cherry Studio current database and Skill boundary
  (2026-07-28; `FR-AGENT-039`, `DES-AGENT-039`, `TEST-AGENT-057`,
  `T-AGENT-092`):
  - Re-audited Cherry Studio's public path registry and Skill service at
    upstream revision `9785c652a6d477fcf3ab86719f4bdd1e57736bbd`.
    PromptHub references the public contract only; no upstream source is copied
    or vendored.
  - The existing database-backed Skill adapter now probes current
    `Data/cherrystudio.sqlite` before compatible `Data/agent.db`,
    `Data/agents.db`, and root `cherrystudio.sqlite` databases. This prevents a
    compatible obsolete database from receiving a write while Cherry Studio
    reads the current v2 database.
  - The canonical registry now uses the cross-platform `Data/Skills` relative
    path and the verified macOS system/user Applications launch allowlist.
    Provider, MCP, Rules, Config, Plugins, Sessions, Usage, Maintenance,
    credentials, IndexedDB, Local Storage, caches, and runtime state remain
    unclaimed. The composite Plugin target stays visible and disabled.
  - The red phase reproduced three prior mismatches: current database
    precedence, the Windows-only Skill separator, and missing launch support.
    After the minimal implementation, the focused suite passed 4 files / 55
    tests. Shared and desktop typechecks, affected desktop ESLint, targeted
    Prettier, spec governance, and `git diff --check` passed.
  - Database selection performs at most four existence checks and one schema
    probe. No unbounded scan, network request, migration, or new persistent
    state was introduced. Existing cross-filesystem transaction hardening
    remains a separate Skills-owner task rather than an inflated capability
    claim.

- Windsurf public transcript boundary
  (2026-07-28; `FR-AGENT-040`, `DES-AGENT-040`, `TEST-AGENT-058`,
  `T-AGENT-093`):
  - Added a bounded, read-only adapter for the documented opt-in
    `~/.windsurf/transcripts/<trajectory_id>.jsonl` export. It exposes only
    `user_input.user_response` and `planner_response.response`; code actions,
    commands, tool payloads, file contents, and unknown future steps remain
    hidden.
  - Kept resume, project, model, mutation, deletion, and lifecycle metadata
    unavailable. The Sessions capability is `partial`, while proprietary
    `~/.codeium/windsurf/cascade/*.pb` state remains excluded.
  - The red phase produced four expected failures against the unsupported
    adapter/capability baseline. After implementation, the focused suite passed
    4 files / 44 tests, including malformed JSONL, pagination, sorting,
    truncation, 64 KiB entry bounds, invalid identifiers, symlinks, source
    immutability, capability truth, and fail-before-write composite Plugin
    distribution.
  - Scanning is limited to the direct transcript directory and 2,000 files;
    metadata reads at most 256 KiB per selected page entry, details at most
    2 MiB, and no network call, database write, runtime mutation, or copied
    upstream source was introduced.

- Provider Profile capability-driven test controls
  (`FR-AGENT-003`, `FR-AGENT-011`, `TEST-AGENT-046`):
  - Removed the renderer-only `codex` gate around connection and streaming
    model tests. Every Agent whose canonical Provider capability is
    `supported` now exposes the same tested workflow; partial, planned, and
    unsupported adapters remain hidden without a second platform allowlist.
  - A Gemini regression reproduced the missing control before the fix and the
    focused Provider Profile component suite passed 1 file / 22 tests after
    implementation. Credentials still resolve only in the main process and
    connection results remain redacted.

- Kiro current CLI boundary
  (2026-07-28; `FR-AGENT-041`, `DES-AGENT-041`, `TEST-AGENT-059`,
  `T-AGENT-094`):
  - Added `KIRO_HOME` root resolution, global Skills/Agents/MCP paths,
    `settings/cli.json`, and the verified macOS launch allowlist. Kiro's
    multi-file `steering/` directory is not misrepresented as a single editable
    Rules file.
  - Added a partial model-only adapter for `chat.defaultModel`. It reports
    credentials as platform-managed, exposes no endpoint, preserves JSONC
    comments and unrelated fields, and reuses backup, atomic replacement,
    concurrent-change detection, reread verification, and rollback. The common
    Provider activation adapter now preserves the nested settings path during
    rollback.
  - Added a partial, read-only CLI session adapter for locally verified
    `sessions/cli` metadata and JSONL. Only Prompt/Assistant `text` content is
    visible; thinking, tool-use, tool-result, runtime state, unknown records,
    and malformed data are hidden or counted. Resume and mutation remain
    unavailable.
  - Disabled direct Kiro Plugin distribution before resolver or filesystem
    access. Existing Power package structures remain available for bounded
    read-only inventory; native import/registration is a separate future
    adapter.
  - PromptHub reuses documented behavior and verified runtime contracts only;
    no Kiro or CC Switch source file is copied, vendored, or loaded at runtime.
  - The red phase reproduced nine missing capability/path/adapter gates plus the
    native Power distribution misclaim. The expanded focused suite passes 8
    files / 93 tests; shared, core, and desktop typechecks, affected desktop
    ESLint, targeted Prettier, spec governance, and `git diff --check` pass.
    The new Kiro session adapter has measured 100% lines, statements, functions,
    and branches. New Kiro model and nested rollback branches are covered in
    the focused tests; the legacy shared model-config module is not claimed as
    whole-file 100% coverage.

- Grok Build Provider and Model adapter
  (2026-07-29; `FR-AGENT-042`, `DES-AGENT-042`, `TEST-AGENT-060`,
  `T-AGENT-095`):
  - Added the verified `$GROK_HOME` or `~/.grok` root and a dedicated adapter
    for the public `[models].default` plus `[model.<alias>]` contract in
    `config.toml`. The adapter maps `chat_completions`, `responses`, and
    `messages` to PromptHub's existing direct-provider protocols while
    preserving unrelated TOML fields.
  - Custom Provider Profiles are environment-owned: PromptHub stores only the
    environment-variable name and resolves its value inside bounded
    main-process probes. Native session/OIDC, `XAI_API_KEY`, inline
    `api_key`, and sensitive headers remain Grok-owned; imported inline
    credentials are redacted and read-only.
  - Activation requires an encrypted full-config backup, expected-digest race
    check, atomic replacement, semantic reread verification, and exact rollback
    or new-file removal after failure. Bounded reads reject malformed,
    oversized, symlinked, and out-of-root configuration.
  - The Provider Profile form exposes provider alias, environment key,
    endpoint, model alias, upstream model, and context window without a
    managed-secret control. Native inline-auth imports cannot be edited or
    saved through the form.
  - The red phase failed because the Grok adapter module did not exist. After
    implementation, the focused adapter and boundary suite passes 2 files / 16
    tests and measured 100% statements, branches, functions, and lines for the
    new adapter. The implementation uses public contract evidence only; no
    Grok Build, CC Switch, or other upstream source is copied or vendored.
  - Final targeted verification passed the Grok adapter, boundary, Profile UI,
    capability inventory, shared model-provider dispatch, activation IPC,
    Provider Profile workbench, and Agent workspace suites: 8 files / 92 tests.
    Shared, core, and desktop typechecks, affected desktop ESLint, Prettier,
    spec governance, and `git diff --check` passed. The repository file-size
    gate remains red only for the pre-existing unrelated
    `SkillStore.tsx` and `SkillStoreDetail.tsx` files at 1,536 lines each;
    this Grok batch's new source and test files remain below 1,000 lines.

- Governance and evidence reconciliation audit (2026-07-29):
  - Re-audited all `FR-AGENT-*`, `DES-AGENT-*`, `TEST-AGENT-*` and
    `T-AGENT-*` definitions and references. No true duplicate definition or
    orphan reference remains; proposal and implementation both remain in the
    `implement` / `in-progress` phase.
  - Corrected the review snapshot so Grok Provider matches its verified adapter
    and reframed the historical Codex checkpoints as intermediate state rather
    than current blockers.
  - Narrowed `T-AGENT-084` traceability to the Codex migration and convergence
    behavior it actually completes. The cross-platform secret, import,
    filesystem rollback and tray umbrella tests remain open until every
    applicable platform and the tray path pass them.
  - Current Kilo documentation proves a split-root contract:
    `~/.kilo/skills/` for global Skills and `~/.config/kilo/` for global
    config, Agents and instructions. PromptHub's existing
    `~/.kilo/rules/global.md` projection is stale; it is recorded as a design
    conflict and is not promoted to supported capability. Correcting the
    shared path contract requires an explicit compatibility decision before
    production code changes.
  - The CC Switch checkout remains a research reference outside PromptHub's
    build and public assets. PromptHub reuses only public protocol and workflow
    evidence and keeps independently implemented storage, secret and rollback
    boundaries.

- Amp current asset and MCP boundary
  (2026-07-29; `FR-AGENT-043`, `DES-AGENT-043`, `TEST-AGENT-061`,
  `T-AGENT-096`):
  - Replaced the stale Windows `%APPDATA%\amp` primary root with the current
    cross-platform `%USERPROFILE%\.config\amp` contract while retaining the
    former path as a read fallback. Unix-like platforms continue to use
    `~/.config/amp`.
  - Added user and project MCP targets for `settings.json` and
    `.amp/settings.json`. Both reuse the owning MCP library and preserve the
    literal top-level `amp.mcpServers` key, unrelated dotted settings and
    unmanaged server entries during reconciliation.
  - Kept Provider explicitly unsupported because Amp does not expose a
    user-managed provider projection. Hosted account, model, thread and usage
    data remain Amp-owned. Raw settings editing and direct TypeScript Plugin
    copying remain disabled because public file locations alone do not prove a
    safe install/activation/rollback contract.
  - The initial focused test failed four assertions for the stale root,
    missing presets, incorrect MCP key and Provider overclaim. The completed
    focused suite passes 5 files / 46 tests; shared, core and desktop
    typechecks, affected ESLint, Prettier, spec governance and
    `git diff --check` pass.
  - The full desktop suite completed 4,186 of 4,188 tests. Its two failures are
    outside this Amp batch: the Skill UI integration expects the old one-arg
    installer call, and the Plugin path test expects `plugins` while the
    current worktree returns `installed-plugins`. The repository file-size
    gate also remains red only for the unrelated pre-existing
    `SkillStore.tsx` and `SkillStoreDetail.tsx` files at 1,536 lines each.
    Amp's new test file is 208 lines; no Amp-touched source exceeds the project
    limits.

- Provider Profile credential replacement compensation
  (2026-07-29; `FR-AGENT-044`, `DES-AGENT-044`, `TEST-AGENT-062`,
  `T-AGENT-097`):
  - Audited PromptHub's Provider Profile transaction against the public
    CC Switch `v3.18.0` Provider write and compensation workflow. The checkout
    remains at `/Users/lingxiaotian/Programs/public/cc-switch`, outside every
    PromptHub application asset directory; no source file, runtime dependency
    or bundled public asset was copied.
  - Reproduced a cross-store failure where SQLite had committed the stable
    replacement secret reference, cleanup of the legacy reference failed, and
    the former compensation restored secret state without restoring the
    Profile and mappings. The resulting Profile could point at a cleared
    replacement secret.
  - Changed compensation to restore the prior Profile and exact mappings first
    with the committed optimistic timestamp. Only after SQLite restoration
    succeeds does it clear the replacement reference and restore the prior
    secret. When SQLite compensation itself fails, the replacement secret is
    retained because the current durable Profile still requires it, and the
    service returns the stable
    `AGENT_PROVIDER_PROFILE_UPDATE_ROLLBACK_FAILED` result.
  - Test-first red verification failed both new scenarios: no compensating DB
    update was attempted after legacy cleanup failure, and a DB compensation
    failure returned the generic update error. The completed Profile
    credential suite passes 5 files / 48 tests, including a real SQLite
    integration that asserts the exact durable Profile, mappings and secret
    state. The changed service has 100% statement, branch, function and line
    coverage. Desktop typecheck, affected ESLint, Prettier, spec governance and
    `git diff --check` pass.
  - The full desktop suite passes 4,189 of 4,191 tests across 454 passing test
    files. Its two failures are unrelated existing-worktree expectations: the
    Skill UI integration still expects the former one-argument installer call,
    and the Plugin path test expects `plugins` while current implementation
    returns `installed-plugins`.

- Device-local session metadata persistence foundation
  (2026-07-29; `FR-AGENT-010`, `DES-AGENT-045`, `TEST-AGENT-063`,
  `T-AGENT-012`, `T-AGENT-098`):
  - Added shared source, index, scan, annotation and bounded-list contracts plus
    `agent_session_sources` and `agent_session_index` SQLite tables. Fresh
    schema and existing-user startup share the idempotent
    `agent_session_index_v1` migration and indexed source/status/update query
    paths.
  - External transcript files remain platform-owned. The tables contain only
    bounded redacted metadata, device-local paths, stable scan state and
    PromptHub-owned tags/note; no transcript body column or remote sync/export
    projection was added.
  - Added transactional full and incremental scan commits. Full scans mark
    unseen rows missing, incremental scans leave them untouched, observed rows
    update metadata without replacing annotations, and source cursor/result
    changes commit with the same transaction. Stable scan failures update only
    the source status. Injected SQLite write failure proves source and session
    changes roll back together.
  - The initial red test failed all 8 cases because the DB class, tables and
    migration marker did not exist. The completed focused suite passes 10
    tests covering fresh/migrated schema, identity, missing/parse-error,
    annotation preservation, literal search, 200-row page cap, 10,000-record
    scan cap, malformed/corrupt input, cascade deletion and failure rollback.
    The new DB class has 100% statement, branch, function and line coverage.
    Expanded migration regression passes 3 files / 28 tests; shared, DB and
    desktop typechecks plus affected ESLint pass.
  - This batch intentionally does not connect the existing platform session
    readers to persistence or renderer IPC. That orchestration, incremental
    adapter cursors, cancellation and 10,000-session end-to-end stress remain
    under `T-AGENT-022`, `TEST-AGENT-010` and `TEST-AGENT-011`.

- Claude/Gemini opt-in session index orchestration
  (2026-07-29; `FR-AGENT-010`, `DES-AGENT-046`, `TEST-AGENT-064`,
  `T-AGENT-099`):
  - Added one desktop main-process orchestration service between the existing
    verified Claude/Gemini read-only adapters and `AgentSessionIndexDB`.
    Merely opening or live-listing Sessions creates no persistent source row;
    source registration remains an explicit opt-in action.
  - Full scans enumerate only the verified bounded directory shapes, cap the
    inventory at 10,000 files, reuse unchanged metadata by path/mtime/size and
    adapter version, re-digest changed bounded prefixes, isolate malformed
    files as `parse-error`, and commit source/index state atomically.
  - Cancellation is checked during enumeration, between records and before
    commit. A cancelled scan leaves the prior source/index state unchanged.
    Other failures record one stable source error without deleting the prior
    inventory. Missing transcripts become metadata-only `missing` rows while
    PromptHub annotations remain.
  - Stored titles redact supported key/token/password shapes, previews remain
    null, and transcript bodies are never persisted. Indexed search uses
    SQLite pagination; detail reads always return to the live adapter, so a
    missing source cannot be reconstructed from cached metadata.
  - The initial red test could not load the absent orchestration service. The
    completed real-SQLite fixture suite passes 11 tests and covers explicit
    opt-in/disable, idle live fallback, Claude/Gemini scan, unchanged reuse,
    adapter-version reparse, multi-page prior state, malformed files,
    redaction, cancellation, stable failure, source missing, annotation
    retention, search and live detail. The new orchestration file has 100%
    statement, branch, function and line coverage; the expanded focused
    session suite passes 3 files / 32 tests.
  - Renderer state/progress/cancel IPC is not introduced in this batch. It
    remains the next UI wiring step under `T-AGENT-022`,
    `TEST-AGENT-010` and `TEST-AGENT-011`.

- Session index IPC and renderer control
  (2026-07-29; `FR-AGENT-010`, `FR-AGENT-015`, `DES-AGENT-047`,
  `TEST-AGENT-065`, `T-AGENT-101`):
  - Added typed shared, preload and main-process contracts for redacted state,
    explicit opt-in, refresh, cancellation, progress and indexed search.
    Renderer-visible state contains no source id, root path, cursor, digest,
    indexed path, preview or transcript body.
  - Refresh controllers are scoped by renderer sender id and request id.
    Duplicate requests fail closed, another renderer cannot cancel the scan,
    renderer destruction aborts it, and controller/listener state is released
    in `finally` or component cleanup.
  - The Sessions sidebar now shows the local-index switch only for verified
    adapters. Enabling starts the first refresh; enabled sources expose one
    compact refresh action, active scans show determinate progress and cancel,
    and a selected-Agent change invalidates late state, progress and list
    results.
  - Indexed search is debounced and uses bounded SQLite pagination. Disabled
    sources preserve the existing live-reader and in-page filter behavior.
    Transcript detail continues to use the external read-only adapter on
    demand.
  - Added all seven locale keys and preload contract coverage. The focused
    session/index/i18n suite passes 8 files / 54 tests. New IPC, operation
    factory and renderer hook modules each have 100% statement, branch,
    function and line coverage. Shared and desktop typechecks, affected
    ESLint and Prettier pass. The existing panel suite still emits its prior
    React `act(...)` warnings while passing; no warning is suppressed.

- Verified Provider Profile tray quick switching
  (2026-07-29; `FR-AGENT-012`, `DES-AGENT-048`, `TEST-AGENT-013`,
  `TEST-AGENT-066`, `T-AGENT-024`, `T-AGENT-102`):
  - Extracted one main-process Provider runtime that owns the Profile service,
    secure secret store, adapter registry, activation service and tray
    projection. IPC and tray now receive the same runtime instance, including
    after database handler rebind; no active-provider record was added.
  - The tray groups active Profiles by the fixed adapter registry. A latest
    verified snapshot is shown as current only after a fresh native preview
    still returns the same platform, Profile, native digest and no-review
    `preserve` plan. External changes, read errors and stale snapshots remove
    the current marker instead of trusting cached state.
  - Selecting an alternate Profile uses the existing preview, a single native
    localized confirmation, and the same activation/backup/verify/rollback
    service as the workspace. Conflicts and blocked plans open the Agent
    workspace; cancelled and already-active plans produce no extra dialog;
    failures expose only a stable localized result.
  - Provider menu refresh is bounded by the fixed adapter set and uses a
    generation token so late loads after a newer refresh or tray destruction
    cannot replace the menu. A refresh failure retains the prior menu and logs
    no underlying error text.
  - Test-first verification initially failed because the tray service,
    runtime, provider submenu, confirmation handler and async reload contract
    did not exist. The completed focused suite passes 6 files / 47 tests,
    and the dedicated five-file coverage run passes 42 tests with 100%
    statement, branch, function and line coverage for the new runtime,
    projection, handler, tray controller and tray menu. Desktop typecheck and
    affected ESLint, desktop production build, spec governance and
    `git diff --check` pass. Every new file is below 400 lines. The file-size
    gate now accepts the touched legacy main entry at its 1,974-line baseline;
    it remains red only for the unrelated existing `SkillStore.tsx` and
    `SkillStoreDetail.tsx` files at 1,536 lines each. No commit, push, tag or
    release action was run.

- Read-only Agent CLI diagnostics
  (2026-07-29; `FR-AGENT-014`, `DES-AGENT-049`, `TEST-AGENT-067`,
  `T-AGENT-103`):
  - Added one optional CLI descriptor to the canonical platform registry and
    derived maintenance capability from it. Claude Code, Codex, Kimi Code,
    Qwen Code, OpenCode and Oh My Pi now have evidence-backed version
    diagnostics; all other built-ins remain `planned`, and custom Agents do
    not accept renderer-provided executable paths.
  - Replaced shell-based native command lookup with a bounded executable-file
    search. It checks at most 256 deduplicated PATH, package-manager and
    standard directories, honors Windows `PATHEXT`, canonicalizes the first
    accessible path and never launches an Agent merely to resolve it.
  - Added a main-owned diagnostic service and typed IPC/preload contract.
    Version execution uses fixed registry arguments without a shell, a
    5-second timeout and 64 KiB per captured stream. Renderer results contain
    only status, canonical path, one 160-character normalized version line,
    coarse install source, timestamp and stable error code; raw output,
    process errors and environment values stay in main.
  - Added a localized read-only dialog under the existing overflow menu.
    Unsupported platforms no longer show a false actionable entry; supported
    diagnostics expose retry, installed/not-installed/unhealthy states and no
    install or update action. All seven locales are present, stale async
    responses are ignored and custom Agents fail closed.
  - Test-first verification initially failed for the absent service, contract,
    dialog, truthful menu capability and shell-free resolver. The completed
    focused suite passes 8 files / 92 tests. The dedicated three-file coverage
    run passes 33 tests with 100% statement, branch, function and line
    coverage for the diagnostic service, native resolver and dialog. Desktop,
    core and shared typechecks, affected desktop ESLint, production build,
    spec governance and `git diff --check` pass. Root ESLint remains
    unavailable for shared/core because the repository has no root
    `eslint.config.*`. The file-size gate remains red only for the unrelated
    existing `SkillStore.tsx` and `SkillStoreDetail.tsx` at 1,536 lines each.
    No commit, push, tag or release action was run.

- OpenClaw read-only CLI evidence expansion
  (2026-07-29; `FR-AGENT-014`, `DES-AGENT-049`, `TEST-AGENT-068`,
  `T-AGENT-104`):
  - Confirmed from current official OpenClaw CLI, install and update
    documentation that `openclaw --version` is a fast read-only global flag.
    The richer setup, update, repair, Gateway, Plugin, Skill and session
    commands are not exposed by this batch.
  - Added the exact executable, fixed argument and evidence identifier only to
    the canonical platform registry. The existing bounded main-process
    resolver, diagnostic IPC and localized dialog are reused without another
    executable or maintenance state store.
  - The initial capability test failed because OpenClaw had no CLI descriptor.
    The completed focused suite passes 4 files / 68 tests and keeps
    maintenance `partial`; install/update remains under the open
    `T-AGENT-029` and `TEST-AGENT-016` lifecycle gate.
  - The current development machine has no `openclaw` executable on `PATH`, so
    the real-machine smoke reaches the expected not-installed boundary rather
    than a version result. No installation or network mutation was attempted.

- Shared verified-current Provider workbench projection
  (2026-07-29; `FR-AGENT-012`, `DES-AGENT-050`, `TEST-AGENT-069`,
  `T-AGENT-105`):
  - Added one public current-state contract with only platform id, status,
    current Profile id and check timestamp. The main-process tray projection
    remains the sole owner of the latest-snapshot plus fresh-native-preview
    verification; renderer code does not derive active state from selection
    or activation history.
  - Added a validated, redacted IPC/preload query and wired it into the
    existing Provider store. Profile lists and current state load together,
    stale platform responses are discarded, and current-state read failures
    do not hide usable Profiles.
  - The workbench shows a current marker and disables redundant activation
    only for `verified`. Missing snapshot, external native change, stale
    Profile reference and unavailable native inspection never claim a current
    Profile. Successful activation, deletion or archival of the current
    Profile triggers a fresh main-process query.
  - The interaction borrows the discoverable current-card concept from CC
    Switch v3.18.0 `ProviderList.tsx` and `ProviderCard.tsx`, while retaining
    PromptHub's stricter native verification, secret separation and existing
    React/Tailwind architecture. No upstream runtime code, assets, database,
    Tauri/Rust layer or bundled checkout was introduced.
  - Test-first verification initially failed for the absent service method,
    IPC/preload contract, store state and visible current marker. The completed
    focused suite passes 5 files / 53 tests. The new IPC has 100% statement,
    branch, function and line coverage, while the shared tray projection has
    100% statement/line/function and 98.21% branch coverage; its only
    uncovered branch is the pre-existing empty or unnamed registry-group
    skip. Shared and desktop typechecks,
    affected desktop ESLint and Prettier pass. New files remain below 1,000
    lines; touched production files remain below 700 lines. No commit, push,
    tag or release action was run.

- Session index cancellation and 10,000-record boundary
  (2026-07-29; `FR-AGENT-047`, `DES-AGENT-053`, `TEST-AGENT-072`,
  `T-AGENT-108`; completes `T-AGENT-022`):
  - Added a main-process abort guard before prior-index paging and immediately
    after adapter scan completion. Pre-cancelled refreshes never invoke an
    adapter; cancellation that wins after scan but before commit writes no
    rows, cursor, timestamp, status or failure state.
  - The guard creates one stable `AbortError` instead of propagating arbitrary
    `AbortSignal.reason` values. Existing non-abort scan failures continue to
    record only `AGENT_SESSION_SCAN_FAILED` and preserve committed rows.
  - Added a real SQLite scale regression that commits exactly 10,000 metadata
    rows in one transaction, traverses all 50 bounded 200-row pages, verifies
    total/has-more and Unicode literal search, and confirms the schema has no
    content/body/transcript column. Ordinary backup/export remains covered by
    the existing Agent runtime exclusion test and does not query session
    details.
  - Test-first verification initially failed both cancellation cases: a
    pre-cancelled request still called `scanIndex`, and a late cancellation
    committed its scan result. After the barrier fix, the service suite passes
    13 tests and the scale suite passes its 10,000-row case in 1.30 seconds.
    The combined session-index, IPC, renderer hook and backup-exclusion gate
    passes 7 files / 45 tests. The changed session-index service has 100%
    statement, branch, function and line coverage. Desktop and database
    typechecks, affected desktop ESLint, Prettier, `pnpm spec:test` and
    `git diff --check` pass. The size gate reports only three unrelated known
    files between 1,500 and 2,000 lines; this batch does not expand them. No
    commit, push, tag or release action was run. `TEST-AGENT-010` and
    `TEST-AGENT-011` remain open for their other cross-adapter, virtualized UI
    and privacy cases.

- Agent and Provider list UI resilience
  (2026-07-29; `NFR-AGENT-004`, `NFR-AGENT-006`, `DES-AGENT-057`,
  `TEST-AGENT-076`, `T-AGENT-112`; advances `T-AGENT-025`):
  - Reused the repository's existing `@tanstack/react-virtual` dependency for
    the enabled built-in/custom Agent sidebar and Provider Profile master
    list. Production renders only the viewport plus six overscan rows with
    stable Agent/Profile ids, fixed row estimates and explicit total-position
    semantics; no second collection, cache or persistent state was added.
  - Kept filtering as one `O(n)` pass while DOM work remains proportional to
    the visible range. Regression fixtures cover 60 Agents and 120 Provider
    Profiles, search, selection, native-verified current state and accessible
    list positions.
  - Long Agent identity and root text remains truncated inside `min-w-0`
    containers. The launch button uses the stable localized Open label while
    retaining the full Agent name in its accessible label; header actions wrap
    and Provider master width contracts at narrow desktop sizes.
  - Test-first verification initially failed because neither list invoked the
    virtualizer and the launch action repeated the unbounded Agent name. The
    completed focused suite passes 3 files / 54 tests. Desktop typecheck and
    affected ESLint pass. The existing JSDOM virtualizer shim deliberately
    renders every row, so the test also asserts the exact production count,
    key, estimate and overscan configuration instead of claiming layout
    measurement in JSDOM. Agent asset 1,000-row bounding remains open under
    `T-AGENT-025`; this batch does not claim that aggregate gate complete.

- Bounded Agent asset pages
  (2026-07-29; `NFR-AGENT-004`, `NFR-AGENT-006`, `DES-AGENT-058`,
  `TEST-AGENT-077`, `T-AGENT-113`; completes `T-AGENT-025`):
  - Added one renderer-only bounded-page primitive. Skill cards keep the
    existing responsive grid in 60-item pages; MCP, Rules and Plugin compact
    inventories use 100-item pages. Search and Skill filters still evaluate
    the complete owning-domain result before slicing.
  - Page state is ephemeral and resets when the owning result, Agent, domain,
    search or filter changes. Shrinking results clamp to a valid page. Native
    Previous/Next buttons use existing seven-locale commands, expose disabled
    boundaries and announce the numeric range.
  - The renderer never copies asset state. Detail, open-folder, import,
    install, uninstall and refresh actions continue to receive the original
    owning-domain object.
  - Test-first verification initially rendered all 1,000 MCP rows and all
    1,000 Skill cards. The completed gate proves 1,000-row MCP, Rules and
    Plugin inventories, 1,000 Skill cards, page boundaries, next/previous,
    source/domain/search/filter reset, clamp behavior and an exact page-two
    open-folder action. The focused suite passes 2 files / 20 tests. The new
    pager has 100% statement, branch, function and line coverage. Desktop
    typecheck and affected ESLint pass.

- Focused Provider and Session verification evidence is kept in
  `verification-evidence.md` so this implementation record stays bounded.
- Credential mutations are serialized per secret file and use unique atomic
  staging paths; the regression and provenance details are recorded in
  `verification-evidence.md` and `cc-switch-coverage.md`.
- OpenCode now has the first confirmed CLI update slice
  (`DES-AGENT-059`, `TEST-AGENT-078`, `T-AGENT-114`): a detached main-owned
  plan, explicit command review, sender-bound one-shot apply, post-update
  verification and exact-version recovery attempt. Detailed evidence is in
  `maintenance-cli-designs.md` and `verification-evidence.md`; install and
  other CLI update lifecycles remain open.
- `TEST-AGENT-017` is complete: the shared Agent shell now recovers keyboard
  focus when an Agent change disables the selected tab, without stealing focus
  outside the tab list, and all seven locale `agents` trees are structurally
  identical and non-empty. Aggregate evidence is in `verification-evidence.md`.
- The focused Agent workspace Electron E2E now navigates the virtualized Agent
  inventory through the same search flow users have, rather than assuming every
  offscreen row exists in the DOM; the production build and E2E pass.
- The current full desktop gate now passes 482 files / 4,380 tests. Its first
  run exposed and the follow-up corrected two stale assertions for Copilot's
  read-only `installed-plugins/` inventory and the explicit disabled safety
  scan policy for local Skill sources; no production behavior was changed.
- Provider Profile deep links now use a main-owned, bounded
  `prompthub://import` parser and FIFO router. Only version-1, non-secret,
  evidence-backed Provider Profile payloads reach the renderer; unsupported
  objects and literal credentials fail closed. The existing Profile service is
  called only after preview confirmation, creates one inactive Profile, and
  performs no native activation. CC Switch remains a pinned MIT workflow
  reference outside PromptHub and contributes no runtime, asset, or copied
  subsystem. Full evidence is in `verification-evidence.md`.

- Source-of-truth boundary: documented; Agent identity and assets reuse existing owners.
- CC Switch parity boundary: documented; product capabilities are phased and risky OAuth/proxy behavior is not copied implicitly.
- Traceability definitions are unique for the completed batches. Aggregate
  verification and delivery rows that still depend on UI scale, CLI lifecycle,
  platform breadth or final release gates remain explicitly open.
- Qwen user/project SubAgent and Command discovery is complete; detailed
  delivery and verification evidence is in `qwen-definition-implementation.md`.
- Qwen deep-page session continuity now keeps at most 256 native metadata rows
  in process, strips internal paths from list results, and revalidates the
  selected transcript below `QWEN_RUNTIME_DIR`; focused coverage is 100%.
- Provider credential editing now requires an explicit keep, replace or remove
  action and reveals only a newly typed renderer draft. PromptHub retains its
  existing main-only secure store; CC Switch is interaction evidence only.
- Remaining implementation blockers are generic fixture/security aggregation,
  maintenance install plus non-OpenCode update lifecycle, broader Electron E2E
  coverage and the final release-quick gate.
  Unsupported platform actions remain disabled with status-specific guidance.
- Registry, shared shell, allowlisted config, Provider activation, read-only
  sessions, portable Agent backup/restore and tray Provider switching are
  implemented. PromptHub intentionally does not edit, delete, synchronize or
  back up external transcript bodies; destructive session actions are outside
  this change rather than an unfinished blocker.
- npm-managed Codex installs now reuse the main-owned CLI lifecycle for
  reviewed update, same-executable verification and exact-version rollback;
  unsupported install sources remain read-only diagnostics.
- npm-managed Qwen Code updates use the same lifecycle with their own canonical
  package identity; exact evidence is recorded in `verification-evidence.md`.
- Agent-scoped Rules editing is complete
  (2026-07-30; `FR-AGENT-051`, `DES-AGENT-066`, `TEST-AGENT-084`,
  `T-AGENT-121`):
  - The Agent Rules tab now resolves the selected Agent's global rule by
    normalized path first, then uses the built-in or custom platform identity
    as a fallback. Agent switches with a pending read never render the previous
    Agent's rule.
  - The tab reuses `RulesManager` and `useRulesStore`, including drafts,
    save-and-overwrite, snapshots and external-change conflict handling. It
    adds no second rule store, IPC surface, editor implementation or durable
    state.
  - Initial inventory loading and a missing-descriptor refresh are bounded to
    one automatic attempt each per Agent/path key. Missing and failed reads
    remain explicitly retryable.
  - The shared rule registry now covers QClaw's PromptHub compatibility
    `workspace/SOUL.md` and CodeBuddy's `CODEBUDDY.md`; Antigravity continues to
    share Gemini's exact rule path rather than creating a duplicate descriptor.
  - Verification passes 6 focused files / 68 tests, including 23 real
    SQLite/filesystem rule-workspace tests. The new adapter has 100% statement,
    branch, function and line coverage. Desktop and shared typechecks, affected
    desktop ESLint, the production build, `spec:test`, formatting and
    `git diff --check` pass.
- Compact Rules editor actions are complete
  (2026-07-30; `FR-AGENT-052`, `DES-AGENT-067`, `TEST-AGENT-085`,
  `T-AGENT-122`):
  - The persistent gray AI/history column was removed. The shared Rules editor
    now uses one full-width draft canvas with compact header actions and the
    existing card/background design tokens.
  - AI rewrite instructions and version snapshots now open in focused shared
    dialogs. AI failure keeps its dialog open; version history keeps snapshot
    selection and the complete line diff in the same master-detail dialog.
  - Snapshot empty state, source labels, bounded expansion, deletion,
    selection and restore continue through the existing Rules store. No IPC,
    preload, filesystem, database or durable-state contract changed.
  - Focused Rules/Agent workspace regression passes 3 files / 36 tests; the
    wider Rules stack passes 9 files / 76 tests, including 23 real
    SQLite/filesystem workspace cases. The new AI and history dialog modules
    measure 100% statement, branch, function and line coverage.
  - Desktop/shared typechecks, affected desktop ESLint, changed-file Prettier,
    desktop production build, `spec:test` and `git diff --check` pass. The
    repository file-size gate remains blocked only by the pre-existing
    1,536-line `SkillStore.tsx` and `SkillStoreDetail.tsx`; this Rules batch
    does not expand either file.
- Agent workspace density follow-up is complete
  (2026-07-30; `FR-AGENT-053`, `FR-AGENT-054`, `DES-AGENT-068`,
  `DES-AGENT-069`, `TEST-AGENT-086`, `TEST-AGENT-087`, `T-AGENT-123`,
  `T-AGENT-124`):
  - The Agent identity/action row no longer reserves a fixed 5.5rem minimum
    height. It uses natural content height, vertically centered children and
    the existing bounded flex-wrap behavior; the tab strip follows without an
    extra top spacer.
  - The shared Rules draft and snapshot diff now fill the content region
    edge-to-edge. The duplicated 1.5rem inset, rounded wrapper border, zoom and
    shadow were removed while the status divider, internal scrolling, alert
    inset and editable draft behavior remain unchanged.
  - The focused workspace regression passes 3 files / 47 tests. A red-first
    layout assertion reproduced each fixed spacer and nested-card edge before
    the renderer changes.
  - Affected desktop ESLint, desktop typecheck, changed-file Prettier, desktop
    production build, `spec:test` and `git diff --check` pass. The repository
    file-size gate remains blocked only by the pre-existing 1,536-line
    `SkillStore.tsx` and `SkillStoreDetail.tsx`; neither file is part of this
    renderer-only follow-up.
- Rules editing workflow completion is implemented
  (2026-07-30; `FR-AGENT-055` through `FR-AGENT-058`,
  `DES-AGENT-070` through `DES-AGENT-073`, `TEST-AGENT-088` through
  `TEST-AGENT-091`, `T-AGENT-125` through `T-AGENT-128`):
  - Rules now reuses the existing CodeMirror editor with Markdown syntax,
    line numbers, undo/redo, search, indentation and the Markdown keymap.
    List markers continue on Enter, parent-value synchronization remains
    annotated, and the Rules store is still the only draft owner.
  - The same draft now supports Edit, Preview and Split views. The mode
    selector sits at the toolbar's far right after the document statistics,
    uses pencil/book/columns icons, and keeps document preview free
    of the ambiguous eye icon. Sanitized internal
    Markdown anchors stay inside the preview, semantic source-line anchors
    synchronize Split panes in both directions, fold controls are vertically
    centered, and long previews expose a reduced-motion-aware return-to-top
    control. Anchor construction is `O(b)` per rendered draft and scroll
    mapping is `O(log b)` with no new storage, IPC, I/O or network work.
  - The AI rewrite dialog uses the existing provider/model settings as its
    source of truth, filters out image-only models, defaults to the configured
    chat model, and sends the explicitly selected endpoint only for the
    current rewrite. Provider-owned protocol, URL and credential fields
    override stale model copies without changing global defaults.
  - Version history opens directly on the newest non-current snapshot and
    keeps the bounded list, line-numbered diff, no-difference state, delete and
    restore actions in one dialog. Comparison never replaces the draft editor;
    restore changes only the draft until Save. A visual-density follow-up
    replaced the 1,200-pixel full modal with the existing 1,000-pixel `2xl`
    bound, reduced the snapshot rail from 320 to 280 pixels and shortened the
    maximum comparison height without changing history behavior. Live Electron
    verification confirmed the compact modal keeps both snapshot metadata and
    the complete diff visible without spanning the workspace.
    Snapshot source metadata now uses neutral Lucide icons; only the current
    state retains semantic success color.
  - Open Location sends the exact rule file path through the existing shell
    boundary. Missing bridge results, rejected calls, malformed responses and
    shell failures produce a visible error; the main process reveals the file
    instead of merely opening its parent directory.
  - The new Rules dialog/helper/service modules have 100% statement, branch,
    function and line coverage. The focused Rules, store and shell suite passes
    9 files / 54 tests; the i18n suite passes 5 files / 36 tests. Desktop
    typecheck, affected ESLint, production build, changed-file formatting and
    `git diff --check` pass.
  - Live Electron verification confirmed the enlarged provider/model dialog,
    immediate master-detail history diff, and macOS Finder revealing and
    selecting the exact `AGENTS.md` file. No file was saved or rewritten.
  - Relevant production files remain below 1,000 lines; the largest touched
    test is 989 lines. The 278-line AI dialog and 382-line history dialog keep
    declarative layout local while model policy, file reveal and CodeMirror
    lifecycle stay in focused helpers with exhaustive branch coverage.
- Cohesive Agent asset navigation and cards are implemented
  (2026-07-30; `FR-AGENT-059`, `DES-AGENT-074`, `TEST-AGENT-092`,
  `T-AGENT-129`):
  - Skills, MCP and Plugins are adjacent top-level tabs before Rules.
    Qwen Definitions follows Rules and no longer separates the three asset
    domains.
  - MCP and Plugin inventories now use the same bounded responsive two-column
    card rhythm as Skills. Cards remain read-only, keep the existing 100-item
    page bound and derive their state from the owning-domain aggregation
    service.
  - MCP uses the server icon and Plugins uses the Lucide plug icon in both
    inventory cards and the Overview navigation cell. No store, IPC,
    persistence, filesystem or network contract changed.
  - Red-first regression reproduced the previous row-list and separated-tab
    behavior. The focused Agent workspace suite passes 4 files / 61 tests.
    Desktop typecheck, affected ESLint, changed-file formatting,
    traceability validation and `git diff --check` also pass.

- Agent asset management workbench is implemented
  (2026-07-31; `FR-AGENT-060`, `DES-AGENT-075`, `TEST-AGENT-093`,
  `T-AGENT-130`):
  - Replaced the generic read-only MCP/Plugin inventory path in Agent detail
    with scoped adapters over the owning stores and direct management card grids.
  - The selected Agent's canonical id/display icon id is matched against exact
    target ids; no fuzzy name matching or duplicate persistence state is used.
  - MCP now renders a direct scoped card grid without the owning module's
    target sidebar. Server cards, detail view, config reveal, open-in-library,
    external import, uninstall and refresh all remain available while the target
    list is restricted to the selected Agent.
  - Plugins now render a single scoped, responsive card grid directly in the
    Agent workspace instead of embedding the old target-sidebar view. Target
    installs and My Plugins entries share the same card rhythm, filters and
    bounded pager; cards remain keyboard/click selectable, target installs can
    be imported, My Plugins entries can be distributed or confirmed-removed,
    folders can be opened, and detail actions retain delete/favorite/store
    behavior through the owning Plugin store.
  - Skills, MCP and Plugins now literally reuse
    `AgentAssetManagementSurface`, `AgentAssetCard` and
    `AgentAssetActionButton`; toolbar/search/filter/refresh, bounded grid,
    card shell/action footer, loading/empty state and pager are no longer three
    duplicated implementations. Rules continues to use its editor workspace.
    No new IPC channel, database table, filesystem layout, or network request
    was introduced.
  - Follow-up on 2026-08-03 removed raw Agent asset paths from the shared list
    toolbar while retaining actionable source paths on cards and detail views.
    The five MCP counter/filter keys now exist in all seven locale bundles, and
    the MCP locale parity test prevents future English fallback regressions.
  - Follow-up on 2026-08-03 links Agent-installed Plugin cards back to their
    PromptHub-managed distribution. The card can now remove that distribution
    only after destructive confirmation; My Plugins deletion keeps its own
    confirmation, while external-only packages remain import/open-only instead
    of receiving an unsafe raw filesystem delete operation.
    Skills, MCP and Plugins also share `AgentAssetPrimaryAction`, placing one
    localized plus-icon action at the same right edge. This batch originally
    handed Add MCP and Add Plugin to their standalone managers; that navigation
    behavior is superseded by `FR-AGENT-115`, which keeps all three Add flows
    inside Agent-scoped dialogs. The Add labels exist in all seven locale
    bundles, while Chinese and Traditional Chinese keep `Plugin` as the stable
    product term.
  - Focused `agent-assets-workspace.test.tsx` passes 23 tests, including the
    shared-surface contract for all three domains and MCP no-sidebar card-grid
    regression. MCP and Plugin locale smoke tests plus the Skill locale
    regression cover the changed translations. Desktop typecheck and affected
    ESLint pass.
    Playwright was intentionally not run; manual UI verification remains the
    requested release gate. The changed renderer files remain below the
    repository's source-size limit.

- Hermes Claw family taxonomy is implemented
  (2026-07-31; `FR-AGENT-061`, `DES-AGENT-076`, `TEST-AGENT-094`,
  `T-AGENT-131`):
  - Added `hermes` to the explicit shared Claw family registry. Agent display
    order and Rules ordering both consume the existing family resolver, so
    Hermes appears with OpenClaw and QClaw without changing its platform id,
    root path, capability declarations or native file contract.
  - Red-first regression covered the previous Code / Work placement, then
    verified the shared resolver, Rules partition and settings grouping after
    the registry update. The focused desktop suites pass 2 files / 23 tests;
    shared and desktop typechecks, affected ESLint, traceability validation and
    `git diff --check` also pass. The existing Markdown table formatting warning
    remains outside this change's scope.

- Local Claw platform coverage is implemented
  (2026-07-31; `FR-AGENT-062`, `DES-AGENT-077`, `TEST-AGENT-095`,
  `T-AGENT-132`):
  - Added independent `copaw`, `autoclaw` and `nanoclaw` registry entries next
    to the existing `openclaw` and `qclaw` identities. All five are classified
    in the shared Claw family without aliasing their roots or native contracts.
  - Added bounded compatibility roots: CoPaw resolves the official
    QwenPaw `~/.qwenpaw` root and falls back to legacy `~/.copaw`, AutoClaw
    to `~/.openclaw-autoclaw`, and NanoClaw to common checkout names;
    users can override NanoClaw to the actual project root. No checkout or
    directory is created by discovery.
  - Added official upstream brand assets for CoPaw, AutoClaw and NanoClaw and
    mapped them through `PlatformIcon`; the renderer no longer falls back to a
    generic Lucide icon for these ids.
  - Kept Provider, Sessions, Usage and CLI maintenance planned for the three
    new identities, with only path-level Skills/Agent management partial. The
    focused desktop suite passes 4 files / 53 tests; shared and desktop
    typechecks pass; `git diff --check` passes. The full desktop unit run
    completed 502 files / 4,496 tests successfully and stopped on one existing
    Agent workspace assertion (`agents-workspace.test.tsx` expects the generic
    `Search assets` control while the parallel Agent MCP workspace renders its
    scoped panel). That unrelated worktree failure remains a release gate and
    is not attributed to the Claw registry change.

- Copilot native History is implemented
  (2026-07-31; `FR-AGENT-063`, `DES-AGENT-078`, `TEST-AGENT-096`,
  `T-AGENT-133`):
  - Added a read-only SQLite adapter for `<COPILOT_HOME>/session-store.db`
    with fallback to `~/.copilot`, safe file validation, parameterized
    metadata/turn search, bounded pagination, title fallback, and native
    `copilot --resume=<id>` metadata.
  - Detail reads expose only visible user/assistant turns and enforce 128-row,
    16 KiB field, 2 MiB total, malformed-row, and truncation bounds. No
    Copilot database rows, WAL files, transcripts, credentials, or runtime
    tables are written, indexed, backed up, synchronized, or sent to the
    renderer beyond the bounded result.
  - Copilot Sessions is declared `partial` with evidence
    `verified-readonly-session-store`; the existing History workspace forwards
    search terms to live adapters even when the persistent local index is not
    enabled. Focused Copilot/index/panel/managed-agent suites pass, and
    desktop/core/shared typechecks pass.
- Stable platform reference and active research docs now describe the
  session-store boundary and its residual platform-owned schema risk.

- Cline native History is implemented
  (2026-07-31; `FR-AGENT-064`, `DES-AGENT-079`, `TEST-AGENT-097`,
  `T-AGENT-134`):
  - Added a read-only Cline adapter for bounded JSON snapshots under
    `<CLINE_DATA_DIR or ~/.cline>/data/sessions/`, with optional read-only
    metadata enrichment from `sessions.db`.
  - Added compatibility reads for legacy
    `data/tasks/<taskId>/api_conversation_history.json` plus
    `task_metadata.json`; snapshot ids win when both stores expose the same
    session.
  - Listing supports bounded pagination and search over visible user/assistant
    text, while detail reads hide tool/system records, enforce entry/body
    limits, reject symlinked or out-of-root message artifacts, and preserve
    `cline --id <session-id>` resume metadata.
  - Cline Sessions is declared `partial` with evidence
    `verified-readonly-session-snapshots`. The adapter never starts the Cline
    hub/CLI and never writes, indexes, backs up, synchronizes, or migrates
    native session state.
- Focused Cline/service/index/renderer tests cover native snapshots, legacy
  tasks, visible-turn search, malformed records, missing roots and unsafe
  symlinks.

- Cursor native History is implemented
  (2026-07-31; `FR-AGENT-065`, `DES-AGENT-080`, `TEST-AGENT-098`,
  `T-AGENT-135`):
  - Added a read-only adapter for Cursor's local
    `projects/*/agent-transcripts/*/*.jsonl` exports below `~/.cursor` or an
    injected root override. It does not read Cursor's private settings DB,
    checkpoints, snapshots, credentials, caches, or remote Background Agent
    history.
  - Listing uses bounded project/session discovery, 64 KiB metadata prefixes,
    eight concurrent reads for search, and offset/limit pagination. Search
    includes visible user/assistant turn text so a match is not lost when it is
    absent from the generated title.
  - Detail reads cap the body at 2 MiB, hide system/tool records, count
    malformed lines, reject symlinked/out-of-root paths, and expose
    `cursor-agent --resume <chat-id>` metadata.
  - Cursor Sessions is declared `partial` with evidence
    `verified-readonly-agent-transcripts`; no Cursor native state is written,
    indexed, backed up, synchronized, or migrated.
  - Focused Cursor adapter/index/renderer/managed-agent tests pass, together
    with desktop and shared typechecks and affected desktop ESLint.

## Project Conversation Continuation Slice

- Implemented device-local `agent_conversation_metadata` and
  `agent_conversation_handoffs` projections with idempotent migration,
  parameterized access and no transcript/message body persistence. PromptHub
  owns titles, project association, tags, notes, favorite/archive state and
  handoff lineage; native Agent files remain authoritative.
- Agent History now overlays existing PromptHub metadata on the adapter-backed
  native session list, supports project filtering and archive metadata, displays
  the live bounded transcript and exposes verified permanent native delete,
  native resume and JSON/Markdown export actions. It does not expose a generic
  conversation metadata editor.
- Native Resume re-resolves the current adapter session and executable in the
  main process, then executes the adapter-owned argument vector through a
  mode-0700 macOS terminal launcher. Arguments are staged in mode-0600 files
  and never interpolated into renderer or shell command text. Staged launch
  artifacts are removed when the terminal exits, immediately on open failure,
  or by a 15-minute expiry fallback when the terminal never executes.
- Cross-Agent continuation requires a project and exact preview. The portable
  payload contains only bounded visible user/assistant turns, replaces the
  home directory, redacts token-like values and excludes system/tool records.
  Claude Code and Codex use direct CLI handoff on supported macOS desktops;
  unsupported targets/platforms open the existing Agent application without
  mutating the clipboard. Launch failure is reported in the UI without a false
  continuation-success state.
- Handoff persistence stores source/target identity, project, transport,
  digest and apply status only. The reviewed payload and native transcript are
  not persisted or synchronized.
- Single-conversation JSON and Markdown export use safe filenames, visible
  turns only, versioned JSON, path/secret redaction and a main-process save
  dialog. Export cancellation does not write a file.
- The target and project controls use the shared styled Select component. The
  target picker now shows only each Agent icon and full display name; transport
  details no longer crowd or truncate the option. Resume, continuation and
  export report visible completion/fallback status in all seven desktop locales.
- The History toolbar no longer uses native operating-system selects. Project
  and status filters, continuation target and project selection, and metadata
  project editing now share the styled listbox control. The conversation title
  occupies its own row, while native resume, target, project, preview, edit,
  export and removal actions use one compact wrapping toolbar. Mutating and
  export actions are icon-only with accessible names and styled hover/focus
  tooltips, leaving more vertical space for the session list and transcript.
- Transcript rendering now uses role-aware chat bubbles with a separate round
  avatar for every user, assistant and tool message instead of placing role labels
  inside full-width gray rows. Users are right-aligned in the primary color;
  assistants and tool records are left-aligned Agent messages on white, while
  system/unknown records use centered white notice bubbles. The light theme uses white surfaces for the
  history rail, detail header and continuation toolbar over a restrained canvas.
- Conversation bodies use a dedicated compact GFM renderer with 13px body
  text, bounded heading/list/table/code styles, sanitized HTML, allowlisted
  external links and non-fetching image placeholders. Raw transcript text
  remains the source for handoff and export; Markdown rendering is presentation
  only.
- Removed the renderer wrapper's generic `mt-2` so user and assistant message
  bodies use only the bubble's intentional padding. Tool bubbles and system notices
  retain a role-aware `mt-1` separation, preventing the large blank strip that
  previously appeared above every conversation body. The sessions regression
  suite covers this spacing contract.
- UI verification passes the 10-test Agent Sessions component suite, the
  4-test shared Select suite, renderer i18n hardcode/smoke checks, affected
  ESLint, desktop TypeScript checking and the full desktop production build.
- Focused verification passes 6 Vitest files / 32 tests across real SQLite
  migration and CRUD, service redaction/continuation/export, secure launcher,
  IPC validation, preload forwarding and renderer interaction. Shared, DB and
  desktop TypeScript checks pass.
- The avatar and launch-only follow-up adds regression coverage for separate
  round user/assistant avatars, uncluttered Agent options, clipboard-free
  fallback launch, launch failure, strict IPC transport validation and legacy
  handoff migration. Focused verification passes 5 files / 30 tests; shared,
  DB and desktop typechecks, desktop lint and the production build pass.
- Remaining scope stays tracked under `T-AGENT-136`, `T-AGENT-137`,
  `T-AGENT-139` through `T-AGENT-143`: a global cross-Agent project catalog,
  adapter-owned native deletion, selectable handoff context policies, retry
  and exact target-session links, batch/atomic export and narrow-window
  step-navigation are not part of this delivered slice.

## User-Level Config Files

- Completed `FR-AGENT-009` / `TEST-AGENT-107` / `T-AGENT-144`: Config Files now derives the user-level Agent root from the canonical registry or user override and lists the bounded existing configuration surface instead of filtering the UI to one declared file.
- Added a main-owned filesystem service for recursive config discovery, declared missing files, path/symlink/size bounds, runtime and credential exclusions, JSON/JSONC/TOML/YAML validation, content revisions and serialized same-file writes.
- Sensitive values are replaced with stable opaque placeholders before IPC. Saving preserves the original values and rejects raw secret changes; successful writes require an encrypted device-local backup, atomic replacement, reread verification and rollback on failure.
- Renderer config trees and Overview counts now use the same IPC inventory. Direct editing remains content-only and user-level; project config scanning and structural create/rename/delete are unchanged and out of scope.
- Verification completed: 6 focused Vitest files passed with 86 tests; desktop/shared/core typechecks, affected ESLint and desktop production build passed; an isolated real Electron E2E passed with a four-file Claude user config tree, excluded `auth.json`/`sessions`, redacted IPC/editor content, secret-preserving save and ciphertext-only backup. Direct local scans found 32 safe Claude entries and 3 safe Codex entries, with credential/runtime stores excluded. The new filesystem service reports 98.45% statements/lines, 96.57% branches and 100% functions; the uncovered guards are defense-in-depth TOCTOU checks for a post-normalization root escape, a post-`lstat` realpath escape and creation of a missing target between prewrite checks. Traversal, symlink and queued/external concurrent mutation behavior is covered without weakening those guards.
- The pre-existing all-in-one `agent-workspace.spec.ts` was also attempted and stopped before this feature at its Provider activation radio-selection flow; the independent config-files E2E is the authoritative end-to-end result for this slice.

## Development Recovery And Agent Editing

- Completed `FR-AGENT-073` / `DES-AGENT-088` / `TEST-AGENT-108` / `T-AGENT-145`: desktop `electron:dev` now delegates to Vite, leaving `vite-plugin-electron` as the only Electron lifecycle owner. The renderer root now contains bootstrap, lazy render and hot-update failures behind a localized recovery boundary with one development auto-reload per 10-second cooldown and a manual production reload action.
- Completed `FR-AGENT-074` / `DES-AGENT-089` / `TEST-AGENT-109` / `T-AGENT-146`: all built-in Agent path editors derive visible fields from the canonical platform registry. Undeclared `agents/` and `commands/` defaults are no longer synthesized; explicit legacy overrides remain recoverable. Custom Agents expose and persist the complete Skills, Rules, MCP, Plugins, Agents, Commands and Config schema through both editing entry points.
- Verified platform declarations now include known user Commands and Agents directories for Gemini, OpenCode, Reasonix, Augment, ZCode, Grok Build, Qwen Code and CodeBuddy where the stable reference already records them. WorkBuddy remains Root + Skills + MCP + Config; CodeBuddy exposes Root + Skills + Rules + MCP + Agents + Commands + Config.
- Verification: 8 focused Vitest files pass with 89 tests; desktop and shared typechecks pass; affected desktop ESLint and desktop production build pass. `agent-edit-adapter.ts` and `RendererErrorBoundary.tsx` each reach 100% statements, branches, functions and lines. A real `pnpm dev` Electron session stayed connected through renderer HMR and full-page reload and visually/semantically verified WorkBuddy and CodeBuddy editors. Shared registry ESLint is not independently configured and is ignored outside the desktop ESLint base path; shared TypeScript and Prettier checks pass.

## Installed-Only Agent Management

- Completed `FR-AGENT-075` / `DES-AGENT-090` / `TEST-AGENT-110` / `T-AGENT-147`: the Agent store now projects only locally detected installations after each refresh and repairs a persisted selection against that installed set. Sidebar count and search apply the same installed-only filter as a defense against stale injected state.
- Undetected detail state keeps only Overview enabled. The overview mounts only the not-installed guidance and does not mount usage, asset inventory, provider, appearance, session, path or config components. Launch, diagnostics and edit actions are absent, and the Config Files panel has an independent no-read guard.
- Updated the seven locale descriptions so an undetected target is no longer described as manageable. The full platform registry and Settings path definitions remain available for detection and configuration ownership; no platform, schema, IPC or filesystem contract was removed.
- Verification: 4 focused Vitest files pass with 57 tests; desktop typecheck, affected ESLint, traceability validation, diff check and desktop production build pass. A real Electron development window showed 15 detected Agents instead of the prior 35 registry entries; CodeBuddy and WorkBuddy were absent, searching for `CodeBuddy` returned no match, and clearing the search restored the installed list.

## Antigravity CLI Conversation History

- Completed `FR-AGENT-076` / `DES-AGENT-091` / `TEST-AGENT-111` / `T-AGENT-148`: the main process now discovers current Antigravity CLI conversation identities from regular UUID-named files below `~/.gemini/antigravity-cli/conversations`, adds project ownership from bounded CLI cache maps and reads only known visible rows from the matching generated transcript projection.
- Database-only conversations remain listable and resumable through typed `agy --conversation <id>` metadata, but their detail is intentionally empty. PromptHub does not decode SQLite protobuf blobs or legacy Antigravity desktop `.pb` files and does not index, mutate, delete, back up or synchronize native conversation data.
- Search, metadata and detail reads are byte-bounded; unsafe ids, path traversal, symlinks, malformed cache/transcript records, unknown event types and private code/tool payloads fail closed or remain hidden. The capability is `partial` because not every valid database conversation has a generated readable projection.
- Verification: the focused Antigravity adapter suite passes 3 tests; the combined session/service/renderer regression passes 4 files / 39 tests; the focused capability assertion, desktop TypeScript checking, affected ESLint, Prettier, diff check and production build pass. The complete capability test file was also attempted and has 10 passing assertions plus 3 stale failures that still expect pre-existing Cursor, Cherry Studio and Windsurf Config/Session states; those assertions belong to parallel capability work and were not weakened here. A read-only probe against the current local CLI root found 7 real database conversations, all 7 natively resumable, one project association and 3 readable generated projections without reading message contents into the verification record.

## Unified Agent Asset Cards

- Completed `FR-AGENT-077` / `DES-AGENT-092` / `TEST-AGENT-112` / `T-AGENT-149`: Skills, MCP and Plugins now render identity, status, description, source and metadata through `AgentAssetCardContent`, while their existing shared shell and owning-domain action buttons remain unchanged.
- Skills use the existing `SkillIcon` name fallback, MCP keeps `ServerIcon`, Agent-discovered Plugins keep `PlugIcon`, and managed Plugins retain `PluginAvatar` artwork. All three domains reserve the same content regions and aligned footer dimensions without adding stores, IPC, persistence or unsupported mutations.
- The shared shell now has a fixed 232px height. Title/status, description,
  source and metadata use bounded 24px, 40px, 16px and 40px slots; overflow is
  truncated or clipped inside the slot, and supplementary inventory chips no
  longer create an extra variable-height row. Different text and chip counts
  therefore cannot move the action divider or footer.
- The Agent taxonomy key now renders `Plugins` in Simplified Chinese, Traditional Chinese and Japanese as well as the four locales that already used the term. Other Plugin copy remains localized.
- Verification: the two focused workspace suites pass 53 tests, including shared anatomy, 1,000-card pagination, existing action behavior and three locale assertions; desktop TypeScript and affected ESLint pass. A real Simplified Chinese Electron session verified Skills, MCP and Plugins at 1200x740 with consistent two-column cards, loaded identity artwork, visible source/chips and non-overlapping icon action footers.

## Agent Workspace Leading-Edge Alignment

- Completed `FR-AGENT-078` / `DES-AGENT-093` / `TEST-AGENT-113` / `T-AGENT-150`: the Agent detail header now uses the asset workspace's `px-5` inset, aligning identity, primary tabs, toolbar controls and inventory cards.
- `AgentAssetManagementSurface` no longer accepts a toolbar title. Skills, MCP and Plugins all start with search because their selected top-level tab already names the domain. Filters, paths, refresh, primary actions, cards and owning-domain behavior remain unchanged.
- Verification: the two focused workspace suites pass 54 tests. A real Simplified Chinese Electron development window confirmed the Codex identity/tabs align with the asset toolbar and card grid, Skills and MCP start directly with search, and the remaining controls fit without overlap. Desktop TypeScript checking is currently blocked by an unrelated parallel session-index edit at `agent-session-index-service.ts:287` that passes three arguments to a two-argument function.

## Paginated Conversation Bodies And Augment History

- Completed `FR-AGENT-079` / `DES-AGENT-094` / `TEST-AGENT-114` /
  `T-AGENT-151`: session detail now accepts a validated optional visible-message
  limit and opaque main-owned cursor through shared types, IPC and preload.
  Codex rollout reading streams complete JSONL lines, scans at most 16 MiB per
  page, hides runtime/tool records without charging the visible page size, and
  returns a continuation cursor instead of treating content after the former
  2 MiB prefix as missing.
- History keeps already loaded message bubbles and requests the next native
  page on demand. Empty scan-budget pages remain loadable. Selection changes
  cannot append a stale page. JSON/Markdown export and cross-Agent handoff walk
  the same cursor chain, so those actions do not silently export only the first
  80 visible entries.
- Added an evidence-backed Augment adapter for native
  `~/.augment/sessions/*.json`: list/search metadata, project/model projection,
  user/assistant-only body pagination and documented
  `auggie --resume <id> --workspace-root <path>` continuation. Account state,
  identity, tool nodes, agent state and task storage are excluded. Augment
  Sessions is now `supported`; platforms without a verified readable store or
  non-interactive identity contract remain planned rather than being guessed.
- Verification: the combined pagination/IPC/preload/conversation/UI/Augment
  suites pass 6 files / 33 tests, including a 17 MiB hidden-record prefix that
  crosses the per-page scan budget and rejection of a stale source cursor. The complete
  capability file still has three unrelated stale expectations for Cursor,
  Cherry Studio and Windsurf while 10 assertions pass; those parallel changes
  were not reverted or weakened.

## Evidence-Backed Read-Only Conversation Breadth

- Completed `FR-AGENT-081` / `DES-AGENT-096` / `TEST-AGENT-116` /
  `T-AGENT-153`. Cherry Studio now prefers the current official
  `Data/cherrystudio.sqlite` Agent schema and extracts only visible text parts
  from user/assistant messages. The locally verified older `Data/agents.db`
  schema remains a read-only fallback. Both paths use schema validation,
  parameterized search, opaque source-bound cursors and fail-closed path checks;
  normal chats, reasoning, tool payloads, memory and credentials remain outside
  the adapter.
- Kilo Code now reads the verified local `storage/session`, `storage/message`
  and `storage/part` trees, projects only user/assistant text parts and exposes
  typed `kilo --session <id>` native continuation metadata. Catalog scans fail
  explicitly at 50,000 records rather than truncating silently, and bounded
  worker pools prevent large histories from creating unbounded file reads.
- The built-in platform matrix now has readable history for 19 of 35 Agents:
  12 `supported`, 7 evidence-limited `partial`, and 16 still `planned` because
  their durable local transcript contracts are not verified. Read-only delivery
  does not wait for editing or native resume support.
- Verification passed 6 focused files / 40 tests, including current and legacy
  Cherry schemas, body-only search through the unified index service, hidden
  reasoning/tool exclusion, malformed and escaped sources, stale cursors, Kilo
  native resume metadata and pagination across 2,001 sessions. Desktop
  typecheck and affected ESLint passed.

## Full-Workspace Agent Asset Details

- Completed `FR-AGENT-080` / `DES-AGENT-095` / `TEST-AGENT-115` /
  `T-AGENT-152`. In Agent management, the shared product term `Agent assets`
  means the Skills, MCP and Plugins card domains; Rules remains a separate
  editor workspace.
- Skills, MCP and Plugins keep their owning-domain selection and detail
  components, and report only transient detail-open state to
  `AgentsWorkspace`. While a detail is open, the shell omits the Agent identity
  header and tab list so the owning detail fills the complete workspace to the
  right of the Agent list. Back restores the same Agent, tab and list state.
- Fixed the development white screen caused by the renderer facade broadly
  re-exporting `@prompthub/core/agent-management`, which pulled the
  main-process `agent-inventory` dependency on `fs/promises` into Vite's
  browser bundle. The facade now exports only the browser-safe
  `agent-root-config` module, with a source-boundary regression test.
- Focused verification passed 3 files / 72 tests: the shared Agent asset
  workspace, Agent shell navigation and renderer root-path boundary suites.
  Desktop typecheck, affected lint and production build passed. A real
  Simplified Chinese Electron development run opened and returned from Codex
  Skill, MCP and Plugin details; all three removed the Agent header/tabs while
  open and restored them on Back.

## Shared Agent MCP Entry Detail

- Completed `FR-AGENT-082` / `DES-AGENT-097` / `TEST-AGENT-117` /
  `T-AGENT-154`. The main MCP workspace and the Agents workspace now render
  Agent MCP entries through the same `AgentMcpEntryDetail` composition.
- The shared detail preserves the rich source metadata, transport-specific
  fields, serialized configuration, managed/external status, Agent source
  sidebar and existing actions. Each caller continues to own selection, Back
  navigation, import and removal orchestration.
- Focused component verification passed 3 files / 43 tests. Desktop typecheck,
  affected ESLint, file-size, traceability and production build gates passed.
  In a real Simplified Chinese Electron development run, opening Codex
  `computer-use` from both Agents > MCP and MCP > Agent MCP rendered the same
  source fields, serialized config, Agent source sidebar and actions; each
  Back path remained scoped to its owning workspace.

## Shared Skill And Plugin Agent Detail Adapters

- Completed `FR-AGENT-083` / `DES-AGENT-098` / `TEST-AGENT-118` /
  `T-AGENT-155`. Skill and Plugin asset details already reused their canonical
  full detail components, but their Agent context and action adapters were
  duplicated between the owning management workspace and Agents management.
- Added `AgentSkillDetailPage` and `AgentPluginDetailPage` as the single adapter
  for each domain. This removes the entry-point drift that exposed uninstall
  for read-only discovered Skills and replaces the main Plugin Agent view's
  no-op store action with its real owning-store callback.
- Real Electron verification found that opening Agents before the Skills module
  left the canonical Skill library unloaded, so managed Codex Skills were
  reported as external. The shared `useEnsureSkillLibraryLoaded` readiness hook
  now initializes that store for both Agent overview aggregation and the Skill
  workspace before either derives managed status; both cold-start regressions
  are covered separately. The hook also observes the store's loading state so a
  rapid tab transition cannot duplicate an in-flight library read.
- Target-installed Plugins now share one adapter while the distinct
  PromptHub-library Plugin flow continues to use `PluginFullDetailPage`
  directly. No durable state, IPC, filesystem or route ownership changed.
- Focused verification passed 8 component suites / 89 tests covering Skills,
  MCP and Plugins across owning and Agents workspaces. Desktop typecheck,
  affected ESLint, file-size, traceability, formatting, production build and a
  fresh Electron cold-start were also run; the cold-start overview and Skills
  toolbar both resolved the installed Codex inventory as 2 managed and 2
  external assets.

## Current-Format Read-Only Session Expansion

- Completed `FR-AGENT-085` / `DES-AGENT-100` / `TEST-AGENT-120` /
  `T-AGENT-157`. The live session service now exposes verified readers for
  Hermes, Reasonix, NanoClaw, CoPaw/QwenPaw and Qoder without persisting native
  transcript bodies.
- Qoder reads only its officially documented
  `~/.qoder/projects/<project>/transcript/<session-id>.jsonl` contract. It
  requires source identity consistency, projects only string user questions
  and assistant text parts, provides full visible-body search, offset list
  pagination and revision-bound cursor detail pagination, and filters progress,
  Hooks, tool calls and tool results. JSONL records larger than 1 MiB are
  skipped before parsing without preventing later visible messages from loading.
- Qoder remains read-only with `resume: null`: current official CLI
  documentation exposes `/resume` as an interactive TUI action but does not
  establish a stable direct process argument. QoderWork remains planned because
  its official Hook docs expose session events without a transcript storage
  path or file schema.
- Capability status now reports 17 fully verified session adapters and 7
  partial readers, for 24 readable built-in Agents out of 35. The remaining 11
  stay planned until a current safe local format is verified. TRAE's current
  local settings database exposes session ids, but the message body is held in
  a non-standard private `ModularData/ai-agent/database.db`; it therefore
  remains planned instead of showing metadata-only empty conversations.
- Focused Qoder and capability verification passed 2 files / 23 tests, and the
  desktop TypeScript check passed. The complete current-format adapter batch
  passed 7 files / 51 tests across its platform-specific suites and shared
  capability/index regressions. Affected ESLint, traceability, diff check and
  the desktop production build also passed.

## PromptHub Provider Import Projection

- Completed `FR-AGENT-084` / `DES-AGENT-099` / `TEST-AGENT-119` /
  `T-AGENT-156`. The Agent Provider & Model workspace can now list global
  PromptHub providers and import one selected chat model as an independent
  per-Agent Provider Profile.
- The main-process source service re-reads the current global AI configuration
  for both list and import, joins only chat models whose provider, protocol and
  normalized endpoint still agree, and applies explicit Codex, Claude Code,
  Gemini, OpenCode and Qwen Code projections. Unsupported combinations remain
  visible with a stable incompatibility reason and cannot create a Profile.
- Renderer and preload payloads contain only redacted source metadata and a
  credential-readiness boolean. Credential values are copied main-side into
  the existing Agent secret store during explicit import; global providers,
  Agent native configuration and activation state remain unchanged until the
  existing preview/confirm activation flow runs separately.
- Focused Provider verification passed 23 files / 161 tests across service,
  IPC, preload, stores, components, persistence, activation and rollback. The
  7-locale smoke suite passed 5 files / 36 tests; desktop/shared typecheck,
  desktop lint, file-size, traceability and production build gates passed.
  A real Simplified Chinese Electron development run opened Codex Provider &
  Model, loaded a configured global provider and model, showed no API key or
  secret reference, and closed without importing or changing user data.

## Claude Project-Scoped Resume And Compact History

- Completed `FR-AGENT-087` / `DES-AGENT-102` / `TEST-AGENT-122` /
  `T-AGENT-159`. Claude list metadata now extracts the validated embedded
  session id and first safe absolute `cwd` from the same bounded JSONL prefix
  used for the title. Native resume therefore launches
  `claude --resume <session-id>` from the conversation's real project rather
  than the user's home directory. Unsafe relative paths and malformed ids are
  ignored, while the source filename remains PromptHub's stable list identity.
- The History transcript now uses a 10px message-stack gap and 16px vertical
  viewport padding. Message bubbles no longer add a generic Markdown `mt-2`
  margin on top of their own padding; only tool/system notices retain a small
  role-to-body `mt-1` separation. The current-Agent action remains bound to the
  verified native terminal resume contract; its final two-action hierarchy is
  recorded under `FR-AGENT-088` / `DES-AGENT-103` below.
- Verification passed 2 focused files / 21 tests, desktop typecheck, affected
  ESLint, Prettier, diff check, file-size, traceability and the production
  renderer/main/preload build.

## Two-Step Continuation And Message Pagination

- Completed `FR-AGENT-088` / `DES-AGENT-103` / `TEST-AGENT-123` /
  `T-AGENT-160`. Conversation actions now expose two labeled primary choices:
  the verified native CLI terminal resume for the current Agent and a
  cross-Agent CLI continuation entry. Target Agent/project configuration opens
  only after the second choice and lists only verified CLI handoff targets.
  Markdown/JSON export has its own compact icon; verified permanent deletion is
  the only destructive overflow action, and no metadata edit or soft
  delete/restore action remains.
- The main process now returns the exact shell-quoted CLI command with each
  reviewed handoff preview. Copy and direct Terminal launch therefore share the
  same target executable, working directory and digest-verified payload. When
  the target CLI cannot be resolved from the app environment, the preview
  keeps manual command copy available and disables direct Terminal launch.
- Transcript source batches remain bounded at 80 entries while the renderer
  mounts 20 messages per page. A fixed page bar supports direct loaded-page
  navigation, scroll reset and on-demand cursor reads past the loaded boundary,
  preserving existing entries and parser diagnostics.
- Component, IPC, preload and service verification covers the complete
  two-stage action flow, CLI-only target filtering, copied command shell
  quoting, independent export, secondary actions, direct page selection and
  cursor-backed next-page loading. Seven locale catalogs include the new labels
  and accessible pagination names.
- Final focused verification passed 6 files / 32 tests, desktop typecheck,
  affected ESLint, Prettier, diff check, traceability and the complete
  renderer/main/preload production build. The repository-wide file-size gate
  remains blocked by the parallel Provider workbench test file exceeding its
  preferred 1,500-line limit; no continuation module exceeds its file limit.

## Current Native Provider Identity And Official Restore

- Completed `FR-AGENT-086` / `DES-AGENT-101` / `TEST-AGENT-121` /
  `T-AGENT-158`. Provider & Model now treats the current native Agent
  configuration as a first-class entry even when PromptHub has no saved
  Provider Profile or activation snapshot.
- The main process derives a redacted native summary from each platform
  adapter's current-config import contract. The renderer receives provider,
  protocol, endpoint, model, official/custom classification and credential
  type/status only; credential values and secret references do not cross IPC.
- The current native source is now rendered as a bordered card without a
  selected left rail. Its right pane uses framed provider, protocol, endpoint,
  model and credential-ownership fields, explains why the Agent-owned source is
  read-only, and offers a primary conversion action. After the existing
  sanitized import confirmation creates the independent Profile, the workbench
  opens that Profile directly in the editable right pane.
- Claude Code and Codex have explicit, verified official Provider templates.
  A custom native configuration can be saved as a Profile or restored through
  the existing activation preview and confirmation flow. Unsupported platforms
  remain readable but do not receive an invented official restore action.
- Focused verification passed 8 files / 88 tests across Claude/Codex adapters,
  native summary, official Profile creation, IPC/preload, store and workbench.
  Current-state IPC and workspace resilience passed 2 files / 6 tests, while
  the 7-locale smoke suite passed 5 files / 36 tests. Desktop/shared typecheck
  and affected desktop lint passed. A real Simplified Chinese Electron run
  identified Claude Code's Kimi endpoint/model and configured auth-token state
  as custom without revealing a credential, and identified Codex's OpenAI
  platform-managed configuration as official.
- The native-card presentation regression passes 26 focused workbench tests,
  desktop typecheck, affected ESLint, seven-locale JSON parsing, Prettier and
  diff checks. It covers the no-rail selection state, five framed summary
  fields, the read-only ownership explanation and the convert-then-edit flow.

## Inline Provider Profile Editor

- Completed `FR-AGENT-089` / `DES-AGENT-104` / `TEST-AGENT-124` /
  `T-AGENT-161`. Creating or editing a Provider Profile now replaces the
  right detail pane with a non-persistent editor instead of opening a modal.
  Cancel discards the renderer-local draft without creating or updating a
  Profile; save still uses the existing main-process Profile and secret
  boundaries, and activation remains a separate reviewed operation.
- The editor groups identity, protocol/endpoint, model and authentication
  fields and renders only values accepted by the selected Agent adapter.
  OpenCode keeps its supported secondary model; Claude, Codex and Gemini no
  longer offer a mapping their adapters reject. Codex direct profiles support
  either a write-only PromptHub-managed credential or an environment-variable
  reference. Official platform-native credentials remain platform-managed.
- CC Switch's proxy-only model catalog, request conversion, custom user-agent,
  pricing and failover controls were reviewed but not exposed because the
  current PromptHub direct adapters cannot persist or execute them.
- Verification passed the focused Provider UI suites (4 files / 37 tests),
  Provider service, persistence, IPC, preload, connectivity and store suites
  (9 files / 80 tests), the seven-locale smoke suite (5 files / 36 tests),
  desktop typecheck, affected ESLint, diff check and the complete desktop
  production build. A real Simplified Chinese Electron development run opened
  Codex Provider & Model and confirmed that Add renders the four-section editor
  in the right pane without a dialog or an immediate persisted Profile. Focused
  V8 coverage for the two touched renderer modules reached 96.59% statements
  and lines, 92.87% branches and 86.2% functions; the remaining misses are
  pre-existing defensive and unrelated platform branches, while the added
  draft, environment-key validation and credential-source branches are covered.

## Capability-Aware Cross-Agent Continuation

- Refined `FR-AGENT-088` / `DES-AGENT-103` / `TEST-AGENT-123` /
  `T-AGENT-160` so cross-Agent continuation no longer filters the target list
  to Claude Code and Codex or labels every handoff as CLI-native resume.
- The target selector now includes every detected Agent other than the source
  Agent and shows its expected handoff tier. The main-process preview remains
  authoritative: verified Claude/Codex executable contracts use direct prompt
  injection, allowlisted desktop applications use copy-before-open, and other
  detected targets retain a copy-only portable-context fallback.
- Application handoff writes the bounded, redacted, digest-reviewed payload to
  the operating-system clipboard before opening the target. Clipboard failure
  prevents launch; application launch failure preserves the copied payload and
  returns a stable manual-continuation error instead of claiming success.
- Native source resume remains separate and continues to use the adapter-owned
  command, source session id and project directory. Cross-Agent handoff never
  passes the source session id to another product as though session identity
  were portable.
- Fixed desktop service wiring to forward the session detail cursor while
  assembling large handoff payloads, preventing repeated first-page reads for
  paginated histories.
- Verification passed desktop typecheck, affected ESLint, production renderer/
  main/preload build, and 7 focused files / 36 tests covering service transport
  selection, clipboard and launch failures, UI target visibility and actions,
  IPC validation, DB lineage, Markdown rendering and seven-locale alignment.

## Asset Toolbar Action Alignment

- Refined `FR-AGENT-060` / `DES-AGENT-075` / `TEST-AGENT-093` /
  `T-AGENT-130`: Skills, MCP and Plugins now keep search, localized filters,
  refresh and the owning Add action on one shared toolbar row.
- The middle filter strip owns bounded horizontal overflow. Refresh and Add
  remain fixed at the right edge, so longer Plugin labels cannot move Add
  Plugin below the search row. No store, route, IPC or persistence behavior
  changed.
- Focused component verification passes 24 tests, including all three domains,
  right-edge DOM order, filter-strip overflow and the existing Add workflows.

## Converge

- Stable knowledge reference synced in `spec/knowledge/reference/agent-platforms.md`;
  workflow/rules are unchanged because this is still an active, unreleased
  registry change.
- Issues/releases/ADRs/indexes remain pending publication and convergence.
- Final change destination: remain active until implementation, verification and convergence complete.

## Follow-Ups

- Collect representative native configs without secrets in priority order and promote only evidence-backed inventory entries from planned/partial.
- Complete the remaining Electron E2E, fixture/security, CLI lifecycle and
  release gates before convergence.
- Keep proxy, failover and OAuth work outside the Phase 1 implementation branch.
- Run the first live Dream Skin compatibility apply as an explicit manual action before release. The pinned upstream runtime is last verified against Codex desktop `26.707.72221`, while the current development machine runs `26.715.21425`; successful start, landmark verification and restore on that version remain a manual release gate.

## Config Editor Isolation And Inventory Enforcement

- Completed `FR-AGENT-090` / `DES-AGENT-105` / `TEST-AGENT-125` /
  `T-AGENT-162`. Existing config targets now require either an adapter
  declaration or membership in the same bounded discovery inventory returned
  by Config Files. The service keeps a 64-entry in-memory LRU inventory cache;
  `list()` refreshes it, and arbitrary existing nested files remain rejected.
- `SkillFileEditor` now clears per-path content when its source identity changes
  and rejects stale list/read successes and failures by source generation.
  Agent sidebar selection reuses the existing localized dirty-editor
  confirmation instead of silently discarding edits.
- Provider credential eye-button reveal behavior is unchanged. General raw
  config files continue to use the existing embedded-secret redaction and
  placeholder-preservation boundary.
- Verification passed 5 focused files / 86 tests without React `act` warnings,
  Core and Desktop typechecks, affected Desktop ESLint, Desktop production
  build, the Agent Config Files Electron E2E, `git diff --check`, and the
  `FR-AGENT-090 -> DES-AGENT-105 -> TEST-AGENT-125 -> T-AGENT-162`
  traceability row. The quick release harness remains blocked by the pre-existing
  stale `spec/changes/index.md`; it was not regenerated because that index also
  contains unrelated active work.
- Targeted V8 coverage passes 46 tests. The extracted dirty-navigation hook is
  100% for statements, branches, functions and lines; the legacy 1,400-line
  `SkillFileEditor` remains at 77.51% statements/lines, 85.43% branches and 60%
  functions overall. Every new source-generation success, stale success, stale
  failure and current failure path is exercised; the remaining uncovered lines
  belong to pre-existing structural mutation and resource-preview flows outside
  this batch.
- Config creation for an undetected Agent remains unresolved because
  `FR-AGENT-075` requires undetected Agents to stay absent and explicitly
  forbids config reads or writes. No implementation silently weakens that
  installed-only boundary.

## Appearance Focused Workspaces

- Completed `FR-AGENT-091` / `DES-AGENT-106` / `TEST-AGENT-126` /
  `T-AGENT-163`. The Agent Appearance surface now uses a compact left icon rail
  for Desktop skins and Pets, with counters derived from the existing single
  overview response.
- The right workspace renders only the selected domain. Import, invalid-item
  notice, inventory, folder action and empty state are contextual, while refresh
  remains shared. Switching destinations performs no IPC and mounts only
  `O(S)` skin cards or `O(P)` Pet cards.
- Skin management keeps native restore, restart consent, apply, export and
  delete actions. Skin cards use a wider preview/detail composition; Pet cards
  retain the bounded animated sprite preview and Pet-only actions.
- Verification passed the focused Agent workspace file (36 tests), Desktop
  typecheck, affected ESLint, file-size enforcement and `git diff --check`.
  Playwright and screenshot comparison were not run because manual visual QA
  was explicitly retained by the product owner for this iteration.

## Managed Pet Inventory And Official Catalog

- Completed `FR-AGENT-092` / `DES-AGENT-107` / `TEST-AGENT-127` /
  `T-AGENT-164`. The filesystem under the selected Codex root remains the Pet
  source of truth; no SQLite, sync or backup ownership was introduced. The Pet
  workspace now supports import or official-store install, inventory and
  animated preview, v1/v2 identification, metadata editing, export, exact
  directory opening and deletion.
- Installed Pets use an auto-fill card grid with a 14-rem minimum track, so a
  normal desktop workspace presents at least three columns and narrower widths
  collapse without horizontal overflow. The Appearance rail is a light card
  surface, while the native-skin state, invalid-item notice and restart consent
  use the same restrained visual hierarchy instead of browser-default controls.
- The official catalog is bounded to
  `legeling/awesome-codex-pet` raw assets. Main-process fetches reject redirects
  and non-allowlisted paths, enforce a ten-second timeout and per-resource byte
  limits, cache catalog reads for five minutes, and stage installation under
  the PromptHub data root before delegating to the existing atomic Pet import.
  Staging is removed after success or failure; renderer catalog requests use a
  generation guard so an older search cannot replace the latest result.
- The live upstream schema was checked against 172 catalog entries. Its
  localized names, author/category/license fields, manifest shape and
  `spritesheet.webp` contract match the adapter implemented here.
- Verification passed 5 focused files / 62 tests covering the Pet workspace,
  appearance service, store service and IPC, plus 2 locale-regression tests.
  Desktop and Shared typechecks, affected Desktop ESLint, file-size enforcement,
  locale JSON/key validation and `git diff --check` passed. Playwright and
  screenshot comparison were not run by explicit product-owner instruction;
  final visual acceptance remains manual.

### Pet Catalog Preview And Card Convergence Correction

- Corrected the catalog preview contract after validating the live upstream
  gallery. Browse previews are published at
  `codexpet.top/assets/previews/<pet-id>/webp/idle.webp`; they are not committed
  under a guessed raw-repository preview directory. The main process now uses
  that bounded official image first and falls back to the package's validated
  manifest and spritesheet only when the gallery asset is unavailable.
- Installed and catalog Pet cards use the same shared Agent asset-card shell,
  spacing, typography and action footer as Skill, MCP and Plugin cards, while a
  Pet-specific body gives the bounded 112-pixel preview primary visual weight.
  Installed paths and catalog identifiers no longer consume body space; exact
  filesystem access remains available through the installed-card folder action.
  Catalog previews render as ordinary bounded images instead of incorrectly
  treating a generated idle preview as a full spritesheet.
- Focused verification passed 2 files / 10 tests, including the published
  preview path, allowlisted package fallback, exact shared card spacing and
  rendered image source. A live HEAD request returned HTTP 200,
  `content-type: image/webp` and a 151,006-byte body for the official Firefly
  preview. Focused V8 coverage was 95.11% statements/lines, 80.85% branches
  and 100% functions for the store service, and 88.55% statements/lines,
  77.77% branches and 70.37% functions for the existing Pet workspace. The
  new published-preview success/fallback decisions and image-rendering branch
  are fully exercised; remaining uncovered paths are pre-existing catalog UI,
  CRUD and pagination branches outside this correction. Playwright was not run
  by explicit product-owner instruction.
- The follow-up presentation correction passed the focused Pet workspace suite
  (1 file / 4 tests), Desktop type checking, affected-file ESLint and the
  repository file-size gate. It verifies the 112-pixel primary preview, removes
  installed paths and catalog identifiers from the visible card body, and keeps
  exact directory access through the folder action.

### Awesome Codex Pet Branding And Persistent Preview Cache

- The official catalog is now labelled `Awesome Codex Pet` consistently in all
  seven locales. The shared Pet card body fixes the preview and detail tracks,
  clamps descriptions to two lines and bounds metadata to one line so upstream
  text cannot resize or overflow a card.
- Preview downloads now use two bounded cache layers: renderer memory and
  in-flight request deduplication for the current process, plus an atomic
  main-process disk cache at
  `<dataRoot>/agent-pet-store/cache/previews`. Disk entries expire after seven
  days and pruning retains at most 96 files or 192 MiB, whichever limit is hit
  first. Valid entries survive refresh and application restart; stale and
  malformed inventory entries are removed before reuse.
- Test-first verification reproduced the old brand, overflow and repeat-fetch
  failures, then passed 2 focused files / 12 tests after the correction. The
  focused suite covers renderer refresh reuse, process-restart reuse, expiry,
  entry-cap pruning and the fixed card text bounds. Playwright was not run by
  explicit product-owner instruction; final visual acceptance remains manual.

### Appearance Navigation And Explicit Catalog Search

- The Appearance context rail now presents Pets before desktop skins while
  retaining desktop skins as the stable initial destination. This changes only
  navigation presentation and does not add IPC, storage or reload work.
- The official catalog now separates the editable search draft from the
  committed query. Typing performs no request; Enter or the search action
  commits the trimmed query and resets paging. A new explicit submission can
  replace an older in-flight request, whose stale completion remains ignored.
- Focused component verification passed 2 files / 41 tests, covering navigation
  order, no request after typing, button submission, Enter submission and stale
  request isolation. Playwright was not run by explicit product-owner
  instruction; final visual acceptance remains manual.

## Menu Bar Agent Quotas

- Completed `FR-AGENT-093` / `DES-AGENT-108` / `TEST-AGENT-128` /
  `T-AGENT-165`. The native tray now shows Claude Code, Codex, Kimi Code,
  Antigravity, Gemini and GitHub Copilot quota summaries in stable registry
  order, with every returned metric, reset distance, plan and explicit
  provider state available in the Agent submenu.
- One process-wide usage service now backs both `agent:usage:get` IPC and the
  tray projection. The projection uses a two-worker queue, static platform
  metadata with no settings/database initialization, adapter-owned 60-second
  caches and sanitized per-provider failure isolation. Menu open is immediate
  from the last snapshot and performs a cache-aware background reload; the
  explicit refresh command alone requests `forceRefresh`.
- The implementation does not add a credential source, persist quota
  snapshots, vendor CodexBar source, or introduce a renderer dependency into
  the tray path. Dynamic labels are stripped of control characters and bounded
  before reaching Electron; raw provider errors are not logged or projected.
- Reference research inspected CodexBar's provider registry, metric-window
  selection and menu-open refresh architecture at upstream commit
  `94efcfdf4a4be495ddc80ad5193d4e488df06450`. The applicable pattern is cached
  immediate presentation plus bounded asynchronous refresh; its custom SwiftUI
  card rendering is not portable to Electron native menus.
- Verification passed 5 focused files / 56 tests. The tray projection, native
  menu and controller passed 3 files / 47 tests with 100% statement, branch,
  function and line coverage; the four provider usage adapter suites passed
  121 tests. Desktop type checking, affected-file ESLint, production build,
  repository file-size, traceability and `git diff --check` passed. The
  production build retains the existing large-chunk and mixed static/dynamic
  `fflate` warnings; this change adds no renderer dependency or bundle asset.

### Rendered Popover Convergence

- Completed `DES-AGENT-110` / `TEST-AGENT-131` / `T-AGENT-168`. The native
  percentage submenu is superseded by a reusable renderer popover anchored to
  the tray bounds and clamped to the nearest display. Blur hides it; tray
  destruction, application quit and stale load failures release the owned
  window without reopening or double-closing it.
- The popover presents the six verified Agents with existing product artwork,
  separate name and tabular-percentage tracks, remaining-capacity progress,
  expandable metric/reset details and explicit loading, disconnected, expired
  and unavailable states. A successful cached row remains visible and marked
  when a refresh is unavailable. Light and dark rendering use the existing
  theme tokens and seven-locale renderer dictionaries.
- Provider work remains a stable two-worker queue over six fixed adapters, so
  time is `O(P + M)`, snapshot memory is `O(P + M)` and network concurrency is
  `O(1)` with an upper bound of two. The existing process-wide usage service,
  adapter timeouts and 60-second cache remain authoritative; the popover adds
  no credential, database, filesystem, backup or sync owner.
- Verification passed 7 focused files / 63 tests. Focused V8 coverage for the
  new controller, window factory, popover and queue model is 100% statements,
  branches, functions and lines. Desktop type checking, affected-file ESLint,
  production build, file-size checks and `git diff --check` passed. Browser
  visual QA at 392 x 540 covered light, dark and expanded-detail states without overlap;
  the temporary browser/server and screenshots were cleaned afterward. The
  production build retains the existing large-chunk and mixed static/dynamic
  `fflate` warnings.

### Direct Tray Quotas And CodexBar Hierarchy

- Completed `TEST-AGENT-132` / `T-AGENT-169`. On macOS, primary-clicking the
  PromptHub status icon now opens the rendered quota surface directly; the
  redundant second-level quota command is gone. Secondary click explicitly
  opens the remaining native action menu. Windows and Linux retain their
  existing context-menu and quota-command behavior.
- The renderer now follows the information hierarchy verified in CodexBar's
  `UsageMenuCardView`: compact provider icon/name/plan, named quota window,
  small inline remaining value, visible full-width slim progress and reset
  time. Raw provider plan identifiers such as `LEVEL_INTERMEDIATE` are
  normalized for display, while disconnected and expired states remain text
  rather than fake percentages. The implementation stays in PromptHub's
  React, token and platform-icon system; no SwiftUI source or upstream assets
  were copied.
- The macOS popover window now opts into Electron's native `popover` vibrancy
  and active visual-effect state. Its renderer shell is transparent and drops
  the opaque white card/shadow; Windows and Linux retain the themed opaque
  fallback. Window and renderer regressions cover both the native options and
  the macOS surface class.
- The native-material follow-up passed the related 5-file / 57-test quota
  suite, desktop typecheck, affected ESLint, Prettier, spec traceability/index,
  file-size and `git diff --check` gates; the production build remains green
  with the existing chunk-size and mixed static/dynamic `fflate` warnings.
- The initial browser inspection exposed a collapsed inline progress track; a
  regression test reproduced it before the track became a stable full-width
  block. Visual QA at 392 x 540 then covered light, dark and expanded Codex
  detail states with visible progress, no overlap and bounded inner scrolling.
  The browser, development server, screenshots and source-reference temporary
  files were stopped or removed afterward.
- The final focused behavior suite passed 7 files / 64 tests. Focused V8
  coverage over `tray-controller.ts`, `tray-menu.ts`, the popover component and
  its model passed 44 tests at 100% statements, branches, functions and lines.
  Both Agent workspace locale gates, Desktop type checking, affected-file
  ESLint and the production build passed. The build retains the existing large
  renderer-chunk and mixed static/dynamic `fflate` warnings.

### Named Cold Start And Kimi Credential Renewal

- Completed `TEST-AGENT-129` / `T-AGENT-166` and `TEST-AGENT-130` /
  `T-AGENT-167`. The tray now creates six named loading rows synchronously and
  replaces each row as its bounded provider request settles, so one slow
  adapter no longer leaves a single anonymous loading item in the menu.
- Kimi Code quota lookup now follows the official current credential lifecycle.
  An expired or rejected access token is renewed through
  `https://auth.kimi.com/api/oauth/token`, then the usage request is retried
  once after a `401`. Renewal uses the upstream-compatible native lock path,
  re-reads credentials after lock acquisition, coalesces concurrent work in the
  process, applies bounded timeout/retry behavior, and atomically replaces the
  credential with `0600` permissions while preserving unknown fields. Legacy
  credentials remain read-only fallbacks.
- Focused verification passed 5 files / 141 tests. Focused V8 coverage for the
  new Kimi renewal service, tray projection, tray controller and native menu is
  100% statements, branches, functions and lines. Desktop type checking,
  affected-file ESLint, production build, repository file-size enforcement,
  traceability, generated change-index validation and `git diff --check` passed.
  The production build retains its existing large renderer chunk and mixed
  static/dynamic `fflate` warnings; this change adds no renderer bundle asset.

### Handoff Confirmation Snapshot Race Fix

- Preserved the existing two-stage review boundary while fixing the failure
  caused by live Claude/Codex transcript writes between preview and confirm.
  `AgentConversationService` now stores each redacted bounded preview under an
  opaque UUID token for five minutes, caps pending snapshots at 64, and keeps
  them only in main-process memory. Confirmation validates the token, request
  identity, payload and digest against that exact snapshot instead of reading
  the source session a second time; successful launches consume the token,
  while failed launches remain retryable until expiry.
- IPC accepts only UUID preview tokens. Renderer errors for an expired or
  changed preview now explain that a fresh preview is required instead of
  collapsing the condition into the generic conversation failure message.
- Added regression coverage for transcript mutation after preview, expiry
  without a second transcript read, target/transport tampering, and the
  updated IPC/preload contract. Focused conversation service, IPC, preload and
  Agent session panel suites passed (31 tests); desktop typecheck passed. A
  full release harness was not run for this focused fix.

### Conversation Feedback And Session Index Affordance

- Conversation actions now use the existing renderer `ToastProvider` for
  successful resume, handoff, copy and export feedback. The action toolbar no
  longer grows an inline status row, so the confirmation is visible above the
  current workspace without changing the transcript layout.
- The opt-in local session index keeps its existing ownership boundary: it
  stores only bounded, redacted session metadata on this device to accelerate
  search and pagination; transcript bodies stay in Agent-owned files and are
  read on demand. The Sessions panel now states this directly below the toggle
  and exposes the description to assistive technology.
- The focused Agent Sessions panel regression passed 10 tests after the UI
  change. Desktop typecheck, locale validation, affected ESLint, formatting,
  production build, and `git diff --check` also passed. The full release
  harness was not run; the build retains the existing large renderer-chunk and
  mixed static/dynamic `fflate` warnings.

### Compact Conversation Detail Header

- Removed the repeated session title and source path from the transcript detail
  header. The selected session list remains the title/path context, while the
  detail header keeps only continuation, export, and metadata actions in a
  compact row so more transcript content is visible per page.
- The Agent Sessions panel regression still passes 10 tests after the layout
  change; the duplicate-title and repeated-path assertions cover the intended
  behavior. Desktop typecheck, affected ESLint, Prettier, production build and
  `git diff --check` also passed; the build retains the existing chunk-size and
  mixed static/dynamic `fflate` warnings.

### Conversation Metadata Dialog Styling And Archive Semantics (Superseded)

- This intermediate renderer dialog was removed by `FR-AGENT-103`; Conversation
  History no longer exposes generic title, project, tag, note, favorite or
  archive editing.
- Clarified that archive is local PromptHub metadata. It marks the conversation
  without excluding it from the current history list; the native Agent
  transcript remains untouched and is never moved or deleted by this control.
- The former modal regression was replaced with assertions that toolbar and row
  context actions do not expose editing. Existing archived metadata remains a
  read-only row projection.

### Conversation History Density And Cursor Safety

- Removed the nested rounded/shadow surface around continuation, export and
  metadata actions; the detail header now owns the single toolbar surface.
- Selected session rows explicitly use `text-foreground` with a neutral accent
  background, avoiding unreadable saturated primary selection styling.
- Transcript loading now de-duplicates each cursor page, follows advancing
  cursors for at most eight hops when a page contains no new entries, stops on a
  non-advancing cursor, and clamps visible pagination to the last loaded page.
- Added a regression fixture for a duplicate cursor followed by the final page,
  plus assertions for the selected-row contrast and toolbar surface contract.

### Lossless Pi Conversation Pagination

- Replaced Pi and Oh My Pi's fixed 2 MiB transcript-prefix detail read with the
  existing main-owned, source-bound cursor page contract. Each request reads
  bounded JSONL chunks, counts only visible messages toward the page size and
  returns an opaque continuation cursor until the native transcript reaches its
  real end; no transcript body or byte offset is persisted or exposed.
- Removed the generic limited-preview banner from Conversation History. The
  renderer still mounts only a bounded message page and fetches additional
  native pages on demand, so responsiveness no longer implies that later
  conversation content is permanently unavailable.
- Added regressions for a Pi transcript that crosses the former 2 MiB boundary,
  complete multi-page traversal and a recoverable `truncated` response that
  still exposes cursor navigation without the old warning. Focused Pi, Oh My
  Pi and Agent Sessions panel suites pass 19 tests; desktop typecheck passes.

### Unified Provider Workbench And Pi Import

- Added shared Provider workbench primitives for the sidebar, fixed toolbar,
  provider rows, detail canvas, headers, sections and metadata rows. Generic
  Provider Profiles, current native configuration and Pi now use the same
  geometry, spacing, selection treatment and 8 px surface radius while keeping
  their platform-specific controls.
- Pi now exposes the PromptHub provider import action in the shared toolbar.
  Renderer requests contain only platform/source/model identifiers. Main maps
  OpenAI, Anthropic and Gemini protocols into Pi APIs, resolves the selected
  credential without exposing it, and projects the provider into native
  `models.json` plus optional `auth.json`.
- Managed-credential import prepares and validates both JSONC edits before any
  mutation, backs up both targets, verifies both original digests, writes
  atomically and restores both originals on partial failure. Imports without a
  credential touch only `models.json`; duplicate providers, malformed input,
  invalid secrets and concurrent edits fail before an unintended write.
- Focused unit/component/IPC/preload verification passed 6 files / 98 tests.
  Desktop typecheck, affected-file ESLint and production build passed. The
  focused Electron Provider workbench
  E2E passed and captured the Pi layout at 1440 x 900; the existing monolithic
  Agent workspace E2E was also attempted but stopped at its pre-existing
  registry count assertion before reaching Provider & Model. The production
  build keeps the existing large renderer chunk and mixed static/dynamic
  `fflate` warnings. The quick release harness completed every non-Desktop-unit
  check; its Desktop unit batch passed 4,899 of 4,900 tests and failed in the
  unrelated database-backup MCP fixture because the fixture omitted the now
  required `bindings` array.

### Pi Current Provider Import Parity

- Added the missing current-configuration import control before Pi's existing
  PromptHub-source import control, matching the generic Provider toolbar order,
  icon treatment, tooltip behavior and confirmation boundary. The action is
  disabled when Pi has no current provider/model or the current provider already
  has a custom override.
- Renderer submits only `agentId: "pi"`. Main re-inspects Pi's current settings
  and bounded catalog, rejects missing, stale, custom or invalid provider/model
  identities, then creates a same-id `models.json` entry using an empty
  `modelOverrides` record for the current model. This is intentionally a no-op
  model override: heterogeneous sibling protocols and endpoints remain untouched,
  built-in models stay available and existing `auth.json` credentials are not
  copied, changed or returned.
- The Pi catalog now marks a built-in provider with a matching `models.json`
  entry as custom, so the refreshed detail exposes the existing edit/remove
  controls. Removing that entry naturally restores the built-in projection.
- Focused unit/component/IPC/preload verification passed 5 files / 59 tests.
  The new importer reached 100% statements, functions and lines; focused
  coverage was rerun after adding the missing provider branch. Desktop typecheck,
  affected ESLint, Prettier, spec traceability/index checks, `git diff --check`
  and production build passed. The focused Electron E2E passed at 1440 x 900,
  exercised the confirmation and durable override write, confirmed both toolbar
  controls, checked secret redaction and captured the final editable Pi surface.
  The build retains the existing large renderer chunk and mixed static/dynamic
  `fflate` warnings. The wider Pi/provider regression passed 9 files / 124 tests.
  The quick release harness passed 21 of 22 checks; its Desktop unit batch passed
  4,905 of 4,906 tests and failed only in the unrelated existing
  `database-backup.test.ts` MCP fixture because that fixture omits the now-required
  `bindings` array.

### Semantic And Composable Agent Quotas

- Completed `FR-AGENT-097` / `DES-AGENT-115` / `TEST-AGENT-138` /
  `T-AGENT-184`. The shared usage contract is now schema V2 with typed scope,
  period and value unions. Claude, Codex, Kimi, Antigravity, Gemini and Copilot
  adapters normalize provider data to remaining percentages and optional
  remaining/limit amounts; unlimited and unknown values remain explicit.
- Added one bounded main-process normalization boundary. Dynamic ids, labels,
  scope text and units are sanitized and length-limited, non-finite values are
  rejected, and inventories are capped at 64 before IPC. Renderer cache reads
  validate the complete V2 envelope and reject stale, malformed or oversized
  entries. No DB, filesystem layout, credential source, provider endpoint,
  request cadence or background process changed.
- Added a shared renderer presentation model and `AgentUsageMeter`. Finite
  percentage or amount values with rolling or day/week periods render as
  compact SVG rings; month, billing-cycle, lifetime and provider-defined values render as
  horizontal remaining bars. Overview and the menu-bar popover share labels,
  reset formatting, warning tones, primary selection and accessible progress
  semantics. Successful summaries no longer repeat provider provenance;
  cached/updating/stale trust states remain explicit.
- Scope composition is Agent-independent: account, model-group, feature and
  model groups use stable ordering; individual models collapse to the four most
  constrained entries and expand within a 64-item bounded scroll region. Cold
  loading no longer fabricates 5-hour or 7-day percentages.
- Test-first verification reproduced four presentation failures before the
  implementation. The final targeted quota regression passed 15 files / 279
  tests, and the locale/hardcoded-copy regression passed 3 files / 4 tests.
  Focused coverage for the new normalization, shared meter, banner,
  presentation selector and renderer cache reached 100% statements, branches,
  functions and lines (5 files / 84 tests). Existing provider service files
  retain legacy uncovered parser/error branches, while every new semantic
  normalization and visualization condition has a direct regression.
- Desktop typecheck, full repository lint including file-size limits, affected
  ESLint and the production build passed. A focused Electron Playwright run
  passed at 1440 x 900 and 820 x 900, asserted four semantic rings plus one
  amount bar, removed provider-source copy, bounded the desktop usage section
  below 260 px and found no horizontal overflow. Temporary screenshots, test
  specification and Electron user-data directory were removed after inspection.
- The quick release harness was also attempted. All completed non-governance
  checks outside the Desktop unit batch passed, but the run remained red for
  two unrelated repository conditions: the generated change index is stale
  after parallel active/archive additions, and `database-backup.test.ts` still
  supplies an MCP fixture without the required `bindings` array. The Desktop
  batch passed 4,975 of 4,977 tests; its other failure was a Kimi lock-liveness
  timeout under the full parallel run, and that file passed in isolation with
  35 of 35 tests immediately afterward.
- Layout follow-up: Overview now uses container-width `auto-fit` tracks instead
  of `xl` viewport breakpoints, so Antigravity's two model groups share one row
  at a 1,008 px CSS viewport while each group's 5-hour and weekly rings remain
  aligned. Plan names now use the shared icon-and-label subscription badge in
  both Overview and the menu-bar popover. A focused Electron Playwright check
  asserted equal group Y positions, right-column placement and no horizontal
  overflow at 1,008 x 900; the temporary fixture and screenshot were removed.
- Visual follow-up: cached values no longer expose the transient
  `cached/updating` implementation message; the disabled spinning refresh
  control remains the busy indicator and failed refreshes still mark values
  stale. Full-width amount groups and cyclic ring groups now use separate
  layout rows so a spanning amount bar cannot preserve empty `auto-fit` tracks.
  Ring meters use readable bounded widths in a wrapping flex row, so related
  5-hour and weekly windows stay clustered without truncating labels; narrower
  containers stack groups before they compress metric copy. The focused
  banner, meter and presentation regression passed 3 files / 43 tests. A
  temporary Electron Playwright fixture passed at 1,440 x 900 and 820 x 900,
  asserting full-width amount composition, group/ring placement, untruncated
  metric copy and no horizontal page overflow; its screenshots, isolated user
  data and temporary test were removed after inspection.
- Antigravity source-semantics follow-up: removed the account-level monthly
  prompt-credit metric derived from `GetUserStatus.planStatus`. Current
  Antigravity documentation defines baseline quota as 5-hour and weekly windows
  and AI credits as a separate overage mechanism; the local adapter now uses
  `GetUserStatus` only for plan identity and emits baseline metrics only from
  `RetrieveUserQuotaSummary`. The legacy credit fields remain in the regression
  fixture to prove they cannot reappear as a fabricated total. Renderer cache
  validation also rejects older Antigravity V2 snapshots containing the retired
  `promptCredits` metric while preserving valid grouped-window caches. The
  regression failed first on the old mapping, then the focused quota suite
  passed 5 files / 114 tests; desktop typecheck, affected ESLint, production
  build, traceability validation and `git diff --check` also passed.
- Kimi current-payload follow-up: the coding usages endpoint now reports
  weekly and rolling values as `remaining` plus `limit`, and its 5-hour window
  as `300 TIME_UNIT_MINUTE`. The adapter now prefers the provider-reported
  remainder, normalizes proto and legacy time units, and keeps compatibility
  with older `used` plus `limit` responses. A regression fixture reproduces
  the live response and failed against the prior adapter before the fix. The
  response's `totalQuota` remains deliberately unmapped: Kimi documents a
  separate monthly membership total shared across products, but the current
  endpoint does not provide a trustworthy numeric value and the official Kimi
  Code client does not use that field for plan usage. The focused quota
  regression passed 6 files / 142 tests; desktop typecheck, affected ESLint,
  production build, traceability validation and `git diff --check` passed. The
  build retains only the existing renderer chunk-size and mixed `fflate`
  import warnings. A final current-account read through the production adapter
  returned `ok` with one weekly amount metric and one 18,000-second rolling
  amount metric; no credential or account identifier was printed.
- Period-visualization correction: restored the confirmed period-first rule
  after Kimi's absolute request amounts exposed an incorrect value-first
  selector. Finite rolling and calendar day/week metrics now render as compact
  rings whether their provider reports percentage or amount values; monthly,
  billing-cycle, lifetime and provider-defined totals remain bars. The Overview
  path disclosure now starts open. Regression tests failed first against both
  old behaviors, then the focused quota/Overview regression passed 8 files /
  164 tests. Desktop typecheck, affected ESLint, production build,
  traceability validation and `git diff --check` passed; the build retains only
  the existing renderer chunk-size and mixed `fflate` import warnings. Live
  Electron inspection at 1,280 x 740 and 900 x 740 confirmed that Kimi's two
  finite windows remain compact rings without content overlap, and the path
  details are expanded on first render.
- Kimi identity and history correction: the shared plan formatter now maps the
  provider's current `LEVEL_*` membership enums to the public tempo names, so
  `LEVEL_INTERMEDIATE` renders as `Allegretto` in both Overview and the tray
  popover. The bounded Kimi session reader now omits default `New Session`
  shells with no `lastPrompt`, requires a contained readable main wire file,
  and reports that exact `wire.jsonl` path and byte size. Test-first coverage
  reproduced the raw enum and empty-shell history rows. Current local data now
  projects 7 readable conversations from 18 indexed Kimi shells, with exact
  wire-file sizes and readable User/Assistant transcript entries. The final
  broader quota/session-adapter regression passed 8 files / 149 tests, and the
  dedicated session service/panel regression passed 2 files / 25 tests. The
  broader session run also caught and corrected a stale Gemini malformed-row
  counter name. An isolated-HOME Electron check at 1,280 x 820 verified one
  real Kimi row, the exact 224 B wire size, User/Assistant transcript bubbles
  and absence of the empty `New Session` shell without clipping or overlap.
  The legacy full Agent-workspace E2E remains blocked before the Kimi step by
  its stale complete-registry count assertion: the isolated fixture exposes 5
  installed Agents while the test still expects all 35 supported platforms.

### Expanded Native Model Configuration

- Completed `FR-AGENT-098` / `DES-AGENT-116` / `TEST-AGENT-176` /
  `T-AGENT-185`. The shared model adapter registry now enables Antigravity,
  Qoder, CoPaw, AutoClaw, QClaw and Hermes in the existing Provider Profile
  workbench. Existing Claude Code, Codex, Grok, Pi, OpenCode and OpenClaw paths
  remain on the same normalized contract; no Agent-specific renderer layout was
  added.
- Antigravity resolves its CLI model root separately from the shared
  `~/.gemini/config` asset root. Qoder projects `model.name` and sanitized
  `customModels` metadata. AutoClaw and QClaw use their own verified native
  files. Hermes preserves YAML routing fields. CoPaw resolves and contains the
  active workspace before changing only its `active_model` pair. All adapters
  keep literal credentials main-owned and preserve unrelated native fields.
- NanoClaw remains planned because its model source is per Agent Group rather
  than platform-global. The existing target-binding follow-up `T-AGENT-178`
  must add an explicit child target before model mutation can be truthful and
  safe; generated container files are not treated as source of truth.
- Test-first verification reproduced 11 unsupported/capability/root failures.
  The final focused regression passed 8 files / 122 tests, and the expanded
  adapter plus legacy model-config coverage passed 2 files / 36 tests. Every
  new statement and branch in the six adapters is covered; the legacy combined
  file remains at 89.44% statements and 88.83% branches overall. Desktop and
  shared typecheck, the root file-size and desktop ESLint gate, and the
  production build passed. An initial ad hoc ESLint command was run from the
  repository root and could not find the desktop package's flat config; the
  authoritative package-scoped lint subsequently passed.
- The repository changed-profile harness passed governance, file-size, shared,
  database, core, CLI, Web, Cloudflare, mobile, Desktop lint and Desktop
  typecheck gates. Its Desktop unit batch passed 4,998 of 4,999 tests and failed
  only in the unrelated existing `database-backup.test.ts` fixture because its
  MCP library omits the now-required `bindings` array; all 122 focused tests for
  this change passed immediately before the harness.

### Provider Toolbar And Sidebar Containment

- Completed `FR-AGENT-099` / `DES-AGENT-117` / `TEST-AGENT-177` /
  `T-AGENT-186`. The generic Profile and Pi Provider workbenches now render the
  existing current-configuration and PromptHub-source import commands as
  one-column icon-and-text buttons. The commands keep their accessible names,
  tooltips and original handlers; no Provider, credential, persistence or IPC
  behavior changed.
- The shared sidebar now contains horizontal overflow while preserving its
  vertical inventory scroll. Native configuration row spacing moved to an
  outer padding wrapper, so the full-width button no longer combines width and
  horizontal margin beyond its content box.
- Test-first verification reproduced three failures for icon-only commands and
  native-row overflow. The final focused component suites passed 60 tests, the
  adjacent workspace/editor suites passed 39 tests, and a real Electron run at
  1440 x 900 confirmed both command labels, equal generic/Pi toolbar geometry
  and `scrollWidth <= clientWidth`. Desktop typecheck, root lint and the
  production build passed. The Playwright Electron process and isolated user
  data were closed and removed by the test harness.

### Current Codex History Message Compatibility

- Extended `FR-AGENT-079` / `DES-AGENT-094` / `TEST-AGENT-114` /
  `T-AGENT-151` after a real current Codex rollout appeared in the History list
  but rendered a blank transcript. The 84 MB source was non-empty; its visible
  turns used top-level `response_item` message records while the adapter only
  recognized the legacy `event_msg` user/agent message shape.
- The Codex projector now accepts both formats, exposes only bounded
  user/assistant text and continues excluding developer instructions,
  reasoning, tool records and image payloads. Metadata title extraction and
  paginated detail reads share the same projector, so the list and body cannot
  disagree about whether current-format visible turns exist.
- Test-first verification reproduced the UUID fallback title and empty detail.
  The new fixture plus the existing major adapters, session service,
  conversation service and renderer History suites pass 4 files / 42 tests.
  Focused V8 coverage for `agent-session-codex.ts` reached 97.18% statements and
  lines, 84.61% branches and 100% functions; every changed message-format branch
  executed. A read-only probe of the reported real session returned 38 visible
  user/assistant entries on the first bounded page, a non-UUID title, zero parse
  errors and a valid continuation cursor without printing transcript content.
- Affected ESLint, desktop typecheck, the full renderer/main/preload production
  build, spec traceability/index validation and `git diff --check` passed. The
  build retains the existing large-chunk and mixed `fflate` import warnings.

### Conversation Storage Size, Project Filters And Native Delete

- Completed `FR-AGENT-100` / `DES-AGENT-118` / `TEST-AGENT-178` /
  `T-AGENT-187`, and closed the adapter-owned gate remaining in
  `T-AGENT-137`. Codex session metadata now projects the exact rollout JSONL
  byte size and explicit native-delete capability. Session cards show the
  formatted footprint; adapters without a truthful per-session value display
  an explicit unknown value rather than the size of a shared database.
- Conversation project filters now merge registered projects with exact paths
  reported by loaded native sessions. Options are deduplicated by path, and
  equal labels are disambiguated with their paths before exact-path filtering.
  This is an O(S + P) in-memory projection over loaded sessions and registered
  projects and adds no persistent project rows, scans, cache or network work.
- The visible delete action is offered only for verified adapters, opens the
  shared destructive confirmation dialog, and sends no IPC mutation on cancel.
  Main re-resolves the Codex session through its configured active and archived
  roots, validates each contained regular file without following symlinks,
  deletes all matching rollout copies, and then hard-deletes the PromptHub
  metadata row. Native deletion failure leaves metadata unchanged. Unsupported
  adapters fail before mutation; no renderer-provided path or generic unlink
  fallback exists.
- Test-first red state reproduced all three reported failures. Final focused
  verification passed 5 files / 40 tests; adjacent session-index, preload and
  locale regressions passed 5 files / 35 tests. New size formatting reached
  100% statements, branches, functions and lines; the focused legacy Codex,
  conversation-service and IPC modules measured 97.48%, 89.67% and 91.7%
  statements respectively, with every new size/delete success, unsupported and
  native-delete, cleanup and unsupported branches exercised.
- Desktop and shared typecheck, affected ESLint, Prettier, production build,
  spec traceability, spec-index validation and `git diff --check` passed. The
  production build retains its existing large renderer chunk and mixed `fflate`
  import warnings. No long-running process, port, browser, temporary session or
  user-owned native conversation was created or retained; native deletion was
  verified only against isolated temporary fixtures.

### Enter-Submitted Conversation Search

- Completed `FR-AGENT-101` / `DES-AGENT-119` / `TEST-AGENT-179` /
  `T-AGENT-188`. Conversation History now keeps the editable draft separate from
  the submitted query. Input changes perform no request or local filtering;
  Enter submits the trimmed value, IME composition is ignored, repeated Enter
  can refresh the same query, and submitting an empty value restores the full
  inventory. Pagination continues with the submitted value even if the draft
  changes afterward.
- Renderer, live session-index projection and persistent SQLite index now limit
  matches to title, project label and project path. PromptHub metadata notes and
  tags, model names, native body-only matches and indexed redacted previews no
  longer expand results. The search placeholder names the title/project scope in
  all seven locales.
- Test-first red state reproduced the 250 ms input debounce, Copilot/Cline/Cursor
  body-result exceptions and SQLite preview match. Focused component, service and
  DB verification passed 3 files / 38 tests; locale regression passed 2 files /
  9 tests. Focused V8 coverage measured the main session-index service at 100%
  branches and 99.55% statements, while the legacy renderer panel measured
  85.47% branches and 94.89% statements with every changed search condition
  exercised.
- Desktop typecheck, affected ESLint, file-size guard and production build
  passed. A real Electron Playwright flow with isolated HOME/CODEX_HOME passed
  body-only rejection, project match and empty-query restoration at 1280 x 820;
  the Electron process, temporary home and screenshot were removed afterward.

### Conversation Ordering And Native Titles

- Completed `FR-AGENT-102` / `DES-AGENT-120` / `TEST-AGENT-180` /
  `T-AGENT-189`. The second Conversation History selector now orders the loaded
  inventory by newest, oldest, largest or smallest. Unknown primary values stay
  last, ties are deterministic, input arrays are not mutated, and appended pages
  are merged into the active order. PromptHub archive metadata remains visible
  through a compact row icon instead of excluding native sessions. Legacy
  The current development-only soft-delete field, Restore IPC/preload contract,
  removed-state icon and Restore menu branch were deleted rather than retained
  as compatibility behavior. Permanent native deletion now hard-deletes the
  matching PromptHub metadata row after the adapter succeeds.
- Added one effective-title projection for list, destructive-confirmation and
  handoff surfaces: PromptHub override, native adapter title, then session id. The Codex
  adapter now reads the latest safe `thread_name` from a contained, read-only,
  8 MiB-bounded tail of native `session_index.jsonl`; malformed, unsafe, missing
  or unusable index data keeps the first-visible-user-message fallback.
- Test-first red state reproduced the ordering, title and soft-delete contract
  defects. Focused verification passed 8 files / 55 tests across sort/title
  helpers, renderer behavior, Codex fixtures, locale parity, conversation
  service, database, IPC and preload. Desktop typecheck, affected ESLint,
  Prettier and production build passed after the soft-delete removal follow-up.
  Focused V8 coverage measured the legacy conversation service at 90.95%
  statements and 75.23% branches; every changed delete, unsupported and cleanup
  branch is covered, while the remaining uncovered lines are unrelated legacy
  handoff/export guards. The earlier real Electron
  Playwright flow used isolated HOME/CODEX_HOME, confirmed native renamed titles
  and largest-first ordering at 1280 x 820, and removed its process, temporary
  home and screenshot; the follow-up reconciliation branch is covered at the
  main-service and renderer-component boundaries rather than by another E2E run.
- Focused V8 coverage measured the new sort/title helper at 100% statements,
  branches, functions and lines. The legacy Codex adapter measured 97.85%
  statements and 85.82% branches with every new native-title branch exercised;
  its remaining uncovered lines are pre-existing detail-page empty-line and
  oversized-rollout error branches outside this title projection.

### Latest Transcript Navigation And Row Context Actions

- Completed `FR-AGENT-103` / `DES-AGENT-121` / `TEST-AGENT-181` /
  `T-AGENT-190`. Transcript pagination now includes an icon-only latest-messages
  command with localized name and tooltip. One activation follows at most eight
  advancing 80-entry cursor pages, de-duplicates stable entry ids and lands on
  the newest 20-entry view page reached; a remaining cursor keeps the command
  available for another explicit activation.
- Right-clicking a session row selects it and opens a viewport-contained menu
  that reuses native continuation, cross-Agent continuation, Markdown/JSON
  export and adapter-gated permanent deletion. Escape, outside pointer input,
  window blur, resize and scroll close the menu. Delete still uses the existing
  destructive confirmation before IPC.
- Removed the generic conversation metadata dialog, its toolbar/menu entry and
  its obsolete seven-locale strings. Existing metadata projection and storage
  contracts were not migrated or duplicated; native Agent titles remain
  read-only. Test-first component coverage proves bounded latest traversal,
  duplicate cursor handling, resume, JSON export, deletion cancel/confirm and
  the absence of the edit command.
- Focused verification passed 8 files / 56 tests, desktop typecheck, affected
  ESLint, Prettier, file-size guard, production build, traceability/index checks
  and `git diff --check`. One isolated-HOME Electron Playwright flow verified
  the latest-page command and row context menu at 1280 x 820; both screenshots
  were inspected for clipping/overlap, then the Electron process, temporary
  home and screenshots were removed. The build retains the existing large-chunk
  and mixed static/dynamic `fflate` warnings.
- Focused V8 coverage measured the two legacy renderer modules together at
  94.93% statements/lines and 88.6% branches. Every new latest-navigation and
  context-action condition is exercised, including loaded-only/cursor-backed
  latest seeks, duplicate cursors, supported/unsupported resume, handoff and
  delete branches, Escape/outside close, export, and deletion cancel/confirm;
  remaining uncovered branches belong to pre-existing loading/error and handoff
  transport fallbacks outside this interaction delta.

### Transcript Table Containment And Tool Message Semantics

- Completed `FR-AGENT-104` / `DES-AGENT-122` / `TEST-AGENT-182` /
  `T-AGENT-191`. GFM tables now render inside a shrinkable, bubble-local
  horizontal scroll region. User, assistant and tool bubbles and the Markdown
  root use explicit `min-w-0` containment, so long paths and wide columns no
  longer enlarge the transcript pane or window.
- Tool calls/results now render as Agent-side messages with the left Agent
  avatar, bounded white bubble and compact Tool label. System and unknown events
  retain the centered informational notice treatment. This changes presentation
  only; native transcript, handoff and export text remain unchanged.
- Test-first regressions cover wide-table containment and the Tool avatar/bubble
  structure. Focused Markdown and Session component verification passed 2 files
  / 16 tests before broader gates.
- Focused V8 coverage measured the two renderer modules at 94.4% statements and
  87.59% branches; both new table-containment and Tool-role branches are
  exercised. Desktop production build and one isolated-HOME Electron Playwright
  flow passed. At 1280 x 820 the transcript retained `scrollWidth <=
clientWidth`, the table wrapper owned horizontal overflow, and the inspected
  screenshot showed no pane/bubble overflow. Test Electron, temporary HOME,
  screenshot and coverage artifacts were removed afterward. Existing build
  warnings remain limited to the large renderer chunk and mixed `fflate`
  import.

### Native Session And Project Location Actions

- Completed `FR-AGENT-105` / `DES-AGENT-123` / `TEST-AGENT-183` /
  `T-AGENT-192`. The selected-conversation More menu now remains available
  without native-delete support and exposes two distinct commands: reveal the
  exact Agent-owned session file and open the effective project directory. The
  row context menu reuses the same callbacks.
- Missing `sourcePath` or `projectPath` keeps only the corresponding command
  disabled. The renderer does not derive or guess locations. Both commands
  reuse the existing validated `window.electron.openPath` bridge, which reveals
  files and opens directories in main; failures use the existing conversation
  action error without changing transcript or metadata.
- Test-first component coverage reproduced the delete-only More menu and then
  verified both exact path calls, shared toolbar/context actions, disabled
  missing-source behavior, menu visibility without delete capability and shell
  failure handling. Focused Session component verification passed 1 file / 13
  tests; the seven-locale renderer suite passed 5 files / 42 tests. Focused V8
  coverage for the two legacy conversation renderer modules measured 95.76%
  statements/lines and 88.35% branches, with both new path commands, disabled
  state and success/failure paths exercised.
- Desktop typecheck, affected ESLint, Prettier and production build passed. One
  isolated-HOME Electron Playwright flow verified the two commands in both the
  row context menu and toolbar More menu at 1280 x 820; the inspected screenshot
  showed correct grouping, icons and no clipping. The test process, temporary
  HOME, screenshot and coverage artifacts were removed afterward. Existing
  build warnings remain limited to the large renderer chunk and mixed `fflate`
  import.

### Claude Transcript And Project Projection

- Completed `FR-AGENT-106` / `DES-AGENT-124` / `TEST-AGENT-184` /
  `T-AGENT-193`. The Claude JSONL adapter now distinguishes visible entries,
  valid internal records and malformed input. Meta records, lifecycle/system
  rows and generated local-command wrappers no longer render as Events, supply
  a fallback title or inflate parse errors. Visible `tool_result` content is
  projected with the Tool role.
- Live metadata and the optional local metadata index now retain a safe absolute
  native `cwd` as project identity, display its basename instead of Claude's
  encoded storage-directory key and use the same cwd for native resume. The
  encoded key remains a fallback for sessions without valid cwd. Claude index
  adapter version 2 causes existing rebuildable metadata to be rescanned; no
  schema, IPC or native transcript migration was added.
- Test-first unit regressions cover meta, system, lifecycle, generated command,
  visible user/assistant, tool-result and malformed records, plus live/index
  label and resume consistency. The focused service suites pass 2 files / 27
  tests. Focused V8 coverage measured the index service at 99.56% lines and
  94.33% branches and the legacy multi-adapter session service at 85.77% lines
  and 72.95% branches; every new Claude classification and cwd projection path
  exercised by the regression is covered, while remaining gaps are unrelated
  legacy adapters and guards.
- An isolated-HOME Electron Playwright flow passed 2 tests and visually verified
  that Claude History shows only the visible question, answer and real
  `newpaper-repair` project label, with no Event or encoded `-Users-` option.
  Desktop typecheck, affected ESLint and production build passed before the
  documentation convergence gate. The existing build warnings remain limited
  to the large renderer chunk and mixed static/dynamic `fflate` import.

### Gemini And Cursor Session Projection

- Completed `FR-AGENT-107` / `DES-AGENT-125` / `TEST-AGENT-185` /
  `T-AGENT-194`. Gemini live and indexed session metadata now reads the bounded
  native `.project_root`, uses its exact safe path for project identity and
  resume, and prefers the bounded native `summary` title. Marker changes
  invalidate otherwise reusable indexed metadata; Gemini index adapter version
  2 rebuilds older projections without a schema or transcript migration.
- Gemini `info`, unknown and empty native rows are valid hidden records;
  visible User/Assistant rows remain unchanged, pure function responses project
  as Agent-side Tool messages, native errors remain System, and only malformed
  documents/non-object message rows increment parse errors.
- Cursor resolves its encoded key only through a unique, non-symlink under-home
  directory walk capped at 64 opened directories and 4,096 streamed entries per
  directory. Exact matches provide project path, basename and resume cwd.
  Missing, stale, ambiguous, inaccessible and over-limit keys keep null paths;
  under-home keys show only the literal unresolved tail instead of the complete
  encoded absolute key. Cursor private databases and external paths are not
  read.
- Test-first verification passes 3 focused unit files / 35 tests and one
  isolated-HOME Electron E2E file / 3 tests. Inspected Gemini and Cursor
  screenshots show native/compact project labels, Gemini native title and Tool
  bubble, no Gemini info Event and no Cursor tool payload. Cursor adapter
  coverage reaches 100% statements/lines/functions and 99.2% branches; the only
  uncovered branch is the defensive basename fallback for an impossible
  root-valued configured home.
- A read-only local probe scanned 58 Gemini and 3 Cursor sessions in 63.7 ms and
  6.8 ms respectively. All 58 Gemini and all 3 Cursor rows avoided encoded
  absolute labels; 41 Gemini rows had valid native project markers, while the 3
  stale Cursor sources had no existing exact path and correctly used compact
  labels with null paths. No transcript text, credential or private Cursor
  database was emitted by the probe.
- Desktop typecheck, affected ESLint, production build, spec traceability/index
  validation and `git diff --check` passed. The build retains the existing
  large renderer chunk and mixed static/dynamic `fflate` import warnings. The
  repository file-size gate remains blocked by the unrelated pre-existing
  `agent-usage-service-providers.test.ts` at 1,647 lines against its 1,500-line
  preferred limit; this session batch did not modify that file.

### Grok Build Subscription, Weekly Usage And Session Size

- Completed `FR-AGENT-108` / `DES-AGENT-126` / `TEST-AGENT-186` /
  `T-AGENT-195`. The main-process usage service now reads only a bounded
  official `auth.x.ai` credential and performs two parallel, ten-second-bounded
  Grok Build requests for subscription metadata and weekly billing. The shared
  60-second cache, force-refresh behavior and existing expired/unavailable
  states remain the only request and failure policy; credentials and account
  identity do not cross IPC.
- The native subscription tier now uses the shared plan formatter, including
  `XPremium` as `X Premium`. The billing period maps to one account-scoped
  calendar-week metric whose value is the provider percentage converted to
  remaining. Existing period-first presentation therefore renders the metric
  as the same compact ring used by other weekly windows; no Grok-specific
  renderer component was added.
- Grok session metadata now resolves and stats the contained
  `chat_history.jsonl`; each history row uses that exact file for `sourcePath`
  and `sizeBytes`. Directory size, summary metadata, lock and event files remain
  excluded.
- Focused verification passed 10 unit files / 170 tests, desktop typecheck,
  affected ESLint, Prettier, file-size, production build and traceability
  validation. Grok provider cases live in a dedicated focused test file rather
  than extending the legacy multi-provider suite past its preferred limit. A
  sanitized production-adapter probe returned status `ok`, plan `XPremium` and
  one weekly metric with 85 percent remaining; no credential or account
  identity was printed.
- One read-only Electron Playwright flow against the installed Grok Build data
  passed at 1440 x 900. It verified the visible `X Premium` badge, 85 percent
  weekly ring and seven history rows whose exact transcript sizes were all
  known. The inspected Overview and Sessions screenshots had no overlap or
  horizontal overflow. The test Electron process, isolated PromptHub user-data
  directory, temporary test file and screenshots were removed afterward.

### Missing Agent Rule File Creation

- Completed `FR-AGENT-109` / `DES-AGENT-128` / `TEST-AGENT-188` /
  `T-AGENT-197`. The Rules store now retains the complete descriptor inventory
  separately from the existing visible Rules sidebar projection. Agent Rules
  can therefore distinguish a declared missing target from an existing empty
  file without making missing global files appear in standalone Rules.
- A known missing target renders a centered confirmation with the descriptor's
  exact canonical name and path. Confirmation reuses the existing rule-id save
  contract with empty content, then opens the shared editor. Failed creation
  remains retryable. Existing empty files still open directly, and an absent
  descriptor retains the bounded scan/retry behavior. No Agent filename,
  including `AGENTS.md`, is hardcoded in the renderer.
- Test-first regressions cover zero pre-confirmation writes, success/loading,
  failure, existing empty content, canonical `GEMINI.md`, descriptor absence,
  visible/raw store projections and save-sync scheduling. Focused verification
  passed 7 files / 78 tests; the affected ESLint command passed. The new
  workspace component reached 100 percent statement, branch, function and line
  coverage, and every changed store branch is exercised; unrelated legacy
  branches keep the whole store below 100 percent.
- An isolated-HOME Electron Playwright flow passed and verified that a missing
  `GEMINI.md` is not created before confirmation, is created as a zero-byte file
  after confirmation and then opens in the empty editor. Its Electron process,
  temporary HOME and Playwright artifacts were removed. The current full
  desktop typecheck is blocked by parallel session-lifecycle edits whose
  adapter type does not yet declare `delete`; this Rules change does not touch
  that main-process service. The repository file-size gate is likewise blocked
  by the concurrently expanded 1,646-line session service. A focused rerun
  confirms three unrelated unit failures remain in the MCP backup fixture and
  the Copilot/Kilo session projections; the Rules-focused 78-test set remains
  green.

### Complete Session Footprint And Permanent Delete

- Completed `FR-AGENT-110` / `DES-AGENT-127` / `TEST-AGENT-187` /
  `T-AGENT-196`. Every adapter currently capable of returning Conversation
  History now projects a non-negative per-session footprint and verified
  permanent-delete capability in both live and indexed metadata. Claude,
  Gemini and the remaining file-backed adapters use contained files;
  Kiro, Reasonix and Kilo resolve known companion files; Cline resolves its
  snapshot/task/external-message payload and removes its native index row;
  Kimi and Grok own their complete session directories.
- Copilot, Cherry Studio and Hermes calculate logical session and child-row
  bytes instead of assigning the shared SQLite file to every conversation.
  Their delete implementations use transactions and retain the database and
  unrelated sessions. OpenCode uses one bounded native DB projection for sizes
  and delegates deletion to its official `session delete` command.
- The renderer still sends only `agentId + sessionId`, keeps the existing
  second confirmation and now describes the target as native conversation
  data rather than one file. Main re-lists the native session immediately
  before mutation, validates all filesystem targets before removing the first,
  rejects missing/symlinked/escaped targets, and only then allows the existing
  PromptHub metadata cleanup.
- Verification passed 25 session unit files / 134 tests, the focused
  conversation UI/service/IPC set at 3 files / 35 tests, desktop typecheck,
  affected ESLint and the production build. The new lifecycle registry reaches
  100 percent statement, branch, function and line coverage. The isolated-HOME Electron history
  suite passed 3 tests; its Claude fixture displayed a known size, offered the
  confirmed permanent-delete action, removed the native JSONL and disappeared
  from the list. Build output retains the existing renderer chunk-size and
  mixed static/dynamic `fflate` warnings.

### Agent Workbench Validation Convergence

- The session service was split at its real boundaries: environment/platform
  root resolution, transcript value parsing, and native footprint/delete
  policy now live in dedicated modules. The orchestration service is 1,475
  lines and the repository file-size gate passes. Review also found and fixed
  an invalid relative `HERMES_HOME` fallback that could duplicate the home path.
- The final changed-unit regression set passed 49 files / 627 tests. Focused
  coverage runs reached 100 percent statements, branches, functions, and lines
  for the newly extracted session root/parser/storage helpers, usage contract,
  usage presentation, usage meter, and session display helpers.
- The installed-only Agent registry, provider workbench, missing-rule creation,
  metadata search/project projection, and Agent workspace Electron suite passed
  7 Playwright tests in one isolated worker. Desktop, database, and shared
  package typechecks, desktop ESLint, production build, spec traceability,
  spec-index validation, formatting, diff checks, and the file-size gate passed.
- The production build still reports the pre-existing renderer chunk-size and
  mixed static/dynamic `fflate` warnings. Those warnings are not introduced or
  suppressed by this change.

### Pi Compatible MCP Capability Correction

- Completed `FR-AGENT-111` / `DES-AGENT-129` / `TEST-AGENT-189` /
  `T-AGENT-198`. The built-in Pi declaration now exposes
  `<PI_CODING_AGENT_DIR>/mcp.json`, defaulting to
  `~/.pi/agent/mcp.json`, so the shared capability and Agent path projections
  enable the MCP tab as partial support.
- The Agent workspace reuses the existing owning MCP target inventory for Pi's
  primary, shared-adapter and project candidates. Pi and Oh My Pi retain
  independent platform identities and roots. No renderer branch, IPC, parser,
  writer, target-preset copy or eager config-file creation was added.
- Product copy and stable references continue to describe this as compatible
  MCP configuration management rather than claiming that base Pi includes a
  native MCP runtime.
- Test-first verification reproduced the disabled MCP tab before the registry
  correction. The focused registry/path/capability/preset/tab suite passed 5
  files / 46 tests; affected ESLint, desktop typecheck, traceability and diff
  checks passed. An isolated-HOME Electron Playwright flow verified that Pi's
  MCP tab is enabled, the exact primary path is visible, Add MCP is available,
  and opening the workspace does not create `mcp.json` eagerly.

### System History Acceleration And First-Page Navigation

- Completed `FR-AGENT-112` / `DES-AGENT-130` / `TEST-AGENT-190` /
  `T-AGENT-199`. The local session metadata index preference now belongs to
  App Settings, defaults to enabled and persists through the existing renderer
  settings store. Conversation History no longer exposes per-Agent indexing,
  refresh, progress or cancellation controls.
- Opening a supported Agent history reconciles its existing native index state
  with the application preference and performs one bounded refresh. Disabling
  the preference restores live reads. Failed automatic refreshes also fall
  back to the native live reader instead of showing stale or empty indexed
  results. Unsupported adapters remain unchanged.
- Transcript pagination now includes a far-left first-page command before the
  previous-page command. It is disabled on page one and returns from a deep
  page using the already loaded transcript slice without another session read.
- Test-first verification passed 4 files / 43 tests. Desktop typecheck,
  affected ESLint, the file-size gate and the production build passed. The
  build retains the existing renderer chunk-size and mixed static/dynamic
  `fflate` warnings.

### Project Rules And Expanded MCP Targets

- Completed `FR-AGENT-113` / `DES-AGENT-131` / `TEST-AGENT-191` /
  `T-AGENT-200`. Cursor now exposes its documented project rule target
  `.cursor/rules/prompthub.mdc` without inventing a user-global file. Agent
  Rules selects from registered projects, requires explicit creation for a
  missing target, and reuses the existing atomic save, version, conflict and
  backup flows. A project's Cursor MDC rule and `AGENTS.md` remain independent.
  Qoder uses the same project selector to reuse its documented root
  `AGENTS.md` compatibility rather than registering a second copy.
- OpenClaw, Qoder, Grok Build and Antigravity now participate in the shared MCP
  target and preset registries. OpenClaw projects into `mcp.servers`; Qoder
  supports its user target and both documented project JSON targets; Grok uses
  native `headers`; Antigravity writes its required `serverUrl` to global and
  workspace targets. Reasonix exposes its documented project `.mcp.json`, while
  its modern global `[[plugins]]` TOML remains native-owned until a lossless
  array-table adapter exists. Unknown native fields remain preserved; native
  OAuth and Qoder WebSocket declarations remain Agent-owned.
- Verification passed 8 focused files / 127 tests, desktop typecheck, affected
  ESLint, the production build, traceability validation and `git diff --check`.
  The production build retains the existing renderer chunk-size and mixed
  static/dynamic `fflate` warnings. The repository file-size gate is currently
  blocked by the concurrently modified
  `apps/desktop/tests/unit/components/agent-sessions-panel.test.tsx` at 1,527
  lines; none of the files in this follow-up exceed the project hard limit.
- No Electron visual E2E was run for this follow-up. Component behavior covers
  project selection and explicit creation, while filesystem integration covers
  real Cursor target writes and native MCP schema preservation.

### Session Index Cache Reuse And Background Warmup

- Completed `FR-AGENT-114` / `DES-AGENT-132` / `TEST-AGENT-192` /
  `T-AGENT-201`. Supported Agent History now reuses an index refreshed within
  five minutes and starts stale or missing warmup only after the initial
  bounded list settles. This removes the previous mount-time full scan that
  competed with Gemini and Claude's native directory reads.
- Automatic refreshes are deduplicated by Agent in a bounded in-flight map.
  Leaving History no longer cancels application-owned warmup, so reopening the
  same Agent joins the running request and can use the completed persistent
  index afterward. Renderer-window destruction still cancels work through the
  existing IPC sender lifecycle; foreground hook refresh remains explicitly
  cancellable.
- A completed background refresh reloads bounded metadata without restoring
  the panel's blocking loader or hiding already visible rows. The change adds
  no schema, IPC, watcher, polling timer, network request or transcript-body
  cache.
- The focused cache/index/session suite passed 5 files / 47 tests. Desktop
  typecheck, affected ESLint, the file-size gate, production build,
  traceability, spec-index and diff checks passed. The build retains the
  existing renderer chunk-size and mixed static/dynamic `fflate` warnings.

### Agent-Scoped MCP And Plugin Add Dialogs

- Completed `FR-AGENT-115` / `DES-AGENT-133` / `TEST-AGENT-193` /
  `T-AGENT-202`. Add MCP and Add Plugin now keep the current Agent workspace
  mounted and open selection dialogs consistent with the existing Add Skill
  flow. Neither action changes the application module or active Agent tab.
- MCP reuses the canonical My MCP deployment dialog and applies the selected
  servers through the existing MCP store to the first verified preset scoped
  to the current Agent. Existing entries remain disabled, target conflicts
  require explicit confirmation, and successful deployment refreshes target
  status in place.
- Plugin uses a fixed-target My Plugins dialog with search, multi-select,
  already-installed disabling, and copy/symlink mode selection. Distribution
  continues through the existing Plugin store for the enabled targets scoped
  to the current Agent, followed by one in-place inventory refresh. No IPC,
  schema, persistent state, background process or alternate installation path
  was added.
- Test-first verification reproduced the navigation regression before the
  implementation. The focused component and locale suite passed 3 files / 32
  tests. Desktop typecheck, affected ESLint and the production build passed.
  The build retains the existing renderer chunk-size and mixed static/dynamic
  `fflate` warnings. No Electron visual E2E was run for this focused follow-up.

### Plugin Empty State And Download Proxy Authority

- Completed `FR-AGENT-117` / `DES-AGENT-135` / `TEST-AGENT-195` /
  `T-AGENT-204`. An empty Agent Plugin workspace now says only that no Plugins
  exist. Add Plugin always opens the in-context picker; an empty library shows
  a plain empty result, while a populated library without an enabled Agent
  destination explains that installation is unsupported and disables actions.
- Official-market Git materialization now follows the existing Network Settings
  authority without an installer-specific fallback. System mode restores the
  proxy environment captured at startup, direct mode removes inherited proxy
  variables, and manual mode applies the validated configured proxy and bypass
  rules. Git performs one bounded attempt with that effective environment.
- Plugin operation failures now share one renderer policy across market,
  local/source import, Agent deployment and batch install. Network/proxy, source
  access, invalid package, duplicate, local storage and Git availability each
  explain the likely cause and next action in all seven locales. Unexpected
  failures retain only a bounded sanitized reason, batch results append the
  first explained failure, and post-install refresh failures report partial
  success rather than claiming installation failed. Raw IPC wrappers, source
  URLs, local paths, Git commands and temporary-path diagnostics are hidden.
- Test-first verification reproduced the targeted empty-state, proxy-authority
  and Plugin error-presentation failures before implementation.
  The focused regression set passed 7 files / 59 tests. Core typecheck,
  affected desktop ESLint and the production build passed. The final desktop
  typecheck is blocked by an unrelated provider-import contract mismatch in
  `AgentProviderSourceDialog.tsx:76`, where the current request omits required
  `protocol`. The build retains the existing renderer chunk-size and mixed
  static/dynamic `fflate` warnings. A real external install was not run because
  network access was unavailable to the verification environment;
  deterministic main-process and child-process regressions cover proxy-mode
  ownership and Git inheritance.

### Provider Terminology And Native Ownership

- Completed `FR-AGENT-116` / `DES-AGENT-134` / `TEST-AGENT-194` /
  `T-AGENT-203`. Agent Provider & Model now presents one supplier-oriented
  workbench across the shared adapter and Pi catalog. Native configuration is
  a read-only projection and no longer exposes “Import current configuration”
  or “Create editable profile”; Add provider, PromptHub import and explicit
  official restore remain available where supported.
- Seven locale bundles now use supplier/provider terminology throughout the
  list, forms, connection tests, activation, deletion, source import and deep
  link flows. Internal `ProviderProfile` types, persistence and IPC identifiers
  remain unchanged as compatibility contracts; no schema, migration, IPC or
  native Agent file write was added.
- Test-first verification reproduced the obsolete native import actions and
  Profile terminology before implementation. The focused component and locale
  suite passed 7 files / 86 tests; the focused Electron Playwright flow passed
  for Claude Code and Pi. Desktop typecheck, affected ESLint, Prettier, the
  production build, file-size gate, traceability and spec-index checks passed.

### Rich Provider Import And Agent-Aware Protocols

- Completed `FR-AGENT-118` / `DES-AGENT-136` / `TEST-AGENT-196` /
  `T-AGENT-205`. PromptHub source rows now reuse the existing Model Services
  provider icon registry, while the shared model selector derives and renders
  the model-family icon from the selected model id. The dialog uses the shared
  custom Select for both model and protocol instead of a native text-only menu.
- `AgentProviderSourceCandidate` now carries a bounded ordered protocol list and
  the import request carries the explicit selected protocol. Main recomputes the
  source-by-Agent intersection before either Profile creation or Pi native
  writing and rejects stale, missing or tampered choices. Codex and OpenCode
  expose Chat/Responses, Pi exposes Chat Completions/Responses, and Claude,
  Gemini and Qwen keep their direct single-protocol mappings. Official OpenAI
  direct endpoints recommend Responses; third-party compatible endpoints
  recommend Chat/Completions. No conversion proxy, icon registry, persistence
  state or migration was added.
- Test-first verification reproduced all four failures before implementation.
  The final focused regression passed 4 files / 86 tests. The source service
  reached 100% statement, branch, function and line coverage; the dialog reached
  100% statements, functions and lines, with remaining uncovered branches only
  in structurally defensive empty/stale selection fallbacks. Desktop TypeScript,
  affected ESLint, Prettier, production build, file-size, traceability,
  spec-index and diff checks passed. A real Electron test passed and visually
  verified the DeepSeek provider icon, GPT model icon, protocol menu and selected
  Responses state in dark mode at 1440 x 900. The full release harness was not
  run because the worktree also contains unrelated concurrent changes; the
  package-script wrapper additionally could not verify the requested pnpm 9.15.0
  signature without registry access, so verification used the installed local
  binaries through `pnpm exec`.

### Provider Sidebar Creation And Import Entries

- Completed `FR-AGENT-119` / `DES-AGENT-137` / `TEST-AGENT-197` /
  `T-AGENT-206`. Import from PromptHub and Add custom provider now share the
  top sidebar action area and both use the add icon. The previous fixed bottom
  add action was removed from the shared layout.
- Right-clicking a provider row or empty list space opens the same two commands
  and delegates to the existing import/create dialogs. The Profile-backed
  workbench and Pi catalog share one presentation component; Web keeps only
  custom creation because local PromptHub import is unavailable there.
- Test-first verification reproduced the old bottom-only add entry, database
  import icon and missing context commands before implementation. The focused
  component suite passed 2 files / 66 tests, and the shared action component
  reached 100% statement, branch, function and line coverage. Desktop
  TypeScript, affected ESLint, Prettier, production build and the focused
  Electron Playwright flow passed. Visual inspection at 1440 x 900 confirmed
  the two top add-icon actions, removed bottom action and unchanged rich import
  dialog in light and dark themes.

### Internal CLI Maintenance Boundary

- Completed `FR-AGENT-120` / `DES-AGENT-138` / `TEST-AGENT-198` /
  `T-AGENT-207`. The Agent overflow menu no longer presents CLI Diagnostics,
  and the standalone diagnostics and update-review UI has been removed while
  Refresh and Edit Agent remain available.
- The renderer preload no longer exposes diagnostic, update-plan or
  update-apply methods. Their shared IPC channels and main-process handlers
  were removed, so the internal services cannot be reached through arbitrary
  renderer input.
- The bounded diagnostic and lifecycle services remain in the main-process
  codebase for explicitly designed internal or future platform-specific use.
  Their allowlisted commands, shell-free execution, timeout/output limits,
  plan ownership, expiry and rollback behavior remain service-tested. No
  persistence, migration, network request or background process was added.
- Test-first verification captured the former preload exposure before the
  removal. The final focused regression passed 4 files / 66 tests, desktop
  typecheck, affected ESLint, production build, file-size, traceability,
  spec-index and diff checks passed. The production build retained only its
  existing renderer chunk-size and mixed static/dynamic `fflate` warnings.

### Inline Provider Form Visual Hierarchy

- Completed `FR-AGENT-121` / `DES-AGENT-139` / `TEST-AGENT-199` /
  `T-AGENT-208`. The Add/Edit provider right pane now separates its muted page
  background, white action header and one bordered white form surface. Identity,
  connection, models and authentication render as divided bands with compact
  icon-backed headings rather than four nested cards.
- Provider text inputs, custom selectors and the write-only credential input now
  share an outlined, card-colored, small-radius control treatment with aligned
  focus and disabled states. The shared Input exposes an explicit outlined
  presentation variant. Every field group now uses one full-width column across
  the available right pane, removing half-width controls and empty grid cells;
  form data, validation and save behavior are unchanged.
- Follow-up removed the remaining four native selects. Provider kind, protocol,
  Claude credential type and Codex authentication source now share the existing
  portal-backed themed Select through `AgentProviderFormSelect`; human-readable
  labels do not alter the exact adapter values. The form now supplies concrete
  CC Switch-aligned examples for provider name/id, endpoint, model, context size
  and API key, including Agent-specific model ids. Unsupported bridge protocols
  and unstored CC Switch-only fields remain absent. The form-select presentation
  also aligns the portal listbox to the full-width trigger and uses a restrained
  radius, border, shadow and neutral selected row instead of the shared Select's
  larger floating-menu treatment.
- Test-first verification reproduced the missing form surface and remaining
  native menu before implementation. The final provider component regression
  passed 4 files / 40 tests, and the extracted form-select module reached 100%
  statement, branch, function and line coverage. Desktop typecheck, affected
  ESLint, Prettier, production build and file-size checks passed. The focused
  Electron Playwright flow passed and visually verified the open themed
  protocol listbox, selected check state, field examples, single white form
  surface, four divided bands and absence of horizontal overflow at 1440 x 900.
  The production build retained only its existing renderer chunk-size and mixed
  static/dynamic `fflate` warnings.
- The full-width follow-up first reproduced the four responsive two-column field
  groups and the oversized shared dropdown treatment. Final Select and provider
  form regressions passed 2 files / 10 tests. The focused Electron Playwright
  flow then measured every visible Codex text/select control above 90% of the
  form-surface width, verified the compact trigger-width listbox, and passed
  without horizontal overflow at 1440 x 900. A fresh renderer/main/preload
  production build, affected ESLint and Prettier checks also passed.

### Provider Activation Switch And Current Native Testing

- Completed `FR-AGENT-123` / `DES-AGENT-141` / `TEST-AGENT-201` /
  `T-AGENT-210`. Each managed provider now owns a compact activation switch in
  the left list. The native-verified provider is checked and cannot be switched
  off into an undefined state; selecting another provider enters the existing
  activation preview, review, atomic apply, verification and rollback path.
  The duplicate detail-pane activation command was removed.
- Current native configuration now exposes the shared connection and explicit
  model-test controls. Main/core derive a validated in-memory
  `native:<platformId>` target from `importCurrent` and reuse the registered
  adapter probe without creating a Provider Profile, copying credentials or
  writing Agent files. Platform-managed transports that cannot be probed report
  unsupported, and model cancellation remains scoped to the requesting renderer.
- Test-first verification reproduced the missing current-native test boundary
  and detail-only activation command before implementation. The final focused
  regression passed 5 files / 64 tests; the core activation service reached
  100% statements, branches, functions and lines. Core and desktop TypeScript,
  affected desktop ESLint, Prettier, production build and `git diff --check`
  passed. The isolated Electron Playwright flow passed and visually verified
  the checked left-list switch plus current-provider connection/model controls
  at 1440 x 900. The build retained only its existing renderer chunk-size and
  mixed static/dynamic `fflate` warnings.

### Claude Code Native Model Routes

- Completed `FR-AGENT-122` / `DES-AGENT-140` / `TEST-AGENT-200` /
  `T-AGENT-209`. Claude custom-provider profiles now use the existing typed
  model-mapping boundary for primary, Sonnet, Opus, Haiku and subagent routes.
  Native import, activation planning, atomic write, verification and rollback
  all read the same route set.
- Activation writes the optional routes to Claude Code's documented environment
  keys and clears stale PromptHub-managed route values when a later profile
  omits them. Unrelated JSON and environment values remain unchanged. Unknown,
  duplicate or parameterized mappings fail before any write.
- The shared provider form exposes five model inputs and saves only non-empty
  optional routes. Endpoint model discovery remains deferred because draft
  credentials are write-only and main-process owned; no renderer HTTP path,
  schema, IPC, cache or background process was added.

### Codex Native Model Runtime Options

- Completed `FR-AGENT-124` / `DES-AGENT-142` / `TEST-AGENT-203` /
  `T-AGENT-212`. Codex provider profiles can now carry optional reasoning effort
  and context window values on the primary model mapping. The adapter imports,
  plans, writes, verifies and clears `model_reasoning_effort` and
  `model_context_window` without creating parallel profile state.
- Reasoning accepts the current official `minimal`, `low`, `medium`, `high` and
  `xhigh` values and is limited to Responses or the native OpenAI path. Context
  window accepts a positive bounded integer. Unknown parameters, invalid enum
  values and invalid scalar shapes fail closed; the TOML editor preserves
  comments, tables and unrelated settings.
- The form adds themed optional controls and seven-locale copy. It intentionally
  does not copy CC Switch's legacy response-storage field, global goals toggle,
  promotional metadata or credential-ownership switches that do not map to this
  provider boundary.
- Test-first verification reproduced the missing route and runtime fields before
  implementation. The combined Claude, Codex and form suite passed 3 files / 34
  tests; locale parity, affected ESLint, Prettier and the production
  renderer/main/preload build also passed. The focused Electron Playwright flow
  passed and visually verified the Claude role inputs plus the Codex reasoning
  and context controls without horizontal overflow at 1440 x 900. The final
  desktop TypeScript rerun is blocked by the separately added
  `packages/core/tests/rule-resource-schema.test.ts`, whose production module is
  currently absent and whose fixture values do not match the shared rule types.
  The repository
  file-size gate remains blocked by the separately modified 1,575-line
  `agent-provider-profile-workbench.test.tsx`; no changed production file in
  this batch exceeds the hard 2,000-line limit.

### Oh My Pi Official Plugin Inventory

- Completed `FR-AGENT-033` / `DES-AGENT-029` / `TEST-AGENT-202` /
  `T-AGENT-211`. The shared target matrix now recognizes Oh My Pi as a native,
  read-only Plugin inventory target while keeping distribution disabled.
- Main reads only the official version 2 user registry at the sibling plugin
  data root, normally `~/.omp/plugins/installed_plugins.json`. It projects
  user-scoped package paths, accepts registry-authoritative multi-capability
  packages, deduplicates real package paths and ignores project entries,
  missing packages, invalid versions, malformed or oversized JSON and paths
  that escape through traversal or symlinks.
- Registry reads are capped at 1 MiB and package containment uses the real
  plugin data root rather than the Agent root. No renderer-only branch, new
  IPC, native install/update action, `agent.db` read or auth-broker access was
  introduced.
- The implementation follows Oh My Pi's published marketplace contract in
  `docs/marketplace.md`, `marketplace/types.ts` and `marketplace/registry.ts`.
  Focused Plugin inventory and target-matrix regression passed 2 files / 30
  tests; the combined App/Agent/Plugin boundary suite passed 4 files / 68
  tests. Desktop and Core TypeScript checks, affected Desktop ESLint, production
  build and bundle budget passed.

### Codex Official Account Switching

- Completed `FR-AGENT-125` / `DES-AGENT-143` / `TEST-AGENT-204` /
  `T-AGENT-213`. Codex's official provider detail now saves the current login,
  accepts a named write-only `auth.json` snapshot, lists only masked account
  metadata, switches accounts and deletes inactive snapshots.
- PromptHub stores at most 32 exact authentication snapshots in a main-only,
  system-encrypted vault under the application user-data root. Switching
  serializes mutations, refreshes a saved snapshot when Codex has rotated the
  current account's tokens, replaces only the single native `auth.json` through
  a same-directory `0600` temporary file, re-reads the digest and restores the
  previous bytes on failure. `config.toml`, Provider Profiles, models, MCP and
  sessions are not written.
- Focused main, IPC, preload and renderer regressions passed 4 files / 16 tests;
  the provider workbench integration suite passed 27 tests. Desktop TypeScript,
  affected ESLint, seven-locale smoke tests, Prettier, `git diff --check` and the
  production renderer/main/preload build passed. The build retained only the
  existing mixed static/dynamic `fflate` warning.

### Codex Official Native Provider Tests

- Completed `FR-AGENT-123` / `DES-AGENT-141` / `TEST-AGENT-205` /
  `T-AGENT-214`. The official Codex provider again exposes the shared connection
  and explicit model-test controls instead of displaying an unsupported result.
- Connection testing resolves the installed Codex CLI without a shell and runs
  `codex login status` with the validated Agent root as `CODEX_HOME`; it sends no
  model request. Explicit model testing retains the quota confirmation and runs
  a bounded `codex exec` with ephemeral sessions, ignored user config and rules,
  read-only sandboxing, a selected model and temporary output that is always
  removed. The probe uses the current Codex CLI surface and does not pass the
  removed `--ask-for-approval` option.
- The native probe returns only typed, redacted statuses for missing CLI,
  signed-out/authentication, timeout, cancellation, quota, rate limit, model and
  network failures. It never returns CLI stdout/stderr or authentication data
  and does not write `config.toml`, Provider Profiles or account snapshots.
- Focused main tests passed 3 files / 36 tests and the Provider workbench passed
  28 tests. Desktop TypeScript, affected ESLint and `git diff --check` passed;
  Prettier was applied to the touched code. Live Electron inspection confirmed
  the official Provider detail renders both test controls and the login-status
  connection check succeeds. One explicitly confirmed live model probe reached
  the official CLI and ended at the bounded 60-second timeout without exposing
  command output or leaving temporary state.

### DeepSeek Harness Profile Plugins

- `FR-AGENT-126` / `DES-AGENT-144` register DeepSeek Harness as a
  `plugin-harness` Agent rooted at `DSH_HOME` or `~/.dsh`. Its desktop workspace
  exposes only Overview and Plugins; Skills, MCP and Rules are not presented as
  independent native domains.
- The platform registry keeps the upstream title `DeepSeek Harness`, while the
  shared Agent list/header icon resolver uses fixed light/dark variants of the
  official upstream Harness favicon instead of the generic DeepSeek provider
  logo.
- The main-only adapter reads bounded profile manifests from
  `profiles/<name>/package.json`, distinguishes ordered bundles from direct
  package dependencies, resolves package metadata under the Harness root and
  returns only sanitized metadata. Profile directories cannot be symlinks;
  manifests and inventories have explicit size and count limits.
- Install, update and removal use the official shell-free `dsh plugin --profile`
  command path with per-profile serialization, a two-minute timeout, bounded
  output and typed redacted errors. Installation requires an explicit package
  lifecycle-script acknowledgement. No marketplace, database schema, sync
  payload or background watcher is introduced.
- Focused platform, capability, icon, tab, service, IPC, renderer and i18n suites
  passed 53 tests. The canonical Agent edit-path regression passed 7 tests.
  Desktop, core and shared TypeScript checks, desktop ESLint and spec
  traceability passed. `pnpm verify:release:quick` passed all 29 checks across
  desktop, CLI, core, database, shared, self-hosted Web, Cloudflare Worker and
  mobile surfaces in 685.2 seconds. The current machine has no installed `dsh`
  executable or Harness profile, so fixture-backed tests prove the adapter
  contract but a live package installation remains unverified.

### File-Authoritative Agent Skill Inventory

- Completed `FR-AGENT-128` / `DES-AGENT-146` / `TEST-AGENT-208` /
  `T-AGENT-217`. The direct Agent Skills workspace now starts the existing
  bounded native-directory scan when the current session has no result instead
  of rendering an uninitialized store as `0 skills`.
- Agent Skill scan results are no longer persisted across application restarts.
  Old persisted empty results are discarded during hydration, while
  current-session results remain shared by Overview and Skill surfaces.
- Initial scan, scan failure and a successful empty inventory now render as
  distinct states. No database schema, watcher, polling loop or network request
  was added.
- Focused Agent workspace and Skill cache regressions passed 3 files / 47
  tests. Desktop TypeScript, affected ESLint, Prettier, file-size governance and
  `git diff --check` passed. `pnpm verify:release:quick` passed all 29 release
  checks in 873.3 seconds.

### Truthful Cross-Domain Agent Asset Summaries

- Implemented `FR-AGENT-129` / `DES-AGENT-147` / `TEST-AGENT-209` /
  `T-AGENT-218`. Agent Overview now hydrates supported Skills, MCP, Rules and
  Plugins from owner-scoped local summary loaders with a two-domain concurrency
  ceiling. The Overview does not load MCP/Plugin markets or full libraries, run
  MCP health checks, read Rules bodies, call remote sources, or run cross-domain
  validation.
- The four summaries now distinguish idle, initial loading, ready, refreshing,
  stale and initial failure. Counts appear only after a successful observation;
  cached counts remain visible during refresh and after refresh failure. Skills,
  MCP and Plugins share an accessible initial-failure body with Retry, while
  Rules preserves its descriptor/read/create workflow and now exits initial
  loading correctly on descriptor failure.
- MCP target presets/status and Plugin target matrix have independently cached,
  in-flight-deduplicated summary actions. Rules summary loading lists
  descriptors without selecting a file, and the aggregate excludes declared
  Rules paths whose native file does not exist. All state remains renderer
  session data; no schema, IPC, persistence layout, network request, watcher,
  timer or process was added.
- Final focused verification passed 8 files and 69 tests, including successful
  and empty summaries, initial failure and Retry, cached stale rows, non-Error
  rejection normalization, in-flight deduplication, failed-owner queue
  isolation, the summary I/O allowlist and the two-domain concurrency ceiling.
  The full desktop Vitest suite also passed on the production batch; the final
  affected suite passed after the test-only assertion follow-up. Desktop
  TypeScript, affected ESLint and Prettier, file-size governance, change
  traceability and scoped diff hygiene passed.
- Targeted V8 coverage across the 11 included production modules was 65.22%
  statements and 80.40% branches. The changed adapter reached 100% coverage,
  and every new summary-lifecycle decision listed above is exercised. Remaining
  uncovered legacy paths are pre-existing card detail/edit/action branches in
  the large Skills, MCP and Plugins panels plus unrelated CRUD, import/export,
  reorder and sync branches in the MCP, Plugins and Rules stores. No live
  Electron GUI, end-to-end suite, production build or release harness was run
  for this renderer/store-only delta.

### Native Tray Quota Reversion

- `FR-AGENT-093` is revised by `DES-AGENT-148` / `TEST-AGENT-210` /
  `T-AGENT-219`. The product decision removes the rendered tray quota surface
  and restores the operating-system-native menu while retaining the existing
  process-wide usage service and bounded refresh semantics.
- Deleted the renderer popover component and queue model, main-process popover
  controller/window factory, `surface=agent-usage` bootstrap branch, transparent
  popover CSS, seven renderer locale blocks and their three obsolete focused
  suites. macOS, Windows and Linux now install one Electron native menu; no
  secondary quota window, product-card row, icon, badge, ring, progress track or
  expand control remains in the tray path.
- Added a focused main-process projection that derives every `supported` usage
  adapter from the shared capability registry while preserving the established
  preferred order. This fixes the old six-item hardcode by including Grok Build
  and automatically admits future verified adapters. It keeps two workers,
  single-flight reloads, Agent-id validation, redacted failure normalization,
  stale-success retention and destroy/recreate isolation. Native menu labels are
  bounded, control-character-free and localized across seven languages.
- Moved plan normalization, remaining-percent clamping and primary-metric
  selection into a shared pure utility reused by renderer Overview and native
  tray projection. The new shared utility and the tray projection/controller/
  menu each reached 100% statement, branch, function and line coverage.
- Focused Desktop verification passed 8 files / 111 tests; the three coverage
  suites passed 50 tests, and the full shared package passed 48 tests. Desktop
  and shared TypeScript, affected ESLint, Prettier, production build, file-size,
  traceability, generated index and scoped diff hygiene passed.
- The full Desktop Vitest run was attempted and remains red for an unrelated
  existing SkillManager fixture gap: 607/608 files and 5,415/5,422 tests passed;
  all seven failures are in `skill-ui.integration.test.tsx`, where
  `remoteStoreEntries` is undefined before `Object.values` at
  `SkillManager.tsx:406`. No live Electron GUI, Playwright E2E or release harness
  was run. This active umbrella remains open for its other tasks.

### Native Config Editor Surface Hierarchy

- Completed `FR-AGENT-130` / `DES-AGENT-149` / `TEST-AGENT-211` /
  `T-AGENT-220`. The Agent Config Files title bar now uses the semantic card
  surface, while the shared file editor keeps its file tree secondary and makes
  the right editor pane the primary card surface.
- `SkillCodeEditor` now applies the same card token to both its host and the
  CodeMirror root. The existing muted gutter, toolbar, active-line and status
  treatments remain intact, so light mode gains a visible white canvas and dark
  mode keeps the paired token contrast without a raw white override.
- The correction is shared by every `SkillFileEditor` consumer and adds no
  Agent-specific stylesheet, nested card, state, dependency, IPC, file I/O,
  network request, timer, watcher, port or process.
- Focused verification passed 3 files / 64 tests. Desktop TypeScript, affected
  ESLint, file-size governance, change traceability, generated index check and
  the production renderer/main/preload build passed. Prettier passed for every
  affected file except `agents-workspace.test.tsx`: the current formatter also
  rewrites a pre-existing unrelated `await act` block around line 581, so that
  mechanical diff was intentionally not retained; the new config-surface
  assertions themselves match the formatter output.
- Replacement-candidate verification repaired the stale SkillManager fixture
  and the complete Desktop suite passed 610 files / 5,434 tests. The isolated
  `agent-config-files` Electron E2E passed, including redaction, edit/save and
  encrypted-backup behavior. Its screenshot and the final `agent-workspace`
  screenshot were inspected directly and show the gray secondary file tree
  against the white primary editor canvas in light mode.
- The wider Agent workspace E2E initially exposed only stale test interaction:
  provider activation had moved from a detail `Activate` button to per-row
  switches, and the test used a non-waiting radio count before the asynchronous
  activation plan rendered. The test now uses the current switches, waits for
  the dialog and each resolution group, asserts both choices, and checks every
  selected provider value. Its minimal built-artifact rerun passed 1/1 without
  changing production activation guards.
- No public screenshot asset was replaced because `docs/imgs/` and
  `website/public/imgs/` contain no Agent workspace, native quota menu or Agent
  config-editor counterpart. The task-owned E2E screenshots remain verification
  evidence rather than a mismatched replacement for an unrelated stable image.

### 2026-10-14 — Kimi / OpenCode configuration audit corrections

- OpenCode direct activation refuses a target OAuth/well-known credential collision,
  including inactive providers. Imported native selections can be restored without
  writing or backing up their credential bytes. JSON/JSONC sources are merged;
  writes remain confined to the selected source, with all sources participating in
  stale-plan detection. Encrypted v1 receipts retain a recovery-only digest conversion.
- OpenCode XDG config roots flow through inventory, installer, rules and MCP presets.
  Kimi no longer selects an old root automatically. Global MCP IPC now forwards its
  configured root, session resume sets `KIMI_CODE_HOME`, and quota caching isolates roots.
  No user config, native credential, historical directory or DB schema was migrated.
- Regression files:
  - `apps/desktop/tests/unit/main/agent-opencode-config-ownership.test.ts`: real-file
    collision refusal, native selection/apply/rollback, merged inspection, reopen,
    lower-source drift refusal and existing receipt recovery. Only OS encryption is
    replaced by a fixture encoder; no real credential or provider network is used.
  - `apps/desktop/tests/unit/main/kimi-opencode-root-consistency.test.ts`: current and
    overridden roots, XDG paths, quota cache isolation (mock OAuth/network), and actual
    execution of the generated shell resume script against a fixture executable.
  - `apps/desktop/tests/integration/kimi-opencode-config-entrypoints.test.ts`: real
    preload APIs, registered IPC handlers, runtime adapter registration, SQLite and
    native files. Imports a native profile, activates a direct profile, closes/reopens
    SQLite and reselects the native profile without changing OAuth bytes. The existing
    integration fixture replaces Electron transport and OS encryption only.
- Reproduce the new regressions from repository root:
  `pnpm --dir apps/desktop exec vitest run tests/unit/main/agent-opencode-config-ownership.test.ts tests/unit/main/kimi-opencode-root-consistency.test.ts tests/integration/kimi-opencode-config-entrypoints.test.ts`
- Verification: 27 focused test files / 392 distinct tests passed across bounded
  runs (390 unit/service/component tests and 2 real-entrypoint integration tests).
  The initial unsupported-protocol error classification was corrected; the legacy
  Kimi-root expectation and resume metadata expectation were updated to the current
  contract. The integration input strips the non-writable `secretRef`, as the renderer
  does. No failed assertion was removed or relaxed to accept the audited defects.
- `pnpm --dir apps/desktop exec tsc --noEmit -p tsconfig.test.json`, affected-file
  ESLint, `git diff --check` and `pnpm build` passed, including renderer/main/preload.
  GUI, Windows/Linux native execution, real-account networking and the full release
  harness were not run. Tests use disposable roots and close their databases/processes;
  no development server was started. Existing unrelated worktree edits remain intact.

### 2026-10-14 — All registered Agent audit

- Scanned all 37 registered identities and their enabled configuration, asset,
  provider, session, quota and appearance boundaries. Eight confirmed defect
  groups were repaired: registry-derived MCP roots, Qwen relative environment
  roots, session factory/index roots, Qwen native list scope, scoped native resume,
  main-process quota cache, renderer quota cache and root-sensitive workspace state.
- Added registry-wide, real preload/IPC/SQLite/reopen and CLI/file-readback
  regressions; extended session shell/environment and renderer root-switch tests.
  No capability was enabled solely because a path was declared, and no user
  configuration, credentials, existing MCP bindings or schema was migrated.
- Consolidated verification: 2,796 distinct tests passed and 4 native-gated tests
  skipped. Desktop/CLI TypeScript, affected-file ESLint, `git diff --check` and
  renderer/main/preload production build passed. Initial failures and exact scope
  are recorded in [the registered-Agent audit](registered-agent-audit.md).
- Native GUI/client/installer, Windows/Linux, live accounts and the full release
  harness remain unverified; source/isolated-fixture evidence does not certify all
  vendor runtimes. Existing shared-checkout edits remain intact; no commit or push.

### 2026-10-14 — Screenshot follow-up: quota proxy and clipped labels

- The production usage singleton now receives `fetchWithNetworkProxy` explicitly,
  instead of retaining the global Node fetch from before proxy initialization.
  System mode uses the configured Electron default Session fetch; manual HTTP,
  SOCKS and direct routing retain their existing implementations. No fallback,
  retry, timeout or credential-writing policy was added. The network boundary is
  consistent with [Electron Session fetch](https://www.electronjs.org/docs/latest/api/session#sesfetchinput-init).
- Overview renders distinct localized messages for `network-error`, `timeout`
  and `http-error`, with the existing generic message for unknown error codes.
  All seven locales contain the new messages; raw exceptions remain private.
- Shared Agent asset cards use a 232px minimum, not a fixed height; metadata wraps
  without a 40px clipping region, content stays top-aligned and actions remain at
  the bottom. Native provider titles wrap above their classification, with a
  non-shrinking activation switch. These changes affect Skills/MCP/Plugins using
  the same card component, not just the screenshot's Plugins tab.
- Regression: `apps/desktop/tests/unit/main/agent-usage-runtime-network.test.ts`
  imports the real production singleton before proxy configuration, initializes
  a real temporary SQLite/profile and reads fixture native config/auth files.
  It checks system/direct/system transitions, later manual HTTP configuration,
  quota values, sanitized transport failure, explicit retry and unchanged auth
  bytes. Only outbound transports/Electron Session are mocked; it does not prove
  OS proxy/PAC execution or a live authenticated quota request.
- Component regressions extend `agent-usage-banner.test.tsx` for four error/retry
  cases, `agent-assets-workspace.test.tsx` for all three card domains, and
  `agent-provider-profile-workbench.test.tsx` for the wrapping native title.
  DOM/class assertions and component interactions do not prove pixel layout.
- Verification: **11 files / 196 distinct tests passed**, consolidated from an
  initial 121 passed / 3 fixture failures and a 75-test repair/consumer run. The
  three failures were an uninitialized test DB; the fixture now uses the existing
  real Agent-settings initializer instead of bypassing root resolution.
  Desktop test TypeScript, affected-file ESLint, seven-locale message validation,
  `git diff --check`, and renderer/main/preload production build passed.
- Reproduce from repository root:

  ```sh
  pnpm --dir apps/desktop exec vitest run tests/unit/main/agent-usage-runtime-network.test.ts tests/unit/main/network-proxy.test.ts tests/unit/main/network-proxy-startup.test.ts tests/unit/main/agent-usage-service-codex.test.ts tests/unit/main/agent-usage-service.test.ts tests/unit/main/agent-usage-service-providers.test.ts tests/unit/main/ai-ipc.test.ts tests/unit/components/agent-assets-workspace.test.tsx tests/unit/components/agent-provider-profile-workbench.test.tsx tests/unit/components/agent-usage-banner.test.tsx tests/unit/components/renderer-i18n-smoke.test.tsx
  pnpm --dir apps/desktop exec tsc --noEmit -p tsconfig.test.json
  pnpm build
  ```

- No GUI automation was authorized or run. Real account quota recovery, native
  OS proxy/PAC, visual layout at the screenshot's size, Windows/Linux and packaged
  release acceptance remain unverified. Existing app processes were not restarted;
  the new main-process code requires loading the new build. Tests removed their
  temporary databases/native roots; no service or port was retained. No user
  credentials/settings were edited, and no commit or push was performed.


### Pet store proxy and timeout recovery (2026-10-17)

- The appearance IPC composition now supplies the existing network-policy fetch
  to the Pet store. Catalogs, manifests, previews and sprites use the current
  system/manual/direct proxy setting; official URL, byte and timeout guards stay
  in place. The former captured global fetch could bypass the system proxy.
- Catalog timeout errors retain their underlying cause and expose a stable code
  translated in all seven locales. Explicit refresh can recover after failure.
- Focused verification: 25 tests passed across agent-appearance-ipc,
  agent-pet-store-service, agent-pet-workspace and network-proxy. Coverage includes
  IPC through the real store and network router with a mocked Electron Session,
  timeout cancellation, failure recovery and the localized retry interaction.
  Affected-file ESLint passed. Public catalog probes from PowerShell and Node
  both returned HTTP 200 with 344 records; the reported transient timeout was not
  reproduced. No live Electron/PAC or GUI acceptance was performed.
- Desktop test typecheck remains blocked by unrelated errors in
  ai-test-workbench.test.tsx (removed promptTestHistoryCreate API) and
  ai-content-workflows.test.ts (unsupported responseFormat option).


### Website-only Pet browsing (2026-10-17)

- Confirmed requirement: catalog browsing uses the official website instead of
  GitHub. The catalog now reads https://codexpet.top/pets.json; preview fallback
  uses the website thumbnail instead of downloading a repository spritesheet.
  Website failures never trigger a GitHub request while browsing. Explicit
  installation retains the existing raw repository package path.
- The existing proxy policy, catalog normalization, 2 MiB catalog/preview limits,
  redirect rejection, cache ownership and Codex-owned install transaction remain
  unchanged. Published URL/command fields are not followed or executed.
- Verification: 22 tests passed in agent-pet-store-service.test.ts,
  agent-appearance-ipc.test.ts and agent-pet-workspace.test.tsx. Tests exercise
  list/filter/paging/cache, preview/thumbnail recovery, failure without a GitHub
  fallback, explicit retry and package staging. Affected-file ESLint and diff
  whitespace checks passed. The live website catalog returned HTTP 200, 344
  entries and 1,021,047 bytes via PowerShell; direct Node probes intermittently
  timed out, so no universal speed or connectivity improvement is claimed.
- GUI acceptance was not run; the application must load the updated main process.
  Existing preview cache files and installed Pets need no migration.
