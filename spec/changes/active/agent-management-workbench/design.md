# Design

## Design Summary

本轮确认的 Provider & Model 设计边界：系统级模型服务配置是跨 Agent 复用的统一 Provider Profile 层，Agent 原生配置是可验证的投影，不是第二个长期事实源。官方供应商/模型目录只读；系统级调用配置可编辑；Agent 自定义 provider/model 可完整编辑、复制和删除；内置模型仅允许官方支持的 override。系统级 Provider 引入 Agent 默认采用绑定继承，也可复制为独立配置。凭据通过安全引用跨 Agent 复用，由各 adapter 投影，明文不进入 SQLite、备份、导出或 renderer。统一模型允许按 Agent 做 model ID 映射；外部文件变更进入 drift/conflict 流程，不静默覆盖。

Provider & Model 页面的左右分栏布局和 CC Switch 风格预制供应商数据/协议映射的细化设计见
`provider-preset-catalog-design.md`。该设计保留现有激活安全管线,只借鉴 CC Switch 的预设
组织与交互契约(MIT v3.18.0,选择性参考,不复制组件或数据模型)。

The Agents workspace manages existing platform identities rather than creating a parallel Agent Profile catalog. It adds a capability-oriented adapter layer around each platform and composes existing asset services into an Agent-centered view.

```text
existing platform registry
  -> managed Agent identity and resolved paths
  -> capability adapters
       installation | provider config | session | CLI | quota | proxy(optional)
  -> Agent application services
       inspect | import | preview | activate | verify | rollback | diagnose
  -> desktop IPC/preload
  -> Agents workspace and tray

existing Skill / MCP / Rules / Plugin services
  -> Agent asset aggregation and actions
  -> no duplicate Agent-owned asset store
```

## `DES-AGENT-155`: Canonical Plugin With Device-Local Source Projection

Keep the existing `data/plugins/<plugin-id>` canonical bundle as the durable
Plugin authority. Extend the existing device projection under
`config/devices/plugin-projections.json` with a bounded Plugin-ID-to-absolute-
source-path map. Canonical resources and version snapshots continue stripping
local paths; reread overlays a local source path only for a local Plugin on the
same device. Legacy projection files without the map remain readable.

Projection creation and parsing validate known Plugin IDs, absolute bounded
paths, duplicate targets, and document size. The projection participates in the
existing atomic canonical publication and deletion transaction. Source package
validation rejects symbolic-link roots before update comparison. Reads and
writes remain `O(P)` for at most 10,000 Plugins, with no watcher, network call,
database schema, or extra package copy.

## `DES-AGENT-154`: Separate Plugin Materialization From Canonical Resources

Keep `data/plugins/<resource-id>` strict: every visible child is a complete
canonical resource bundle. In canonical mode, local, Git, update, and snapshot
package materialization uses bounded cache workspace instead of that namespace.
`PluginLibraryStorage.write` publishes from the workspace, rereads the canonical
result, removes the consumed workspace, and returns canonical paths to callers.
Legacy metadata mode retains its existing managed-package layout. Package copy
and canonical publication remain linear in file count and bytes, with one
temporary copy and one canonical copy during the transaction.

## `DES-AGENT-153`: Demand-Driven MCP Encryption

Keep the canonical MCP transaction and device-bound secret store. Its staged
update requires encryption only when `extractedSecrets` is non-empty. Empty
updates and encrypted-reference cleanup can filter or publish ciphertext
without encryption or decryption. Any new or changed secret still checks
encryption before the staged file is written, so publication remains atomic and
fail-closed for confidential values.

## `DES-AGENT-152`: Installation-Gated Usage Reads

Keep the existing resolved Agent root as the installation boundary. The shared
main-process usage service checks that root once before dispatching to any
provider adapter. An absent root returns the typed `agent-not-installed` result
without reading credentials, listing processes, starting a helper, or issuing a
network request. This places one guard before every usage caller instead of
special-casing the tray or Antigravity adapter.

## `DES-AGENT-151`: Stable Provider Identity

`agent_provider_profiles.id` remains the only Provider Profile identity. Remove
the partial unique index on `(platform_id, LOWER(name))`; keep the existing
platform/list query index. A transactional legacy migration drops the obsolete
index before schema indexes are installed, records its immutable migration
name, and leaves profile rows, model mappings, canonical bundles, and secret
references unchanged. Dropping the obsolete index is a one-time operation
bounded by that index's pages; steady-state profile writes become cheaper, and
the existing platform/archive query index keeps list reads indexed. The shared
migration transaction and pre-migration safety point provide rollback and
recovery. No renderer validation or name-derived lookup is added.

## `DES-AGENT-150`: Skill Delete Ownership Copy

Keep the existing main-process ownership rule as the single deletion boundary:
`SkillInstaller.isManagedRepoPath()` permits managed-container cleanup, while
linked external paths never enter that operation. The detail and batch dialogs
reuse the existing delete hint keys and describe both sides of the contract in
one truthful message, so no renderer path inference or new IPC contract is
introduced. Distribution copy and symlink controls remain separate.

## `DES-AGENT-001`: Domain Model And Terms

### Managed Agent

A `ManagedAgent` is a view over an existing `SkillPlatform` plus device-specific detection and capabilities. Its stable id remains the existing platform id.

```ts
interface ManagedAgent {
  platform: SkillPlatform;
  installation: AgentInstallationStatus;
  capabilities: AgentCapabilitySet;
  provider: AgentProviderSummary | null;
  assets: AgentAssetSummary;
  sessions: AgentSessionSummary;
  health: AgentHealth;
}
```

No `agent_profiles` table is introduced for the first delivery.

### Provider Profile

A `ProviderProfile` is an Agent configuration source that can be activated through an adapter. It contains normalized common fields plus platform-owned extension data. It is not PromptHub's own chat model configuration and does not copy credentials.

### Universal Provider

A Universal Provider is a logical provider definition with explicit per-platform projections. It is not one JSON blob written unchanged to every Agent.

### Agent Asset State

Agent asset state is a computed aggregate of canonical Skill, MCP, Rules, and Plugin services. The Agent domain may cache a short-lived view but does not own durable asset content or assignment truth.

### Agent Profile / Persona

This remains a future composition layer. It may reference Managed Agents and assets later but is excluded from the first schema and UI.

## `DES-AGENT-002`: Sources Of Truth

| Concern                        | Source of truth                                                    | Agent workspace responsibility                                           |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Platform identity/capabilities | `packages/shared/constants/platforms.ts` and custom Agent settings | Read and present; do not duplicate                                       |
| Resolved roots/paths           | Existing platform path services and settings overrides             | Diagnose and pass to adapters                                            |
| PromptHub AI providers/models  | `CoreAIConfigService` / `config/ai-models.json`                    | Optional source for creating a Provider Profile; not native config truth |
| Agent Provider Profiles        | New SQLite records plus secure secret references                   | CRUD, test, activate, version metadata                                   |
| Active native provider         | Verified Agent config on disk                                      | Read through provider adapter; do not trust a UI boolean                 |
| Skills                         | Existing Skill DB/repos/distribution services                      | Aggregate and invoke owning actions                                      |
| MCP                            | Existing MCP library and target reconciliation                     | Aggregate and invoke owning actions                                      |
| Rules                          | Existing Rules workspace/DB services                               | Aggregate and invoke owning actions                                      |
| Plugins                        | Existing Plugin library/distribution services                      | Aggregate and invoke owning actions                                      |
| Sessions                       | Platform-owned files/logs                                          | Local metadata index and on-demand read                                  |
| Credentials                    | OS secure storage or platform-owned auth mechanism                 | Reference, readiness, projection where supported                         |

This table is a design gate. New code must not move canonical asset ownership into React state or Agent-specific JSON.

## `DES-AGENT-003`: Capability-Oriented Adapter Contracts

One giant `AgentAdapter` would force unsupported features into every platform. Use optional, typed capability adapters registered by platform id.

```ts
interface AgentInstallationAdapter {
  detect(context: AgentPathContext): Promise<AgentInstallationStatus>;
}

interface AgentProviderAdapter {
  inspect(context: AgentConfigContext): Promise<AgentNativeProviderState>;
  importCurrent(
    context: AgentConfigContext,
  ): Promise<AgentProviderImportPreview>;
  planActivation(input: AgentProviderActivationInput): Promise<AgentConfigPlan>;
  apply(plan: AgentConfigPlan): Promise<AgentConfigApplyResult>;
  verify(plan: AgentConfigPlan): Promise<AgentConfigVerification>;
  rollback(
    receipt: AgentConfigApplyReceipt,
  ): Promise<AgentConfigRollbackResult>;
}

interface AgentSessionAdapter {
  scan(input: AgentSessionScanInput): AsyncIterable<AgentSessionMetadata>;
  read(input: AgentSessionReadInput): Promise<AgentSessionTranscript>;
  getResumeCommand(session: AgentSessionMetadata): AgentResumeCommand | null;
}

interface AgentCliAdapter {
  inspect(): Promise<AgentCliStatus>;
  planInstallOrUpdate(input: AgentCliChangeInput): Promise<AgentCliChangePlan>;
  apply(plan: AgentCliChangePlan): Promise<AgentCliChangeResult>;
}
```

Optional `quota` and `proxy` contracts remain separate. Platform registration declares each capability and adapter version independently. Missing capability yields `planned` or `unsupported`, not an exception, and never removes the Agent from the workspace.

Provider and session adapters SHOULD use a platform's documented structured CLI
or local RPC before parsing internal files. File adapters are used only when no
non-mutating native interface exists and representative fixtures prove the
format. Destructive session operations are not part of the generic adapter
contract: they require a typed native command or a separately tested move-to-
trash capability.

All user-enabled built-in platforms participate in Agent discovery and display from the first delivery. Disabled built-in and custom platforms are excluded at the managed-Agent projection boundary, and settings changes refresh an already-loaded workspace. Deep-management work is prioritized rather than scope-filtered:

1. User-pinned Agents
2. Detected or explicitly configured Agents
3. Curated common Agents such as Claude Code, Codex CLI, Google Antigravity, OpenCode, Cursor, Windsurf, Cline and OpenClaw
4. Remaining enabled built-in platforms
5. Enabled custom Agents, with detected/configured custom Agents promoted by the same rules

Provider, session, config and CLI adapters may have different delivery order because each depends on format stability, security and fixture evidence. The capability matrix, not platform visibility, records implementation depth.

### Kimi Code Generation Resolution

Kimi keeps the existing stable platform id `kimi`, but root resolution is generation-aware:

1. A PromptHub user override wins.
2. A valid absolute `KIMI_CODE_HOME` selects current Kimi Code.
3. The current default `~/.kimi-code` is selected when it exists.
4. A valid absolute `KIMI_SHARE_DIR` or legacy default `~/.kimi` is used only when the current root is absent.
5. A fresh target resolves to `~/.kimi-code`; PromptHub never creates new data under the legacy root.

Current Kimi Code files are managed as separate capabilities: `config.toml` for non-secret model projection, `tui.toml` for raw allowlisted editing, `mcp.json`, `AGENTS.md`, `skills/`, `plugins/`, `session_index.jsonl`, and `sessions/`. `credentials/`, logs, update state, and arbitrary runtime files are never exposed through the config editor.

Model inspection reads `default_model`, the selected `[models.*]` entry, and its `[providers.*]` non-secret fields. Literal `api_key`, custom authorization headers, and credential documents never enter renderer payloads. Writes preserve semantic TOML fields, create a backup, replace atomically, re-read, and use `kimi doctor config` when the executable is available.

Session listing performs one bounded linear index pass, retains at most a bounded candidate window, and reads at most `O(page size)` state files with capped concurrency. Default `New Session` shells without `lastPrompt` are not conversations and are omitted. A listed row must resolve its contained `agents/main/wire.jsonl`; that exact file remains the transcript source path. The lifecycle projection reports the bounded footprint of the containing native session directory because permanent delete removes that directory. Selected transcript reads are capped by bytes and line count. Inventory discovery never recursively traverses all of `sessions/`; only the returned page's session directories are measured with the shared 50,000-entry per-session bound, so discovery stays `O(index bytes + page size)` with bounded concurrency and memory.

## `DES-AGENT-004`: Provider Profile Storage

### System Provider Profile and Agent Binding Boundary

`agent_provider_profiles` 是系统级可复用 Provider Profile 的持久化层，不应再按每个 Agent 复制一份同义配置。Provider Profile 保存规范化的非敏感 endpoint/protocol/model metadata 和 secure `secret_ref`；`agent_provider_bindings`（后续迁移）保存 Agent 绑定、目标 provider id、模型映射、继承/独立模式和 projection digest。

官方 catalog 是只读的 reference source。内置 provider/model 的官方字段不能被 CRUD 修改；用户修改 endpoint、凭据、默认模型或上下文/思考参数时，必须写入 adapter 支持的 override/config 层，并在 UI 标记 `Built-in · Override`。自定义 provider/model 允许完整 CRUD 和 duplicate；详情操作栏固定为 rename、create copy、copy text 和 confirmed delete，不暴露 archive。现有 `archived` 存储字段和主进程能力暂留作兼容结构，不再作为当前 workbench 的产品操作。

系统级 provider 引入 Agent 有两种明确操作：`bind`（继承系统配置）和 `clone`（复制为 Agent 独立配置）。解除绑定不删除系统 profile；删除系统 profile 前必须列出受影响的 bindings。模型身份由统一 model id 加每个 Agent 的 target model id 组成，不能假设不同 Agent 的 provider/model id 相同。

Native reconciliation MUST record `baselineDigest`, `currentDigest` and `desiredDigest`. Current differs from baseline while desired also differs时返回 `drifted/conflict`，提供导入外部修改、重新投影和查看差异，不得静默覆盖。

### `agent_provider_profiles`

- `id TEXT PRIMARY KEY`
- `platform_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `provider_kind TEXT NOT NULL`
- `protocol TEXT NOT NULL`
- `endpoint TEXT`
- `config_json TEXT NOT NULL DEFAULT '{}'`
- `secret_ref TEXT`
- `source TEXT CHECK(manual/native-import/universal/import)`
- `archived INTEGER NOT NULL DEFAULT 0`
- `created_at`, `updated_at`

`config_json` stores validated non-secret platform-specific extension data. Adapters own schema validation; renderer cannot submit arbitrary file content.

### `agent_provider_model_mappings`

- `id TEXT PRIMARY KEY`
- `provider_profile_id TEXT NOT NULL REFERENCES agent_provider_profiles(id) ON DELETE CASCADE`
- `route_key TEXT NOT NULL`
- `model_id TEXT NOT NULL`
- `parameters_json TEXT NOT NULL DEFAULT '{}'`
- `UNIQUE(provider_profile_id, route_key)`

Route keys are adapter-defined and surfaced through typed capabilities. Common labels such as primary, fast, vision, reasoning, and fallback are UI vocabulary, not a forced platform schema.

### `agent_provider_snapshots`

- `id TEXT PRIMARY KEY`
- `platform_id TEXT NOT NULL`
- `provider_profile_id TEXT REFERENCES agent_provider_profiles(id) ON DELETE SET NULL`
- `native_digest TEXT NOT NULL`
- `redacted_snapshot TEXT NOT NULL`
- `backup_ref TEXT`
- `operation TEXT CHECK(import/activate/backfill/restore)`
- `result TEXT CHECK(planned/applied/verified/rolled-back/failed)`
- `created_at INTEGER NOT NULL`

Snapshot rows contain redacted structural state. Native backup file paths use device-local references and are excluded from portable export.

### `agent_universal_providers` And Projections

Universal providers are follow-up schema, not required for the first migration. When added, each projection maps a universal id to a platform-specific Provider Profile and records unsupported fields explicitly.

### Migration

- Add fresh schema and idempotent existing-user migration in `packages/db`.
- Do not mutate existing platform settings or PromptHub AI configuration.
- Do not infer Provider Profiles from native files during migration; import is explicit.
- Add indexes for platform, archive state, update time, and snapshot history.

## `DES-AGENT-005`: Credential Strategy

Credential handling has three cases:

1. **PromptHub-owned secret**: store in OS secure storage through a stable `secret_ref`; never return the value to renderer after save.
2. **Platform-owned OAuth/keychain**: preserve the native mechanism and expose readiness only. Do not copy or export tokens.
3. **Native config requires plaintext/env value**: resolve the secret in main/core only during activation, write only the adapter-required target, then verify and redact diagnostics.

The first implementation must audit the existing AI configuration secret behavior before sharing connections. Provider Profiles may offer “create from PromptHub provider” only when protocol and credential semantics are compatible. It must create a mapping, not alias two mutable JSON records.

Backup rules:

- Default backups contain secret requirements and references, not secret values.
- A future encrypted credential export requires a separate explicit format, user password, authenticated encryption, and dedicated threat model.
- Deep links with literal credentials are treated as transient sensitive input and never logged.

Claude Code Provider Profiles use `config_json.credentialEnvKey` only for the
allowlisted values `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN`. The matching
secret remains under PromptHub main-process custody and is projected only into
`~/.claude/settings.json` after preview and confirmation. A
`platform-native` Claude Profile removes PromptHub-managed direct-provider env
keys and leaves Claude's own OAuth/keychain flow in control. PromptHub never
reads, writes, migrates, backs up or exports Claude-owned `.credentials.json`.

## `DES-AGENT-006`: Native Config Reconciliation And Activation

Every supported switch follows:

`inspect -> normalize -> compare baseline/current/desired -> preview -> backup -> stage -> atomic replace -> re-read -> verify -> record`

The comparison is three-way:

- baseline: last verified PromptHub projection, if any
- current: current native config read immediately before apply
- desired: adapter projection from selected Provider Profile

Plan classifications:

- `apply`: managed field can be changed safely
- `preserve`: unrelated or unknown field remains unchanged
- `backfill`: current native value can update the PromptHub profile after confirmation
- `external-modified`: managed field changed outside PromptHub
- `conflict`: current and desired both diverge from baseline
- `unsupported`: adapter cannot represent requested configuration
- `blocked`: secret, permission, validation, or path prerequisite is missing

Apply rules:

- Use structured parsers/writers for JSON, JSONC, TOML, YAML, or dotenv as appropriate.
- Never use ad hoc string replacement for structured files.
- Preserve comments/order when the selected parser supports it; otherwise preview formatting changes explicitly.
- Resolve and validate paths against allowlisted platform roots.
- Create backup before replacing an existing file.
- Use a same-directory staging file and atomic rename where supported.
- Re-read and verify semantic state after write.
- Restore backup when write or verification fails.
- Record active provider only from verified native state.

Concurrent changes are handled by a digest check immediately before rename. A changed digest invalidates the plan and returns to preview.

## `DES-AGENT-007`: Agent Asset Aggregation

Create an application-level `AgentAssetAggregationService` that depends on public services from the existing domains:

```ts
interface AgentAssetDomainAdapter {
  readonly kind: "skill" | "mcp" | "rule" | "plugin";
  listForTarget(platformId: string): Promise<AgentAssetTargetState[]>;
  planAction(input: AgentAssetActionInput): Promise<AgentAssetActionPlan>;
  applyAction(plan: AgentAssetActionPlan): Promise<AgentAssetActionResult>;
}
```

Rules:

- The Agent workspace does not write asset tables/files directly.
- Every action uses the owning domain's existing validation, reconciliation and rollback behavior.
- Counts, list rows, detail badges and tray summaries derive from the same aggregate selector.
- Missing adapter support is shown per asset kind.
- The first delivery adds no generic `agent_asset_bindings` table.

## `DES-AGENT-008`: Sessions And Usage

### Metadata Index

Introduce device-local session sources and metadata indexes only for verified formats:

- `agent_session_sources`: platform, root, adapter version, scan cursor, enabled, last result.
- `agent_sessions`: external id, platform, title, project path, timestamps, message count, bounded preview, source path/digest/status, tags/note.

Transcript bodies remain in source files and are loaded on demand. Index rows are excluded from normal cloud sync unless a future explicit metadata policy is added.

### Scan Safety

- Opt-in per source where content sensitivity warrants it.
- Bounded file count, size, preview, parse time, and concurrency.
- Incremental scan using path, mtime, size, digest and adapter version.
- Cancellation and progress events.
- Symlink escape, traversal and null-byte rejection.
- Per-file parse failures without aborting the inventory.
- Redaction before previews or diagnostics are persisted.

The first adapters MUST NOT recursively parse entire platform roots. OpenCode
and OpenClaw use bounded native JSON commands. Claude may use a bounded file
metadata adapter with tolerant JSONL parsing because its first-party docs expose
the transcript location while warning that entry schemas are internal. Codex
uses `session_index.jsonl`/SQLite metadata first and reads rollout files only for
the selected page; multi-gigabyte rollout files must remain loadable as bounded
partial results.

### Resume

Adapters return executable plus argument arrays, never a renderer-built shell string. UI may copy a quoted display command, but main process launch uses `execFile`-style invocation.

### Session Management

- Search, metadata browse, bounded detail view, source diagnostics, and resume
  are the common baseline.
- Transcript contents are never edited by PromptHub.
- Archive is a PromptHub-owned metadata projection: it removes a session from
  the Active filter and keeps it available through Archived, without modifying
  or moving the Agent-owned transcript.
- Platform-native delete/retention/cleanup commands may be exposed as typed
  adapter actions with preview and confirmation.
- Raw transcript files are never permanently deleted through a generic file
  operation. A future fallback must use operating-system trash and prove
  rollback behavior.

### Usage

P1 usage summaries derive from verified session logs. Proxy-observed usage and provider-reported quota remain separate data sources with labels and timestamps.

## `DES-AGENT-009`: Provider And Model Testing

Provider tests run in main/core and never mutate the active Agent configuration.
The capability is split into two explicit levels so the UI does not confuse
endpoint reachability with a billable model inference:

1. **Connection inventory check**: a bounded, read-only protocol request that
   verifies endpoint policy, authentication and model discovery.
2. **Streaming model test**: an explicit user action that performs a minimal
   inference and records first-token timing. It requires a quota confirmation
   and remains separate from activation because it can consume provider quota.

The Codex OpenAI-compatible connection inventory check resolves the unified
Provider Profile, model mapping and secure secret only in main memory. It calls
`GET /models` with zero retries, an 8-second total timeout, a 1 MiB response
limit and no redirects. Public endpoints require HTTPS; explicit loopback HTTP
is allowed for a user-owned local provider; other private, link-local and
internal addresses are rejected after DNS resolution. The result returns only
the endpoint origin, model count/presence, stable status and elapsed time.
Query, fragment, userinfo, response bodies, native paths and credentials never
cross IPC.

Result fields:

- adapter/protocol/provider profile id
- tested model and endpoint origin, with sensitive query values removed
- started/finished timestamps
- DNS/connect/TLS/request/first-token/total durations when available
- success, HTTP category, protocol category, retry count
- bounded redacted response preview only when safe

The streaming test uses OpenAI Responses or Chat Completions SSE according to
the stored protocol. It sends one fixed minimal prompt with an 8-token output
cap, uses 5-second connect, 8-second first-token and 20-second total deadlines,
permits at most one retry for a bounded transient category, rejects redirects
and unsafe targets, and caps the response at 256 KiB. Only a control-character
free, credential-redacted 256-character preview crosses IPC. Profile switches,
explicit cancellation and renderer destruction abort the main-owned request.
The adapter builds every test request from the Provider Profile and secure
secret reference without reading the active native projection as a second
source of truth.

Claude Code uses the same two-level test contract with Anthropic's native
protocol: `GET /v1/models` for inventory and `POST /v1/messages` with SSE for
the explicit minimal model test. `ANTHROPIC_API_KEY` maps to `x-api-key`;
`ANTHROPIC_AUTH_TOKEN` maps to `Authorization: Bearer`. The probe shares the
HTTPS/explicit-loopback, DNS pinning, redirect, timeout, response-size, retry,
cancellation and redaction boundaries above. IP endpoints omit TLS SNI because
Node rejects IP literals as `servername`.

Gemini CLI keeps its enterprise/paid-API compatibility identity separate from
Antigravity. The complete Gemini adapter owns a two-file runtime projection:

- `~/.gemini/settings.json`: `model.name` and
  `security.auth.selectedType` only, edited as JSONC while preserving unrelated
  fields and comments.
- `~/.gemini/.env`: only the managed `GEMINI_API_KEY` and optional
  `GOOGLE_GEMINI_BASE_URL` entries. Other variables, comments and formatting
  remain byte-stable where possible.

Managed paid API profiles use protocol `google-generative-ai`, auth type
`gemini-api-key`, and a main-only `agent-provider:<profileId>` secret. The
default endpoint is `https://generativelanguage.googleapis.com`; an override
must use HTTPS or explicit loopback HTTP. Connection inventory calls bounded
`GET /v1beta/models`; the explicit model test calls bounded
`POST /v1beta/models/{model}:streamGenerateContent?alt=sse`. Both authenticate
with `x-goog-api-key`, reject redirects and unsafe DNS targets, and share the
existing timeout, response-cap, retry, cancellation and redaction contract.

Platform-native profiles may preserve the documented non-secret auth types
`oauth-personal`, `vertex-ai`, `compute-default-credentials`, `cloud-shell` and
`gateway`. PromptHub does not read or migrate Gemini keychain data,
`oauth_creds.json`, ADC/service-account files, or Antigravity credentials.
Native-auth connection and model tests report unsupported instead of borrowing
those credentials. Activation uses one encrypted bundle backup, checks both
files for concurrent edits, writes each atomically, rereads both, and restores
both on any partial failure.

## `DES-AGENT-010`: UI Information Architecture

### Global Navigation

Add `Agents` as a first-class left-rail module. Its default position is second,
immediately after `Prompts` and before `Skills`. New settings use that canonical
order. The settings v17 migration maps only recognized historical defaults to
it; current-version hydration preserves complete user-defined orders, including
an order that happens to equal the former default. Existing settings for Agent
roots become advanced platform/path settings and link back to the corresponding
Agent detail.

### Workspace Layout

- Left/local list: enabled Agents with one search field; status and sort filter controls are intentionally omitted.
- The list contains enabled built-in and enabled custom Agents. It is never reduced to platforms with provider/session adapters, but user-disabled platforms are not displayed.
- Default order is pinned, detected/configured, curated common priority, then stable name order. Search operates over the enabled set.
- Agent row: icon, name, detection/version, current provider/model, health, asset/session summary.
- Main detail header: Agent identity, status, current provider, diagnose, quick actions.
- Tabs:
  - Overview
  - Provider & Model
  - Appearance
  - Skills
  - MCP
  - Rules
  - Plugins
  - Config Files
  - Sessions
  - Usage
  - Maintenance

Tabs are capability-aware. Overview and supported asset/path information remain available for every Agent. Unsupported deep capabilities show `partial`, `planned`, or `unsupported` with a reason instead of hiding the Agent or presenting a broken empty page.

### Appearance Adapter

Appearance is a first-class Agent capability with one shared page and optional
adapter-owned sections. The initial Codex adapter exposes native appearance,
desktop skins, and Pets. Other Agents retain the same tab position and declare
`planned` or `unsupported` until an adapter is verified.

Imported Codex Dream Skin directories are stored beneath PromptHub's resolved
data directory at `agent-appearance/themes/codex/<theme-id>`. Each directory
contains declaration-only `theme.json` metadata and one local PNG, JPEG, or
WebP image. The directory is the source of truth; SQLite stores no duplicate CSS
or image payload. PromptHub vendors the audited software-only runtime from
`Fei-Away/Codex-Dream-Skin` version `1.2.0`, commit
`3af1d6d62f3a0388cc640d2f497ac3100998938e`. The renderer receives only
normalized metadata and action results, never an unrestricted CDP handle.

Desktop skin execution belongs to the Electron main process and its managed
Dream Skin host process. PromptHub stages the selected theme into the upstream
platform runtime and invokes its start, verification, watch/reinject, and restore
flows. The runtime binds only to loopback, validates that the listener belongs
to the official Codex process, validates `app://` renderer landmarks, injects the
vendored CSS/renderer payload, and removes the payload plus debugging session on
restore. macOS reuses the signed Node runtime bundled with Codex. Windows follows
the upstream Node 22 runtime requirement and reports a bounded actionable error
when that prerequisite is absent.

Theme imports reject traversal, symlinks, reparse points, non-local image paths,
malformed JSON, unsupported image formats, empty images, files over 16 MB,
dimensions over 16384px, and images over 50 megapixels. Theme staging publishes
the image before `theme.json` by atomic rename so the watcher never observes a
partial pair. The application bundle, `app.asar`, and signature are never
patched. PromptHub packages the upstream MIT license, notice, pinned commit, and
local modifications. Celebrity, character, sponsor, and other rights-unclear
upstream presets are excluded; only software and the upstream abstract demo
artwork may be redistributed.

The sibling checkout under `Programs/public/Codex-Dream-Skin` is an audit and
update source only. Production and development builds MUST use the pinned
runtime snapshot inside PromptHub and MUST NOT execute mutable code from that
sibling checkout or from imported theme directories.

Codex Pets remain platform-owned at `<codex-root>/pets/<pet-id>`. A valid package
contains `pet.json` and a local PNG or WebP spritesheet declared by the manifest.
The main process resolves real paths, enforces containment, rejects symlinks and
oversized files, normalizes the Codex sprite contract version, and exposes the
spritesheet through a bounded data URL. The renderer treats the sheet as an
8-column atlas and clips one `192x208`-ratio cell inside a stable preview
viewport. It advances through the six standard idle frames using the Codex idle
timing sequence; v1 uses nine rows and v2 uses eleven rows. The source atlas is
never rendered as a whole-card `<img>`. `prefers-reduced-motion: reduce` pins the
preview to idle frame zero. Import uses atomic staging and rename; delete is
scoped to one validated child directory. Pet files remain outside PromptHub
backup and sync unless a later change adds an explicit portable-asset contract.

All Agents use the same detail shell and stable tab/action placement. Capability state changes control availability, not layout:

- The Agent row, Overview, and detail shell are always clickable.
- `supported` actions are enabled.
- `partial` actions are enabled only for the supported sub-actions; unavailable sub-actions are disabled.
- `planned` and `unsupported` actions remain visible but disabled, with a concise reason in a tooltip or adjacent status label.
- Disabled controls must not open an empty panel, invoke IPC, or imply that installing the Agent will automatically add an unsupported adapter.
- Capability changes must not reorder tabs or cause platform-specific page variants.

### Provider And Model

- Current verified provider and native config status.
- Provider Profile list with activate, test, duplicate, edit, import-current and export actions.
- Diff preview uses field-level rows and masked sensitive values.
- Universal provider projections appear only after P1 support exists.

### Asset Domains

Skills, MCP, Rules and Plugins are direct top-level tabs in the shared Agent shell. Do not add a generic Assets tab, segmented control, or secondary asset navigation. Each page shows installed, available, drifted, blocked and unsupported states for its own domain. Canonical editing opens the owning workspace.

### Config Files

The platform registry and user path overrides remain the source of truth for
the user-level Agent root and preferred/missing config-relative paths. The main
process discovers the rest of the existing editable user configuration surface
below that root; React does not guess filenames or receive unrestricted root
access.

The first config-file batch reuses the existing local file tree/code editor in a constrained mode:

- the editor base is the resolved Agent root;
- existing bounded text configuration files are discovered recursively, while
  declared config-relative paths remain visible before creation;
- missing allowlisted text files may be created by saving them;
- content editing and save are enabled, while rename, delete, arbitrary file creation and arbitrary folder creation are disabled;
- Open Agent folder delegates to the existing validated shell path action;
- authentication artifacts, secret-only files, session stores, logs, caches,
  databases, backups, generated content, Skills and Plugins are excluded by a
  main-owned policy before listing or access;
- embedded secret values are replaced by opaque placeholders before IPC and
  cannot be added, removed, or changed through the raw editor;
- saves use expected-revision protection, format validation, encrypted
  device-local backup, atomic replacement, re-read verification and rollback.

Verified initial declarations include Claude Code `settings.json`, Codex CLI `config.toml`, Gemini CLI `settings.json`, OpenCode `opencode.json`, and Cline's non-credential settings files. Additional platforms use the same UI when their registry metadata is verified; otherwise the stable Config Files tab remains disabled.

Structured adapters and a browsable history/restore UI remain a later
capability layer. The encrypted save snapshots introduced here are the durable
rollback source for direct edits and must compose with that future UI rather
than introduce a second path source.

### Sessions And Usage

Sessions use a searchable, virtualized list and transcript reader. Usage labels evidence source and freshness. Unsupported platforms show the reason, not a blank panel.

### Maintenance

Show executable source/version, update status, roots, permissions, adapter versions, re-detect, open folder, export diagnostics and future install/update actions.

## `DES-AGENT-011`: Tray Integration

The tray menu is a projection of the same Agent query and activation services:

- Agents submenu
- current provider/model state per supported Agent
- alternate Provider Profiles
- open Agent detail
- diagnose or report failure

Tray must not bypass preview policy. For quick switching, the previous accepted preview can be summarized in a confirmation dialog; new conflicts force the full workspace preview.

## `DES-AGENT-012`: Backup, Import, And Deep Links

### Backup

Extend the structured backup envelope with optional versioned sections:

- provider profiles
- model mappings
- redacted snapshot metadata
- Agent workspace preferences
- session source preferences, but not transcript bodies

Restore order:

1. Existing canonical assets and settings
2. Provider Profiles and mappings
3. Agent path resolution and capability detection
4. Secret readiness and native config reconciliation
5. Optional local session rescan

### Portable Export

Provider Profile export includes platform id, protocol, endpoint, model mappings, non-secret config, required secret labels and format version. It excludes active native file snapshots, local backup paths and credentials.

### Deep Link

P1 may introduce `prompthub://import?...` with:

- versioned payload schema and strict maximum length
- allowed object type and URL protocol validation
- decoded redacted preview
- explicit confirmation
- no automatic provider activation
- no logging of raw URL or secret fields

## `DES-AGENT-013`: Proxy And Failover Boundary

Proxy/failover is a future subsystem, not part of provider activation:

- owns local listeners, protocol adapters, routing, health checks, failover queues and request accounting
- requires explicit enablement and visible port/bind configuration
- must never intercept traffic merely because a Provider Profile was selected
- uses separate logs, retention, redaction, threat model and performance tests
- integrates through an optional `AgentProxyAdapter` projection

OAuth reverse proxy and non-public authentication flows require a separate legal/security review and are not assumed to be part of parity.

## `DES-AGENT-014`: Package And Process Ownership

### `packages/shared`

- serializable contracts, capability/status enums and IPC channel names
- no secret values, unrestricted native config, or Electron imports

### `packages/db`

- Provider Profile, model mapping, redacted snapshot, session source/index primitives
- schema, migration, indexes and transactions
- no filesystem inspection or platform parsing

### `packages/core`

- Agent query/orchestration services
- adapter interfaces and registry
- provider reconciliation/planning policy
- asset aggregation contracts
- backup normalization and redaction policy

### Desktop Main

- platform-specific filesystem/process/network adapters
- secure storage bridge
- provider apply/verify/rollback
- session scan/read/resume
- CLI inspection and future installation

### Preload

Expose an `agent` domain composed from smaller modules. Keep existing `window.api`/`window.electron` compatibility.

### Renderer

- list/detail loading, filters, view state and user workflow orchestration
- no direct filesystem, secure storage, native config parsing or canonical asset mutation

## `DES-AGENT-015`: Security And Failure Boundaries

- Validate DTOs, enums, object depth, array length and payload size at IPC.
- Reject traversal, null bytes, device paths, unsafe symlinks and writes outside resolved roots.
- Use executable plus argument arrays; do not interpolate untrusted shell commands.
- Restrict network tests to adapter-approved HTTP(S) protocols, explicit endpoints, redirect limits and private-address policy.
- Redact Authorization, API keys, tokens, cookies, query secrets, env secrets and native config bodies.
- Mark partial results per platform/action; never collapse multi-Agent operations into false global success.
- Keep backups bounded by count/age and exclude them from normal sync.
- Use operation ids and cancellation for scans/tests; ignore late results after cancellation.
- Record adapter version with snapshots so future parsers can explain drift.

## `DES-AGENT-016`: Phased Delivery

### Phase 0: Foundations

- Managed Agent query over the complete existing registry, including stable priority metadata and capability states
- capability contracts and adapter registry
- secure secret abstraction
- Provider Profile schema and backup contract
- fixture and failure harness

### Phase 1: Core CC Switch Parity

- Agents workspace and overview for all built-in and enabled custom Agents
- Claude Code, Codex CLI, Gemini CLI provider adapters
- import/backfill/preview/activate/verify/rollback
- provider/model test
- asset aggregation
- tray switching
- two session adapters

### Phase 2: Breadth And Operations

- Continue adapter coverage across every preset platform according to the capability inventory
- Universal Providers
- quota/model refresh
- CLI install/update/diagnostics
- usage summaries
- deep-link import

### Phase 3: High-Risk Routing

- local proxy and protocol conversion
- failover queues and request telemetry
- optional encrypted sensitive sync
- separately approved OAuth capabilities

## `DES-AGENT-017`: Google Antigravity Product Boundary

Google transitioned the consumer terminal experience from Gemini CLI to
Antigravity CLI (`agy`). Since 2026-06-18, Free, Google AI Pro and Ultra users
are served through Antigravity; Gemini CLI remains supported only for enterprise
licenses, Google Cloud and paid Gemini API keys. PromptHub therefore:

- prioritizes `antigravity` as the current Google Agent;
- marks `gemini` as `enterprise-legacy` with `antigravity` as its replacement;
- preserves the existing `gemini` id, root and adapters for compatibility rather than deleting or silently migrating user data.

The `antigravity` platform represents the shared Antigravity customization surface:

- managed root: `~/.gemini/config`
- Skills: `skills/`
- MCP: `mcp_config.json`
- Plugins: `plugins/`
- global Rules: `../GEMINI.md`
- CLI preferences: `../antigravity-cli/settings.json`

The desktop runtime root `~/.gemini/antigravity` and CLI runtime root
`~/.gemini/antigravity-cli` contain product-owned conversations, artifacts,
caches, credentials, and updater state. They remain discovery/session adapter
inputs only and are not generic asset distribution targets.

## `DES-AGENT-018`: Traceability

| Requirements                                                                                                          | Design                                                                                                                                                                 | Verification                                                                                                                                                                                         | Tasks                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FR-AGENT-001`, `FR-AGENT-002`, `FR-AGENT-018`, `FR-AGENT-019`                                                        | `DES-AGENT-001`, `DES-AGENT-002`, `DES-AGENT-003`, `DES-AGENT-010`, `DES-AGENT-014`, `DES-AGENT-016`, `DES-AGENT-032`                                                  | `TEST-AGENT-001`, `TEST-AGENT-002`, `TEST-AGENT-016`, `TEST-AGENT-019`, `TEST-AGENT-021`, `TEST-AGENT-045`                                                                                           | `T-AGENT-001`, `T-AGENT-002`, `T-AGENT-003`, `T-AGENT-004`, `T-AGENT-006`, `T-AGENT-009`, `T-AGENT-010`, `T-AGENT-011`, `T-AGENT-013`, `T-AGENT-014`, `T-AGENT-020`, `T-AGENT-021B`, `T-AGENT-026`, `T-AGENT-026A`, `T-AGENT-034`, `T-AGENT-073`, `T-AGENT-076`                             |
| `FR-AGENT-003`, `FR-AGENT-004`, `FR-AGENT-005`, `FR-AGENT-006`, `FR-AGENT-007`                                        | `DES-AGENT-004`, `DES-AGENT-005`, `DES-AGENT-006`, `DES-AGENT-012`, `DES-AGENT-033`, `DES-AGENT-034`, `DES-AGENT-035`                                                  | `TEST-AGENT-003`, `TEST-AGENT-004`, `TEST-AGENT-005`, `TEST-AGENT-006`, `TEST-AGENT-007`, `TEST-AGENT-015`, `TEST-AGENT-051`, `TEST-AGENT-052`, `TEST-AGENT-053`                                     | `T-AGENT-005`, `T-AGENT-007`, `T-AGENT-012`, `T-AGENT-015`, `T-AGENT-016`, `T-AGENT-017`, `T-AGENT-018`, `T-AGENT-019`, `T-AGENT-020`, `T-AGENT-027`, `T-AGENT-074`, `T-AGENT-075`, `T-AGENT-077`, `T-AGENT-078`, `T-AGENT-079`, `T-AGENT-086`, `T-AGENT-087`, `T-AGENT-088`, `T-AGENT-100` |
| `FR-AGENT-008`                                                                                                        | `DES-AGENT-002`, `DES-AGENT-007`                                                                                                                                       | `TEST-AGENT-008`, `TEST-AGENT-017`                                                                                                                                                                   | `T-AGENT-013`, `T-AGENT-021`, `T-AGENT-060`, `T-AGENT-076`                                                                                                                                                                                                                                  |
| `FR-AGENT-009`                                                                                                        | `DES-AGENT-006`, `DES-AGENT-010`, `DES-AGENT-015`                                                                                                                      | `TEST-AGENT-006`, `TEST-AGENT-009`, `TEST-AGENT-107`                                                                                                                                                 | `T-AGENT-015`, `T-AGENT-021`, `T-AGENT-021A`, `T-AGENT-144`                                                                                                                                                                                                                                 |
| `FR-AGENT-010`, `FR-AGENT-015`                                                                                        | `DES-AGENT-008`, `DES-AGENT-045`, `DES-AGENT-046`, `DES-AGENT-047`, `DES-AGENT-053`, `DES-AGENT-064` in `session-index-designs.md`                                     | `TEST-AGENT-010`, `TEST-AGENT-011`, `TEST-AGENT-040`, `TEST-AGENT-063`, `TEST-AGENT-064`, `TEST-AGENT-065`, `TEST-AGENT-072`, `TEST-AGENT-082`                                                       | `T-AGENT-008`, `T-AGENT-016`, `T-AGENT-022`, `T-AGENT-028`, `T-AGENT-030`, `T-AGENT-067`, `T-AGENT-069`, `T-AGENT-098`, `T-AGENT-099`, `T-AGENT-101`, `T-AGENT-108`, `T-AGENT-119`                                                                                                          |
| `FR-AGENT-011`                                                                                                        | `DES-AGENT-009`, `DES-AGENT-015`, `DES-AGENT-033`, `DES-AGENT-034`, `DES-AGENT-035`                                                                                    | `TEST-AGENT-012`, `TEST-AGENT-050`, `TEST-AGENT-051`, `TEST-AGENT-052`, `TEST-AGENT-053`                                                                                                             | `T-AGENT-017`, `T-AGENT-018`, `T-AGENT-019`, `T-AGENT-085`, `T-AGENT-086`, `T-AGENT-087`, `T-AGENT-088`                                                                                                                                                                                     |
| `FR-AGENT-012`                                                                                                        | `DES-AGENT-011`, `DES-AGENT-048`, `DES-AGENT-050` in `tray-provider-designs.md`                                                                                        | `TEST-AGENT-013`, `TEST-AGENT-066`, `TEST-AGENT-069`                                                                                                                                                 | `T-AGENT-024`, `T-AGENT-102`, `T-AGENT-105`                                                                                                                                                                                                                                                 |
| `FR-AGENT-013`, `FR-AGENT-016`                                                                                        | `DES-AGENT-012`; `DES-AGENT-061` in `deep-link-designs.md`                                                                                                             | `TEST-AGENT-014`, `TEST-AGENT-015`, `TEST-AGENT-079`                                                                                                                                                 | `T-AGENT-023`, `T-AGENT-031`, `T-AGENT-116`                                                                                                                                                                                                                                                 |
| `FR-AGENT-014`, `FR-AGENT-120`                                                                                        | `DES-AGENT-003`, `DES-AGENT-010`, `DES-AGENT-014`, `DES-AGENT-049`, `DES-AGENT-059`, `DES-AGENT-063`, `DES-AGENT-065`, `DES-AGENT-138` in `maintenance-cli-designs.md` | `TEST-AGENT-016`, `TEST-AGENT-067`, `TEST-AGENT-068`, `TEST-AGENT-078`, `TEST-AGENT-081`, `TEST-AGENT-083`, `TEST-AGENT-198`                                                                         | `T-AGENT-029`, `T-AGENT-103`, `T-AGENT-104`, `T-AGENT-114`, `T-AGENT-118`, `T-AGENT-120`, `T-AGENT-207`                                                                                                                                                                                     |
| `FR-AGENT-017`                                                                                                        | `DES-AGENT-013`, `DES-AGENT-016`                                                                                                                                       | separate change                                                                                                                                                                                      | `T-AGENT-032`, `T-AGENT-033`                                                                                                                                                                                                                                                                |
| `FR-AGENT-020`                                                                                                        | `DES-AGENT-003`, `DES-AGENT-010`, `DES-AGENT-014`, `DES-AGENT-015`                                                                                                     | `TEST-AGENT-020`                                                                                                                                                                                     | `T-AGENT-026B`                                                                                                                                                                                                                                                                              |
| `FR-AGENT-021`                                                                                                        | `DES-AGENT-001`, `DES-AGENT-002`, `DES-AGENT-003`, `DES-AGENT-017`                                                                                                     | `TEST-AGENT-022`                                                                                                                                                                                     | `T-AGENT-026C`                                                                                                                                                                                                                                                                              |
| `FR-AGENT-022`, `FR-AGENT-023`                                                                                        | `DES-AGENT-019`                                                                                                                                                        | `TEST-AGENT-023`, `TEST-AGENT-024`                                                                                                                                                                   | `T-AGENT-040`, `T-AGENT-041`, `T-AGENT-042`, `T-AGENT-043`, `T-AGENT-044`                                                                                                                                                                                                                   |
| `FR-AGENT-024`                                                                                                        | `DES-AGENT-020`                                                                                                                                                        | `TEST-AGENT-004`, `TEST-AGENT-005`, `TEST-AGENT-007`, `TEST-AGENT-013`, `TEST-AGENT-025`, `TEST-AGENT-026`, `TEST-AGENT-027`, `TEST-AGENT-049`                                                       | `T-AGENT-045`, `T-AGENT-046`, `T-AGENT-047`, `T-AGENT-048`, `T-AGENT-049`, `T-AGENT-079`, `T-AGENT-084`                                                                                                                                                                                     |
| `FR-AGENT-025`                                                                                                        | `DES-AGENT-021`                                                                                                                                                        | `TEST-AGENT-028`                                                                                                                                                                                     | `T-AGENT-050`, `T-AGENT-051`, `T-AGENT-052`                                                                                                                                                                                                                                                 |
| `FR-AGENT-026`                                                                                                        | `DES-AGENT-022`                                                                                                                                                        | `TEST-AGENT-029`, `TEST-AGENT-030`, `TEST-AGENT-031`                                                                                                                                                 | `T-AGENT-053`, `T-AGENT-054`, `T-AGENT-055`, `T-AGENT-056`                                                                                                                                                                                                                                  |
| `FR-AGENT-027`                                                                                                        | `DES-AGENT-023`, `DES-AGENT-109`                                                                                                                                       | `TEST-AGENT-032`, `TEST-AGENT-033`, `TEST-AGENT-035`, `TEST-AGENT-037`, `TEST-AGENT-041`, `TEST-AGENT-130`                                                                                           | `T-AGENT-057`, `T-AGENT-058`, `T-AGENT-059`, `T-AGENT-061`, `T-AGENT-065`, `T-AGENT-070`, `T-AGENT-167`                                                                                                                                                                                     |
| `FR-AGENT-028`                                                                                                        | `DES-AGENT-024`                                                                                                                                                        | `TEST-AGENT-034`                                                                                                                                                                                     | `T-AGENT-060`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-029`                                                                                                        | `DES-AGENT-003`, `DES-AGENT-007`, `DES-AGENT-008`, `DES-AGENT-014`, `DES-AGENT-015`, `DES-AGENT-025`; `DES-AGENT-062` in `platform-adapter-designs.md`                 | `TEST-AGENT-036`, `TEST-AGENT-080`                                                                                                                                                                   | `T-AGENT-062`, `T-AGENT-063`, `T-AGENT-064`, `T-AGENT-117`                                                                                                                                                                                                                                  |
| `FR-AGENT-030`                                                                                                        | `DES-AGENT-026`                                                                                                                                                        | `TEST-AGENT-038`                                                                                                                                                                                     | `T-AGENT-067`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-031`                                                                                                        | `DES-AGENT-027`                                                                                                                                                        | `TEST-AGENT-039`                                                                                                                                                                                     | `T-AGENT-068`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-032`                                                                                                        | `DES-AGENT-028`                                                                                                                                                        | `TEST-AGENT-040`                                                                                                                                                                                     | `T-AGENT-069`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-033`                                                                                                        | `DES-AGENT-029`                                                                                                                                                        | `TEST-AGENT-042`, `TEST-AGENT-202`                                                                                                                                                                   | `T-AGENT-071`, `T-AGENT-211`                                                                                                                                                                                                                                                                |
| `FR-AGENT-034`                                                                                                        | `DES-AGENT-030`                                                                                                                                                        | `TEST-AGENT-043`                                                                                                                                                                                     | `T-AGENT-072`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-035`                                                                                                        | `DES-AGENT-031`                                                                                                                                                        | `TEST-AGENT-044`                                                                                                                                                                                     | `T-AGENT-026D`                                                                                                                                                                                                                                                                              |
| `FR-AGENT-036`                                                                                                        | `DES-AGENT-036`                                                                                                                                                        | `TEST-AGENT-054`                                                                                                                                                                                     | `T-AGENT-089`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-037`                                                                                                        | `DES-AGENT-037`                                                                                                                                                        | `TEST-AGENT-055`                                                                                                                                                                                     | `T-AGENT-090`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-038`                                                                                                        | `DES-AGENT-038` in `platform-adapter-designs.md`                                                                                                                       | `TEST-AGENT-056`                                                                                                                                                                                     | `T-AGENT-091`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-039`                                                                                                        | `DES-AGENT-039` in `platform-adapter-designs.md`                                                                                                                       | `TEST-AGENT-057`                                                                                                                                                                                     | `T-AGENT-092`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-040`                                                                                                        | `DES-AGENT-040` in `platform-adapter-designs.md`                                                                                                                       | `TEST-AGENT-058`                                                                                                                                                                                     | `T-AGENT-093`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-041`                                                                                                        | `DES-AGENT-041` in `platform-adapter-designs.md`                                                                                                                       | `TEST-AGENT-059`                                                                                                                                                                                     | `T-AGENT-094`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-042`                                                                                                        | `DES-AGENT-042` in `platform-adapter-designs.md`                                                                                                                       | `TEST-AGENT-060`                                                                                                                                                                                     | `T-AGENT-095`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-043`                                                                                                        | `DES-AGENT-043` in `platform-adapter-designs.md`                                                                                                                       | `TEST-AGENT-061`                                                                                                                                                                                     | `T-AGENT-096`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-044`                                                                                                        | `DES-AGENT-044` in `provider-credential-designs.md`                                                                                                                    | `TEST-AGENT-062`                                                                                                                                                                                     | `T-AGENT-097`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-045`                                                                                                        | `DES-AGENT-051` in `provider-credential-designs.md`                                                                                                                    | `TEST-AGENT-070`                                                                                                                                                                                     | `T-AGENT-106`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-046`                                                                                                        | `DES-AGENT-052` in `provider-credential-designs.md`                                                                                                                    | `TEST-AGENT-071`                                                                                                                                                                                     | `T-AGENT-107`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-047`                                                                                                        | `DES-AGENT-053` in `session-index-designs.md`                                                                                                                          | `TEST-AGENT-072`                                                                                                                                                                                     | `T-AGENT-108`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-048`                                                                                                        | `DES-AGENT-054` in `backup-portability-designs.md`                                                                                                                     | `TEST-AGENT-073`                                                                                                                                                                                     | `T-AGENT-109`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-049`                                                                                                        | `DES-AGENT-055` in `backup-portability-designs.md`                                                                                                                     | `TEST-AGENT-074`                                                                                                                                                                                     | `T-AGENT-110`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-050`                                                                                                        | `DES-AGENT-056` in `backup-portability-designs.md`                                                                                                                     | `TEST-AGENT-075`                                                                                                                                                                                     | `T-AGENT-111`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-051`                                                                                                        | `DES-AGENT-066` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-084`                                                                                                                                                                                     | `T-AGENT-121`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-052`                                                                                                        | `DES-AGENT-067` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-085`                                                                                                                                                                                     | `T-AGENT-122`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-053`                                                                                                        | `DES-AGENT-068` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-086`                                                                                                                                                                                     | `T-AGENT-123`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-054`                                                                                                        | `DES-AGENT-069` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-087`                                                                                                                                                                                     | `T-AGENT-124`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-055`                                                                                                        | `DES-AGENT-070` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-088`                                                                                                                                                                                     | `T-AGENT-125`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-056`                                                                                                        | `DES-AGENT-071` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-089`                                                                                                                                                                                     | `T-AGENT-126`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-057`                                                                                                        | `DES-AGENT-072` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-090`                                                                                                                                                                                     | `T-AGENT-127`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-058`                                                                                                        | `DES-AGENT-073` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-091`                                                                                                                                                                                     | `T-AGENT-128`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-059`                                                                                                        | `DES-AGENT-074` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-092`                                                                                                                                                                                     | `T-AGENT-129`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-060`                                                                                                        | `DES-AGENT-075` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-093`                                                                                                                                                                                     | `T-AGENT-130`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-061`                                                                                                        | `DES-AGENT-076` in `ui-design.md`                                                                                                                                      | `TEST-AGENT-094`                                                                                                                                                                                     | `T-AGENT-131`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-062`                                                                                                        | `DES-AGENT-077`                                                                                                                                                        | `TEST-AGENT-095`                                                                                                                                                                                     | `T-AGENT-132`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-063`                                                                                                        | `DES-AGENT-078`                                                                                                                                                        | `TEST-AGENT-096`                                                                                                                                                                                     | `T-AGENT-133`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-064`                                                                                                        | `DES-AGENT-079`                                                                                                                                                        | `TEST-AGENT-097`                                                                                                                                                                                     | `T-AGENT-134`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-065`                                                                                                        | `DES-AGENT-080`                                                                                                                                                        | `TEST-AGENT-098`                                                                                                                                                                                     | `T-AGENT-135`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-066`                                                                                                        | `DES-AGENT-081` in `conversation-continuation-designs.md`                                                                                                              | `TEST-AGENT-099`                                                                                                                                                                                     | `T-AGENT-136`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-067`                                                                                                        | `DES-AGENT-082` in `conversation-continuation-designs.md`                                                                                                              | `TEST-AGENT-100`                                                                                                                                                                                     | `T-AGENT-137`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-068`                                                                                                        | `DES-AGENT-083` in `conversation-continuation-designs.md`                                                                                                              | `TEST-AGENT-101`                                                                                                                                                                                     | `T-AGENT-138`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-069`, `FR-AGENT-070`                                                                                        | `DES-AGENT-084` in `conversation-continuation-designs.md`                                                                                                              | `TEST-AGENT-102`, `TEST-AGENT-103`                                                                                                                                                                   | `T-AGENT-139`, `T-AGENT-140`                                                                                                                                                                                                                                                                |
| `FR-AGENT-071`                                                                                                        | `DES-AGENT-086` in `conversation-continuation-designs.md`                                                                                                              | `TEST-AGENT-105`                                                                                                                                                                                     | `T-AGENT-142`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-072`                                                                                                        | `DES-AGENT-085`, `DES-AGENT-087` in `conversation-continuation-designs.md`                                                                                             | `TEST-AGENT-104`, `TEST-AGENT-106`                                                                                                                                                                   | `T-AGENT-141`, `T-AGENT-143`                                                                                                                                                                                                                                                                |
| `FR-AGENT-073`                                                                                                        | `DES-AGENT-088`                                                                                                                                                        | `TEST-AGENT-108`                                                                                                                                                                                     | `T-AGENT-145`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-074`                                                                                                        | `DES-AGENT-089`                                                                                                                                                        | `TEST-AGENT-109`                                                                                                                                                                                     | `T-AGENT-146`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-075`                                                                                                        | `DES-AGENT-090`                                                                                                                                                        | `TEST-AGENT-110`                                                                                                                                                                                     | `T-AGENT-147`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-076`                                                                                                        | `DES-AGENT-091`                                                                                                                                                        | `TEST-AGENT-111`                                                                                                                                                                                     | `T-AGENT-148`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-077`                                                                                                        | `DES-AGENT-092`                                                                                                                                                        | `TEST-AGENT-112`                                                                                                                                                                                     | `T-AGENT-149`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-078`                                                                                                        | `DES-AGENT-093`                                                                                                                                                        | `TEST-AGENT-113`                                                                                                                                                                                     | `T-AGENT-150`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-079`                                                                                                        | `DES-AGENT-094`                                                                                                                                                        | `TEST-AGENT-114`                                                                                                                                                                                     | `T-AGENT-151`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-080`                                                                                                        | `DES-AGENT-095`                                                                                                                                                        | `TEST-AGENT-115`                                                                                                                                                                                     | `T-AGENT-152`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-081`                                                                                                        | `DES-AGENT-096`                                                                                                                                                        | `TEST-AGENT-116`                                                                                                                                                                                     | `T-AGENT-153`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-082`                                                                                                        | `DES-AGENT-097`                                                                                                                                                        | `TEST-AGENT-117`                                                                                                                                                                                     | `T-AGENT-154`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-083`                                                                                                        | `DES-AGENT-098`                                                                                                                                                        | `TEST-AGENT-118`                                                                                                                                                                                     | `T-AGENT-155`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-084`                                                                                                        | `DES-AGENT-099`                                                                                                                                                        | `TEST-AGENT-119`                                                                                                                                                                                     | `T-AGENT-156`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-085`                                                                                                        | `DES-AGENT-100`                                                                                                                                                        | `TEST-AGENT-120`                                                                                                                                                                                     | `T-AGENT-157`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-086`                                                                                                        | `DES-AGENT-101`                                                                                                                                                        | `TEST-AGENT-121`                                                                                                                                                                                     | `T-AGENT-158`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-087`                                                                                                        | `DES-AGENT-102`                                                                                                                                                        | `TEST-AGENT-122`                                                                                                                                                                                     | `T-AGENT-159`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-088`                                                                                                        | `DES-AGENT-103`                                                                                                                                                        | `TEST-AGENT-123`                                                                                                                                                                                     | `T-AGENT-160`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-089`                                                                                                        | `DES-AGENT-104`                                                                                                                                                        | `TEST-AGENT-124`                                                                                                                                                                                     | `T-AGENT-161`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-090`                                                                                                        | `DES-AGENT-105`                                                                                                                                                        | `TEST-AGENT-125`                                                                                                                                                                                     | `T-AGENT-162`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-091`                                                                                                        | `DES-AGENT-106`                                                                                                                                                        | `TEST-AGENT-126`                                                                                                                                                                                     | `T-AGENT-163`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-092`                                                                                                        | `DES-AGENT-107`                                                                                                                                                        | `TEST-AGENT-127`                                                                                                                                                                                     | `T-AGENT-164`                                                                                                                                                                                                                                                                               |
| `FR-AGENT-093`                                                                                                        | `DES-AGENT-108`, `DES-AGENT-109`, superseded `DES-AGENT-110`, `DES-AGENT-148`                                                                                          | `TEST-AGENT-128`, `TEST-AGENT-129`, historical `TEST-AGENT-131/132`, `TEST-AGENT-210`                                                                                                                | `T-AGENT-165`, `T-AGENT-166`, historical `T-AGENT-168/169`, `T-AGENT-219`                                                                                                                                                                                                                   |
| `NFR-AGENT-001`, `NFR-AGENT-002`, `NFR-AGENT-003`, `NFR-AGENT-004`, `NFR-AGENT-005`, `NFR-AGENT-006`, `NFR-AGENT-007` | `DES-AGENT-005`, `DES-AGENT-008`, `DES-AGENT-009`, `DES-AGENT-014`, `DES-AGENT-015`, `DES-AGENT-060` in `ui-resilience-designs.md`                                     | `TEST-AGENT-004`, `TEST-AGENT-007`, `TEST-AGENT-009`, `TEST-AGENT-011`, `TEST-AGENT-012`, `TEST-AGENT-015`, `TEST-AGENT-016`, `TEST-AGENT-017`, `TEST-AGENT-018`, `TEST-AGENT-047`, `TEST-AGENT-048` | `T-AGENT-025`, `T-AGENT-035`, `T-AGENT-036`, `T-AGENT-037`, `T-AGENT-038`, `T-AGENT-039`, `T-AGENT-082`, `T-AGENT-083`, `T-AGENT-115`                                                                                                                                                       |
| `NFR-AGENT-004`, `NFR-AGENT-006`                                                                                      | `DES-AGENT-057` in `ui-resilience-designs.md`                                                                                                                          | `TEST-AGENT-076`                                                                                                                                                                                     | `T-AGENT-025`, `T-AGENT-112`                                                                                                                                                                                                                                                                |
| `NFR-AGENT-004`, `NFR-AGENT-006`                                                                                      | `DES-AGENT-058` in `ui-resilience-designs.md`                                                                                                                          | `TEST-AGENT-077`                                                                                                                                                                                     | `T-AGENT-025`, `T-AGENT-113`                                                                                                                                                                                                                                                                |

`T-AGENT-081` is the program-level delivery gate for the in-scope rows above.
It introduces no parallel requirement or design source and cannot substitute
for any row-level task or test. It closes only after every remaining in-scope
task has either passed its linked verification or converged to an
evidence-backed `unsupported` capability declaration.

## `DES-AGENT-078`: Copilot Read-Only Native Session Store

The Copilot History adapter is deliberately separate from the existing
filesystem and native-command readers. It resolves the root using the same
environment precedence as the registry (`COPILOT_HOME`, then the injected
home directory's `.copilot`) and opens only `session-store.db` through the
read-only SQLite adapter. A missing store is an empty result; a symlink,
non-file, missing table, or unreadable database is an explicit unavailable
state. No WAL cleanup, migration, backup, or write transaction is performed.

List queries use parameterized metadata/turn predicates, a count query, and
`LIMIT/OFFSET` pagination. Session titles fall back to the first non-empty
user turn. Search covers summary, cwd, repository, and visible user/assistant
turn text without loading the full transcript. Detail reads cap rows at 128,
each field at 16 KiB, and the complete visible body at 2 MiB; malformed rows
are counted, and only user/assistant text is projected. Metadata carries the
native `copilot --resume=<id>` command and the local source path, while the
adapter remains `partial` because Copilot owns the database schema and
retention lifecycle.

The renderer passes search terms to live adapters even when the persistent
PromptHub session index is disabled. This keeps Copilot's native search
semantics and pagination intact while preserving the existing index boundary
for Claude/Gemini. Complexity is bounded by SQLite's filtered query work plus
the requested page; no recursive scan or unbounded transcript load is
introduced.

## `DES-AGENT-079`: Cline Read-Only Session Sources

The Cline History adapter resolves an injected root or absolute
`CLINE_DATA_DIR` and never starts the Cline CLI or hub. It scans only the
documented `data/sessions/` and compatibility `data/tasks/` directories,
skipping symlinks and bounding the scan at 2,000 files. Session snapshots are
the transcript source of truth. When `data/sessions/sessions.db` is present,
PromptHub opens it read-only and uses an allow-listed `sessions` table only to
enrich metadata and ordering; it never copies rows into PromptHub or treats
the index as a transcript.

Listing reads a bounded metadata prefix and supports pagination plus search
over title, workspace, model, and visible user/assistant text. The legacy task
adapter reads `api_conversation_history.json` and optional
`task_metadata.json`, while a snapshot's id wins when both stores contain the
same id. Detail reads resolve an optional `messagesPath` only after canonical
path containment, hide tool/system records, count malformed array items, cap
visible entries at 256 and the body at 2 MiB, and return an explicit truncated
result for oversized or incomplete JSON. Metadata carries `cline --id <id>`
with a validated workspace cwd when available.

The adapter is intentionally partial: Cline owns the schema, hub lifecycle,
retention, and credential storage. Complexity is `O(n)` over the bounded
candidate scan for live listing/search and `O(p)` for the requested page; no
unbounded recursive parse or native process startup is introduced.

## `DES-AGENT-080`: Cursor Read-Only Agent Transcripts

Cursor's official History and CLI documentation confirms local chat history
and the `cursor-agent ls` / `--resume` workflow, while the current local
runtime stores visible transcript exports under
`projects/<project>/agent-transcripts/<session-id>/<session-id>.jsonl`.
PromptHub resolves an injected Cursor root or `~/.cursor`, scans only that
bounded project/transcript shape, and never opens Cursor's private settings
database, checkpoints, snapshots, authentication state, or caches.

Listing reads only a 64 KiB prefix for the requested page. Search reads the
same bounded prefix for at most 2,000 candidates with eight concurrent file
reads, then applies offset/limit to matching sessions. Details are capped at
2 MiB and expose only visible user/assistant records; system/tool payloads,
malformed records, symlinked sources, and paths outside the configured root
are skipped or counted without mutation. Metadata carries
`cursor-agent --resume <chat-id>` and a project directory label, but does not
invent an absolute workspace path that Cursor's transcript export does not
provide.

The adapter is intentionally `partial`: Cursor owns the local history index,
retention, and runtime lifecycle, and Background Agent chats are remote rather
than part of the local transcript source. Complexity is `O(n)` for the bounded
candidate scan and search, `O(p)` for an unfiltered page, and `O(visible
bytes)` for a selected detail read; concurrency is capped and transcript
bodies never enter PromptHub persistence or sync.

## `DES-AGENT-032`: Machine-Readable Capability Inventory

The canonical platform registry remains the only source of path, asset, launch,
and built-in identity facts. A shared capability projection derives those facts
and combines them with an explicit deep-adapter declaration for every built-in
platform.

- Each capability is one of `supported`, `partial`, `planned`, or
  `unsupported`, and every declaration carries a non-empty evidence code.
- Deep adapters (`providerModel`, `sessions`, `usage`, and `appearance`) are
  declared explicitly for all 31 built-ins so an omitted platform fails a test.
- Path-owned capabilities are derived from `SKILL_PLATFORMS`; the inventory
  must not duplicate path strings or infer a working protocol from a filename.
- Custom Agents derive only registry-backed path capabilities. They inherit no
  deep protocol support from a built-in platform with a similar directory.
- Renderer capability summaries are projections of this inventory, not a
  second set of hard-coded platform id allowlists.

## `DES-AGENT-019`: Overview Navigation Hub And Claude Quota Adapter

Batch confirmed on 2026-07-20; implements `FR-AGENT-022` and `FR-AGENT-023`.

### Overview data sources (no new owning state)

- Skills/MCP/Rules/Plugins counts reuse the existing domain stores via `use-agent-asset-domain.ts` (skill scan cache, MCP target status, rules files, plugin target matrix).
- Sessions total comes from `agent:sessions:list`; provider/model summary from `agent:modelConfig:get`; appearance state from `agent:appearance:get`; usage from the new `agent:usage:get`.
- The Overview tab receives an `onNavigate(tab)` callback from `AgentsWorkspace`; there is no second navigation state store. Cells whose capability is `planned`/`unsupported` render disabled and never invoke IPC.
- The flat paths panel is collapsed into a secondary region inside the Paths & capabilities card. Shared Skills/MCP/Plugins inventory toolbars omit raw paths so search, filters, refresh and the primary action remain compact; actionable paths stay on the relevant card, detail view and explicit open-folder control.

### Quota adapter contract

- Shared types in `packages/shared/types/agent.ts`: `AgentUsageWindow { utilization, resetsAt }`, `AgentUsageQuota { agentId, adapter, status, source: "provider", fiveHour, sevenDay, sevenDayOpus, plan, fetchedAt, errorCode? }`; status is one of `ok | no-credentials | expired | unavailable`.
- IPC channel `agent:usage:get` in `packages/shared/constants/ipc-channels.ts`; preload exposes `agent.getUsage(agentId)`.
- Credential resolution (main process only, via `native-command` runner and bounded file reads): macOS Keychain service `Claude Code-credentials`, then hashed variant `Claude Code-credentials-<sha256(expandedRoot).slice(0,8)>`, then `<root>/.credentials.json` honoring the configured root override; token is read from `claudeAiOauth.accessToken`; a present `expiresAt` short-circuits to `expired` before any network call.
- Query: `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20`, 10s timeout; response `five_hour` / `seven_day` / `seven_day_opus` (`utilization`, `resets_at`) mapped to the contract; 401 maps to `expired`; other failures map to `unavailable` with categorized `errorCode`.
- In-memory result cache per agent for 60s; the cache never stores the token. Manual refresh bypasses the cache. No background polling in this phase.
- Capability flip: `buildCapabilities` marks `usage` as `supported` for `claude` only; every other platform stays `planned`.

### UI composition

- New `AgentOverviewPanel.tsx` owns the overview content so `AgentsWorkspace.tsx` stays within file-size policy; styling uses neutral design tokens only (`bg-card`, `bg-muted`, `border-border`, `text-muted-foreground`, `border-primary` for selection).
- New `AgentUsagePanel.tsx` renders the five-hour and seven-day windows with utilization bars, reset countdowns, a provider-reported label, a refresh action, and guided states for `no-credentials` / `expired` / `unavailable`. The overview usage cell summarizes both windows and navigates to the tab.
- All copy goes through i18n across the seven locales.

## `DES-AGENT-020`: Codex Third-Party Providers With Managed Keys

Batch confirmed on 2026-07-20; implements `FR-AGENT-024`.

### Source of truth and custody split

The 2026-07-20 implementation used `config.toml` as the management source of
truth. That transitional boundary is superseded by the user-confirmed unified
Profile migration on 2026-07-28:

- SQLite `agent_provider_profiles` and
  `agent_provider_model_mappings` are PromptHub's management source of truth.
  `config.toml` is the Codex runtime projection and may also contain
  externally-owned entries that PromptHub must reconcile rather than silently
  adopt.
- API keys have two representations only when Codex runtime requires it:
  encrypted custody under `agent-provider:<profileId>` and a verified native
  projection (`experimental_bearer_token`). Entries using `env_key` keep the
  credential external and store no secret.
- The legacy `codex-provider:<providerId>` namespace is migration input, not a
  second durable source. It remains untouched until explicit user consent and
  is removed only after the selected migration batch verifies completely.
- Declining migration preserves legacy behavior and data. It does not create a
  Profile, copy or delete a credential, or rewrite `config.toml`.

### CC Switch source reference and migration

CC Switch stable `v3.18.0`
(`606e7bbe75db7f8285f7a3be006fac22b5d22796`, MIT) is pinned at the sibling
checkout `/Users/lingxiaotian/Programs/public/cc-switch`. Its SQLite Provider
library, explicit import, live projection, atomic Codex writes and rollback
orchestration are the reference workflow. PromptHub adapts those boundaries to
the existing TypeScript/Electron architecture and does not copy CC Switch's
plaintext credential-in-`settings_config` storage.

Migration is main-process orchestration:

1. Parse the current Codex Provider entries and discover legacy managed,
   external environment and native-inline credential states.
2. Return a bounded public preview containing only provider identity,
   endpoint/protocol/model metadata, active state and credential readiness.
3. Require an explicit request containing selected provider ids and the
   preview digest. A stale digest cancels migration.
4. Create Profile records and model mappings, copy selected credential
   material directly between main-process secret boundaries, and verify the
   new public readiness state.
5. After every selected Provider succeeds, remove legacy secret refs. If any
   create, copy, verify or cleanup step fails, restore cleared legacy refs and
   remove all Profile records and new refs created by that request.
6. Leave `config.toml` byte-identical. Activation is a separate reviewed
   operation and owns backup, atomic write, re-read verification and rollback.

The algorithm is linear in selected Provider count and performs one bounded
native-config parse, one batched legacy-secret read and at most one Profile
transaction plus two secret-store writes per selected Provider. Migration
concurrency is serialized per platform; no unbounded request or retry loop is
introduced.

### Secret store

- `agent-secret-store.ts` remains the main-only encrypted boundary. New Profile
  ownership uses `agent-provider:<profileId>`. The old
  `codex-provider:<providerId>` namespace is read only by the migration
  orchestrator and is never returned across IPC. Unavailable encryption fails
  closed with a categorized error.

### Provider service and write pipeline

- `agent-codex-provider-adapter.ts` is the only Codex activation writer used by
  the unified Profile service. It implements
  `inspect/import/plan/apply/verify/rollback`, requires an explicit Provider id
  and one primary model mapping, validates protocol and endpoint policy, and
  preserves unrelated TOML keys, tables and comments.
- Activation resolves `agent-provider:<profileId>` only in main memory,
  creates a safeStorage-encrypted device-local backup, checks the preview
  digest, writes `config.toml` atomically with mode `0600`, re-reads semantic
  state and rolls back on any write or verification failure. It does not edit
  `auth.json`.
- `agent-codex-provider-service.ts` remains main-only migration input for
  inspecting legacy native entries and credentials. Its legacy list/upsert/
  remove/set-default/test IPC and preload surface has been removed; it is not a
  second management API.
- `agent-codex-provider-adapter.ts` exposes isolated connection inventory and
  explicit streaming model tests through the unified activation service. Both
  use main-process credentials, the same validated target boundary, bounded
  resources and stable redacted results; activation still makes no implicit
  network request.

### Contract

- Shared Provider Profile, model-mapping, migration-preview and activation
  contracts in `packages/shared/types/agent.ts` contain public metadata and
  readiness only. They never contain secret material or a secret-store
  reference.
- Renderer operations use the unified Profile CRUD, migration and
  import/preview/activate IPC channels. Main validates every request and emits
  stable `AGENT_PROVIDER_*` failures without native paths or credentials.
- Renderer credential input is write-only. Edit preserves the existing
  credential unless the user explicitly replaces or clears it; the current
  value is never prefilled or returned.

### UI

- The unified `AgentProviderProfileWorkbench` is the final Codex Provider
  surface. Before the first migration it shows a non-blocking migration review
  entry; the review lists each legacy Provider and credential source, selects
  nothing silently, and provides explicit migrate / not-now actions.
- The legacy `AgentProviderModelPanel.tsx` and
  `AgentCodexProviderFormDialog.tsx` renderer surfaces were removed after
  migration, full activation, encrypted rollback, unit regression and Electron
  consent/activation E2E gates passed. There is one renderer management source
  for Codex Providers.
- Migration review, failure/retry state and the unified workbench use neutral
  design tokens, keyboard/reader semantics and all seven locales.

## `DES-AGENT-021`: Desktop-Native Workspace Layout

Batch confirmed on 2026-07-20; implements `FR-AGENT-025`.

### Shell rules (all tabs)

- `AgentWorkspacePanel` drops the page canvas (`px-6/py-7/sm:px-8` outer margins and `max-w-6xl` centering are removed); every tab root becomes `flex h-full min-h-0 flex-col` and touches the workspace dividers.
- Each tab owns a compact toolbar row (`border-b border-border`, title + counts + primary actions) that never scrolls; the content region below it is the only scroll container (`flex-1 min-h-0 overflow-y-auto`).
- Primary surfaces are flat panes separated by hairline borders; rounded shadow cards remain only for genuine summary groups inside the Overview dashboard.
- Neutral design tokens only; semantic status colors unchanged.

### Direct domain tabs

- Tabs: Overview, Skills, MCP, Rules, Plugins, Provider & Model, Appearance, Config Files, Sessions. Metadata lives in `agent-workspace-tabs.ts`.
- Skills, MCP, Rules, and Plugins are direct top-level destinations rendered by `AgentAssetsWorkspace.tsx`; no generic Assets tab, segmented control, or secondary navigation is present. Each domain remains capability/path gated.
- Overview asset cells navigate directly to the owning domain tab. The header does not duplicate asset-domain actions.
- Maintenance tab removed; refresh and open-settings actions move into the workspace header overflow (`...`) menu.

### Per-tab composition

- Provider & Model: master-detail. Left list = built-in OpenAI subscription entry + third-party providers + add action; right detail = selected provider's config, model selection, key state, test, set-default/restore, edit/delete for third-party entries. Other agents get the same shell with only the built-in entry.
- Config Files: toolbar (file count + open folder) with the editor filling the remaining height edge-to-edge.
- Appearance: compact left icon rail switches between focused desktop-skin and
  Pet workspaces. Each workspace owns one contextual import action, scoped
  invalid count, inventory, folder action and shared refresh; native status and
  restore exist only in the desktop-skin workspace.
- Usage: the 5h / 7d / Opus window cards render side by side in one row instead of stacking vertically.
- Sessions: keeps its existing two-pane layout, re-based onto the edge-to-edge shell.
- Overview: dashboard content keeps internal section padding (that is content spacing, not a page margin); status strip and grid touch the pane edges.
- Overview path details use native disclosure semantics but start open so raw
  resolved paths and open-folder actions are visible by default.

## `DES-AGENT-022`: Codex Quota Adapter And Provider-Aware Overview

Batch confirmed on 2026-07-21; implements `FR-AGENT-026`.

### Codex quota path

- `agent-usage-service.ts` gains a Codex adapter alongside the Claude one, selected by agent id through the same registry guard.
- Credential: parse `<root>/auth.json` (`tokens.access_token`, `tokens.account_id`); missing file/tokens -> `no-credentials`; no keychain variant exists for Codex.
- Query: `GET https://chatgpt.com/backend-api/wham/usage` with `Authorization: Bearer` and optional `ChatGPT-Account-Id`, 10s timeout; 401/403 -> `expired`; other failures categorized as before. Token isolation rules identical to the Claude adapter (main-process only, 60s result cache, no persistence/logs/refresh).
- Window mapping: `rate_limit.primary_window` and `secondary_window` are classified by `limit_window_seconds` (<= 86400 -> `fiveHour`, otherwise -> `sevenDay`); `reset_at` (epoch seconds) -> `resetsAt` ms; `plan_type` -> `plan`; `sevenDayOpus` stays null for Codex.

### Provider-aware behavior

- Before querying, the adapter resolves the active `model_provider` from `config.toml`; anything other than `openai`/unset returns `status: "unavailable"` with `errorCode: "custom-provider-active"` without a network call.
- Claude has the same short-circuit (added 2026-07-21): when `settings.json` sets `env.ANTHROPIC_BASE_URL` or a cloud-provider flag (`CLAUDE_CODE_USE_BEDROCK`/`VERTEX`/`FOUNDRY`), the official Anthropic quota endpoint is not queried and the adapter returns `custom-provider-active`; the Overview Provider & Model cell then shows the sanitized gateway endpoint and model instead of the official model summary.

## `DES-AGENT-023`: Polymorphic Multi-Agent Quota

Batch confirmed on 2026-07-21; implements `FR-AGENT-027`.

### Contract

- `AgentUsageQuota` replaces `fiveHour`/`sevenDay`/`sevenDayOpus` with `metrics: AgentUsageMetric[]`. A metric is `{ id, label, kind: "window" | "quota", utilization, resetsAt, usedAmount?, totalAmount?, unit? }`; amounts are present only for `quota` kind. All existing status/errorCode semantics stay.
- Metric id registry for i18n: `fiveHour`, `sevenDay`, `sevenDayOpus` (Claude/Codex), `weekly`, `rolling` (Kimi), `premium`, and `chat` (Copilot); any other id (e.g. Antigravity/Gemini model quotas) renders its provider label.

### Adapters

- Claude/Codex adapters keep their query logic and re-map results into `metrics` (ids above).
- Kimi: read `~/.kimi-code/credentials/kimi-code.json` (fallback `~/.kimi-code/oauth/kimi-code*`) for `access_token`/`expires_at`; `GET https://api.kimi.com/coding/v1/usages`. Map `usage` -> `weekly` (limit/used/resetTime), `limits[]` entries -> `rolling` with duration-derived label, `membership.level` -> plan. Verified live 2026-07-21.
- Kimi membership presentation maps current provider enums to public tempo plan names (`LEVEL_STANDARD` -> `Moderato`, `LEVEL_INTERMEDIATE` -> `Allegretto`, `LEVEL_ADVANCED` -> `Allegro`, `LEVEL_PREMIUM` -> `Vivace`) and keeps a readable fallback for unknown future values.
- Antigravity: first discover the running Antigravity `language_server` process with bounded `ps` output, require both an Antigravity process marker and a valid CSRF argument, enumerate only loopback listening ports, and use fixed allowlisted RPC paths with a 4s timeout and 1 MiB response limit. `GetUserStatus` supplies plan identity only; `RetrieveUserQuotaSummary` supplies the authoritative grouped weekly and five-hour baseline buckets for Gemini models and third-party Claude/GPT models. Legacy `monthlyPromptCredits` and `availablePromptCredits` fields are not a baseline total and are ignored. AI credits are an overage mechanism and require a separately verified balance source before PromptHub may expose them. The CSRF value never leaves main-process memory or enters logs/errors. If no trusted desktop process exists on macOS, PromptHub may start the native `language_server` only from the verified `/Applications/Antigravity.app` or `~/Applications/Antigravity.app` resource path, with fixed arguments, telemetry and the built-in Chrome DevTools MCP disabled, a reserved loopback port, a random in-memory CSRF token, bounded startup/output/request limits, and no shell. The helper's IDE version is read through bounded `plutil` access to the verified app's `Info.plist`, with a sanitized compatibility fallback; PromptHub binds and waits for the explicitly announced HTTP listener rather than sending JSON RPC to the HTTPS gRPC port. Startup-only connection, timeout, and HTTP readiness failures retry with a bounded delay and overall deadline. The helper is terminated after every success or failure and escalates from `SIGTERM` to `SIGKILL` when necessary. The quota-summary request runs first so grouped quota remains available even when the optional account-status request fails. macOS Keychain (`service=gemini`, `account=antigravity`), legacy Antigravity CLI token, and shared Gemini credential reads remain compatibility fallbacks when the helper is absent or unavailable. PromptHub does not copy Antigravity OAuth client credentials or refresh its tokens itself; `antigravity-not-running` remains only a recovery state when neither a running service nor the bounded helper can provide current quota.
- Gemini CLI: read `~/.gemini/oauth_creds.json` (`expiry_date` ms); POST `loadCodeAssist` then `retrieveUserQuota`; buckets -> `quota` metrics by `modelId`, tier -> plan.
- Copilot: resolve a GitHub OAuth token from `~/.config/gh/hosts.yml` then `~/.config/github-copilot/hosts.json`; `GET https://api.github.com/copilot_internal/user` with `Authorization: token`; map `quota_snapshots.premium_interactions`/`chat` (entitlement/remaining/percent_used) -> `premium`/`chat` quota metrics, `quota_reset_date` -> resetsAt, `copilot_plan` -> plan.
- Cursor stays `planned` (no public quota API; documented exclusion).

### UI

- The banner iterates `metrics`: reset windows render as ring gauges; only quota metrics with numeric `usedAmount` and `totalAmount` render as progress bars. Antigravity group ids combine the provider group label with localized weekly/five-hour labels. The layout remains bounded to five visible metrics, which fits four Antigravity window rings plus its monthly credit total.

### Native application launch

- `SkillPlatform.launchPaths` owns an operating-system-specific allowlist of desktop application paths. Renderer state exposes only a `launchable` capability bit.
- `agent:launch` accepts an Agent id, resolves its platform in main, checks only the declared candidates, and uses Electron `shell.openPath` so an existing app is focused instead of duplicated. Renderer-provided paths and shell command strings are never accepted.
- `buildCapabilities` marks `usage` supported for `claude`, `codex`, `kimi`, `antigravity`, `gemini`, `copilot`.

## `DES-AGENT-024`: Skill Asset Cards In The Agent Workspace

Batch confirmed on 2026-07-21; implements `FR-AGENT-028`.

### Composition (renderer-only, no new main-process surface)

- The Skills domain of `AgentAssetsWorkspace` renders `AgentSkillAssetPanel`: toolbar (search, managed/unmanaged/symlink/copy filter chips, refresh, "Add Skill") plus a responsive card grid. Skills, MCP and Plugins now render through the same `AgentAssetManagementSurface`, `AgentAssetPrimaryAction`, `AgentAssetCard` and `AgentAssetActionButton` primitives rather than duplicating visually similar toolbar, primary action, grid, card and action markup. The shared toolbar never renders a raw asset path; locale-specific filter labels and Add labels come from each domain's seven-locale resource tree. It remains one non-wrapping row: the filter strip owns bounded horizontal overflow while refresh and the shared Add action remain fixed on the right. Add Skill, Add MCP and Add Plugin each open an Agent-scoped library dialog over the current workspace; MCP and Plugin dialogs write only through the owning stores to verified targets already scoped to that Agent. Domain panels retain only scoped selectors, card body content, detail routes and owning-store actions; Rules retain their editor workspace.
- Rows reuse `agentScanState[agent.id]` from the skill store and `getSkillScanStatus` for badge semantics — the same source of truth as `SkillAgentsView`; `AgentAssetItem` is not extended; the panel consumes `AgentScannedSkill` directly via a dedicated hook.
- Actions map one-to-one to existing flows: open folder (`window.electron.openPath`), adopt (`useSkillStore.importScannedSkills` with the `handleImportAgentSkill` hydration pattern), open managed skill (jump to the Skills module my-skills view), install from library (`SkillLibraryImportModal` with the agent's skills dir as fixed target), uninstall (`skillApi.uninstallPlatformSkill` + `ConfirmDialog`, built-in blocked).
- Card click opens `SkillFullDetailPage` with `overrideSkill` + `agentContext` + `agentActions` (the `buildProjectDetailSkill` adapter), replacing the right pane with a back action — the same drill-in contract as the Skills module, embedded in the workspace shell.
- Usage UI renders a dedicated custom-provider state for that code. `buildCapabilities` marks `usage` supported for `codex` as well as `claude`.
- Overview Provider & Model cell: built-in active -> current model + credential state; third-party active -> sanitized base URL + model from `listProviders`/`getModelConfig`.
- Overview "Paths & capabilities": the capability grid is removed; the collapsible paths list remains and each row gets an open-folder action via `window.electron.openPath`.

### Usage banner revision (2026-07-21)

- The standalone Usage tab is removed (tab bar 7 -> 6); usage is not a functional page but dashboard data.
- The Overview renders a usage banner above the navigation grid when the usage capability is supported/partial: SVG ring gauges per window (`fiveHour`/`sevenDay`/`sevenDayOpus` when present) with centered utilization percentage, window label, reset countdown, plan badge, provider-reported label, and a refresh action. Rings use neutral track with threshold-toned strokes (<70% primary, 70-90% amber, >=90% destructive); single-window responses render gracefully without empty placeholders.
- Guided states reuse the existing mappings (no-credentials / expired / unavailable / `custom-provider-active`) in compact banner form.
- `AgentUsagePanel.tsx` is repurposed into the overview banner component; the usage navigation cell is removed from the grid.

## `DES-AGENT-031`: Codex / ChatGPT Presentation Identity

Batch confirmed on 2026-07-21; implements `FR-AGENT-035`.

- `codex` remains the stable platform id and `~/.codex` remains the native data root. Name and icon preferences are renderer presentation settings and do not alter platform detection, filesystem paths, IPC, provider ids, sessions, assets, or appearance adapters.
- The default registry name becomes `Codex`. A normalized `agentIdentityPreferences.codex` setting independently stores an allowlisted name choice (`codex | chatgpt`) and icon choice (`codex | chatgpt`). Missing values default to Codex; malformed values are rejected field by field.
- A pure identity projection resolves the display name and icon id before managed Agents are sorted, searched, or rendered. `ManagedAgentSummary` carries the resolved icon id so list and detail surfaces use the same identity source.
- `PlatformIcon` owns both bundled icon choices. The ChatGPT choice packages the complete 1024 px Aqua and Dark Aqua Blossom assets extracted at development time from the locally installed ChatGPT app asset catalog; app-controlled theme classes select the matching file without a runtime dependency on `/Applications/ChatGPT.app`. Settings may select only bundled ids; arbitrary paths, data URLs, and remote URLs are not accepted.
- `CodexIdentityFields` is embedded only in the built-in Codex row's existing edit panel, beside the root and asset-path fields. It is not a standalone settings section. Name and icon changes share the Agent editor's draft, Save, Cancel, and Reset lifecycle; Save refreshes the managed Agent projection without restarting the application.
- Each name and icon choice is an `aria-pressed` segmented control. The active choice uses a solid primary surface, primary border, contrasting text, and an explicit check mark so selection does not depend on a subtle shadow or color nuance.
- The preference is part of the persisted settings state and therefore follows the existing non-sensitive settings snapshot, backup, restore, and sync contract.

## `DES-AGENT-025`: Qwen Code Platform Boundary

This design implements `FR-AGENT-029`. Qwen Code uses stable platform id
`qwen` and display name `Qwen Code`. It is not an alias for `qoder`; both
entries may coexist because they identify different installed products and
different local data contracts.

### Root and scope resolution

1. A PromptHub user override wins.
2. A non-empty `QWEN_HOME` resolves the user configuration root. Relative values
   are resolved using Qwen Code's documented current-working-directory rule;
   PromptHub stores and returns the normalized absolute path.
3. Otherwise the user root is `~/.qwen` on macOS/Linux and the equivalent home
   expansion on Windows.
4. `QWEN_RUNTIME_DIR` resolves conversations, logs, and todos only. It never
   replaces the user configuration root or a project `.qwen/` directory.
5. Project assets are resolved from the selected repository, never by joining
   them under the user root.

### Capability and ownership matrix

| Domain         | User scope                                                                      | Project scope                                     | PromptHub policy                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills         | `<QWEN_HOME>/skills/<name>/` and compatibility discovery in `~/.agents/skills/` | `.qwen/skills/<name>/`                            | Manage the complete package, including `SKILL.md`, scripts, templates, and resources. Write to the native `.qwen/skills` target; treat `.agents/skills` as compatibility discovery unless the user selects it explicitly. |
| SubAgents      | `<QWEN_HOME>/agents/*.md`                                                       | `.qwen/agents/*.md`                               | Model as Agent assets with YAML-frontmatter validation; do not confuse these definitions with the Qwen Code platform itself.                                                                                              |
| MCP            | `<QWEN_HOME>/settings.json` `mcpServers`                                        | `.qwen/settings.json` `mcpServers`                | Prefer the native `qwen mcp` command when it can express the requested operation; otherwise perform a structured JSON merge that preserves unrelated settings and supports backup/verify/rollback.                        |
| Rules          | `<QWEN_HOME>/QWEN.md`                                                           | repository `QWEN.md`; local `.qwen/QWEN.local.md` | Expose the three documented scopes and their precedence. Never fold auto-memory into Rules.                                                                                                                               |
| Extensions     | `<QWEN_HOME>/extensions/<name>/qwen-extension.json`                             | `.qwen/extensions/<name>/qwen-extension.json`     | Use native extension lifecycle commands. Extension-provided Skills, SubAgents, MCP, and commands are derived/read-only children of the parent bundle.                                                                     |
| Commands       | `<QWEN_HOME>/commands/*.md`                                                     | `.qwen/commands/*.md`                             | Discovery-first. A later Commands domain may manage them; they are not Skills or Plugins by inference.                                                                                                                    |
| Provider/model | `<QWEN_HOME>/settings.json`                                                     | `.qwen/settings.json`                             | Inspect redacted model/provider identity. Secret-bearing provider or `env` fields remain main-process only until a Qwen-specific secret write contract passes.                                                            |
| Sessions       | runtime root `projects/<sanitized-project>/chats/`                              | native CLI project selection                      | Prefer `qwen sessions list --json`; page and parse bounded native results rather than recursively scanning the runtime root.                                                                                              |

Qwen Code applies settings in layers: defaults, system defaults, user, project,
system overrides, environment variables, and CLI flags. PromptHub may edit only
the explicit user/project layer chosen by the user and must not imply that a
lower-precedence value is active when a higher-precedence layer overrides it.

### Secret and runtime exclusions

- Exclude `mcp-oauth-tokens.json`, `mcp-oauth-tokens-v2.json`, credentials,
  provider API keys, expanded `env` values, MCP headers/environment values,
  OAuth client secrets, and authentication caches from renderer payloads,
  diagnostics, normal backup, export, and sync.
- Exclude sessions, runtime sidecars, logs, todos, auto-memory under
  `projects/<project>/memory/`, and `.qwen/team-memory/` from normal backup and
  sync. Team memory is opt-in shared project state owned by Qwen Code, not a
  PromptHub Rule or Skill.
- A settings write is `read -> parse -> normalize requested subtree -> preview
-> backup -> digest check -> atomic replace -> re-read -> semantic verify ->
rollback on failure`. Complexity is linear in the settings file size and uses
  one bounded read plus one staged write; no recursive asset scan is required.
- Session listing delegates to the native CLI with a timeout and output byte
  cap. PromptHub retains only the requested bounded metadata page and never
  loads every transcript into memory.

### Implementation gate

Each Qwen capability may move from planned to supported only after its matching
`TEST-AGENT-036` fixtures cover the relevant environment overrides, scope,
package ownership, secret redaction, bounded failure paths, rollback, and
backup/sync exclusions. The overall task remains incomplete until project
SubAgent parsing, Commands discovery, and Electron E2E also pass; those missing
surfaces do not roll back already verified registry, Skill, MCP, Rules, model,
extension, or read-only session adapters.
An official Qwen/Qwen Code mark with recorded provenance is required; a generic
letter fallback may be used only as the runtime fallback, not as the bundled
brand asset.

## `DES-AGENT-026`: Common-Agent Session Adapter Breadth

This design implements `FR-AGENT-030` without creating a second session store.
Agent-owned files and native indexes remain the source of truth; PromptHub keeps
no transcript copy and exposes only bounded list/read results over the existing
`agent:sessions:*` IPC contract.

- Codex: scan only `sessions/**/*.jsonl` and `archived_sessions/*.jsonl` below
  the resolved Codex root, deduplicate by `session_meta.payload.id`, derive the
  title from the first visible `event_msg.user_message`, and render only visible
  user/assistant event messages. Resume is `codex resume <id>`.
- Grok Build: scan only `<root>/sessions/<encoded-project>/<session-id>/`, read
  bounded `summary.json` metadata and `chat_history.jsonl`, ignore lock/terminal/
  artifact files, and resume with `grok --resume <id>` in the decoded project
  directory when it is absolute.
- OpenClaw: read the bounded legacy per-agent `sessions/sessions.json` index and
  its referenced JSONL transcript only when both resolve beneath the configured
  OpenClaw root. Newer native/SQLite stores remain a later native-CLI adapter;
  the legacy reader is read-only and never runs cleanup/compact/delete.
- Qwen Code: use bounded `qwen sessions list --json --limit N` output and accept
  a transcript path only when its real path remains below `QWEN_RUNTIME_DIR`.

All adapters cap discovered files, metadata bytes, transcript bytes, entry text,
and native command output. Listing is `O(n log n)` for at most the configured
scan cap; selected transcript reads are `O(min(fileSize, 2 MiB))`. No adapter
follows directory symlinks, writes Agent state, or includes transcript bodies in
backup, sync, export, logs, or default overview payloads.

## `DES-AGENT-028`: Paged Session Metadata And Progressive Transcript Rendering

The existing `agent:sessions:list` contract gains a validated `offset` while
retaining a bounded `limit`. Renderer pages contain 50 metadata records. Native
CLI adapters request at most `offset + limit` rows only when the upstream CLI
does not provide a cursor, then slice locally; filesystem adapters scan only
their allowlisted indexes and hydrate metadata for the requested window. The
maximum offset remains capped by the existing 2,000-file discovery ceiling.

The renderer appends pages by stable session id, exposes the native total and a
Load More action, and applies `content-visibility: auto` to off-screen session
rows. A selected transcript remains an on-demand read capped at 2 MiB and 64 KiB
per entry. Only the first 80 entries are mounted initially; later batches are
added explicitly, and the existing truncation notice remains visible when the
source exceeded the byte cap. This keeps list memory `O(loaded metadata)` and
mounted transcript work `O(visible batch)` rather than `O(all native history)`.

OpenCode remains native-CLI owned, but `opencode session list --format json` is
working-directory scoped and therefore cannot back a global Agent History
view. PromptHub uses the read-only `opencode db` command to page session
metadata, total count, message count, and calculated size directly from the
current native database. Detail remains `export --sanitize`, while deletion and
resume remain native CLI commands. An empty successful database projection is
an empty history, not an adapter failure; plugin sidecars are never substituted
for missing session rows.

## `DES-AGENT-027`: In-Workspace Agent Settings Dialog

This design implements `FR-AGENT-031` without creating a second settings
workflow. `AgentsWorkspace` owns only the modal open state. The dialog reads
effective built-in configuration from the platform registry, existing
`builtinAgentOverrides`, and the current managed Agent path; custom Agent drafts
come from `customAgents`.

`AgentSettingsDialog` reuses `BuiltinAgentEditor`, including the Codex/ChatGPT
identity controls, and persists with `updateBuiltinAgentOverride`,
`setCodexIdentityPreference`, or `updateCustomAgent`. Those existing actions
remain responsible for normalization, validation, main-process synchronization,
and managed-Agent refresh. The dialog therefore owns no durable state and does
not duplicate filesystem or settings logic.

Opening, editing, resetting, saving, validation failure, and closing are bounded
UI operations over one Agent draft, with `O(f)` time and memory where `f` is the
small fixed number of editable path fields. Changing the selected Agent closes
the modal so a stale draft cannot be applied to a different target.

## `DES-AGENT-029`: Oh My Pi Native Boundary

This design implements `FR-AGENT-033` for issue #187. Oh My Pi is represented
by the stable platform id `oh-my-pi` and the display name `Oh My Pi`; no
presentation alias with a `CLI` suffix is introduced.

### Roots and assets

- The default user root is `~/.omp/agent`. `PI_CODING_AGENT_DIR` is resolved
  through the existing platform-root service and wins when it is an absolute
  path; PromptHub settings overrides remain higher priority through the same
  service.
- User Skills live at `<root>/skills`, global Rules at `<root>/RULES.md`, and
  user MCP at `<root>/mcp.json`. A project target is `<project>/.omp/mcp.json`.
- Oh My Pi plugins are installed by the native runtime below the sibling
  `<root>/../plugins` data root (normally `~/.omp/plugins`). PromptHub reads the
  official version 2 `installed_plugins.json` registry from this root and
  projects only `scope: "user"` packages into the shared Plugin inventory.
- Registry parsing is read-only and bounded to 1 MiB. Every package path is
  resolved through `realpath` and must remain below the same plugin data root;
  duplicate paths, project-scoped entries, missing packages, symlink escapes,
  invalid versions and malformed or oversized registries are ignored. The
  authoritative registry may point to a multi-capability package without a
  generic manifest marker.
- PromptHub does not read or write Oh My Pi's `agent.db`, auth broker or
  credentials, and it does not install, update, enable or remove native Oh My
  Pi packages. Those lifecycle operations remain owned by Oh My Pi.
- Config Files uses an allowlist of `config.yml`, `config.yaml`,
  `settings.json`, `mcp.json`, `.mcp.json`, and `RULES.md`. Credentials,
  session files, caches, and arbitrary profile files are not promoted into the
  editor.

### Sessions

The read-only adapter scans only direct project directories one level below
`<root>/sessions` and accepts JSONL files whose first session record contains a
safe id. It reads at most 16 KiB for header discovery, 256 KiB for metadata,
2 MiB for a selected transcript, and 64 KiB per visible entry through the
shared session utility bounds. Metadata is deduplicated by id and sorted by
file mtime; malformed lines are isolated. `toolResult` records are rendered as
tool entries, while system/developer messages are not presented as user or
assistant conversation. Symlinks and unsafe ids are rejected before detail
reads. The resume payload is `{ executable: "omp", args: ["--resume", id] }`
with the parsed project cwd when available; PromptHub never launches it from
the session adapter.

The adapter intentionally excludes nested subagent transcripts. Native
profile/config-directory overrides beyond `PI_CODING_AGENT_DIR` (for example
XDG or named profiles), provider activation, credential editing, usage/quota,
and package installation require a later contract-specific change rather than
guessed filesystem behavior. The non-secret model projection is defined by
`DES-AGENT-030` below.

## `DES-AGENT-030`: Oh My Pi YAML Model Projection

This design implements `FR-AGENT-034` without creating a second provider store
or copying Oh My Pi credentials into PromptHub. The adapter uses the resolved
Oh My Pi root and two native files:

- `config.yml` is preferred, with `config.yaml` as a compatibility fallback;
  only `modelRoles.default` is read or written for the global model selection.
- `models.yml` is optional and supplies provider ids, explicit model ids and
  provider-level `baseUrl`/`auth` metadata. Its `apiKey`, headers, OAuth data,
  model metadata and unknown fields are never returned to the renderer.

The read path is bounded by the existing 2 MiB config limit and parses YAML
with the repository's existing `yaml` dependency. The normalized result uses
the existing `AgentModelConfiguration` contract and reports the adapter as
`oh-my-pi-yaml-v1`; available models are concrete `provider/model` selectors,
with the selected model retained even when it is not listed in the static
catalog. A provider endpoint is passed through the existing URL sanitizer.
Credential status is presence-only: `apiKey` configured, `auth: oauth`, and
keyless `auth: none` never reveal the credential value or environment lookup.

Writes parse the selected YAML document, set only `modelRoles.default`, create
the existing per-agent backup, guard against a concurrent source change, write
through the existing atomic path, re-read and verify the selector, and restore
the exact original bytes on any failure. Provider switching, credential writes,
quota requests, runtime discovery and plugin installation remain outside this
adapter.

The contract was re-audited against upstream revision
`cc00ab161b2721e50d8a96a0dc9552abfd258b8b`. Current Oh My Pi owns stored API
keys, OAuth accounts, multi-account rotation, and broker-backed credentials in
or behind `<root>/agent.db`; it also resolves runtime and environment sources.
PromptHub therefore keeps `providerModel` at `partial`. It may select a
documented `provider/model` value, but it must not present the generic
model-only adapter as a full Profile endpoint/credential adapter. Reading or
writing `agent.db`, copying an Oh My Pi credential into PromptHub's secret
store, or projecting a PromptHub secret into `models.yml` would change the
credential source of truth and requires a separately approved design. No
upstream source is copied or vendored.

## `DES-AGENT-033`: Kimi Code Provider And Model Projection

This design extends the existing Kimi model-only adapter under
`FR-AGENT-003` to `FR-AGENT-006` and `FR-AGENT-011`. It is based on the
official Kimi Code `config.toml` contract and the upstream
`MoonshotAI/kimi-cli` revision
`4a550effdfcb29a25a5d325bf935296cc50cd417`; no upstream source is copied or
vendored.

### Native ownership and profile shape

- The resolved Kimi root and `config.toml` remain the runtime source of truth.
  PromptHub owns Provider Profiles, model mappings, secure secret references,
  redacted snapshots, and encrypted rollback backups.
- A managed Profile stores only public metadata: native provider id and type,
  protocol, endpoint, model alias, upstream model id, and
  `max_context_size`. The API key remains in the main-process secret store and
  is projected to native plaintext only during confirmed activation because
  Kimi Code requires the credential in `config.toml`.
- Model alias is `modelMappings.primary.modelId`; upstream model id and context
  size are validated mapping parameters. Provider id is public profile config.
  No credential, OAuth reference, custom header value, or provider `env` value
  enters renderer state, snapshots, exports, logs, or ordinary backups.

### Supported protocol projection

| Kimi provider `type` | PromptHub protocol       | Credential policy                                |
| -------------------- | ------------------------ | ------------------------------------------------ |
| `kimi`               | `openai-chat`            | PromptHub-owned direct API key                   |
| `openai`             | `openai-chat`            | PromptHub-owned direct API key                   |
| `openai_responses`   | `openai-responses`       | PromptHub-owned direct API key                   |
| `anthropic`          | `anthropic-messages`     | PromptHub-owned direct API key                   |
| `google-genai`       | `google-generative-ai`   | PromptHub-owned direct API key                   |
| `vertexai`           | `platform-native`        | Google ADC remains entirely platform-owned       |
| OAuth/custom headers | `platform-native` import | Read-only; PromptHub never owns or tests secrets |

Kimi `/login` credentials, `credentials/`, provider `oauth`, provider `env`,
and `custom_headers` are external authentication surfaces. Import reports their
presence without values. Direct providers with native plaintext credentials
can be imported as incomplete Profiles, but require an explicit write-only
credential entry before reactivation.

### Apply, verification, and rollback

The adapter performs one bounded read of `config.toml`, parses it as TOML,
preserves all unknown semantic fields, and edits only the selected provider
entry, selected model entry, and `default_model`. It validates identifiers,
endpoint, model metadata, file size, regular-file status, symlink rejection,
and the pre-write digest. The prior bytes are stored only in the encrypted
Agent config backup area. The write uses the shared atomic replacement path,
optionally invokes the allowlisted native `kimi doctor config` validator,
re-reads the file, verifies provider/model/default selection semantically, and
restores the exact prior bytes on any failure.

Platform-native activation never creates a provider or model. It can only
select an already valid native model whose provider/type matches the imported
Profile. Direct connection and streaming tests dispatch to the existing
OpenAI-compatible, Anthropic, or Google Gemini main-process probes. Their
SSRF/DNS, timeout, response-size, abort, retry, and redaction policies remain
the single network boundary; the Kimi adapter adds no proxy or protocol
conversion layer.

Runtime complexity is `O(n)` time and memory in the bounded TOML size for
inspect/apply/verify. Network probes are one bounded request plus at most one
existing retry. No recursive filesystem scan or unbounded provider/model
enumeration is introduced.

## `DES-AGENT-034`: Qwen Code Provider Catalog And Credential Projection

This design extends the existing Qwen model-only projection under
`FR-AGENT-003` to `FR-AGENT-006` and `FR-AGENT-011`. Evidence is the official
Qwen Code settings, authentication, and model-provider documentation plus the
public `QwenLM/qwen-code` revision
`bfd4c8e519f96ca5bdc6cdd9f7a635b9345dbf11`. No upstream source is copied or
vendored.

### Current native contract

- User `settings.json` is the provider catalog and active-selection source of
  truth. Project `.qwen/settings.json` remains a higher-precedence
  project-owned layer and is not rewritten by a user Profile activation.
- Current `$version: 4` uses a bare `ModelConfig[]` at
  `modelProviders[providerId]`. The earlier wrapped
  `{ protocol, models }` form is invalid for this adapter because current Qwen
  silently skips it.
- A provider model is identified by provider id plus model `id` and normalized
  `baseUrl`. Built-in provider ids route directly; a custom provider id must
  have an explicit `providerProtocol` mapping.
- `security.auth.selectedType` selects the provider id and `model.name`
  selects the model. PromptHub never writes the deprecated
  `security.auth.apiKey` or `security.auth.baseUrl` fields.

### Profile and secret ownership

A direct Qwen Profile stores public provider id, protocol, endpoint, model id,
environment-key name, and non-secret Provider metadata. The credential remains
in the main-process secret store until confirmed activation. Activation writes
that value only to user `.env`, the location recommended by current Qwen
documentation, and removes the same selected key from the lower-priority
`settings.json.env` object so one credential has one active native source.
Other environment entries and all unrelated settings remain intact.

| Provider protocol | Qwen routing value | Credential policy                          |
| ----------------- | ------------------ | ------------------------------------------ |
| OpenAI-compatible | `openai`           | PromptHub-owned direct API key             |
| Anthropic         | `anthropic`        | PromptHub-owned direct API key             |
| Google GenAI      | `gemini`           | PromptHub-owned direct API key             |
| Google Vertex     | `vertex-ai`        | ADC remains platform-owned                 |
| Legacy Qwen OAuth | `qwen-oauth`       | Read-only; free tier discontinued upstream |

Custom provider ids may map only to `openai`, `anthropic`, or `gemini`.
Provider `generationConfig`, capabilities, descriptions, custom headers, and
other unknown fields are preserved when the exact model entry already exists;
PromptHub does not synthesize an advanced generation policy. Automatic Coding
Plan entries and reserved `BAILIAN_CODING_PLAN_API_KEY` ownership are imported
as platform-managed unless the user creates a distinct manual provider/env-key
Profile, matching Qwen's overwrite warning.

### Apply, verification, and rollback

The adapter performs bounded parallel reads of `settings.json` and `.env`,
rejects non-regular files, symlinks, malformed input, unsafe identifiers and
endpoints, and computes one digest over both byte streams. One encrypted bundle
contains the exact prior bytes for both files. After a pre-write digest check,
settings and environment files are atomically replaced in order; any partial
failure restores both prior files. A bounded semantic reread verifies provider
protocol, exact provider/model/endpoint identity, active selection,
environment-key name, and credential presence without exposing the value.

Direct health and streaming tests resolve the Profile secret only in main and
reuse the existing OpenAI-compatible, Anthropic, and Google Gemini probes.
Platform-owned entries return a stable unsupported result and are never tested
with borrowed credentials. Runtime complexity is `O(n)` time and memory in the
bounded settings and environment files. Provider lookup is a single bounded
linear scan of the selected provider's model array; no recursive scan,
unbounded network fan-out, proxy, protocol conversion, or OAuth pool is added.

## `DES-AGENT-035`: OpenCode Provider Catalog And Native Auth Boundary

This design extends the existing OpenCode model-only projection under
`FR-AGENT-003` to `FR-AGENT-006` and `FR-AGENT-011`. Evidence is the official
OpenCode config/provider documentation and the public `anomalyco/opencode`
revision `017a5977d2107092007623e507fc5c6eb337d3b2`. No upstream source is
copied or vendored.

### Version and path boundary

The current stable schema and installed OpenCode `1.18.3` use singular
`provider`, `model`, and `small_model` in the global
`~/.config/opencode/opencode.jsonc` or `opencode.json`. The adapter preserves
JSONC comments and chooses the same `opencode.jsonc`, `opencode.json`,
`config.json` precedence implemented upstream. The separate experimental v2
documentation uses a materially different plural `providers` contract;
PromptHub detects but does not write that shape until it becomes the stable
schema and has its own compatibility fixtures.

Credentials are owned by OpenCode's XDG data root, not its config root. The
main process resolves `${XDG_DATA_HOME}/opencode/auth.json`, with the platform
XDG default when the variable is absent. The renderer never supplies or sees
this path. Tests inject an isolated data root rather than changing process
home state.

### Supported Profile shapes

PromptHub supports only the two custom-provider packages documented for direct
OpenAI-compatible endpoints:

| Profile protocol   | OpenCode `npm` package      | Native request contract |
| ------------------ | --------------------------- | ----------------------- |
| `openai-chat`      | `@ai-sdk/openai-compatible` | Chat Completions        |
| `openai-responses` | `@ai-sdk/openai`            | Responses               |

A direct Profile stores public provider id, package/protocol, sanitized
endpoint, primary model id, optional small model id, and non-secret Provider
metadata. Activation writes or updates the exact `provider[providerId]`,
selects native model strings as `providerId/modelId`, and writes only
`{ type: "api", key }` at `auth.json[providerId]`. It removes a selected
provider's legacy inline `options.apiKey` only after an encrypted backup exists.
Existing custom authorization headers block direct activation instead of being
silently removed or combined with another credential source.

Built-in providers, unsupported npm packages, environment/file substitutions,
OAuth, well-known auth, cloud identity and pre-existing API credentials are
imported as platform-native, redacted and read-only. PromptHub may retain or
select only an already-valid native state and never borrows those credentials
for a network test.

### Apply, verification, and rollback

The adapter performs bounded parallel reads of the selected config and native
auth files, rejects non-regular files, symlinks, malformed input, unsafe ids,
model names and endpoints, and computes one digest over both byte streams. One
encrypted bundle contains the exact prior bytes and target-relative config
name. A pre-write digest check protects both files; config and auth are
atomically replaced with mode `0600`, and a partial failure restores both.
Semantic reread verifies provider/package/endpoint/model/auth type and key
presence without returning the key.

Direct connection and streaming tests resolve only the Profile secret in the
main process and reuse the existing OpenAI Chat or Responses probes. Runtime
complexity is `O(n)` time and memory in the bounded config/auth files, with
constant provider/model lookups inside their bounded maps. No recursive scan,
native database access, proxy, protocol conversion, OAuth pool, or network
fan-out is introduced.

## `DES-AGENT-036`: GitHub Copilot CLI Model And Asset Boundary

This design implements `FR-AGENT-036` from current GitHub Copilot CLI `1.0.48`
and GitHub's public CLI configuration reference. PromptHub reuses documented
contracts only; it does not copy or vendor Copilot source.

`COPILOT_HOME` overrides the default `~/.copilot` root. The registry exposes
only documented user-owned assets: `skills/`, `agents/`,
`copilot-instructions.md`, `mcp-config.json`, `settings.json`, and installed
Plugin discovery. Automatically managed `config.json`, `session-state/`,
`session-store.db`, permissions, logs, MCP OAuth/secrets, Plugin metadata, and
native authentication remain excluded from generic editing and ordinary
configuration backup.

The model adapter reads JSONC `settings.json` and projects only the top-level
`model` as a platform-native Profile mapping. It writes that field through the
existing bounded read, exact backup, digest race check, atomic replacement,
semantic reread, and rollback pipeline. Missing files may be created; malformed,
oversized, symlinked, or concurrently changed files fail closed.

Copilot BYOK is process-environment-only:
`COPILOT_PROVIDER_BASE_URL`, provider type, wire API/model, and credential
variables affect a launched process but have no documented durable settings
projection. The model-only adapter therefore blocks endpoint and secret
Profiles and keeps `providerModel` at `partial`. A future runtime-launch
environment design must be explicit and user-confirmed before PromptHub can
claim full Provider activation.

## `DES-AGENT-037`: Copilot Native Plugin Install Gate

Copilot package shape and installation are separate contracts. PromptHub keeps
the existing read-only scan of documented installed package markers, but
removes Copilot from filesystem-based distribution. The target matrix remains
the single UI and service gate: `github-copilot` is visible as an `adapter`,
disabled, and explains that native CLI registration is required.

`assertSupportedPluginTargets` rejects direct calls before target resolution or
filesystem mutation. A later implementation may enable the target only after a
bounded `copilot plugin install` adapter provides preview, explicit
confirmation, timeout/output limits, post-install verification, uninstall or
rollback, and tests against the current CLI. No platform-managed Plugin
metadata is edited directly.

## `DES-AGENT-077`: Local Claw Registry And Evidence Boundary

The built-in registry adds independent `copaw`, `autoclaw`, and `nanoclaw`
identities beside the existing `openclaw` and `qclaw` entries. The shared Claw
family resolver is the only presentation grouping; no platform id is aliased
to OpenClaw and no deep adapter is inherited from a similar directory name.

Path handling is conservative and reversible:

- CoPaw keeps the stable `copaw` PromptHub id but uses the current
  AgentScope/QwenPaw `~/.qwenpaw` installation root; the legacy `~/.copaw`
  directory is a bounded fallback.
- AutoClaw uses `~/.autoclaw` and the `~/.openclaw-autoclaw` compatibility
  candidate. Both are explicitly inferred because the official desktop page
  does not publish a canonical host root.
- NanoClaw uses bounded compatibility candidates (`~/.nanoclaw`,
  `~/nanoclaw`, `~/nanoclaw-v2`) while allowing the existing built-in root
  override to point at the actual arbitrary project checkout. It does not
  claim a global native root or invent a session/config adapter.

All three entries expose only a user-overridable `skills/` compatibility
surface. Their Provider/Session/Usage/CLI capabilities remain `planned`, and
no MCP, Rules, config, credential, or transcript paths are added without a
stable upstream contract. The UI still exposes the shared Agent shell and
individual capability states so these platforms can be promoted adapter by
adapter later. Registry path lookup remains O(1) per platform and performs no
recursive scan or network request.

## `DES-AGENT-088`: Single-Owner Electron Development Startup

`vite-plugin-electron` remains the development lifecycle owner through the
existing main-process `onstart(args.startup(["."]))` hook. The desktop
`electron:dev` script delegates to `vite` only. It does not use `concurrently`,
`wait-on`, or a second direct `electron` invocation. This keeps renderer, main,
preload and Electron restarts in one process tree and prevents the duplicate
instance from shutting down the renderer server used by the surviving window.

The renderer entry creates one root and wraps bootstrap, `ToastProvider`,
Suspense and the lazy App in `RendererErrorBoundary`. Promise rejection and
render exceptions converge on the same localized recovery screen. Development
claims a session-scoped reload token before one automatic reload and enforces a
10-second cooldown; production never reloads automatically. The fallback does
not query or mutate local data.

## `DES-AGENT-089`: Canonical Agent Edit Schema

The shared `SkillPlatform` registry owns optional native path declarations,
including `commandsRelativePath`. A pure renderer adapter maps a platform and
current draft to the visible edit field keys. Canonical declarations enable a
field; a non-empty stored draft keeps a legacy override visible; custom mode
enables the complete schema. `BuiltinAgentEditor`, the Agent workspace dialog
and Settings reuse that adapter.

`getEffectiveBuiltinAgentConfig` composes only explicit registry defaults and
normalized user overrides. It does not synthesize `agents/` or `commands/`.
Known command/agent directories are added only where the stable platform
reference already records them. Root selection uses the existing native folder
dialog. Settings persistence remains the existing local settings owner; no new
database, IPC or filesystem source of truth is introduced.

## `DES-AGENT-090`: Installed-Only Workspace Projection

The canonical registry remains the source for platform metadata and Settings
configuration, while the Agents workspace projects only summaries with
`isDetected === true`. The Agent store applies this projection immediately
after detection and resolves persisted selection against the projected set, so
sidebar count, search, selection and detail share one installed-only source.

The tab capability gate independently rejects every non-Overview tab for an
undetected summary. This defense remains necessary for stale renderer state,
tests and detection changes between renders. The undetected Overview renders
only status guidance; it does not mount inventory, usage, provider, appearance,
session, path or config components. Header launch, diagnostics and edit actions
are unavailable. No schema, registry, detection, IPC or persistence contract is
changed.

## `DES-AGENT-091`: Antigravity CLI Read-Only Conversation Adapter

The `antigravity` session adapter targets the current open-source Antigravity
CLI contract rather than the proprietary desktop protobuf store. Its main-owned
root defaults to `~/.gemini/antigravity-cli`; only an injected absolute root is
accepted by tests or trusted platform resolution. Conversation candidates are
regular, non-symlink `.db` files whose basename is a UUID-safe session id. The
adapter never opens mutable SQLite handles and does not decode blob tables.

Project association comes from the bounded CLI cache maps under `cache/`, where
absolute project paths map to conversation ids. Generated visible messages come
only from the matching bounded `brain/<id>/.system_generated/logs/transcript.jsonl`.
The parser accepts known source/type pairs, caps line/body bytes, hides tool
payloads and ignores unknown records. A missing projection produces an empty,
non-error detail so the database identity can still be resumed without
fabricating content. Search covers the bounded title, project metadata and
visible projected turns.

Native continuation resolves the allowlisted `agy` executable at apply time and
uses typed arguments `--conversation <id>`, optional verified project cwd and
`shell: false` through the existing resume service. Legacy desktop `.pb` files,
SQLite protobuf blobs, credentials, implicit trajectories, browser recordings,
tool payloads and full transcripts remain excluded. Capability is `partial`
because generated transcript projections are not guaranteed for every valid
database conversation.

## `DES-AGENT-092`: Shared Icon-Led Asset Card Content

`AgentAssetManagementSurface.tsx` owns both the existing card/action shell and
a shared `AgentAssetCardContent` primitive. The content primitive fixes the
icon slot, title/status row, two-line description, one-line source, metadata
chips and optional supplementary metadata to the same dimensions. Skill, MCP
and Plugin panels supply only domain identity, labels, metadata and canonical
actions.

Skills use `SkillIcon` with the scanned name fallback because the scan contract
does not project library artwork. MCP keeps `ServerIcon`. Managed Plugins keep
`PluginAvatar`, while Agent-discovered packages keep `PlugIcon`. Action buttons
continue through `AgentAssetActionButton`; no action, store, IPC or persistence
contract changes. The `agents.plugins` taxonomy key resolves to `Plugins` in
all seven locales while unrelated descriptive Plugin strings stay localized.

## `DES-AGENT-093`: Shared Agent Workspace Leading Edge

The Agent detail header uses the same `px-5` horizontal inset as the asset
toolbar and inventory viewport, so identity, tabs, controls and cards align to
one workspace grid. `AgentAssetManagementSurface` does not accept or render a
domain title because the active top-level Skills, MCP or Plugins tab already
names the current workspace. No asset, action, store or IPC behavior changes.

## `DES-AGENT-094`: Cursor-Paginated Native Transcript Reads

`AgentSessionDetail` gains an optional opaque `nextCursor`; the existing detail
fields remain stable. `agent:session:read` accepts an optional object containing
`cursor` and a bounded visible-message `limit`. The preload forwards that
object unchanged, while the main handler validates its shape, length and range
before selecting an adapter. Cursors are source-bound main-process values, not
paths or renderer-selected byte ranges.

The first implementation replaces Codex's fixed 2 MiB prefix read with a
bounded streaming JSONL scanner. It tracks complete-line byte offsets, rejects
invalid or source-mismatched cursors, caps individual lines/text and scans at
most 16 MiB per page, hides non-visible runtime/tool records, and keeps
scanning until the visible page is full, the source ends or the scan budget is
reached. A budget boundary returns a continuation cursor, including when the
page has no visible entry, rather than claiming the conversation has no body.
The visible-message projector accepts both legacy `event_msg` user/agent
messages and current top-level `response_item` message records. Only explicit
user/assistant roles and bounded `input_text`/`output_text` content are
projected; developer instructions, reasoning, tool calls, outputs and image
payloads remain private.

Augment uses the same public page contract over its native
`~/.augment/sessions/*.json` documents. The adapter validates the session id,
regular-file realpath and source revision, derives project ownership only from
workspace folders embedded in request nodes, and projects only
`request_message` / `response_text`. Native resume uses the documented
`auggie --resume <id>` command with the verified workspace root. Agent state,
authentication, user identity, tool nodes and task storage remain private.

`AgentSessionsPanel` requests the first visible page lazily, appends subsequent
pages by stable entry id and exposes one load-more control whenever either a
server cursor or locally unmounted legacy entries remain. Selection changes
invalidate in-flight pages. `truncated` remains reserved for data that cannot
be recovered, such as bounded field text; a paginatable source uses
`nextCursor` instead of the old permanent-preview warning.

Pi and Oh My Pi use the same source-bound JSONL cursor contract instead of the
legacy fixed 2 MiB prefix. Each request collects at most 200 visible messages,
scans complete lines in bounded chunks and returns the next opaque cursor when
more native records remain. The renderer no longer renders the generic limited
preview notice: recoverable history stays available through message-page
navigation, while transcript bytes remain external and are never persisted.

## `DES-AGENT-095`: Shell-Owned Agent Asset Detail Navigation

`AgentsWorkspace` owns one transient `isAssetDetailOpen` presentation state.
The Skills, MCP and Plugins detail owners keep their canonical selected-item
state and full-detail components, but report open/close transitions through
`AgentAssetsWorkspace`. While the state is open, the workspace shell omits the
Agent identity header and tab list, allowing the existing panel to fill the
complete area to the right of the Agent list. Back clears the domain-owned
selection and restores the shell without changing the selected Agent or tab.

The state resets when the selected Agent or top-level tab changes. Rules does
not participate because it is a dedicated editor rather than one of the three
Agent asset card domains. No route, store, IPC, persistence or owning-domain
asset contract changes.

## `DES-AGENT-096`: Verified Read-Only Cherry Studio And Kilo Sessions

The existing main-owned session service gains two live-reader adapters without
changing the IPC contract or persisting transcript bodies. Both adapters use
the shared list/search/detail model and opaque, source-bound detail cursors.

Cherry Studio first opens the current official
`<root>/Data/cherrystudio.sqlite` with the SQLite read-only option after
regular-file, realpath-containment and schema checks. Metadata comes from
`agent_session` plus `agent_workspace`; visible rows come from
`agent_session_message.data.parts`, restricted to `user` / `assistant` rows
and `type: text` parts. Reasoning and tool parts are excluded. If the current
database is absent, the adapter may read the locally verified older
`<root>/Data/agents.db` `sessions` / `session_messages` schema. Search is
parameterized and literal across metadata and visible text. The adapter is
`partial` because it covers Cherry Agent sessions rather than every Cherry
chat surface, and it advertises no native resume command.

Kilo reads regular, non-symlink JSON files below
`~/.local/share/kilo/storage/{session,message,part}`. Session and message ids
must pass the shared safe-id policy, every resolved path must stay inside the
storage root, and oversized or malformed records are rejected or counted as
parse errors. Detail pages combine only `type: text` parts for `user` and
`assistant` messages; reasoning, tool, snapshot and step records are excluded.
An explicit scan ceiling fails with `AGENT_SESSION_SCAN_LIMIT` rather than
silently truncating the catalog. Session metadata and transcript hydration use
bounded worker pools so a large catalog does not create unbounded simultaneous
filesystem reads. Native continuation is typed as
`kilo --session <id>` with an absolute verified project cwd when available.

`TEST-AGENT-116` covers list/search ordering, cursor pagination, missing roots,
malformed schemas/JSON, symlinks, traversal ids, hidden record exclusion and
resume metadata. Capability evidence changes only after these fixtures pass.

### `DES-AGENT-102`: Claude Resume Metadata And Transcript Density

The Claude JSONL list adapter reads at most `MAX_METADATA_BYTES` from each
selected source and derives title, validated session id and the first absolute,
null-byte-free `cwd` in one pass. The stable PromptHub list identity remains the
source filename, while the typed native command uses the validated embedded id
and carries `cwd` through the conversation service to the terminal launcher.
Invalid or missing metadata is ignored rather than decoded from Claude's lossy
project-directory folder name.

The renderer keeps avatars and bubbles as separate elements, reduces the
transcript stack gap to 10px and vertical viewport padding to 16px, and does
not add a generic top margin inside every message bubble. User and assistant
Markdown content starts directly within the bubble's existing padding; tool and
system notices may keep only a 4px role-to-body separation. Native resume uses
the current-Agent terminal contract; `DES-AGENT-103` supersedes the earlier
compact glyph treatment with the explicit two-action hierarchy.

### `DES-AGENT-103`: Continuation Intent Gate And View Pagination

`AgentConversationActions` owns a two-stage continuation state. The default
toolbar renders two labeled actions only: an action for the selected session's
typed native `resume` contract and a cross-Agent handoff action. The handoff
action opens a custom modal containing all detected target Agents and the
project selector; preview generation remains the confirmation boundary before
the existing digest-verified handoff. Export has a dedicated compact icon with
Markdown/JSON choices. The custom overflow menu contains edit plus
adapter-owned permanent delete only when the selected session supports it.

`AgentConversationService.previewHandoff` is the single source of truth for the
portable payload and transport tier. Each generated preview also receives an
opaque, main-process-only token and a five-minute bounded in-memory lease.
Confirmation looks up that exact snapshot, rechecks its identity and digest,
and never rereads a live transcript after the user has reviewed it. Expired,
evicted or tampered previews fail with an actionable stable error and do not
create a handoff record. The cache is capped at 64 entries, is not persisted,
and successful launches consume the token. Verified Claude Code and Codex executable
contracts use `direct` and expose a shell-quoted command using the same target,
project directory and payload consumed by Terminal launch. Other detected
Agents with an allowlisted application launch path use `launch`: the main
process copies the reviewed payload before opening the target application.
Targets without either capability use `unavailable` as a copy-only UI fallback;
the payload remains reviewable and copyable, but no launch success is recorded.
The renderer never reconstructs a command and derives only presentation copy
from the returned transport.

Cross-Agent continuation never reuses the source session id as if it were
portable. Native resume remains owned by the source adapter and source Agent;
handoff transports pass a bounded, redacted project-aware conversation payload
to the selected target Agent.

`AgentSessionsPanel` separates source fetching from DOM pagination. Adapters are
read in bounded batches of 80 entries, while the renderer mounts 20 entries per
view page. The fixed pagination bar selects any loaded page, resets the
transcript scroll position on navigation and requests the next source cursor
only when the user advances beyond the loaded page count. The merged detail
deduplicates entry ids and preserves parse/truncation metadata. The transcript
detail keeps the selected title and source path in the session list; its compact
action header does not repeat those values, reserving the vertical space for
conversation entries.

The opt-in session-index control states its ownership boundary next to the
toggle: PromptHub stores only redacted device-local metadata for faster search
and pagination, while transcript bodies remain in Agent-owned files and are
read on demand. Successful resume, handoff, copy and export actions use the
shared renderer toast surface instead of adding a status row to the conversation
toolbar.

## `DES-AGENT-097`: Shared Agent MCP Entry Detail

`AgentMcpEntryDetail` owns the complete Agent MCP detail composition: identity
header, management status, transport-specific source fields, serialized config
preview, detail actions and `AgentMcpPreviewSidebar`. `McpAgentsView` and
`AgentMcpAssetPanel` both provide their selected preset, server and callbacks
to this component instead of maintaining parallel detail JSX.

Selection, import, removal and navigation remain owned by the invoking
workspace. The shared component does not add durable state, IPC, routes or MCP
storage behavior. Component tests in both entry points assert the shared
split-sidebar layout and source sidebar so either surface cannot silently
regress to a reduced detail.

## `DES-AGENT-098`: Shared Skill And Plugin Agent Detail Adapters

`AgentSkillDetailPage` is the only adapter from scanned/managed Agent Skill
records into `SkillFullDetailPage`. `SkillAgentsView` and
`AgentAssetsWorkspace` provide domain data and orchestration callbacks without
constructing their own `agentContext` or `agentActions`. The adapter owns the
read-only, external, copied, symlinked and managed action policy.
`useEnsureSkillLibraryLoaded` is the shared readiness boundary for the overview
aggregate and Skill workspace. It initializes the canonical Skill library when
it is empty before either surface derives scan status, so cold-start navigation
order cannot change managed counts or actions. Its `isLoading` guard prevents a
rapid overview-to-Skills transition from issuing a duplicate library read while
the first request is still in flight.

`AgentPluginDetailPage` is the only adapter from a target-installed Plugin into
`PluginFullDetailPage`. `PluginAgentViews` and `AgentPluginAssetPanel` provide
the target, managed Plugin match and real import/open/store callbacks. A
PromptHub-library Plugin opened directly from `AgentPluginAssetPanel` remains a
separate managed-library scenario and still uses the canonical full detail
page; it is not a duplicate target-installed adapter.

Neither adapter owns durable state, IPC, routing or filesystem writes. Focused
component tests assert the resulting canonical props and action availability so
the two entry points cannot drift independently.

## `DES-AGENT-099`: PromptHub Provider Import Projection

Add a main-process provider source service between `CoreAIConfigService` and
the existing `AgentProviderProfileService`. The source service reads
`config/ai-models.json` on every list/import operation, joins chat models to
their provider, applies an explicit platform/protocol compatibility matrix and
returns only redacted candidate metadata. A confirmed import revalidates the
candidate and selected model, constructs the platform-specific public Profile
configuration, and delegates Profile plus write-only credential creation to
the existing transactional service. This is a copy/projection boundary: global
AI provider changes never mutate existing Agent Profiles, and Profile changes
never mutate the global provider.

The IPC contract exposes `list sources` and `import source` only. It never
returns API keys or secret references. Codex, Claude Code, Gemini, Qwen Code and
OpenCode are enabled only for protocol combinations their completed adapters
can write and verify. Other combinations remain visible as incompatible until
their adapter can represent all required fields without invented defaults.

## `DES-AGENT-100`: Current-Format Read-Only Session Adapters

The shared main-process session service owns five additional current-format
readers: Hermes read-only SQLite, Reasonix replayable JSONL events, NanoClaw v2
paired SQLite queues, CoPaw/QwenPaw SafeJSONSession workspaces and Qoder
transcript JSONL. Each reader validates its own root, schema, source identity,
symlink boundary and scan ceiling before projecting the shared metadata/detail
contract. No transcript body is persisted in PromptHub's database or sync.

The Qoder reader scans only regular files at
`<root>/projects/*/transcript/*.jsonl`, requires every record's `sessionId` to
match the filename, and derives a source-bound PromptHub id so equal native ids
in different project roots cannot collide. The official record taxonomy is
projected narrowly: user records require string `message.content`; assistant
records contribute only `type: text` parts. `session_meta`, `progress`,
`tool_use` and `tool_result` records remain hidden. Full visible text supports
search, while each rendered message is capped and detail uses a revision-bound
opaque cursor.

Qoder JSONL records larger than 1 MiB are counted as malformed and skipped
before JSON parsing; scanning continues so an oversized runtime/tool payload
cannot hide later visible messages. The capability gate is transcript-body
based: a session index alone is insufficient, and undocumented encrypted stores
are not decrypted or inferred. Network-backed history readers require a
separate opt-in design because they change the local-only privacy boundary.

Qoder's documented `/resume` command is interactive rather than a verified
direct process argument, so metadata keeps `resume: null`. QoderWork is not
mapped to this reader because its public Hook schema does not document a local
transcript path or body format. Capability evidence therefore flips only the
five exact platform ids whose fixtures pass.

## `DES-AGENT-101`: Native Provider Summary And Official Profile Source

Extend the shared current-state projection with a redacted native Provider
summary derived from each adapter's validated `importCurrent` result. The tray
service reads this summary independently of activation snapshots, so a real
native configuration remains visible before PromptHub owns any Profile. The
summary reduces credential data to a bounded ownership/status enum and reduces
provider identity to public name, kind, protocol, sanitized endpoint and model.

Add a main-process official Profile source with an explicit platform matrix.
Claude Code maps to Anthropic platform-native authentication and Codex maps to
OpenAI platform-native authentication. It reuses the current primary model,
creates no secret, reuses a matching active Profile when present and delegates
creation to the existing transactional Profile service. The renderer can then
request the existing activation preview; native writes, backup, verification
and rollback remain exclusively owned by the activation service. Other
platforms advertise no official restore until their default provider and model
write contract is independently verified.

The renderer represents the native source with the same bordered-card language
as editable Profiles, without a selected left rail. Its detail pane uses a
bounded grid of framed, sanitized fields and an explicit ownership notice. The
notice is not merely copy: its primary action calls the existing redacted
import/adopt flow, then immediately sets the newly created Profile as the
right-pane edit target. This preserves the source-of-truth boundary: native
files and credentials stay Agent-owned and main-process-only, while subsequent
editing targets an independent PromptHub Profile and activation still uses the
existing preview, backup, verification, and rollback path. Rendering remains
`O(1)` for the native summary and does not add filesystem reads or network
requests.

## `DES-AGENT-104`: Right-Pane Provider Draft Editor

`AgentProviderProfileWorkbench` owns a renderer-local edit target with three
states: closed, unsaved new draft, and an existing public Profile. Add and Edit
replace the right detail surface with `AgentProviderProfileFormDialog` rendered
as an inline labelled region; the component keeps its existing request shaping,
validation and write-only credential contract but no longer owns a modal.
Successful create/update closes the editor after the store selects the saved
Profile. Cancel clears only renderer state and performs no IPC write.

The editor is divided into identity, connection/protocol, model routing and
authentication bands. Platform defaults and validation continue to derive from
the completed Claude, Codex, Gemini, Kimi, Grok, Qwen and OpenCode adapters.
Codex additionally exposes its already-supported `env_key` credential ownership
as an alternative to a PromptHub-managed secret. The editor does not add model
catalog, reasoning conversion, custom User-Agent, failover or proxy controls:
those CC Switch surfaces depend on the separately gated proxy capability in
`FR-AGENT-017` and are not accepted by the current direct adapters.

## `DES-AGENT-105`: Source-Bound Config Inventory And Editor State

`AgentUserConfigFileService` keeps its existing bounded discovery policy
(`MAX_CONFIG_ENTRIES`, `MAX_CONFIG_FILES`, `MAX_CONFIG_DEPTH`) as the single
filesystem inventory boundary. Existing non-declared targets are authorized
only when the same discovery policy returns their normalized path; missing
targets remain limited to adapter declarations. This adds at most one bounded
`O(E)` directory scan per uncached source context, where `E <= 2,000`, and the
service keeps at most 64 source inventories in an in-memory LRU cache. `list()`
refreshes that cache so external changes are observed without unbounded
watchers, polling or durable state.

`SkillFileEditor` attaches list and read requests to a monotonically increasing
source generation. A source change clears inventory, selected content and
per-path cache before loading the next source. Late results are ignored unless
their generation and source key are still current. Same-source refreshes retain
the existing content cache, avoiding redundant reads.

The existing dirty-editor confirmation is extracted as a shared renderer hook
and reused by both module navigation and Agent selection.

Allowing an undetected Agent to create declared config files is intentionally
not implemented in this design because it conflicts with `FR-AGENT-075`, which
requires undetected Agents to remain absent and forbids config reads or writes.
Changing that source-of-truth boundary requires an explicit product decision
about whether configured-but-undetected Agents re-enter the sidebar.

## `DES-AGENT-106`: Appearance Context Rail

`AgentAppearancePanel` owns a renderer-local `skins | pets` selection whose
default is `skins`. A fixed-width navigation rail presents Pets before desktop
skins and derives both counters from the single `AgentAppearanceOverview`;
switching destinations performs no IPC and does not duplicate durable state.
The right pane renders a destination-specific toolbar and scroll surface, so
skin and Pet actions cannot be confused.

Refresh remains the only shared operation. Import, invalid-count messaging,
folder opening and inventory rendering are selected by the current destination.
This keeps navigation `O(1)` and inventory rendering `O(S)` for skins or `O(P)`
for Pets rather than mounting both collections at once. Existing main-process
validation, filesystem ownership, apply/restore and Pet animation contracts are
unchanged.

The exported panel remains a declarative orchestration component that wires the
existing command surface into the two focused workspaces. Its render body may
exceed the default 50-line function target because splitting that one-to-one
action wiring behind a second abstraction would hide the IPC ownership without
removing a repeated decision; all inventory and card rendering remains in
smaller domain components.

## `DES-AGENT-107`: Filesystem Pet Manager And Bounded Official Catalog

The renderer splits Pet inventory and catalog concerns into a dedicated
workspace component. A white context rail selects installed Pets or the
official catalog while one responsive `auto-fill` grid renders domain cards.
Installed cards use the existing preview bridge and filesystem actions;
catalog cards use a separate read-only preview endpoint. Both surfaces derive
installed state from one `AgentAppearanceOverview`, avoiding duplicate durable
state and keeping list work `O(P)` for installed Pets or `O(C)` for the current
bounded catalog page. Installed and catalog cards render through the shared
Agent asset-card shell, including the same padding, typography and quick-action
footer. Their domain-specific content body uses a bounded 112-pixel preview so
the animated Pet is the primary signal. Its detail column has a fixed bounded
height, two-line description clamp and one-line metadata lane so variable
upstream copy cannot resize or escape the card. Installed filesystem paths and
catalog identifiers are omitted from the visible card body; the exact installed
path remains owned by the path-open action. The renderer still performs no
extra I/O for this presentation change, and list work remains linear in the
bounded page.

`AgentAppearanceService` remains the owner of `<codex-root>/pets`. Its metadata
update reads the existing manifest, merges only validated display fields,
revalidates the full result and atomically replaces `pet.json`, preserving
unknown version-compatible fields. A separate main-process
`AgentPetStoreService` owns network access. It accepts no caller-supplied URL.
Catalog, manifests and installable spritesheets are restricted to the official
raw GitHub repository prefix. Card previews first request the project's
published, frame-sized `codexpet.top/assets/previews/<safe-id>/webp/idle.webp`
asset with a 2 MiB ceiling; if unavailable, the service validates `pet.json`
and uses its allowlisted spritesheet as a 20 MiB fallback. This avoids fetching
a multi-megabyte animation sheet for every healthy catalog card while retaining
a deterministic recovery path. All requests enforce a 10-second timeout and
reject redirects. The renderer loads at most four previews concurrently,
deduplicates in-flight preview ids and retains at most 96 preview data URLs for
the active process. The main process persists valid preview bytes under
`<dataRoot>/agent-pet-store/cache/previews`, reuses them for seven days across
application restarts, and atomically writes then prunes the cache to at most 96
files and 192 MiB. Preview hits require one bounded file lookup/read; a prune is
`O(C log C)` for `C <= 96`, while an uncached page remains `O(P)` network work
with four renderer workers. The service also retains at most one short-lived
catalog cache and stages installs under PromptHub's temporary data area. The
staging directory is removed on every result path.

Catalog search keeps renderer-local draft and committed values separate.
Keystrokes update only the draft. Enter or the search icon commits a trimmed
query, resets paging and increments a bounded request generation; this permits
a newer explicit search to supersede an older in-flight request while the
existing source-bound guard discards the stale completion. Network work is
therefore proportional to explicit searches and page/refresh actions, not the
number of typed characters.

IPC and preload add typed list/install/preview/update operations. Renderer
requests are source-bound and ignore stale results after Agent, search or page
changes. No database, backup, sync, runtime path or upstream execution contract
changes.

## `DES-AGENT-108`: Cached Native Menu Quota Projection

`agent-usage-runtime.ts` owns one process-wide `AgentUsageService` used by both
Agent IPC and a main-process tray projection service. The projection derives
every `supported` usage adapter and display name from the shared platform and
capability registries while preserving the established preferred ordering. It maps only the public
`AgentUsageQuota` contract; credentials, provider response bodies and raw
exceptions never enter the tray model.

The projection evaluates `P` providers with `O(P + M)` time and `O(P + M)`
snapshot memory, where `M` is the total returned metric count. Provider I/O
runs through a two-worker queue, so network concurrency is
`O(1)` and cannot fan out without bound. Each adapter retains its existing
10-second request timeout and 60-second cache. A rejected provider becomes a
sanitized unavailable item while successful peers remain intact.

The focused projection owns the last successful presentation and one in-flight
quota reload. Menu creation and each macOS `mouse-down` first rebuild synchronously
from that presentation, then request an asynchronous refresh. Repeated opens
join the in-flight request rather than issuing duplicate work; destroy advances
the generation so late results cannot recreate or mutate an owned tray.

`tray-menu.ts` keeps the native-menu rendering boundary. It selects the metric
with greatest utilization as the compact summary, formats every metric as
remaining percentage plus a bounded relative reset, and localizes known metric
ids and status text through the existing seven-language tray dictionary. A
refresh command and the existing Agent management command remain available in
the quota submenu. This intentionally adapts CodexBar's provider/metric/reset
hierarchy to Electron native menu constraints instead of copying its SwiftUI
view implementation or vendoring third-party source.

## `DES-AGENT-109`: Incremental Quota Projection And Kimi Token Renewal

The tray projection starts with typed loading rows derived from the shared
verified usage-capability inventory. Provider work remains a two-worker queue, but each
settled item is reported to `TrayController` immediately and merged by stable
Agent id. This keeps cold-start rendering at `O(P)` memory and lets a later menu
open use partial results instead of waiting for the slowest provider. The final
array remains in registry order; an already-open native macOS menu is not
mutated in place because Electron installs menus as native snapshots.

Kimi renewal is owned by a focused main-process helper rather than renderer UI.
It reads only `<root>/credentials/kimi-code.json`, applies the upstream
`auth.kimi.com/api/oauth/token` refresh-token form contract and registered Kimi
Code client id, and bounds each request to ten seconds with at most three total
attempts and short exponential backoff. Legacy OAuth files remain read-only.

Before rotating a token, the helper acquires Kimi Code's native
`<root>/oauth/kimi-code.lock` directory with a bounded wait, refreshes the lock
mtime while held, and re-reads the credential after acquisition so a concurrent
Kimi process can win without being overwritten. Persistence preserves unknown
JSON fields, uses same-directory atomic replacement with mode `0600`, and
releases the lock on every path. Unauthorized refreshes do not overwrite Kimi
credentials; transport and write failures become sanitized unavailable states.
The helper coalesces refreshes within this process, so repeated workspace and
tray reads do not rotate the same refresh token concurrently.

## `DES-AGENT-110`: Rendered Tray Quota Popover (Superseded)

Superseded on 2026-08-19 by `DES-AGENT-148` after explicit product feedback.
The identifier remains only as historical context for the removed renderer
implementation. Current code MUST NOT create or mount the rendered tray quota
popover described by this former design.

## `DES-AGENT-112`: Conversation Toolbar And Cursor Boundary

`AgentConversationActions` renders one flex row directly inside the detail header;
the header owns the border, background and spacing, so the action row does not
introduce a second card surface. Session selection uses the existing semantic
foreground/muted tokens and a low-contrast accent background rather than a
saturated primary fill. This is renderer-only and does not change metadata,
native transcript, IPC or persistence ownership.

Transcript pagination keeps the existing 20-entry viewport and 80-entry fetch
size. When the requested page is beyond the loaded boundary, it follows native
cursors until the target page has an entry, the cursor is exhausted, the cursor
stops advancing, or eight hops have been attempted. Each response is de-duplicated
by entry id in `O(n)` time per fetched page; the bounded hop count prevents
pathological adapters from causing unbounded I/O. The renderer updates the
existing detail snapshot once, clamps the visible page to the last loaded page,
and preserves a cursor for a later retry when the hop budget is reached.

## `DES-AGENT-113`: Shared Provider Workbench Composition And Pi Import

`AgentProviderWorkbenchLayout.tsx` owns the stable Provider & Model visual
composition: responsive sidebar tracks, top action toolbar, scrollable provider
list, bottom create action, detail canvas, list-item classes, detail header,
metadata rows and section surfaces. The generic Provider Profile adapter and
Pi native catalog adapter provide data and commands to these primitives rather
than maintaining independent shells.

Pi import reuses the existing PromptHub provider-source discovery service. The
service adds a Pi protocol projection (`openai-completions`,
`anthropic-messages`, or `google-generative-ai`) and resolves the selected
provider/model entirely in the main process. A dedicated IPC operation passes
only source and model identities from the renderer and returns only backup
metadata; literal credentials remain main-process-only.

The Pi writer prepares the `models.json` and optional `auth.json` edits before
performing either write. It creates both backups, verifies both original
digests, writes with atomic replacement, verifies the generated structures,
and restores both original files if either replacement fails. Duplicate ids,
invalid endpoints, unsupported protocols and malformed native files fail
before the first write.

Provider discovery remains `O(P + M)` for `P` configured providers and `M`
chat models. Pi import performs a constant number of bounded file reads,
backups and atomic replacements; it adds no cache, polling loop, network call
or renderer-resident credential state.

## `DES-AGENT-114`: Pi Current Provider Override Import

The Pi workbench toolbar mirrors the generic Provider toolbar with current
configuration import first and PromptHub-source import second. Renderer sends
only `{ agentId: "pi" }`; main re-inspects `settings.json` and the sanitized Pi
catalog, so stale renderer-selected provider ids cannot choose a filesystem
write target.

For a current built-in provider, main writes a same-id provider entry containing
an empty `modelOverrides` record for the current verified model into
`models.json`. Pi treats this as a valid, behavior-preserving override: unlike a
provider-level `baseUrl`, it cannot reroute sibling models that use different
protocols or endpoints. Built-in models remain composed underneath it, while
existing `auth.json` and environment credentials remain owned by Pi. The catalog
projection marks a built-in provider with a matching custom entry as custom so
the existing edit/remove controls operate on the override. Removing the entry
restores the unmodified built-in projection.

The import performs `O(P + M)` bounded catalog inspection and one bounded JSONC
write. Existing backup, digest comparison, atomic replacement, semantic re-read
verification and rollback primitives remain the only persistence path. Missing
current provider/model, non-built-in source, stale model, malformed source and
duplicate override fail before mutation.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-095` | `DES-AGENT-113` | `TEST-AGENT-136` | `T-AGENT-182` |
| `FR-AGENT-096` | `DES-AGENT-114` | `TEST-AGENT-137` | `T-AGENT-183` |

## `DES-AGENT-115`: Semantic Quota Contract And Shared Meter Composition

Quota adapters normalize provider payloads into a versioned contract whose
metrics carry typed scope, period and value unions. Finite values cross IPC only
as remaining percentage, with remaining/limit amounts when trustworthy;
unlimited and unknown are explicit variants. Adapters do not select a renderer
or parse their ids in UI code.

A shared pure presentation model owns grouping, semantic ordering, primary
selection, bounded model expansion, reset formatting, tone and visualization
selection. Finite percentage or amount values with rolling or day/week calendar
periods use a compact SVG ring; month, billing-cycle, lifetime and
provider-defined values use a horizontal remaining bar. Overview and the menu-bar popover compose
the same meter component at different densities. Successful summaries omit the
redundant provider-provenance sentence. Cached values remain stable during an
in-flight refresh, whose busy state stays on the refresh control; stale copy is
reserved for a failed refresh that affects trust. Old V1 renderer caches are
ignored through the contract schema version. Provider endpoints, credential
ownership, process cache, concurrency and persistence remain unchanged.

Antigravity is a source-specific normalization rule, not a renderer branch. Its
baseline metrics come only from `RetrieveUserQuotaSummary` grouped five-hour
and weekly buckets. `GetUserStatus` contributes plan identity, while legacy
prompt-credit counters are ignored because current provider documentation
defines AI credits as overage and no verified balance contract is present.

Kimi is also normalized at the adapter boundary. The current coding usages
payload reports `remaining` and `limit`, and expresses its 5-hour window as
`300 TIME_UNIT_MINUTE`; the adapter prefers that remaining value, accepts the
proto unit, and retains compatibility with the older `used` payload. The
official client treats top-level `usage` as weekly and `limits[]` as rolling
windows. PromptHub does not map `totalQuota` because it is not a trustworthy
numeric source for the separate cross-product monthly membership total.

The complete adapter matrix, contract shape, cardinality rules, complexity,
failure states and verification plan are authoritative in
`quota-presentation-design.md`.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-097` | `DES-AGENT-115` | `TEST-AGENT-138` | `T-AGENT-184` |

## `DES-AGENT-116`: Native Model Adapter Registry Expansion

The existing main-process model configuration boundary remains the owner of
native inspection and mutation. Its registry adds independent JSON/JSONC/YAML
projections for Antigravity, Qoder, CoPaw, AutoClaw, QClaw and Hermes. Existing
Claude Code, Codex, Grok, Pi, OpenCode and OpenClaw behavior is reused rather
than copied into new renderer components. Capability declarations and Provider
runtime registration derive from the same implemented platform set.

The normalized operation remains O(F + M) time and O(F + M) bounded memory,
where F is one native config file capped at 2 MiB and M is the platform's
declared model catalog. Each request performs at most one primary config read,
one optional catalog/active-workspace read, one backup copy, one atomic write
and one verification read. No network request, polling loop, cache or background
process is introduced.

Antigravity resolves Provider state from the sibling
`~/.gemini/antigravity-cli/settings.json` while retaining
`~/.gemini/config` as its Skills/MCP root. Qoder reads `model.name` and sanitizes
metadata from `modelConfigs.customModels`. AutoClaw reads `setting.json`. QClaw
uses its own root with the verified OpenClaw JSON shape. Hermes reads
`config.yaml`. CoPaw resolves the active workspace from `config.json`, validates
that the selected workspace remains under the platform root, then reads and
writes only its `agent.json`; its provider secret file is outside the adapter.

All JSON mutations use structural JSONC edits so comments and unrelated keys
survive. YAML mutations use the existing document-preserving parser. Backup,
concurrent-change detection, atomic replacement, semantic verification and
rollback are shared with existing adapters. Renderer and Provider Profile code
continue to consume the normalized contract and therefore need no Agent-specific
layout branch.

NanoClaw is a separate target-binding design: the native source of truth is a
per-group `container_configs` row managed by its CLI, not one platform-global
file. It remains planned until `AgentProviderAdapterContext` and the workbench
can carry an explicit child target. This avoids unsafe fan-out, arbitrary group
selection and mutation of generated files.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-098` | `DES-AGENT-116` | `TEST-AGENT-176` | `T-AGENT-185` |

## `DES-AGENT-117`: Provider Toolbar And Sidebar Containment

`AgentProviderWorkbenchLayout` changes its toolbar from one fixed-height icon
row to a bounded one-column command grid. Generic Profile and Pi workbenches
continue to supply the same two commands, but each button now renders its
existing localized accessible name as visible text. This keeps action semantics
and IPC unchanged while making the commands discoverable at the sidebar's
224-288 px responsive widths and across all seven locales.

The sidebar owns `overflow-x-hidden` and keeps only its existing vertical scroll
container. The native configuration card moves spacing to a containing block;
the button remains `w-full` inside that block instead of combining `w-full`
with horizontal margins. This removes the deterministic extra-width overflow
without clipping focus state or changing list selection behavior.

Rendering remains O(V), where V is the visible virtualized profile count. No
network, filesystem, persistence, cache or process boundary changes.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-099` | `DES-AGENT-117` | `TEST-AGENT-177` | `T-AGENT-186` |

## `DES-AGENT-118`: Adapter-Owned Session Footprint And Deletion

`AgentSessionMetadata` carries an optional `sizeBytes` and an explicit
`nativeDeleteSupported` capability. File-backed adapters populate the size from
the same contained source they already discover. Shared-database adapters leave
the size unknown until they implement a truthful row-level calculation; the UI
never substitutes the whole database size. Codex reports the exact rollout JSONL
size already collected during its bounded scan.

The project selector builds an O(S + P) map from loaded sessions (`S`) and
registered projects (`P`). Its stable identity is the exact project path, with a
separate namespace for registered ids lacking a loaded path. Filtering uses the
same identity helper, so equal basenames do not merge different directories.
No additional filesystem scan, cache, network request or persistent project row
is introduced.

Permanent deletion remains behind the session adapter. The conversation service
invokes the adapter-owned native delete first and changes no PromptHub metadata
when that operation fails. After native success it hard-deletes the matching
metadata row; a cleanup failure is logged without turning the already deleted
native session into a reversible state. The Codex adapter validates the session
id, rescans its configured active and archived roots without following symlinks,
resolves the current matching rollout and unlinks only that contained regular
file. There is no generic `sourcePath` deletion path. Renderer confirmation is
required before IPC, and a successful response removes the session from local UI
state immediately.

Codex list and delete remain O(F), where `F` is the bounded native rollout
inventory already required for identity resolution. Size display adds no extra
I/O because scan metadata already includes byte size. Delete performs one bounded
rescan, one native unlink and at most one metadata-row delete, with no retry.
Native failure leaves metadata unchanged; successful native deletion is
intentionally irreversible.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-100` | `DES-AGENT-118` | `TEST-AGENT-178` | `T-AGENT-187` |

## `DES-AGENT-119`: Draft/Submitted Search State And Metadata Scope

`AgentSessionsPanel` owns two ephemeral values: the input draft and the last
submitted query. `onChange` updates only the draft. An Enter key handler ignores
IME composition, prevents implicit form behavior and copies the trimmed draft to
the submitted value. Only the submitted value participates in list requests,
pagination and visible filtering. Agent changes reset both values. No search
state is persisted.

The main session-index service applies one final metadata predicate to live
adapter results using `title`, `projectLabel` and `projectPath`; adapter-native
body matches are therefore discarded before IPC. The persistent SQLite index
uses `title` and `project_path` only and no longer consults `redacted_preview`.
The renderer repeats the same visible metadata predicate so PromptHub-owned
display-title overrides can be honored without allowing notes, tags or models to
expand the result set.

The indexed path retains the existing bounded SQLite query and page shape. The
live path retains each adapter's bounded native lookup plus an `O(p)` pass over
the returned page of at most 200 rows. Typing performs zero I/O; one Enter
submission performs one list request. This change adds no cache, persistence,
network request, unbounded scan or process lifetime.

Analyze gate: the previous debounced/body-search behavior in
`session-index-designs.md`, the database preview predicate and renderer adapter
exceptions conflict with the newly confirmed product behavior. `FR-AGENT-101`
supersedes those search semantics without changing transcript ownership or the
list IPC shape. No source-of-truth migration, compatibility fallback or blocking
`[待确认]` item remains.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-101` | `DES-AGENT-119` | `TEST-AGENT-179` | `T-AGENT-188` |

## `DES-AGENT-120`: Loaded-Inventory Sort And Codex Thread-Name Projection

`AgentSessionsPanel` replaces its status-filter state with an ephemeral sort
mode. A pure comparator copies the filtered array before sorting by effective
time (`updatedAt`, then `createdAt`) or truthful `sizeBytes`. Null and invalid
values always compare after known values; ties use newest effective time and
then session id. The default is newest. The operation is `O(n log n)` time and
`O(n)` array space for the currently loaded, explicitly counted inventory, adds
no I/O, and reapplies after each bounded page append. PromptHub archive metadata
no longer excludes a native row; the existing compact archive icon preserves
that state without retaining a status-filter control.

The conversation projection has no soft-delete state. The renderer has no
Restore branch or removed-state icon, and the shared IPC/preload contract does
not expose a restore channel. The only visible delete command is the confirmed
adapter-owned native delete from `FR-AGENT-100`.

One renderer title helper supplies the effective title to list rows,
destructive confirmation and handoff previews: trimmed PromptHub override,
native adapter title, then id.
Adapters continue to own their native-title/fallback decision. The Codex adapter
adds one read-only title projection from `<codexRoot>/session_index.jsonl`. It
resolves the index as a contained regular file, reads at most 8 MiB from the
tail, drops a partial leading record, parses newest-to-oldest so the latest valid
record wins, accepts only safe ids and bounds titles to 160 characters. One
index read builds an `O(i)` map per list call and metadata projection remains
`O(p)` for the requested page. Missing, symlinked, malformed and truncated index
data falls back to the existing first visible user message without changing the
rollout, index, SQLite state or IPC contract.

Analyze gate: the existing status selector and archive-hides-from-Active copy
conflict with the newly confirmed ordering behavior. `FR-AGENT-102` supersedes
that renderer-only status exclusion while retaining non-destructive archive
metadata and preserving the adapter-owned permanent-delete boundary from
`FR-AGENT-100`.
Codex's native `session_index.jsonl` is an additional read-only native source,
not a PromptHub source-of-truth migration. No blocking `[待确认]` item remains.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-102` | `DES-AGENT-120` | `TEST-AGENT-180` | `T-AGENT-189` |

## `DES-AGENT-121`: Bounded Latest Seek And Shared Row Context Menu

`AgentSessionsPanel` owns only ephemeral context-menu coordinates and the
selected session id. A native `contextmenu` event selects the row and renders
the menu through `AgentConversationActions`, so toolbar and context actions call
the same resume, handoff, export and confirmed-delete operations. No duplicate
IPC orchestration, persistent menu state, metadata editor or new contract is
introduced. The menu position is clamped to the viewport and global close
listeners are installed only while it is open, then removed on close/unmount.

The latest command reuses the existing 80-entry cursor reader and 20-entry view
pages. One activation follows at most eight advancing cursors, de-duplicates
entries by stable entry id and lands on the final loaded page. A stalled cursor
is cleared; an advancing cursor remaining after eight reads stays available for
another explicit activation. For `k <= 8` cursor pages and `e` loaded entries,
one activation performs `O(k)` bounded I/O and `O(e)` de-duplication space/time.
It adds no network work, cache, durable state, process or filesystem mutation.

Analyze gate: earlier conversation CRUD and two-step-continuation text described
a generic metadata editor as a History action. The confirmed product behavior
removes that renderer operation while retaining the existing metadata storage
boundary for already projected titles/project/archive state. No schema,
migration, IPC or source-of-truth change is required, and no blocking
`[待确认]` item remains.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-103` | `DES-AGENT-121` | `TEST-AGENT-181` | `T-AGENT-190` |

## `DES-AGENT-122`: Shrinkable Markdown Surfaces And Tool Message Semantics

`AgentConversationMarkdown` wraps GFM tables in a `max-w-full`, `min-w-0`
horizontal scroll region and renders the table at `w-max min-w-full`. The
Markdown root and user/assistant/tool bubble flex items also receive
`min-w-0 max-w-full` containment. Ordinary tables still fill the bubble; only
content wider than the available bubble scrolls. This is presentation-only and
does not parse, copy, mutate or persist transcript text.

`ConversationMessage` handles Tool before the informational fallback. Tool uses
the assistant-side flex row, Agent avatar and the same 82% bounded bubble, with
a sky-accented Tool label and terminal icon inside the bubble. System and
unknown events continue through the centered notice branch. No role contract,
adapter parser, IPC or storage boundary changes.

Layout work remains `O(v)` for the visible Markdown nodes. Browser-native local
overflow handles wide tables without duplicate rendering, measurement loops,
observers, cache, I/O or background work. Tool rendering remains `O(1)` per
visible entry.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-104` | `DES-AGENT-122` | `TEST-AGENT-182` | `T-AGENT-191` |

## `DES-AGENT-123`: Capability-Gated Native Location Commands

`AgentConversationActions` keeps the More trigger independent of permanent
delete support and supplies the same location commands to both the toolbar menu
and row context menu. Show in folder receives only `session.sourcePath`; Open
project folder receives the already resolved registered/native `projectPath`.
Missing values disable the matching menu item, rather than deriving a parent,
falling back to an Agent root or hiding the distinction between the two paths.

Both commands reuse `window.electron.openPath`, whose existing main-process
handler validates existence and resolves file versus directory behavior: files
are revealed with `showItemInFolder`, while directories use `shell.openPath`.
This adds no IPC contract, storage, migration, cache, background process or
network request. Each explicit action performs one `O(1)` IPC invocation and
one filesystem metadata lookup in the existing handler. Failure returns through
the existing conversation-action error surface without mutating transcript or
PromptHub metadata.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-105` | `DES-AGENT-123` | `TEST-AGENT-183` | `T-AGENT-192` |

## `DES-AGENT-124`: Claude Native-Record Classification And Cwd Projection

The Claude JSONL parser returns both the validated native record and an optional
visible entry. This lets metadata and index scans reuse one parse without
mistaking intentionally hidden records for malformed input. Only native `user`
and `assistant` records continue to content projection. `isMeta` rows,
non-message types and known generated command wrappers are valid-but-hidden;
`tool_result` arrays project as Tool entries. Malformed JSON and non-object rows
remain parse errors. Titles continue to use the first visible User entry.

Both the bounded live metadata read and optional local-index scan accept only an
absolute, null-free native `cwd`. The exact value becomes `projectPath`, while
`path.basename(projectPath)` becomes the displayed label; the encoded Claude
storage directory is retained only when no valid cwd is available. Indexed
metadata derives the same label and includes the same cwd in the verified
`claude --resume` command. The Claude index adapter version advances from 1 to
2, so enabled rebuildable metadata is rescanned rather than preserving the old
encoded projection. There is no SQLite schema, IPC, transcript-body persistence
or native-file migration.

For `n` bounded JSONL records, parsing remains one `O(n)` pass with `O(1)`
additional state. Live/index metadata reads remain capped at 256 KiB per file,
detail reads remain capped at 2 MiB, scan concurrency remains one, and no new
network, cache or background process is introduced.

Analyze gate: Claude's encoded project directory and internal records were
native storage details incorrectly exposed by the adapter, while the stable
product behavior requires project identity and visible transcript semantics.
The source of truth remains Claude's native JSONL; only its read-only projection
changes. No compatibility migration or unresolved material decision remains.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-106` | `DES-AGENT-124` | `TEST-AGENT-184` | `T-AGENT-193` |

## `DES-AGENT-125`: Bounded Gemini Marker And Cursor Key Resolution

`scanGeminiFiles` resolves one optional `.project_root` marker per native cache
directory before enumerating its chats. The marker is accepted only when it is
a regular non-symlink file, no larger than 4 KiB, and contains one null-free
absolute path. The resulting `SessionFile.projectPath` is reused by live
metadata, index scan and resume projection. Gemini index adapter version
advances from 1 to 2 so enabled, rebuildable metadata is reparsed without a
schema migration.

Gemini message parsing returns visible entries plus a count of malformed rows.
`user` text maps to User, `gemini` text to Assistant, and a user content array
whose only visible payload is `functionResponse.response.output` maps to Tool.
`info`, unknown and empty well-formed rows are ignored without increasing parse
errors. Native `error` text remains a System entry because it represents a
user-relevant failed response rather than cache metadata. A non-empty native
`summary`, bounded to its first 160-character line, precedes the first visible
User title fallback in live and indexed metadata.

The Cursor adapter receives the configured `homeDir`. It computes the Cursor
key for that home and resolves only a remaining suffix below that root. At each
level it streams actual directory entries, rejects symlinks, and follows every
component name whose literal name is an exact or hyphen-delimited prefix of the
remaining key. Resolution accepts exactly one terminal directory; zero or
multiple matches fail closed. The walk visits at most 64 directories and 4,096
entries per directory. When exact resolution fails for an under-home key, a
second cached walk removes only uniquely matched existing prefix components and
uses the remaining literal suffix as a compact label; it still returns no
project path. The resolver never scans transcript content, follows symlinks,
walks above home, accesses Cursor private databases or treats string
replacement as proof of a path.

Gemini enumeration remains `O(P + S)` for `P` project caches and `S` chat files,
with one bounded marker read per project. Cursor resolution is bounded by 64
directory opens and 4,096 streamed entries per opened directory, with `O(c)`
candidate state for `c <= 64`. Both changes are read-only, add no network,
schema, IPC, cache, background process or native-file mutation.

Analyze gate: stable research previously kept Cursor project identity partial
because no canonical private history index was allowed. This design does not
promote that private index or claim universal resolution; it adds a
filesystem-verified, unique under-home projection and preserves null fallback.
Gemini's `.project_root` is an existing native marker and remains the source of
truth. No unresolved material decision remains.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-107` | `DES-AGENT-125` | `TEST-AGENT-185` | `T-AGENT-194` |

## `DES-AGENT-126`: Grok Build Usage And Conversation Size Projection

The existing main-process usage service owns the Grok adapter. It reads at
most 256 KiB from `<grok-root>/auth.json`, accepts only a host entry rooted at
`https://auth.x.ai::` with a non-empty `key`, and parses `expires_at` through
the shared epoch/ISO timestamp helper. The token remains inside the main
process. One refresh launches exactly two parallel requests, each using the
existing 10-second timeout and error classification:

- `GET https://cli-chat-proxy.grok.com/v1/user?include=subscription` supplies
  `subscriptionTier` only.
- `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits` supplies
  `config.currentPeriod`, `creditUsagePercent` and the weekly reset boundary.

Billing success is sufficient for an `ok` quota; user metadata failure leaves
the plan absent without discarding a valid weekly metric. Billing failure uses
the existing `expired` or `unavailable` state and may retain a successfully
read plan. The shared 60-second cache bounds normal refresh traffic to two
requests per Agent per minute. Parsing is linear in the bounded JSON payload;
the response mapper retains one weekly metric, so renderer memory is constant.

The shared plan formatter maps known Grok native tier enums to public labels,
including `XPremium` to `X Premium`, without adding a Grok-specific component.
The existing period-first presentation policy renders the calendar-week metric
as a ring.

The Grok session adapter resolves `chat_history.jsonl` through the existing
contained real-file guard while reading metadata, performs one file stat for
each projected row, and uses that file for both `sourcePath` and `sizeBytes`.
The directory scan remains bounded by the existing 50,000-session ceiling and
detail reads remain capped at 2 MiB. No schema, IPC, transcript ownership or
native file mutation changes.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-108` | `DES-AGENT-126` | `TEST-AGENT-186` | `T-AGENT-195` |

## `DES-AGENT-127`: Session-Owned Footprint And Delete Registry

The main session service owns a typed lifecycle registry beside the existing
read adapters. Each listed adapter registers one of three deletion strategies:

- a contained single-file target;
- a contained multi-file or session-directory target resolved again from the
  native session id; or
- a native command / shared-database row mutation implemented by that adapter.

The renderer still sends only `agentId` and `sessionId`. Immediately before a
mutation, the main process reloads the native identity and validates every
filesystem target as a regular non-symlink child of the configured Agent root.
Multi-target validation finishes before the first removal. Shared SQLite
stores use a transaction to delete known child rows before the session row and
verify that exactly one session was removed. Native CLI stores use the CLI's
own delete command. No generic renderer-provided `sourcePath` deletion exists.

List projection uses the same registered target set. A file target contributes
its exact byte size; a directory target is streamed without following symlinks
and is capped by the existing 50,000-entry session inventory limit. Shared
database adapters calculate logical bytes from the session row and its child
rows in the same list query, so one session never reports the whole database
file. Known sizes remain `O(1)` for file/stat and database projections;
directory footprints are `O(F)` time and `O(D)` bounded traversal space for the
files and directories owned by that session. List enrichment uses a bounded
worker pool rather than unbounded `Promise.all` I/O.

This design changes the earlier `DES-AGENT-118` capability gate: delete remains
adapter-owned and confirmed, but every adapter that returns sessions must now
provide a verified lifecycle strategy. The native mutation succeeds before
PromptHub metadata is hard-deleted. A native failure leaves PromptHub metadata
unchanged; a later metadata cleanup failure is reported without pretending the
native content can be restored.

Traceability:

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-110` | `DES-AGENT-127` | `TEST-AGENT-187` | `T-AGENT-196` |

## `DES-AGENT-128`: Full Rule Inventory And Explicit Creation

The Rules store keeps two related projections from the same IPC result:

- `availableFiles` retains every descriptor returned by `rules:list` or
  `rules:scan`, including global descriptors whose target does not yet exist.
- `files` remains the existing visible workspace projection, so standalone
  Rules navigation continues to omit missing global targets and disabled
  platforms.

`AgentRulesWorkspace` resolves its Agent target from `availableFiles`, still
preferring the normalized resolved path over platform identity. Synchronization
selects and reads only descriptors whose `exists` flag is true. A known missing
descriptor renders an unframed centered creation state using the descriptor's
`name` and `path`; an absent descriptor retains the bounded rescan and retry
state.

Creation reuses `window.api.rules.save(ruleId, "")`. The store merges the
returned descriptor into both projections, selects the created rule, exposes
its empty content through the existing editor and schedules the existing
WebDAV save-sync. A failed write leaves the missing descriptor intact and
returns the prompt to a retryable state. No IPC, preload, shared type,
filesystem layout or main-process write path changes.

Inventory matching and projection are `O(n)` in the bounded rule descriptor
count with `O(n)` renderer state. Opening a missing target performs no I/O
beyond the existing bounded inventory load; confirming creation performs one
save IPC and one existing save-sync schedule.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-109` | `DES-AGENT-128` | `TEST-AGENT-188` | `T-AGENT-197` |

## `DES-AGENT-129`: Pi MCP Capability Registry Correction

Pi's MCP target presets and stable platform reference already define the
compatible primary target at `<root>/mcp.json` plus separate shared and project
candidates. The built-in `pi` platform declaration therefore adds only
`mcpRelativePath: "mcp.json"`. The existing managed-Agent query derives
`paths.mcp`, and the machine-readable capability inventory changes MCP from
`planned` to `partial` through its existing path-backed policy. No renderer
branch, IPC channel, storage model, parser, writer, or target-preset duplication
is introduced.

The Agent MCP workspace continues to filter the owning MCP preset inventory by
the stable `pi` platform id. This keeps `~/.pi/agent/mcp.json`, shared adapter
files, and project candidates independently visible while preserving the
separate `oh-my-pi` identity. Registry projection remains linear in the bounded
platform and preset counts; opening Pi adds no scan or network request beyond
the existing MCP workspace load.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-111` | `DES-AGENT-129` | `TEST-AGENT-189` | `T-AGENT-198` |

## `DES-AGENT-130`: Application-Owned Session Index Preference And Paging Boundary

The renderer settings store owns one boolean history-acceleration preference.
Its default is `true`, it persists through the existing bounded Zustand
settings snapshot, and General Settings exposes the only user-facing toggle.
No new database schema, IPC channel or native Agent setting is introduced.

`AgentSessionsPanel` passes the preference to the existing session-index hook.
On each supported History mount the hook reads native index state once,
reconciles an enabled-state mismatch and performs one refresh only when the
application preference is enabled. Existing renderer-scoped request ids,
progress filtering, cancellation on unmount, 10,000-record scan ceiling and
live-reader fallback remain authoritative. The panel removes its indexing
controls; refresh progress stays internal and the completed revision triggers
the existing bounded list reload.

The transcript pager adds one `ChevronsLeft` icon command before Previous. It
sets the current display page to zero using the already loaded entry array and
is disabled while loading or already on page zero. Latest retains the existing
bounded cursor traversal. First-page navigation is therefore `O(1)` state work
and zero I/O; index refresh remains `O(n)` in the bounded native session count
with one scan in flight.

Analyze gate: this intentionally replaces the earlier per-source opt-in UI in
`DES-AGENT-047`. Native transcript files remain authoritative, index metadata
remains local and rebuildable, and disabling preserves the existing live-reader
path. The user explicitly selected a system setting with default-on behavior,
so no unresolved source-of-truth or privacy decision remains.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-112` | `DES-AGENT-130` | `TEST-AGENT-190` | `T-AGENT-199` |

## `DES-AGENT-131`: Project Rule Kind And Target-Specific MCP Projection

Cursor user rules remain Cursor-settings-owned because the official product
does not publish a canonical user rule file. The platform registry declares
only the project target `.cursor/rules/prompthub.mdc`. Managed Agent projection
adds a separate `projectRules` path so global and project scopes cannot be
confused. The existing Rules workspace gains a bounded rule kind registry:
`workspace` continues to target `AGENTS.md`, while `cursor` targets the MDC
file. Duplicate detection uses the resolved target path, allowing both files
under one project root. Existing atomic write, version, conflict and backup
flows remain authoritative.

Qoder declares the same `workspace` project-rule kind at `AGENTS.md`, so its
Agent Rules view reuses an existing workspace descriptor by resolved target
path. The renderer is parameterized by rule kind and platform id; it does not
add a Qoder-only editor or duplicate managed file.

The Agent Rules panel derives projects from the existing `skillProjects`
setting, selects one bounded project, and registers the Cursor target only
after explicit confirmation. No new IPC, schema or renderer filesystem write
is introduced.

MCP support extends the shared target registry rather than adding Agent UI
branches. OpenClaw gets a nested JSON projector for `mcp.servers` and canonical
remote transport output; Qoder reuses the top-level `mcpServers` JSON projector;
Grok reuses bounded TOML section scanning with target-aware `headers` output;
Antigravity uses the same top-level container with a target-specific
`serverUrl` remote projection. Reasonix exposes only its documented project
`.mcp.json` through the generic JSON contract. Its modern global `[[plugins]]`
array remains excluded because the current Codex-style TOML merger cannot
preserve and reconcile that schema losslessly.
Global presets add the documented user files and project presets add Qoder's
two documented scopes plus Grok and Antigravity project files. Unknown
JSON/TOML siblings are preserved. WebSocket-only Qoder declarations, OpenClaw
and Antigravity OAuth state and other unknown native fields are not modeled.

Registry lookup is `O(P)` in the bounded platform/preset count. Rule descriptor
lookup is `O(R)` and MCP JSON/TOML merge is `O(S)` / `O(file lines)` with no
new network request, background process or unbounded cache.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-113` | `DES-AGENT-131` | `TEST-AGENT-191` | `T-AGENT-200` |

## `DES-AGENT-132`: Fresh Session Index Reuse And Background Warmup

`useAgentSessionIndex` treats a completed scan timestamp as a freshness lease.
A source refreshed within five minutes is reused directly; a missing or stale
lease starts one module-scoped background refresh per Agent. The bounded map
contains only currently running promises and removes each entry on settlement,
so it cannot grow with historical requests. A background request is owned by
the application renderer window rather than the mounted History component:
tab/Agent navigation does not cancel it, while the existing main IPC binding
still aborts it when the sender window is destroyed.

Automatic enablement updates source state without invoking the foreground
refresh path, then joins or starts background warmup. The existing explicit
hook refresh remains component-scoped and cancellable for tests and future
commands. Freshness checking is `O(1)`; deduplication is expected `O(1)` map
lookup; the existing bounded scan remains `O(n)` filesystem metadata work and
`O(n)` validation memory only when stale.

`AgentSessionsPanel` delays automatic reconciliation until its first bounded
list settles. The initial load therefore performs one native/index list instead
of racing that list against a full scan. Index revisions and submitted searches
reuse the visible panel and never reactivate its initial blocking loader. The
existing bounded list result atomically replaces visible metadata when ready.

Analyze gate: this supersedes `DES-AGENT-130` only where that design refreshed
on every mount and cancelled automatic work on unmount. It does not change the
SQLite schema, IPC contract, native transcript ownership, scan ceiling, live
fallback or user preference. The user explicitly requested real cache reuse
after observing repeated long Gemini scans, so no material decision remains.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-114` | `DES-AGENT-132` | `TEST-AGENT-192` | `T-AGENT-201` |

## `DES-AGENT-133`: Agent-Scoped Asset Selection Dialogs

The Agent MCP panel reuses `McpLibraryDeployDialog`, which already owns bounded
My MCP selection, disabled/already-installed states and target application. The
panel supplies the first matching writable preset exactly as the previous
navigation handoff did, but invokes the MCP store directly and refreshes the
Agent target status in place. Target conflicts retain the existing explicit
overwrite confirmation; no new IPC or persistence contract is introduced.

The Agent Plugin panel opens a dedicated library selection dialog over the
current workspace. The dialog reads the existing Plugin library, filters in
memory, keeps selected ids in bounded component state and exposes the existing
copy/symlink modes. Confirmation distributes sequentially through the existing
Plugin store to the enabled target ids already scoped to the current Agent,
then reloads the shared library/target matrix. Standalone manager navigation
remains available from detail actions, but is no longer the Add workflow.

Selection and duplicate checks are `O(A)` for library assets and `O(T)` for the
bounded Agent target set. The dialogs add no filesystem access, network call,
background process, durable UI state or unbounded cache.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-115` | `DES-AGENT-133` | `TEST-AGENT-193` | `T-AGENT-202` |

## `DES-AGENT-134`: Provider Product Vocabulary And Native Read Boundary

The renderer removes the native-import commands from the shared Provider
workbench, native detail and Pi catalog. The native summary remains a derived,
read-only view, and official restore keeps its existing explicit activation
preview. Add provider and PromptHub provider import continue through their
existing workflows.

All seven locale namespaces replace user-facing profile/configuration-profile
copy with the locale's provider term. Component, store, shared type, IPC and
database identifiers keep `ProviderProfile` for compatibility; changing those
names would add migration and contract risk without changing product behavior.
The unused native-import dialog is removed from the renderer, while low-level
preload/main operations remain available to avoid an unrelated cross-process
contract deletion.

The change removes UI branches and performs no new scan, filesystem write,
network request, persistent state or cache. Rendering remains `O(P + M)` for
the bounded provider/model inventory with the same memory bound.

Analyze gate: the requested product vocabulary conflicts only with existing
UI copy, not with the durable Provider Profile boundary. Keeping internal names
and removing the exposed conversion action resolves the conflict without a
schema or migration decision.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-116` | `DES-AGENT-134` | `TEST-AGENT-194` | `T-AGENT-203` |

## `DES-AGENT-135`: Plugin Empty-State And Git Proxy Authority Boundary

`AgentPluginAssetPanel` always opens the fixed-Agent library dialog. Inventory
emptiness is evaluated before target availability so an empty library renders a
plain no-Plugin state and never emits the internal no-target toast. When library
packages exist but the scoped target list has no enabled destination, the dialog
renders one user-facing unsupported notice and disables selection and install.
No target is guessed or created.

The desktop network-proxy service remains the only owner of effective proxy
environment. `system` restores the environment captured at application startup,
`direct` removes upper- and lower-case HTTP(S), ALL and NO proxy variables, and
`manual` writes the validated configured proxy and bypass rules. Settings changes
continue to apply immediately through the existing settings IPC path.

The core Git runner performs one bounded attempt and inherits that effective
process environment. It does not inspect proxy failures, switch to direct mode or
override Network Settings. Existing 30-second timeout, diagnostic redaction and
temporary-path cleanup remain unchanged. Runtime stays `O(1)` with one Git
attempt.

The renderer owns one shared Plugin operation error presenter. It classifies
network/proxy, source access, package validation, duplicate, local storage and
Git availability failures into seven-locale messages containing the failed
operation, likely cause and corrective action. Market install, local/source
import, Agent deployment and batch installation use that presenter. Batch
installation keeps aggregate counts and appends the first explained failure.
Unexpected errors retain only a bounded sanitized reason; source URLs, local
paths, IPC prefixes and internal wrappers are removed. If Agent deployment
succeeds but its inventory refresh fails, the dialog reports that distinct
partial-success state rather than claiming installation failed.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-117` | `DES-AGENT-135` | `TEST-AGENT-195` | `T-AGENT-204` |

## `DES-AGENT-136`: Source Import Presentation And Protocol Projection

`AgentProviderSourceCandidate` adds a bounded ordered `protocols` list while
retaining `protocol` as the recommended default. `ImportAgentProviderSourceRequest`
adds the required selected `protocol`. This is an in-version renderer/preload/main
contract update with no database or filesystem migration.

The main source service owns one projection function for list and import. It
intersects the source `apiProtocol` with the destination Agent's verified write
formats: Codex and OpenCode can choose OpenAI Chat or Responses; Pi can choose
its OpenAI Completions or Responses APIs; Claude, Gemini and Qwen retain their
direct protocol-specific mappings. Import recomputes that list and rejects any
submitted value outside it before accessing the profile creator or Pi writer.
For `openai` on the exact official `api.openai.com` host, Responses is ordered
first for Codex, OpenCode and Pi; compatible third-party endpoints keep
Chat/Completions first. The user may still explicitly select the other verified
direct protocol.
There is no proxy or format conversion fallback.

The renderer reuses `ModelIcons.getCategoryIcon`, `getProviderIconCategory`,
`getModelCategory` and the portal-backed shared `Select`. Provider identity is
derived from `providerKind`; model identity is derived from the selected model
and provider. This keeps light/dark assets and fallback behavior identical to
Model Services without adding image files or another icon registry.

Listing performs `O(P + M)` work over the already bounded AI configuration.
Each provider receives at most two protocol options, so selection state is
`O(1)` and no cache, network request or background process is added.

Analyze gate: CC Switch v3.19.2 confirms that upstream API format is an explicit
provider choice and distinguishes direct Responses from Chat/Anthropic formats.
PromptHub adopts only that interaction principle; its actual options remain
constrained by PromptHub's existing native Agent adapters, and no CC Switch
runtime code, routing proxy or promotional preset is copied.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-118` | `DES-AGENT-136` | `TEST-AGENT-196` | `T-AGENT-205` |

## `DES-AGENT-137`: Shared Provider Sidebar Actions

`AgentProviderWorkbenchActions` owns the two shared entry presentations used by
the Profile-backed workbench and Pi's native catalog. The toolbar renders Import
from PromptHub followed by Add custom provider, using the same add icon and the
existing secondary button treatment. `AgentProviderWorkbenchLayout` no longer
owns a fixed footer because no provider creation action remains at the bottom.

Each provider navigation surface owns only a bounded `{x, y}` context-menu
position. Its native `contextmenu` event opens the shared menu, whose actions
call the same state setters as the toolbar. The menu adds no alternate import,
creation, IPC or persistence path. Busy state disables both presentations;
Web omits the unsupported PromptHub import action.

Rendering and interaction remain `O(1)` beyond the existing provider list. The
change adds no scan, network request, cache, durable state or background task.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-119` | `DES-AGENT-137` | `TEST-AGENT-197` | `T-AGENT-206` |

## `DES-AGENT-139`: Layered Inline Provider Form Surface

`AgentProviderProfileFormDialog` remains the owner of the inline right-pane
editor. Its scroll body uses the existing muted application background and
contains one bounded `bg-card` form surface. Identity, connection, models and
authentication remain full-width bands inside that surface, separated by
borders and compact icon-backed headings. This adds hierarchy without nesting
cards or changing form state, validation, save behavior or pane sizing.
Each band's field group uses one full-width column because the editor already
occupies the narrower third pane; no control is paired with empty half-row space.

The shared `Input` component gains an explicit `outlined` presentation variant
so repeated provider fields do not fight the default borderless input classes.
`AgentProviderFormSelect` composes the existing portal-backed shared `Select`
with the same border, card background, radius, focus ring and disabled treatment;
all four provider-form selection surfaces use it and no native `select` remains.
Its form presentation keeps the portal and positioning behavior but replaces
the shared menu's promotional radius and deep shadow with a trigger-width,
small-radius, light-shadow list whose selected row uses the neutral muted fill
and a primary check icon.
Provider-kind labels are human-readable while submitted values remain the exact
adapter contract. Protocol options continue to come only from each Agent's
verified direct write formats; the protocol bridge change remains separately
gated.

The form reuses CC Switch's field concepts only as interaction evidence. Name,
provider id, endpoint, model, context size and API-key inputs receive concrete
examples, including destination-specific model ids and `/v1` endpoint hints for
OpenAI-family adapters. No notes, website, icon, proxy or request-conversion
field is added because PromptHub has no matching durable contract in this form.
The surface and every text, secret and select control span the available pane
width at all supported viewport sizes.

Rendering remains `O(F + O)` for the bounded field and option counts; each
selector performs one bounded linear lookup over at most seven options. It uses
no new durable state, scan, network request, persistence, IPC, timer or background
process.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-121` | `DES-AGENT-139` | `TEST-AGENT-199` | `T-AGENT-208` |

## `DES-AGENT-140`: Claude Code Role-Based Model Mapping

Claude role models use the existing `AgentProviderModelMapping` boundary rather
than adding profile JSON or a storage migration. `primary` maps to the native
top-level `model`; optional `sonnet`, `opus`, `haiku` and `subagent` routes map
to `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`,
`ANTHROPIC_DEFAULT_HAIKU_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL`. The renderer
emits only non-empty optional mappings, and the Claude adapter owns validation,
native import, planning, atomic write, post-write verification and rollback.

The adapter parses the bounded mapping list once into a route record. It rejects
unknown or duplicate route keys, non-empty parameters, missing primary values,
control characters and model ids longer than 512 characters. Activation clears
the four managed role keys before applying the selected profile, preventing a
previous profile's role override from leaking into the new provider while
preserving all unrelated JSON and environment keys.

The field count is fixed at five, so parsing, rendering and reconciliation are
`O(1)` in product terms and use no cache, scan, network request or background
process. Endpoint model discovery is not coupled to this UI-only addition: a
future implementation must reuse the main-process SSRF, timeout, response-size,
proxy and write-only-secret boundaries rather than calling a renderer fetch.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-122` | `DES-AGENT-140` | `TEST-AGENT-200` | `T-AGENT-209` |

## `DES-AGENT-142`: Codex Primary-Model Runtime Parameters

Codex reasoning effort and context window use the existing primary
`AgentProviderModelMapping.parameters` object rather than profile JSON or a new
schema. The optional `reasoningEffort` value maps to top-level
`model_reasoning_effort`; optional `contextWindow` maps to top-level
`model_context_window`. Import projects the same values back onto the primary
mapping, so list, edit, activation and native state share one durable value.

The adapter accepts only the official bounded reasoning enum and a safe positive
integer no larger than 10,000,000. Reasoning effort is rejected outside the
Responses path, except for the native OpenAI profile whose transport is owned by
Codex. Activation surgically replaces or removes only the two managed scalar
keys. The TOML editor preserves trailing comments and rejects arrays, inline
tables, non-integer replacements or other complex shapes instead of reformatting
the whole file.

The mapping list and parameter set are fixed-size, so validation and rendering
remain `O(1)` with no cache, network request, database migration, process or
background resource. `disable_response_storage` is absent from the current
official Codex reference, `goals` is global rather than provider-owned, and
OpenAI-auth reuse changes credential ownership; none belongs in this bounded
model-parameter change.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-124` | `DES-AGENT-142` | `TEST-AGENT-203` | `T-AGENT-212` |

## `DES-AGENT-141`: List-Owned Activation And Ephemeral Native Tests

The shared Provider workbench renders activation state beside each provider
identity through `AgentProviderActivationSwitch`. It remains a command surface,
not a second durable boolean: the checked state is derived only from the
verified native digest/current profile state. A checked switch is disabled so
the UI cannot create an invalid no-provider state. Selecting another row's
switch delegates to the existing activation preview and review dialog; apply,
verification and rollback remain owned by `AgentProviderActivationService`.

Current native testing uses two explicit preload/IPC operations. Core calls the
registered adapter's `importCurrent`, validates its sanitized preview, and
constructs an in-memory `native:<platformId>` profile plus bounded model
mappings. It then reuses the adapter's existing connection/model probe and
result validation. The ephemeral target never enters the repository, secret
store, snapshot store or activation writer. Model cancellation keeps the
existing renderer-scoped request id and `AbortController` lifecycle.

Codex is the explicit platform-native exception to the generic unsupported
fallback. The Codex adapter resolves the allowlisted `codex` executable through
the shared native-command resolver and points `CODEX_HOME` at the validated
Agent root. Connection testing runs `codex login status`, which checks the
official authentication method without a model request. Model testing runs
`codex exec` with `--ephemeral`, `--ignore-user-config`, `--ignore-rules`,
`--skip-git-repo-check`, `--sandbox read-only`, an explicit model and a bounded
temporary final-message file. The runner uses no shell, accepts cancellation,
cleans temporary output in `finally`, never returns stdout/stderr or auth data,
and maps only allowlisted error classes to the shared redacted result contract.

One extracted `AgentProviderConnectionCheck` renders both stored and current
provider results. Runtime cost is `O(M)` for the current preview's bounded model
mappings and one explicit network probe at most; there is no cache, scan,
background process or additional persistent state. Probe failures remain
redacted at the core boundary. Unimplemented platform-native protocols return
the adapter's truthful unsupported state; official Codex uses the bounded native
probe above.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-123` | `DES-AGENT-141` | `TEST-AGENT-201` | `T-AGENT-210` |

## `DES-AGENT-143`: Encrypted Codex Account Snapshots

Codex continues to own one active `<codex-root>/auth.json`. PromptHub adds a
desktop-main `AgentCodexAccountService` whose private vault lives under the
PromptHub user-data root. Each entry contains bounded public metadata, a SHA-256
digest of the exact native bytes and a `safeStorage` ciphertext. Raw JSON and
tokens never leave the main process after the write-only import call.

The service exposes list, save-current, import, activate and delete operations
through fixed preload/IPC channels. Activation is serialized per vault, saves
an unrecognized current file as a recovery account, decrypts and validates the
target, writes a same-directory temporary file with mode `0600`, renames it over
`auth.json`, re-reads its digest and rolls back to the prior bytes on any write
or verification failure. Active entries cannot be deleted. The vault and native
payload are bounded to 32 accounts and 256 KiB per account.

No database migration, provider activation, network call, process, watcher,
timer or background cache is introduced. List and activation are `O(A)` for at
most 32 metadata records; native replacement is `O(B)` for a payload bounded to
256 KiB. The account manager renders only inside Codex's official native
provider detail and does not expose a general-purpose secret JSON editor.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-125` | `DES-AGENT-143` | `TEST-AGENT-204` | `T-AGENT-213` |

## `DES-AGENT-144`: DeepSeek Harness Profile Adapter

DeepSeek Harness is registered with a `plugin-harness` asset model, a
`DSH_HOME` root override, the `dsh` executable, and no generic Skills, MCP,
Rules, Appearance, Provider, Config Files, or Session path claim. The shared
Agent shell uses that declaration to show only Overview and Plugins. The
Plugins destination renders `AgentDeepSeekHarnessPanel` instead of the generic
PromptHub Plugin target view; this is a platform adapter, not a second canonical
PromptHub Plugin library.

Desktop main owns `AgentDeepSeekHarnessService`. Profile enumeration reads at
most 64 direct, non-symlink profile directories and only their bounded
`package.json` manifests. Opening one profile reads at most 128 unique bundle
or dependency manifests. Installed package resolution follows pnpm links from
the selected profile's `node_modules` only when their real target remains
inside the Harness root, and returns sanitized identity,
version, description, license, repository, bundle/client declarations,
dependency source, enabled/direct status, and lifecycle-script names. Script
bodies and arbitrary package content never cross IPC. Profile listing is
`O(P)` and selected detail is `O(D)` for the declared hard limits; it uses no
watcher, timer, database row, sync payload, or unbounded cache.

Three typed IPC operations list profiles, read one selected profile, and mutate
one plugin. Both IPC and service layers validate the fixed Agent id, strict
profile/package grammar, allowed keys, operation, and risk acknowledgement.
Mutations resolve only the allowlisted `dsh` executable and invoke one of:
`plugin --profile <name> add <source>`, `update <package>`, or
`remove <package>`. They run without a shell, cap execution at two minutes and
128 KiB output, serialize per profile, discard stdout/stderr, and return only
allowlisted error codes. Update/removal first re-read the profile and reject
shipped bundles that are not direct dependencies. A successful mutation then
re-reads only the selected profile.

The renderer uses the shared portal-backed Select, standard buttons, Lucide
command icons, and theme-aware copies of the official DeepSeek Harness favicon
from the upstream repository. The platform icon resolver shares that identity
between the Agent list and workspace header instead of reusing the generic
DeepSeek provider logo. The panel also uses an explicit install confirmation
checkbox and a destructive removal confirmation. It keeps one
profile detail request in flight per selection and refreshes after mutations;
there is no background polling or remote marketplace discovery. Community
discovery remains separately gated because the upstream project exposes a
package contract, not an authoritative marketplace.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-126` | `DES-AGENT-144` | `TEST-AGENT-206` | `T-AGENT-215` |

## `DES-AGENT-145`: Registry-Aware Preference Merge

One pure ordering helper owns the merge used by both the Skill platform view
and Settings Agent Management. It first keeps the unique, currently available
ids from the saved preference. Each missing built-in id is then inserted after
the nearest predecessor that was present in the saved order. If the user had
not saved a preceding default entry, the explicit preference remains ahead and
the missing default is appended in product-default order. Remaining custom ids
are appended in their incoming order.

This keeps existing user-relative order while making new built-in Agents
visible without resetting or eagerly rewriting settings. Both management rows
and workspace cards continue to resolve identity through `SKILL_PLATFORMS` and
`PlatformIcon`, so DeepSeek Harness cannot drift to a generic provider title or
logo. The operation is bounded by the small platform registry, performs no I/O,
network access, persistence migration, process launch, or background work.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-127` | `DES-AGENT-145` | `TEST-AGENT-207` | `T-AGENT-216` |

## `DES-AGENT-146`: Session-Scoped Agent Skill Scan

`useAgentSkillAssets` owns cold-load readiness for the direct Agent Skills
workspace. When the current session has no result and no scan is in flight, it
invokes the existing `skill:scanPlatformSkills` contract once. Existing rows
remain visible during explicit refresh; an initial missing result renders the
loading state, while the store's scan error renders a retryable failure state.

`agentScanState` remains shared in memory by Overview, the direct Agent tab and
the Skills module, but `partializeSkillState` and persisted-state merge discard
it. Native Agent Skill directories are the source of truth, so a restart always
requires fresh observation. The existing bounded discovery performs `O(D + F)`
filesystem work for at most 1,000 discovered directories plus the validated
package files; it performs no network I/O and adds no watcher or polling loop.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-128` | `DES-AGENT-146` | `TEST-AGENT-208` | `T-AGENT-217` |

## `DES-AGENT-147`: Bounded Asset Summary Hydration And Lifecycle

The owning renderer stores expose summary-grade loaders instead of making
Overview invoke their full workspace loaders. Skills reuses the bounded native
directory scan and local managed-Skill read. MCP reads only target presets and
target status. Rules lists file descriptors without selecting or reading a
rule body. Plugins reads only the target compatibility matrix. Overview starts
only domains supported by the selected Agent, schedules no more than two domain
hydrators concurrently, and disables cross-domain validation. Each owner
deduplicates an in-flight summary load and retains successful rows when a later
refresh fails.

`AgentAssetInventory` derives one state from owner facts:
`idle`, `loading`, `ready`, `refreshing`, `stale`, or `failed`. Initial loading
and failure never emit a numeric count. Refreshing and stale states keep the
last successful count, with explicit secondary text. A successful empty result
is the only state that renders zero. The shared Skills, MCP, and Plugins
management surface renders a dedicated failure body with an accessible retry
button when no rows have ever loaded; a refresh failure remains an alert above
cached rows. Rules keeps its existing richer missing-file and retry states.

The Rules aggregate excludes declared descriptors whose native file does not
exist, so a known writable path is not misreported as an installed rule. All
loads are local, bounded by existing IPC/service limits, and session-cached.
For `D` supported domains and `N` returned summary rows, scheduling is `O(D)`
with a fixed concurrency ceiling of two and projection is `O(N)` time and
space. No schema, IPC contract, persistence layout, network request, watcher,
timer, process, or background service is added.

Analyze gate: `FR-AGENT-022` requires live owner summaries while archived
`FR-PERF-15` and stable performance section 9 previously prohibited every cold
Overview read. The selected resolution narrows the prohibition to deep or
high-fan-out work and permits bounded summary-grade hydration. The user's
2026-08-19 report confirms that an indefinitely unknown/false-empty Overview is
not acceptable product behavior. There are no unresolved material decisions or
`[待确认]` items.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-129` | `DES-AGENT-147` | `TEST-AGENT-209` | `T-AGENT-218` |

## `DES-AGENT-148`: Native Tray Quota Projection

`TrayController` owns one Electron `Menu` on every desktop platform. It builds
the Agent Quotas submenu from a main-process snapshot and installs that menu on
the tray; macOS no longer routes primary click to a custom BrowserWindow. The
renderer entry has one application bootstrap path, and all popover-only
renderer, window, controller, CSS and locale assets are deleted.

A focused main-process projection derives typed rows from the shared verified
usage-capability registry, keeps the existing preferred order and calls the
process-wide `AgentUsageService`. It uses a two-worker
queue, deduplicates an in-flight reload, validates returned Agent identity,
normalizes thrown failures to a redacted unavailable result and retains a
successful row as stale when a later refresh is unavailable. Each settled row
publishes a new cached native-menu snapshot without mutating an already-open
OS menu instance.

`tray-menu.ts` remains the presentation boundary. It consumes shared pure plan,
remaining-percent and primary-metric helpers, bounds dynamic metrics to the
existing 64-item contract, strips control characters and caps every dynamic
label. The native hierarchy is Agent summary -> optional plan + metric/reset
lines, followed by Refresh Quotas and Open Agent Workspace commands. For `P`
verified providers and `M` metrics, refresh is `O(P + M)` time, `O(P + M)` snapshot
space and `O(1)` network concurrency capped at two. No new credential,
renderer IPC, database, filesystem, backup, sync, watcher, timer, port or
process owner is introduced.

Analyze gate: this design intentionally replaces the rendered-surface clauses
of `FR-AGENT-093` and `DES-AGENT-110`; the user's 2026-08-19 instruction is the
explicit product decision. `DES-AGENT-108/109` remain valid for native
projection, cache, bounded concurrency and Kimi renewal. There are no unresolved
material choices or `[待确认]` items.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-093` | `DES-AGENT-148` | `TEST-AGENT-210` | `T-AGENT-219` |

## `DES-AGENT-149`: Shared File-Editor Surface Hierarchy

`AgentConfigFilesPanel` keeps the application `background` token as its shell
and uses the `card` token for the native-config title bar. The reusable
`SkillFileEditor` owns the split-pane hierarchy: its file tree remains the
secondary muted surface, while the right editor pane is a card surface. The
shared `SkillCodeEditor` host and CodeMirror root use that same card token; the
existing translucent muted gutter, toolbar, active-line and status treatments
then composite against the primary surface instead of a second gray canvas.

This applies the hierarchy at the shared editor boundary rather than adding an
Agent- or Codex-specific stylesheet. It uses no raw `white`, hex color, new
token, nested card shell, shadow, animation, or dependency. Existing borders,
focus states, selection states, keyboard navigation and dark-theme variables
remain unchanged.

Rendering remains `O(1)` and adds no state, allocation proportional to file
size, filesystem or database I/O, network request, IPC, timer, watcher, port,
or process. Analyze gate: the July neutral-tone pass made the config header
muted, but it did not require every workspace layer to share one fill. The
user's 2026-08-19 visual report resolves that presentation ambiguity while
preserving the neutral semantic palette. There are no unresolved material
choices or `[待确认]` items.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-130` | `DES-AGENT-149` | `TEST-AGENT-211` | `T-AGENT-220` |

## `DES-AGENT-156`: Registry-Only Doubao Work Skill Adapter

Doubao Work uses the existing `SkillPlatform` registry and generic Skill
installer. The built-in id is `doubao`, the display name is `Doubao Work`, and
the macOS root is the verified Agent workspace under Doubao's application
support directory. `skillsRelativePath` is `.user_skills`; no fallback points
at the sibling product-owned `.skills` inventory or at another Agent's shared
Skill directory.

Windows and Linux retain conservative application-data templates so users may
override them through the existing built-in Agent settings, but only the macOS
path and launch allowlist are currently verified. No MCP, Rules, Plugin,
Config, Provider, Session, Usage, CLI, schema, IPC, backup, sync, watcher,
network, or secret adapter is added. The UI reuses PromptHub's existing Doubao
provider mark instead of adding a second brand asset.

Detection performs the existing constant-time parent existence check. A Skill
scan retains the shared depth-eight and 1,000-directory bounds; installation is
`O(F)` time and bytes for the selected package's `F` files and adds no extra
network I/O or resident cache.

Analyze gate: local Doubao `2.27.10` evidence and its bundled Skill creator both
identify `workspace/.user_skills` as the default user creation directory and
explicitly reject `~/.codex/skills` and `.agents/skills` as fallbacks. The
verified boundary has no material unresolved decision.

| Requirement    | Design          | Verification     | Task          |
| -------------- | --------------- | ---------------- | ------------- |
| `FR-AGENT-137` | `DES-AGENT-156` | `TEST-AGENT-218` | `T-AGENT-227` |

## `DES-AGENT-157`: One Current Agent Contract

The evidence inventory, ownership changes, migration/recovery design and ordered
implementation batches are in [current-contract-design.md](current-contract-design.md).
This implements the accepted FR-AGENT-138 direction; implementation is pending.
Earlier read-time canonical/legacy modes and native-source fallback descriptions
in this change record remain implementation debt, not alternative accepted modes.

| Requirement | Design | Verification | Tasks |
| --- | --- | --- | --- |
| `FR-AGENT-138` | `DES-AGENT-157` | `TEST-AGENT-219` | `T-AGENT-228`, `T-AGENT-229`, `T-AGENT-230`, `T-AGENT-231`, `T-AGENT-232`, `T-AGENT-233`, `T-AGENT-234` |
