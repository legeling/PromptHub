# Plugins Spec

## Purpose

本规范定义 PromptHub Plugin 体系的稳定产品边界。Plugin 是比 Skill 更高一级的可安装分发单位，用来承载一组可复用能力，而不是单个任务工作流。

## Official Concept Boundary

PromptHub 采用 Codex 官方概念作为命名基线：

- Skill: 可复用工作流说明，告诉 agent 某类任务该怎么做。
- Plugin: 可安装的分发单位，可以打包 skills、apps、MCP servers 和相关资源。
- MCP server: 提供外部工具和上下文的运行时能力。
- App/connector: 连接 GitHub、Slack、Google Drive 等服务的集成面。

Official references:

- [Codex Skills](https://developers.openai.com/codex/skills)
- [Codex Plugins](https://developers.openai.com/codex/plugins)
- [Build plugins](https://developers.openai.com/codex/plugins/build)

## Stable Requirements

### 1. Plugin Package Contract

- Plugin 是可安装 package，不是单个 Skill。
- Plugin 可以包含多个 child assets，包括 Skills、MCP servers、Apps/connectors、commands、hooks、assets、docs 和 templates。
- Plugin UI 必须展示 child inventory，不能把多能力包误展示成一个 Skill。
- 只有一个 `SKILL.md`、没有额外 inventory / scripts / MCP config / commands / hooks / assets 的来源，应按 Skill package 处理，不应作为完整 Plugin 展示。
- 只有单个 JS/TS hook、function、tool entrypoint 的 runtime plugin，不满足 PromptHub Plugin bundle 语义。
- Antigravity IDE 原生包以包根目录 `plugin.json` 定义身份，组件可选；合法原生 manifest 即可作为 Plugin 导入，不以 child inventory 数量拒绝。IDE 未声明 `name` 时使用目录名；声明的名称只允许字母、数字、连字符和下划线。扫描保留源 manifest 的扩展元数据，不把字段删除当作格式转换。
- Plugin 安装只表示能力包进入 My Plugins；子能力是否导入 My Skills / My MCP 或分发到 agent target，必须由用户明确选择。

### 2. Store and Source Contract

- Plugin Store 必须能表达来源和可信级别：official、verified、community、custom。
- PromptHub 应内置自己的 `prompthub-official` marketplace，源仓库为 `https://github.com/legeling/PromptHub`，marketplace 文件为 `.agents/plugins/marketplace.json`。
- PromptHub 应内置 OpenAI 公开 `openai-curated` marketplace，源仓库为 `https://github.com/openai/plugins`，marketplace 文件为 `.agents/plugins/marketplace.json`，作为 Codex official source 暴露。
- Store entry 的安装状态不得只按展示名匹配；必须使用稳定 identity，例如 manifest id、source URL、revision/version 或 source fingerprint。
- Store entry 可以先只从 marketplace JSON 渲染；manifest、inventory 和 semantic classification 应通过懒预览读取，避免打开商店时批量拉取所有插件 manifest。
- Codex official store entry 应保留 marketplace policy 元数据和 Codex detail deep link，例如 `codex://plugins/openai-developers@openai-curated`。
- Git/SSH/HTTP/local folder 都可以作为自定义 plugin source。
- SSH source 应走本地 git 和本地密钥，不应依赖匿名 GitHub API 完成主扫描。

#### Git package acquisition (#215)

Locally implemented and verified 2026-10-21; release pending. Git source and marketplace paths
must use shallow partial clone without initial checkout, then literal anchored
directory selection before checking out the requested branch or pinned commit.
The complete package includes hidden files, nested assets and binary content;
unrelated root, ancestor and sibling files must not be fetched when filtering is
supported. Root packages still require their full tree. Directory names are
paths, never wildcard expressions. Skill and Plugin share pattern construction;
transport policy, package validation and publication remain with their owners.

CLI marketplace install/update must publish actual package files, matching the
Desktop contract; metadata-only success is insufficient. Existing metadata-only
entries are not bulk migrated: explicit update uses existing materialization and
canonical publication. Source identity, version records and storage layout stay
unchanged, and failure must preserve the previously installed package. Reuse
existing rollback/version facilities. Native Agent CLI-managed Git operations,
HTTP catalogs, archives and release/CI clones are outside this change.

The acquisition regressions, isolated defect-sensitivity checks and exact repeat
commands are recorded in [Skill/Plugin acquisition verification](skills.md#expanded-skillplugincli-verification--2026-10-21).

#### Third-party marketplace repair (#242 / #243)

- The Core marketplace boundary normalizes Claude relative-directory and Git repository entries, and Antigravity `type=archive` entries, into `PluginPackageSource`. Relative Claude entries use `.claude-plugin/plugin.json`; Codex retains its existing portable/legacy manifest contract. Repository `ref` and pinned `sha` must be used consistently for preview and checkout, never replaced by the default branch.
- Archive sources retain their HTTPS URL and required SHA-256 in an optional `archive` field; Git pins use optional `revision`. These are additive source JSON metadata, not new tables or an alternative storage authority. Existing sources need no migration. Normalization, fingerprints, snapshots and reopen must retain the fields. Downgrade requires a full backup; older binaries cannot install or update archive sources.
- Archive preview verifies the digest before extracting a root-native Plugin package. Installation reuses that validated temporary package within the same operation, then publishes through the existing SQLite/file owner. Failed verification, unsafe paths, missing manifests and publication errors leave existing library data intact; all task-owned staging is removed. Preview never installs, executes scripts, registers Agent plugins or authorizes Apps.
- Archive reads reuse existing HTTPS/proxy/DNS/redirect/download limits. Extraction streams files to disk using the Plugin owner's existing file-count and per-file limits, rejects duplicate/case-colliding paths and traversal, and does not materialize archive links. Work is linear in compressed and expanded bytes, with bounded input chunks rather than retaining the whole expanded archive. Listing stays manifest-lazy; no bulk package download or new retry policy.
- Sources: [Claude marketplace contract](https://code.claude.com/docs/en/plugin-marketplaces), [Claude official catalog](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json), and [Antigravity catalog](https://www.gstatic.com/antigravity/plugins/marketplace.json), inspected 2026-10-19. Unsupported executable source types are not run or guessed into Git sources.
- Installed inventory is derived from the validated materialized package, including native conventional directories omitted from the manifest. Git remote preview still reports manifest-derived counts; it is not a complete repository inventory. Native Agent loading, third-party executable sources and arbitrary Git hosts are not established by these marketplace tests.
- The source adapter keeps its format discrimination and canonical field mapping together; the ordered Git/SQLite and archive rollback regression cases intentionally exceed 50 lines to keep setup, operation, reopen and failure assertions readable as one lifecycle.

### 3. Static Scan Contract

- 扫描和预览阶段不得执行插件代码。
- 扫描和预览阶段不得安装依赖、启动 MCP server、调用 plugin tools 或触发 App 授权。
- PromptHub 可以读取 manifest、README、package metadata、MCP config、Skill entrypoint 和静态资源清单。
- manifest 和 inventory 必须拒绝路径穿越、绝对写入路径、null byte、危险 symlink escape 和重复 identity 冲突。
- 本地或 Git 物化后的 Plugin package 在进入 My Plugins 前必须先校验 package 边界：manifest child asset 路径不得指向包外，包内 symlink 不得解析到包外，package scripts 只能作为静态文件存在，扫描/导入不得执行它们。

### 4. Distribution Contract

- Shared global Plugin distribution is an explicit advanced target `shared-agents`
  at `~/.agents/plugins/<normalized-plugin-name>/`. It preserves the complete
  original package in copy or symlink mode without manifest conversion, native
  registration, code execution, or automatic child-asset import. It remains
  available independently of Agent detection and is excluded from select-all.
  The UI describes placement in a shared directory, not universal Agent activation.
- Core owns this target, its home-relative resolver, safe package publication,
  ownership checks and removal; Desktop/CLI use the same resolver and existing
  distribute/remove APIs. `PluginTargetStatus` adds `shared`. No DB migration or
  new IPC channel is needed; existing `distributedTargetIds` records the target.
  Copy targets contain `.prompthub-shared-plugin.json` with the owning Plugin id;
  symlink ownership requires its destination to match the managed source.
  Unowned/colliding directories and symlinked parent directories are rejected.
  Copies are staged beside the destination, published by rename, and the old
  package is restored if publication fails. A metadata failure leaves a complete
  owned package that explicit retry can reconcile, never a success status.
  Removal keeps the managed source and unrelated shared packages. Older versions
  preserve the unknown target id but cannot manage it; remove the target before
  downgrading when needed. Existing multi-target partial-success semantics remain.
  Filesystem/SQLite failure-retry tests cover complete copy/symlink packages,
  unowned directory conflicts, symlinked parent rejection, staging/publication
  failures, and explicit retry after metadata persistence failure.
  Abrupt process termination can leave staging/backup siblings for recovery;
  ordinary write failures restore the previous package. The UI card JSX and
  ordered Electron lifecycle remain contiguous blocks over 50 lines; selection
  and filesystem ownership policies are separately tested small functions.
- Verification (2026-10-17): seven real filesystem/SQLite shared-distribution
  tests passed. The combined MCP/Plugin focused suite passed 85 tests, with
  Desktop build, test typecheck, and scoped lint passing. The isolated Electron
  `plugin-shared-distribution.spec.ts` workflow passed explicit selection,
  complete-package copy, reload with installed status, and removal retaining
  the library package. Native Electron screenshots verified both advanced
  target panels. Native Agent loading and release acceptance were not exercised.

- Native target compatibility is derived from current managed-package manifests when reading My Plugins, including packages imported before a target was supported. This refresh reads the finite marker set and referenced manifest paths, without rescanning the whole package tree or rewriting version history. Import/distribution still validate the package boundary.
- Direct Agent inventory includes a distributed symlink only when its path matches the existing target resolver, its real destination matches the recorded My Plugins package, and its binding includes that target. Inventory retains the Agent-side path; removal unlinks the distribution without removing the source package. Unknown links outside the Agent root are not imported into inventory.

- Plugin 内的 Skill child asset 应复用 Skill package contract 和 Skill 分发流程。
- Plugin 内的 MCP child asset 应复用 MCP library、preview、backup、conflict 和 apply/remove 流程。
- Plugin 内的 App/connector child asset 只能进入待配置/待授权状态，不能自动获得用户账户权限。
- Agent Assistant 未来只能调用同一套 Plugin scan/install/distribute API，不得在聊天层绕过安全确认。

### 5. Agent Plugin Adapter Contract

#### Local Codex management (2026-10-19)

- Agent Plugin must manage the plugins installed in the selected local Codex home:
  inspect, install, refresh/update, enable/disable and uninstall. The native
  `plugin list --json` response owns installed/enabled state; cache directories
  alone never establish installation. Cached packages absent from that response
  are not installed rows. Native identities include both plugin and marketplace.
- Prefer the desktop application's bundled executable when present. The platform
  registry owns executable locations; standalone Codex is used when no desktop
  runtime is installed. Unsupported native JSON contracts produce an actionable
  error, not a guessed alternate response or filesystem-only success.
- Shared native operations belong to Core; Desktop resolves the configured Codex
  root and supplies encrypted configuration backups. IPC/preload carry typed
  mutation requests and sanitized results. Agent refresh is independent of public marketplace requests. Codex distribution/removal refreshes native inventory automatically. Renderer state derives from the same
  returned inventory for rows, detail, counts and actions. No SQLite schema or
  durable second installed-plugin registry is added.
- Installation and update use native marketplace/plugin commands; enabling uses
  the native `config/value/write` contract with an expected configuration version.
  Native account-managed plugins retain their account/installation policies;
  local enable controls must not pretend to change remote workspace policy.
  OAuth and account authorization remain explicit native setup steps.
- Before a native mutation, preserve the existing configuration through the
  established encrypted backup owner. Native failures remain visible; reread
  after mutations and refresh after errors. Do not restore the entire user
  configuration over concurrent edits. PromptHub-owned removal also removes its
  distribution binding/source through the existing ownership transaction; native
  external removal never deletes the imported My Plugins package.
- Inspect installed metadata only on list load; do not fetch the public catalog
  or recursively scan every cached package. The measured native public catalog
  contains 7,197 available rows / 3,241,738 JSON bytes on this host, whereas the
  installed list has 18 rows. Installed-list work is linear in installed rows
  plus their manifests and static package inventory. Existing native process execution budgets
  apply; no model traffic, additional retry policy or business limit is added.
- Acceptance: existing desktop import/distribution entrypoints plus native
  installed-plugin actions, actual cache/config readback, refresh/reopen,
  unrelated configuration/package preservation, invalid identities, failed
  mutation and retry. A task-owned harmless plugin is also exercised against the
  actual local Codex home and removed afterward. GUI control is authorized for
  the test plugin. Windows/Linux native loaders and remote OAuth are separate
  acceptance boundaries.
- The RPC session, IPC mutation orchestration and native action component keep their cohesive lifecycle/render flow in one function beyond 50 lines. Native lifecycle/config-conflict tests and Electron removal/action failure/confirmation tests cover these boundaries.
- Validation on macOS: Core native lifecycle with real desktop-bundled Codex passed, including disabled upgrades, reopen and concurrent config protection. Focused Core tests (9), Desktop inventory/actions/store/distribution tests (71), Core/Desktop/test TypeScript checks, scoped ESLint and desktop build passed. Electron UI lifecycle passed through import/distribution, refresh, native disable/update/enable, confirmed uninstall, reopen and My Plugins source update/delete. The opt-in `codex-plugin-local-home.spec.ts` also passed against the authorized real Codex home; original native inventory and parsed configuration matched afterward and the disposable plugin was removed. No release or cross-platform acceptance is implied.
- Acceptance limitation: the computer-control tool disallows the Codex application, so its own plugin-page visual state was not inspected. PromptHub GUI and native Codex readback were exercised. Remote account OAuth/authorization and Windows/Linux were not tested. Desktop component tests retain existing React `act(...)` warnings.
- Research: [official plugin packaging](https://developers.openai.com/plugins/build/plugins),
  [native app-server configuration](https://learn.chatgpt.com/docs/app-server),
  [Codex CLI plugin owner](https://github.com/openai/codex/blob/main/codex-rs/cli/src/plugin_cmd.rs),
  [Codex++ marketplace owner](https://github.com/qqheling/codexplusplus/blob/main/crates/codex-plus-core/src/plugin_marketplace.rs).
  Codex++ also patches desktop UI requests; PromptHub uses native management
  commands and does not patch account policy or desktop application code.

- “Agent 支持 Plugin”在 PromptHub 中表示 PromptHub 能把一个整合包安装为该 Agent 的原生整合包或等价组合，而不是要求该 Agent 直接读取 Codex `.codex-plugin`。
- 合法 Codex / Claude 原生 manifest 定义 Plugin 身份，单 Skill 也可作为 Plugin 导入。
  Codex portable 根 manifest 按 schema 识别，保留根身份、`com.openai` 覆盖优先级和根 MCP 清单。
  桌面 Codex 分发与管理优先复用已安装桌面应用自带的原生运行程序；独立 CLI 是另一种安装来源，
  不要求桌面用户重复安装 CLI。Claude 分发继续调用官方 CLI。不能由复制目录推断安装成功；
  原生配置确认启用后才记为已分发，移除时先卸载。具体合同见 Plugin Management Spec。
  Claude 存在原生安装注册表时，以注册表枚举已安装包，不把卸载后保留的缓存重新显示为
  已安装；独立手动目录仍按既有入口扫描。
- Codex CLI / Codex app 是 native target，因为它直接支持 Codex plugin package 和 marketplace。
- Claude Code、Cursor、Gemini CLI、Kiro、GitHub Copilot / VS Code Agent Plugins 应建模为 adapter target，因为它们存在自己的插件、扩展、power 或 agent plugin bundle 机制。
- OpenCode 和 Cline SDK / CLI / Kanban 当前应建模为 runtime-only target，因为它们的官方插件语义主要是 JS/TS hook module、npm plugin、`AgentPlugin` entrypoint、tools/hooks/commands runtime，而不是多子资产 bundle inventory。
- Cline runtime-only target 需要标注适用范围：官方插件机制当前适用于 Cline SDK / CLI / Kanban，不适用于 VSCode / JetBrains 扩展运行时。
- Windsurf / Devin、Cherry Studio 当前应建模为 composite target 或 lower-priority target，因为它们没有确认的单一 Agent 插件包格式，需要把 PromptHub Plugin 拆到多个目标资产面。
- Amp 和其他证据不足的平台应保持 pending/disabled，直到官方文档或源码能证明单一插件包机制。
- UI 必须明确区分 `Native`、`Adapter`、`RuntimeOnly`、`Composite`，不能把适配后的效果伪装成目标 Agent 原生支持 Codex 插件。
- 第一版只启用 `Native` 和满足 bundle 语义的 `Adapter`；目标先按 [Agent 可见性规则](../reference/agent-platforms.md#agent-edit-contract) 筛选，与 Skill 一致。当前可用 Agent 中的 `RuntimeOnly`、`Composite`、`Pending` 目标可见但置灰，并明确显示“不支持 PromptHub 插件整合包”，等后续设计 wrapper/composite installer 或有新证据后再重新评估。
- 分发到 Adapter 目标时，PromptHub 必须复制 Plugin package 并生成目标 Agent 的原生 package marker，例如 `.claude-plugin/plugin.json`、`.cursor-plugin/plugin.json`、`gemini-extension.json`、`POWER.md` 或 `plugin.json`；不得只把 Codex `.codex-plugin` 原包软链到非 Codex Agent。
- 当用户对 Adapter 目标选择 symlink 模式时，PromptHub 应落成生成后的 copy package 并在结果中报告实际 copy 写入，因为 marker 转换不能通过原包软链接真实表达。
- Antigravity 是独立的原生格式目标（#226），只分发已包含合法根级 `plugin.json` 的包。没有该 manifest 时在目标选择器禁用，并在 Core 写入前拒绝；不生成包含 Codex/Gemini 字段的伪 Antigravity manifest。
- Antigravity IDE 全局目录来自 platform registry：macOS/Linux 为 `~/.gemini/config/plugins/<name>/`，Windows 为 `%USERPROFILE%\.gemini\config\plugins\<name>\`，不增加版本子目录。Gemini CLI 使用独立的 `~/.gemini/extensions/` 与 `gemini-extension.json`，不能代替 Antigravity 的插件目标。
- Antigravity 扫描只检查全局 plugins 目录的直接子包；静态 inventory 包括原生 `mcp_config.json`、`hooks.json`，完整包分发保留 `skills/`、`agents/`、`rules/` 和所有资源。采用已有 package copy/symlink 与移除流程；不启动 MCP 或 hooks。
- 本次没有 DB/schema 变更，也不自动移动先前 Gemini 目标的目录或修改用户配置。本次新导入的原生包可选择 Antigravity 分发；先前误放在 Gemini config/plugins 下的目录保持原状，用户需在原目标中显式处理遗留包。项目级安装与 Antigravity CLI 注册不在此 IDE 全局路径边界内。
- 2026-10-20 macOS 本机验收：通过 PromptHub CLI 的 `plugin import/distribute/update/redistribute/undistribute` 正式入口，使用隔离的 PromptHub 数据目录向真实 Antigravity App 2.23.0 全局目录分发唯一命名的无害插件。客户端 Installed 页面从 3 个插件变为 4 个，详情显示 1.0.0，并能打开测试 Skill 正文；源包更新并重新分发后，页面自动显示 1.0.1 和新正文；移除后详情提示插件不存在，列表恢复为原有 3 个插件。退出本次启动的客户端后，`~/.gemini/config/` 原有 292 个文件的 SHA-256／符号链接目标清单完全一致，无新增文件，测试包与临时数据已清理。此次证明本机 App 的包发现、内容加载、更新和移除；未调用模型、MCP 或 hooks，不代表这些运行时能力、独立 CLI 注册、Windows/Linux 或发布验收。独立 `agy` 1.2.7 的 `plugin validate` 可识别该类包，但其列表未枚举 App 现有插件，不能用该列表替代 App 验收。
- 详细目标矩阵和证据源见 `spec/knowledge/reference/plugin-agent-adapter-matrix.md`。

### 6. Stable Internal Sources

- Plugin 当前 active change: `spec/changes/active/plugin-management/`
- Codex extension surface reference: `spec/knowledge/reference/codex-extension-surfaces.md`
- Existing Skill boundary: `spec/knowledge/behavior/skills.md`
- Existing MCP boundary: `spec/changes/archive/2026/07/2026-07-06-mcp-management/`

### 7. Storage Ownership

当前存储权威遵循 [Foundation 数据归属](../../changes/active/foundation-integrity-redesign/specs/foundation/spec.md#fr-foundation-003-data-ownership-and-invariants)。
2026-10-17 源码核对：`PluginLibraryStorage` 已委托 `PluginStorage` 与 `PluginDB`，
普通读写使用 SQLite 元数据和版本记录；实际包位于 runtime-path 所属的
`data/plugin-files/<encoded-plugin-id>/current/`，历史包位于同级 `versions/<version>/`。
SQLite 与文件提交复用 `publishSqliteEntries`，不能由 renderer 或普通读取重新发布旧 JSON 真源。

`plugin-sqlite-v1` 在升级边界读取旧 metadata、canonical bundles 和设备 projection，保全包、版本及设备绑定，
通过既有恢复机制统一提交并退役旧输入。冲突或校验失败保留数据并报错；已完成迁移后再次出现旧来源要求显式恢复，
不能当成正常读取时自动覆盖 SQLite 的输入。降级恢复继续使用完整、对应版本的数据根备份。
这一段纠正此前 JSON／canonical 为当前权威的描述；不表示本次新增迁移或完成全量历史升级验收。

三类资源的公共接口与实施范围见 [公共资源架构](../structure/resource-library-architecture.md)（待实施）。
Plugin 包身份、子资产和原生目标要求仍由本规范定义。

#### Historical storage stages (superseded)

以下保留旧 JSON → canonical 阶段的迁移证据与恢复约束，仅用于辨认历史输入；
不能用作当前普通读写或另一次迁移的授权，当前所有权以上文及 Foundation 为准。

- Before canonical file authority is published, Desktop stores installed Plugin library metadata in `<userData>/data/plugins/library.json`. Under canonical file authority, each Plugin is stored as a resource bundle below `<userData>/data/plugins/<encoded-plugin-id>/`; the directory name is produced only by `encodeCanonicalResourceDirectory`. Reader, writer and checkpoint use that same encoding. Exact superseded `library.json`, `market-cache.json`, and `versions.json` regular files may coexist briefly as compatibility remnants but are not authoritative. If no Plugin bundles exist, the service migrates a populated superseded library through the canonical journaled writer and deletes old library/version metadata only after verification. Existing bundles always win over stale metadata. Same-name directories, symlinks, and undeclared root files remain invalid. If only the legacy `<userData>/config/plugin-library.json` exists before canonical publication, desktop migrates it into the data path on first read and keeps the legacy file as a compatibility backup.
- Existing raw-ID directories from the beta canonical writer are upgraded by `plugin-resource-paths-v1` before catalog reconciliation, under its existing maintenance boundary. The migration validates every bundle and directory identity before publication, rejects an occupied encoded destination, and publishes verified copies, raw-directory removal and the version marker as one journaled change. Full package/history bytes are preserved. Moved bundles have verified backups under `recovery/plugin-resource-paths-v1/<encoded-id>/<content-hash>/`; the marker lives under `data/operations/migrations/`. Repeated startup is a no-op. A graph manifest that explicitly declares a raw Plugin path requires repair and is not silently rewritten.
- Upgrade failure rolls back through the existing entry publication journal. Collision recovery requires reviewing both retained directories; it never deletes one automatically. Before downgrade, close all clients and restore a complete pre-upgrade root backup. The per-bundle recovery copy is available for a deliberate forward repair or restoration of its original raw directory; retain the original ID from `plugin.json`, all history and device projections, and do not overwrite an occupied destination. Normal readers never accept both directory formats.
- Canonical Plugin target and local-source projections are device-local metadata scoped to the active PromptHub storage root. Their identity is derived from the stable storage-root identity, not from the optional self-hosted sync identity, so Plugin reads and migration work before sync setup and remain stable across synchronization configuration changes. A local import stores complete package bytes inside `data/plugins/<encoded-plugin-id>/files`; its bounded absolute upstream locator lives only in `config/devices/plugin-projections.json`, survives restart on that device, and never enters the portable resource or version snapshot.
- Under canonical authority, installed local, marketplace, and Git-backed package files are published under `<userData>/data/plugins/<encoded-plugin-id>/files`; temporary materialization stays under cache and is removed after publication. Legacy metadata mode may retain its earlier managed-package layout until canonical migration.
- During historical metadata adoption, an identical portable record may retain a removed pre-adoption package path. The verified current record for that same identity remains authoritative, including a metadata-only bundle with no declared package bytes; the stale path is not reopened or recreated. Available current packages and history remain intact, and original metadata is preserved in migration recovery. Differing portable metadata, differing extant package bytes and missing packages without a verified current owner remain explicit errors. This conversion stays in the migration boundary and does not claim missing package files were recovered.
### 8. Current Desktop MVP Boundary

- Plugin Store includes OpenAI `openai-curated` and PromptHub `prompthub-official` built-in marketplace sources.
- Plugin Store defaults to PromptHub's built-in `prompthub-official` Official Store and keeps `openai-curated` available as the Codex Official Store, while keeping an all-sources filter.
- Marketplace preview lazily reads the selected package manifest, shows inventory/classification/policy/source links, and does not execute plugin code.
- Marketplace Store cards may render first from cached marketplace JSON, but visible cards with missing manifest presentation metadata must start bounded background prefetch immediately, even while slower marketplace source refreshes are still in flight.
- Plugin Store uses the same large-catalog rendering boundary as Skill Store: small catalogs render as normal card grids, while catalogs above the shared large-list threshold render through a virtualized row catalog tied to the page scroll container.
- Marketplace install validates the selected package manifest and downloads Git-backed packages into PromptHub's managed plugin directory before writing My Plugins metadata.
- Plugin Store batch mode supports Skill Store-style batch install, update, and remove actions. Install applies to selected store entries that are not in My Plugins. Update applies to selected entries already installed in My Plugins and calls the same source-update flow used by installed Plugin detail. Remove applies to selected installed store entries and removes those Plugin records from My Plugins; it does not remove imported child Skills/MCP entries and does not remove distributed Agent Plugin packages unless the user uses the My Plugins delete cleanup flow.
- My Plugins entries open as full detail pages rather than modal dialogs. The detail page shows Plugin description, inventory, source metadata, local package path, source/manifest content, a Files tab backed by the installed local package path, and an Agent Plugin target-selection entry point.
- Opening installed detail does not automatically check or clone its source. Check updates explicitly refreshes the source status; a failed refresh cannot open a review from stale cached status, and results from a detail that has been left cannot display notifications on another page. Git clone timeouts use localized network guidance. The current-check and package-fingerprint contract is owned by the Plugin Management Spec.
- Installed Plugin detail page render failures are contained with the same recoverable boundary pattern as My Skills: the Plugin module stays usable, users can go back to the list, and retry reloads Plugin data.
- Installed Plugin detail pages show a Skill-style Back to Top action on long non-files tabs after scrolling. The Files tab hides the floating action because it owns its own editor scroll area.
- My Plugins supports Skill-style installed-library controls where applicable: gallery/list view toggle, persisted gallery column preference, shared page-size pagination, previous/next page controls, and right-click context menu actions for detail, favorite, user tags, Agent target selection, opening the package folder, and delete.
- My Plugins tag filtering uses the shared left-bottom sidebar tag section, matching My Skills. The My Plugins header may keep status/source/view controls, but must not render a separate page-top tag selector.
- Installed Plugin detail pages expose a static package check. The check verifies local package existence, manifest path boundaries, and package symlink boundaries without executing Plugin code, installing dependencies, starting MCP servers, or mutating the Plugin library.
- Installed Plugin detail pages share the disabled-by-default manual content scan feature. Explicit static/AI assessment reviews descriptions and selected package text, not source provenance, trust labels or inventory counts. It never executes Plugin content or participates in installation, source updates or child distribution. Historical safetyReport metadata remains readable.
- Installed Plugin detail pages expose Plugin package snapshots. Snapshot versions start at `v1`, capture Plugin metadata plus static package files, can preview text package files, can be restored with a safety snapshot of the current state, and can be deleted without mutating the current Plugin entry.
- Plugin source updates that proceed to overwrite the installed package must first create an automatic pre-update snapshot with the old Plugin metadata and package files. Up-to-date checks and blocked local-change conflicts must not create snapshot noise.
- Plugin source checks compare the complete validated package fingerprint for local folders, Git/SSH/HTTPS sources, and Git-backed marketplace entries. Manifest metadata and child inventory counts alone must not decide whether a package is up to date, because child Skill, MCP, command, hook, asset, and documentation files can change independently.
- Credentialed Git transport keeps credentials only for the active clone operation. Stable source identity and diagnostics exclude URL userinfo, query values, and fragments; clone operations are bounded by a 30-second timeout and remove temporary package materialization after the check.
- Legacy installed Plugin records without a package baseline must report a source/local conflict when managed local content and current source content differ. They must not silently report up to date.
- My Plugins cards surface checked source update states from the installed detail page, including available updates, local package changes, and source/local conflicts. The card grid must not trigger new source scans by itself because Plugin sources can require Git/SSH/network work.
- My Plugins stores user-facing personal metadata separately from source metadata. `isFavorite`, `userTags`, and `userNotes` are PromptHub-owned user metadata and must be preserved across source refresh or source-update operations. Manifest/source `tags` remain read-only package metadata; My Plugins filtering, searching, and card chips may combine source tags and user tags for discoverability, but write actions must only modify PromptHub-owned metadata.
- My Plugins batch mode supports Skill-style favorite/unfavorite actions. If every selected Plugin is already favorited, the batch favorite action removes favorite state; otherwise it favorites every selected Plugin.
- My Plugins batch mode includes a paper-plane distribute action. Selected Plugin packages share one Agent target picker; confirming the picker distributes each selected Plugin package to the chosen Agent Plugin targets through the same copy/symlink Plugin package distribution flow as single-Plugin distribution.
- Desktop operation feedback: installation and distribution show an immediate
  informational Toast plus the existing busy button. Confirmed success shows a
  success Toast and closes the originating store-detail/target-picker modal;
  failure preserves the dialog for retry. Completion follows the mutation IPC,
  not marketplace reload or Agent inventory refresh. Distribution results update
  the shared observation immediately; background refresh errors remain visible
  through the existing inventory/status error state, not as installation failure.
  Apply changes and Redistribute share one horizontal footer row, with the hint
  below, separated from the scrolling content. Locally implemented 2026-10-21.
  No storage, IPC, acquisition, timeout or retry contract changes are involved.
- Feedback regression acceptance (2026-10-21): four focused assertions failed
  before correction (missing start Toast, installation result replaced by a
  reload, and two blocked-completion refresh cases). The real PluginManager,
  Zustand store and Toast provider tests replace preload I/O, covering store
  install success/failed retry, distribution success/failed retry, and slow or
  failed native inventory refresh. Eight focused unit files pass 91 cases.
  `tests/e2e/plugin-operation-feedback.spec.ts` passes headed macOS Electron
  through the real picker, IPC and filesystem: start/success Toast visibility,
  automatic close, copy bytes, redistributing, horizontal button bounds, reload
  persistence, and light/dark screenshots. The single E2E scenario exceeds 50
  lines to keep one owned fixture and its complete observable lifecycle together.
  It uses an isolated shared Plugin target, not the user's Codex configuration;
  Codex refresh failure/latency is tested at the component/store boundary.
  The public marketplace download and native Codex installer were not rerun in
  this UI follow-up. Source/test TypeScript and scoped ESLint pass. No full
  release-harness or cross-platform acceptance is claimed.

  Reproduction from `apps/desktop` (all commands use pnpm):

  ```sh
  pnpm exec vitest run --project unit tests/unit/stores/plugin.store.test.ts tests/unit/components/plugin-manager-distribution.test.tsx tests/unit/components/plugin-manager-store.test.tsx tests/unit/components/plugin-agent-target-picker.test.tsx tests/unit/components/plugin-shared-target.test.tsx tests/unit/components/toast.test.tsx tests/unit/components/plugin-manager-library.test.tsx tests/unit/components/plugin-manager-detail.test.tsx --maxWorkers=2 --minWorkers=1
  # Against the existing dev server; omit VITE_DEV_SERVER_URL to use built renderer assets.
  VITE_DEV_SERVER_URL=http://127.0.0.1:5173 PROMPTHUB_E2E_HEADED=1 pnpm exec playwright test tests/e2e/plugin-operation-feedback.spec.ts --workers=1
  ```

  The E2E is also selected by the normal Desktop E2E command and the built smoke
  script consumed by the root release harness. Earlier visual-capture attempts
  used the wrong theme setting and counted an unrelated status element; the
  corrected test asserts `themeMode`/actual dark class and only operation Toasts.
- My Plugins distribution preserves Codex native package copy/symlink behavior for Codex targets, and generates target-native package markers for enabled adapter targets before recording `distributedTargetIds`.
- A Plugin package may contain more than one target-native manifest. PromptHub
  records native support per recognized target, preserves the exact manifest
  for the selected native target during distribution, and inspects every
  recognized secondary manifest independently.
  Malformed, oversized, or traversal-bearing native manifests disable only
  their own target with an actionable warning. They must fail before that
  target is published, without hiding other valid native targets or
  authorizing adapter overwrite. An escaping package symlink remains a
  package-wide security failure.
- Agent Plugin and the installed Plugin detail page both let users remove a distributed My Plugins package from one supported target without deleting the My Plugins record. The removal is confirmation-gated, deletes only the resolved target package path, and removes only that target ID from `distributedTargetIds`.
- Uninstall removes My Plugins metadata and PromptHub-managed plugin package files. Distributed Agent Plugin package copies/symlinks are preserved by default, but single and batch delete confirmations may explicitly remove the resolved Agent Plugin package paths for recorded `distributedTargetIds`. Plugin uninstall never removes imported child Skills/MCP entries, App authorizations, user-owned external source packages, or unrelated Agent folders.
- Single-skill packages and single runtime hook/module packages fail the Plugin semantic gate and are not installed as Plugin bundles.
- Plugin Targets render enabled `Native` / `Adapter` targets and disabled `RuntimeOnly` / `Composite` / `Pending` targets. Disabled targets remain visible with an explicit reason.
- Agent Plugin reads target-native installed Plugin inventory for enabled bundle targets without importing it into My Plugins. Current target-native inventory detection covers Codex native installed records enriched by confirmed package manifests, Claude Code registry/manual packages, Cursor `.cursor-plugin/plugin.json` packages, Gemini CLI extension packages, Antigravity IDE root `plugin.json` packages, Kiro `POWER.md` powers, and GitHub Copilot / VS Code Agent Plugin `plugin.json` packages. Runtime-only, composite, and pending targets remain disabled and are not scanned as separate skill/MCP folders.
- Agent Plugin target descriptions are localized UI copy keyed by target ID. Disabled runtime-only or composite targets must clearly say the Agent does not support PromptHub Plugin bundles, instead of surfacing raw adapter metadata or opaque internal status labels.
- Plugin Store cards do not show child inventory count chips. Source, category, provenance, install state, icon, and description stay on the card; complete child inventory remains visible in detail and preview surfaces.
- Agent-installed Plugin inventory chips use direct capability counts, such as `1 Skill`, `2 Hooks`, or `1 个 Skill`; they do not prefix the count with `Includes` / `包含`.
- Agent-installed Plugin cards open package details. Codex details additionally expose native update, enable/disable and uninstall through the local management contract above; other targets remain read-only. The detail shows Agent source, description, inventory, local source path, a read-only Files tab, import-to-My-Plugins, and open-folder actions without editing package files; Codex uninstall is explicit and confirmed.
- PromptHub-managed My Plugins entries shown inside Agent Plugin are clickable into the same full installed Plugin detail page used by My Plugins, while still keeping selected-target distribution as a direct paper-plane action.
- Users can explicitly import a target-native installed Plugin from Agent Plugin into My Plugins. Import copies the Agent package into PromptHub-managed `data/plugins`, records Agent source provenance, leaves the original Agent package untouched, and still rejects packages that fail the Plugin bundle semantic gate.
- Users can explicitly import a local Plugin package from My Plugins. The desktop folder picker supplies the source path, the same local Plugin import pipeline performs a static manifest/inventory scan, copies valid packages into PromptHub-managed `data/plugins`, and rejects sources that fail the Plugin bundle semantic gate.
- Users can explicitly import Git/SSH/HTTPS Plugin sources from My Plugins. The URL flow first performs a static preview scan and shows a confirmation modal with manifest identity, source, classification, inventory, and unsupported reasons; it writes My Plugins metadata only after the user confirms import. SSH sources use local git and local SSH keys; source branch and package path are preserved in the installed Plugin metadata for duplicate detection and future source update checks.
- Users can explicitly import supported child assets from an installed Plugin detail page. Child Skills reuse the existing local Skill scan preview and copy import flow. Child MCP configs are discovered by static JSON/TOML package scan, symlink escapes are rejected by realpath, and detected configs are imported through the existing MCP library importer. After child Skill/MCP import succeeds, PromptHub opens My Skills/My MCP with the imported assets selected in the existing batch distribution flow. Unsupported child Apps/connectors, commands, hooks, and scripts remain visible as inventory/content but are not auto-imported or executed.
- Installing a Plugin into My Plugins does not automatically copy child assets into My Skills/My MCP and does not write external Agent configuration.

## Stable Scenarios

### Scenario: Installing a plugin package

When a user installs a Plugin from a store, Git URL, SSH URL, HTTP URL, or local folder:

- PromptHub performs a static scan
- PromptHub shows the manifest and child inventory
- PromptHub asks for confirmation before installation
- PromptHub records Plugin source identity and installed inventory
- PromptHub does not auto-distribute child assets to external agents

### Scenario: Distributing plugin child assets

When a user chooses to distribute child assets from an installed Plugin:

- Skills are first imported into My Skills, then distributed through the existing Skill batch distribution dialog
- MCP servers are first imported into My MCP, then distributed through the existing MCP batch distribution dialog
- Apps/connectors require explicit authorization or external setup
- conflicts and overwrites require explicit confirmation

### Scenario: Assistant-driven plugin operation

When the future Agent Assistant handles a natural-language request such as “install this plugin and distribute it to Codex and Claude”:

- the Assistant calls Plugin scan/install/distribute capabilities
- the same preview, confirmation, conflict, backup, and no-code-execution rules still apply
- the Assistant does not silently grant App auth or write target configs

## Current Verification Gap (2026-10-12)

The real renderer child-Skill import in `release-acceptance-agents-assets-skill-combinations.test.tsx` still produces zero independent library imports where one is required. The failing assertion remains; encoded Plugin bundle paths and their migration passing do not establish this import workflow.

### Antigravity native Plugin verification (#226)

- Contract source: [Google Antigravity Plugins](https://antigravity.google/docs/plugins?tab=ide), checked 2026-10-13.
- Report-specific acceptance uses `tests/integration/antigravity-plugin-entrypoints.test.ts` for the real preload/registered IPC, registered Agent-root resolver, canonical package, copy/symlink, reopened inventory and removal path; `tests/e2e/antigravity-plugin.spec.ts` exercises local import and target selection through the actual Electron UI before a full process restart. The OS directory picker supplies a fixture path; Plugin business operations are not mocked. The long lifecycle test bodies keep each ordered arrange/action/readback/restart sequence together rather than splitting its assertions across helpers.
- Regression boundary: synthetic Agent roots and real Core/desktop IPC filesystem workflows cover the reported Zotero manifest, metadata-only packages, IDE folder-name identity, malformed manifests, target separation, flat target layout, exact-byte package preservation, library reopen, explicit removal, and unsupported conversion before target mutation.
- Read-only discovery is linear in direct package count and existing bounded inventory scans; it does not recursively traverse Antigravity version directories or call network services.
- Windows path-template verification is distinct from a Windows packaged-app or Antigravity loader run; native GUI/loader and release acceptance remain pending.

Focused checks (2026-10-13):

- Desktop Vitest: 106 distinct cases passed across 11 related files. The corrected IPC removal-method test and accessible-name assertion were rerun at the affected scope; unchanged passing suites were not repeated. Coverage includes Plugin distribution/import/version validation, native target overlays, target picker/Agent installation, i18n, platform capabilities and child MCP import. Existing React `act(...)` warnings in PluginManager tests do not constitute native GUI evidence.
- `pnpm --filter @prompthub/core typecheck`, `pnpm --filter @prompthub/desktop typecheck`, and `pnpm --filter @prompthub/desktop typecheck:tests`: passed.
- ESLint for touched desktop source/tests, `pnpm lint:file-size`, and `git diff --check`: passed. No build, packaged Windows run, Antigravity loader run, or release harness was performed.

Report-specific revalidation (2026-10-14, isolated `cd80eb1f` plus new tests):

- `pnpm --filter @prompthub/desktop exec vitest run --project integration tests/integration/antigravity-plugin-entrypoints.test.ts --minWorkers=1 --maxWorkers=1`: 2 passed. Restoring the prior version-directory behavior in the isolated `plugin-target-paths.ts` makes both cases fail at the target-path business assertion (`plugins/zotero/0.1.2` instead of `plugins/zotero`, exit 1). The mutation was removed; shared source was never mutated. The initial test incorrectly expected an empty inventory array; the canonical matrix omits empty inventories, so the test now separately asserts target existence and absence of installed entries.
- `pnpm --filter @prompthub/desktop build` then `pnpm --filter @prompthub/desktop exec playwright test tests/e2e/antigravity-plugin.spec.ts --workers=1 --retries=0`: build and 1 Electron test passed. A fresh isolated profile imports the reported native manifest, distributes through the real target picker, preserves manifest/image bytes at the flat default IDE path, and retains library and target inventory after process restart. Fixtures and Electron processes are cleaned on completion.
- Desktop `typecheck:tests`, ESLint on both added test files, scoped Prettier and `git diff --check` passed. The previously run native Plugin unit suite remains 10/10; unchanged product source was not retested merely for this documentation update.
- This closes the reported IDE global-directory/manifest defect, originally fixed in `37a20820`. It does not claim execution of Zotero, a Windows Antigravity loader, CLI Plugin registration, project-level Plugin support or a published release; those are distinct acceptance boundaries, not evidence that the reported configuration remains broken.

### Windows native runtime discovery (#244)

Plugin commands retain the native `plugin` prefix. The runtime resolver uses the
registered `OpenAI.Codex` Windows Store package's `app/resources/codex.exe`, or
an active `openai.chatgpt` extension from the default VS Code `extensions.json`,
before standalone PATH discovery. Package identity and executable layouts belong
to the shared Agent definition; Store version directories are never guessed.
Custom VS Code extension directories are not discovered. Store ACL failures are
reported as native command failures; discovery does not alter package permissions.

Native commands and Codex configuration RPC use `cross-spawn` for Windows npm
shims and argument quoting. This promotes the existing MIT-licensed 7.0.6
transitive dependency to a direct core dependency; no additional runtime is
introduced. Output limits and execution timeouts retain the existing command
policy. Termination on Windows targets only the owned process tree. The command
collector keeps its lifecycle in one closure (over 50 lines) so output, abort,
timeout and close share one completion state; process regression tests cover
output budgets, exit codes and argument boundaries. Native installation errors
include the operation and a safe exit/system code, never raw stderr.

Windows Store discovery and extension selection are covered with deterministic
fixtures. The npm shim execution case runs only on Windows. No Windows test
machine was available for the 2026-10-20 verification; Windows 11 installation,
enable/disable and removal remain an explicit release acceptance gap.

The replacement release gate runs the native lifecycle with Codex 0.163.0 on
Windows x64. Its first run exposed user-config layer recognition during disable.
Configuration RPC now compares canonical filesystem identities, including Windows
extended-length paths and directory aliases, rather than raw path spelling.
Windows CI regression confirmed that `realpath` alone preserves the extended
prefix; both resolved paths use the same native namespace before comparison. A
different config file is still rejected; original bytes and the native expected
version protect concurrent edits. Regression coverage uses a real stdio child
process. Windows native lifecycle acceptance remains pending the corrected gate;
this CLI check does not claim Windows Store GUI acceptance.
