# Sync Spec

## Purpose

本规范定义 PromptHub 的稳定同步与远程备份语义，包括 WebDAV/S3 在线同步、自部署 Web 不可变备份与显式恢复，以及内部数据契约边界。

## Stable Requirements

### 1. Sync Contract

- 同步必须围绕可恢复的数据对象或稳定数据布局进行，而不是依赖临时 UI 状态。
- 不同在线同步后端可以不同，但用户可见的同步语义必须保持一致：连接验证、上传、下载、恢复、周期同步。
- 持久设置中的 provider 联合类型仍为 `manual | webdav | self-hosted | s3`，其中 `self-hosted` 只用于读取历史设置；当前版本加载后必须规范化为 `manual`，不得再把自部署 Web 作为在线同步源。
- WebDAV 与 S3 是在线同步 provider。桌面端可以同时配置多个目标，但自动在线同步在任一时刻只能由一个 `syncProvider` 驱动，避免多源竞争写入。
- 自部署 Web 是独立的远程备份目标，不受 `syncProvider` 选择限制。启用后可以与一个 WebDAV/S3 自动同步任务并行配置，但它的启动与定时任务只能上传新快照，不得拉取、合并或修改本地及 Web 在线工作区。
- 桌面端数据设置中的云备份导航应使用 provider 导向命名，并直接显示每个 provider 是否已启用。
- 对 `webdav` push/pull 的编排必须通过路由/页面外的 orchestrator 服务完成，避免在入口层直接堆叠远端流程细节。
- 桌面端必须记录最近的远端操作，覆盖 WebDAV/S3 手动备份与在线同步，以及自部署 Web 的启动、恢复启动、定时备份。记录只包含 provider、触发原因、状态、时间、是否更新本地数据和脱敏摘要，不得保存凭据、远端地址、token、bucket、remote path 或 payload。最近记录保存在兼容设置字段 `autoSyncHistory` 中，同时追加写入单个本地日志文件 `logs/auto-sync.jsonl`，不是每条记录一个文件。
- WebDAV/S3 legacy 与 incremental 上传成功结果必须明确报告 Prompt、Skill、Skill 版本、Skill 文件和媒体数量；零 Prompt 不得被呈现为无法判断 Skill 是否进入备份的“零数据”结果。

### 1.1 Stable Web Sync Response Shape

- Web `sync` 主操作接口（`PUT /sync/data`、`POST /sync/push`、`POST /sync/pull`）必须返回统一 `summary` 对象，包含：
  - `prompts`
  - `folders`
  - `rules`
  - `skills`
- 为保持兼容，可同时返回历史字段（例如 `promptsImported` / `promptsExported`），但 `summary` 作为统一消费入口。
- Web push/pull 失败路径必须走统一错误映射（当前为 `VALIDATION_ERROR`），并保留可诊断消息（例如连接失败 HTTP 状态、payload 非法原因）。
- WebDAV 结构化备份必须保持可恢复：`data.json`、`manifest.json`、以及被 Prompt 引用的媒体文件必须一起参与 push/pull；仅 `404` 可视为远端备份缺失并触发 legacy fallback，其他 HTTP 失败必须原样暴露为诊断错误。
- WebDAV structured push must upload referenced media before publishing `data.json` and `manifest.json`; pull must verify `data.json` and media bytes against the manifest hash/size before import can continue.
- Desktop WebDAV responses must decode UTF-8 across HTTP chunks; a chunk boundary inside a multibyte character must not change backup text or its content hash.

### 1.2 Complete prompt snapshot

- A complete prompt snapshot includes prompts, versions, folders, prompt
  relations, and output format items. `promptRelations` and
  `outputFormatItems` are optional for backward compatibility, but providers
  MUST preserve them when present.
- Desktop Electron restore preserves relation/output IDs through direct main
  process inserts and filters records whose prompt endpoints were not restored;
  graph-bearing fallback restores must fail before clearing data when that
  bridge is unavailable.
- Self-hosted Web export/import applies the same endpoint and visibility
  boundary. WebDAV and S3 legacy/incremental payload builders carry the same
  fields so provider choice does not change the restored prompt graph.
- Web import responses expose imported and skipped counts for prompt relations
  and output-format items whenever those collections are present; dangling
  dependencies are never reported as fully restored.
- Incremental WebDAV/S3 downloads verify the serialized data hash and each
  manifest-listed media hash/size before local restore begins; missing or
  mismatched payloads fail without clearing local records.
- WebDAV/S3 portable snapshots exclude sync credentials, API keys, access keys,
  tokens, proxy credentials, and provider/model secrets even when transport
  encryption is enabled. Restore merges portable settings while retaining the
  destination device's local credentials.
- Desktop ZIP/logical restore first merges the selected scopes into a detached
  candidate. The existing canonical projector rebuilds its file graph and
  catalog; the same restore journal verifies both before publication and after
  publication. Successful restore must survive normal initialization and reopen.
  Candidate projection reads only candidate files, never native Agent targets.
  Its catalog paths refer to the final destination root. Unselected domains,
  operation/migration records, conversations, attachments and unreferenced media
  remain intact; any failure restores the prior root through the same journal.
  A Prompt selected without its history receives one snapshot at its existing
  current version, preserving its text, variables, AI response and timestamp.
  Selected histories must satisfy the current-version contract; restore does
  not fabricate missing entries in a selected history. Independent marketplace
  metadata retained by the scope merge survives candidate projection.
- WebDAV/S3 legacy and incremental download pass the complete verified snapshot
  (including inline media, portable settings and AI configuration) to that same
  restore owner once. They must not write settings or media after publication:
  the desktop restore closes the active database and schedules a restart.
  The remote layout and schema do not change; failure recovery remains owned by
  the existing restore journal and safety snapshot. GUI acceptance on 2026-10-22
  exposed a duplicate post-restore settings write that rolled back a restored
  Skill package; regression and cold-reopen verification cover both formats.
- Selecting settings imports all four `AGENT_SETTING_KEYS` through the existing
  `agent-settings-v1` import boundary, including when the target is nonempty.
  Unselected settings, nonportable device configuration and local secret bytes
  remain unchanged. Selecting MCP retains device bindings only for server IDs
  present after restore; unselected MCP retains all bindings. Canonical MCP
  bundles retain their complete history and secret references without decrypting
  secrets. Missing local credentials remain unavailable, never replaced with a
  redaction marker. Restore does not apply files to external Agent installations.
  These checks cover the current canonical runtime, not the pending foundation
  conversion to SQLite ownership.
- WebDAV/S3 pull and download create a lazy local safety snapshot only after the
  remote payload has passed validation and immediately before mutation. Any
  subsequent restore failure triggers rollback; rollback failure is reported
  separately and never presented as a successful sync. An empty local data
  directory uses a manifest-only baseline instead of skipping rollback safety.
- Desktop startup, interval and save-triggered synchronization use the main-process
  causal workflow at `prompthub-sync/head.json`. Explicit legacy/incremental
  backup and restore remain separate operations; timestamps do not choose live
  sync authority. Existing backups are not silently adopted as a live baseline.
- The complete inventory includes Prompt graphs and referenced media, whole Skill
  packages/history, Rules/history, MCP/history, Plugin packages/history, Agent
  provider profiles, Generation outputs, portable settings and remote marketplace
  sources. Credentials, native deployment bindings, Agent installation roots,
  local-directory marketplace sources and device recovery paths stay local.
- Independent resource edits merge against the common base; absent resources
  become tombstones. Conflicts require explicit per-resource selection. Unrelated
  nonempty libraries require an explicit complete-library baseline choice.
  Review tokens pin local content, common base and observed remote ETag; stale
  choices require a refreshed review. Both inventories are preserved under
  `recovery/causal-sync/` before resolution, and immutable remote generation
  archives retain previous committed metadata.
- Targets must pass real conditional-write behavior probes. Unsupported targets
  expose manual backup capabilities only. Optional encryption wraps every new
  live-sync payload with the existing AES-GCM/PBKDF2 codec, retaining ciphertext
  ETags for conditional publication; wrong passwords never trigger plaintext
  fallback. In-flight calls for one target share its single persisted operation.
- SQL/file application and the common baseline share one publication receipt.
  Renderer settings writes are awaited before capture; incoming updates refresh
  domain stores while preserving an unsaved Rule draft. No-change synchronization
  advances metadata without rewriting domain packages.
- Source integration passes controlled HTTP/SDK two-profile tests and isolated
  built Electron baseline selection with two cold reopens. These fixtures do
  not establish deployed WebDAV/S3 vendor acceptance.
- Skill safety provenance in portable snapshots uses `scanMethod: ai |
preflight`. Legacy `static` values normalize to `preflight`; an unknown
  string provenance drops only that auxiliary safety report, while malformed
  report fields still reject the snapshot. Import must not rewrite a current
  `preflight` report as an AI result.
  Desktop renderer normalization also preserves the current method and report
  fields on initial load and repeated normalization; it is not a legacy import
  compatibility boundary and must not label a preflight result as AI.
  The displayed method label and description select the same current provenance:
  `preflight` is deterministic content analysis without an AI model, and `ai`
  retains the AI-assisted label. Imported descriptive reports are not installation
  authorization. All seven Desktop locales define both current methods.
  AI-specific scoring dimension explanations appear only for AI reports;
  preflight still shows its risk level, findings, scan details and any stored score.

### 2. Desktop And Web Relationship

- 桌面端只把自部署 Web 作为独立备份与恢复目标；当前 UI、启动任务和定时任务不得调用 live workspace 的 `/api/sync/data` 或媒体写入接口。
- 自动备份与手动创建备份前，桌面端必须读取本机安装版本和 Web `/health`、受保护 capabilities 返回的服务版本。三者必须完全一致，备份协议也必须匹配；否则在导出本地数据前停止。Web 创建路由必须再次校验客户端版本，且不得回退到旧同步接口。
- Web 通过 `/api/backups/desktop` 为每个认证用户保存不可变、带 SHA-256 校验的快照，默认保留最近 10 份。快照写入成功且目录元数据持久化后才可清理旧快照；备份目录、用户目录或快照文件不得接受符号链接。
- 自部署快照包含 Prompt、版本、文件夹、关系、输出格式、Rule、Skill 完整文件和版本、MCP/Plugin 库及包、商店源、Agent 资产文件、内联媒体和非秘密设置。未加密通道必须递归排除密码、token、API key、access key、代理凭据等已知凭据字段。
- 恢复只能由用户显式触发。桌面端先读取并校验服务端最新快照，紧接在本地写入前
  创建安全快照；安全快照失败时不得开始本地恢复，恢复失败时必须回滚。自动任务
  永远不得调用恢复。
- 单次备份请求当前上限为 50 MiB；超过上限必须在解析和写盘前拒绝，避免无界 JSON/base64 内存占用。网络读取使用 15 秒超时和一次有限重试；创建快照等写操作不得自动重试，避免产生重复快照。
- 旧 `/api/sync/data` 路由在兼容窗口内继续存在，但只服务旧客户端；当前桌面 UI 与调度器不再调用它。
- 面向用户的自部署说明在 `docs/web-self-hosted.md`，内部同步与布局事实在 `spec/`。
- 自部署 Web 备份 payload 必须保留 MCP/Plugin 库、包、商店源与 agent asset 文件，即使浏览器不提供这些 Desktop-owned 资源的管理界面。

### 3. Stable Internal Sources

- Web 与数据布局演进的历史资料保存在 `spec/changes/legacy/docs-08-todo/`。
- 稳定数据布局事实见 `spec/knowledge/structure/storage-architecture.md`。

## Stable Scenarios

### Scenario: Contributor changes sync semantics

When sync semantics, backup format, or restore logic changes materially:

- they update this owning topic when requirements change, marking implementation gaps
- they keep a plan only when needed under the documentation routing rule

### Scenario: Contributor adds sync route behavior

When web sync route behavior is changed:

- contributor keeps provider-specific IO in orchestrator service (`apps/web/src/services/sync-orchestrator.ts`)
- contributor preserves response compatibility while maintaining unified `summary`
- contributor validates route contract with unit/integration tests under `apps/web/src/routes/sync.test.ts`

### Scenario: Desktop has multiple backup targets configured

When desktop users enable more than one cloud backup target:

- manual backup, download, and restore actions can remain available for every enabled target
- WebDAV/S3 startup, interval, and save-triggered live sync run only for the selected `syncProvider`
- WebDAV/S3 automatic cadence, startup, and save-triggered controls are disabled when that target is not the selected `syncProvider`; changing these dormant values must not appear actionable
- self-hosted startup and interval backup can run independently, but only uploads immutable snapshots
- settings navigation keeps provider-oriented labels and shows which providers are enabled without entering each panel

### Scenario: Desktop user checks sync history

When a desktop user runs a manual WebDAV/S3 backup or enables automatic sync or self-hosted automatic backup:

- each manual backup records success or failure, and each automatic attempt records success, failure, or skipped state
- skipped state explains common reasons such as offline, hidden window, an in-flight operation, inactive live-sync provider, incomplete config, or Desktop/Web version mismatch
- the data settings UI shows recent entries so users can confirm background sync activity without opening developer tools
- the local data paths UI exposes `logs/auto-sync.jsonl` so users can open the durable local log file directly

### Scenario: Desktop user backs up Skills to WebDAV or S3

When a workspace contains Skills and the user creates a remote backup:

- the remote snapshot carries Skill metadata, versions, and complete filtered file snapshots
- the success message and typed result details report all three Skill counts even when the workspace has zero Prompts
- a Skill metadata/version/file read failure fails the backup instead of reporting zero Skills

### Scenario: User needs deployment-level sync guidance

When a user asks how desktop and self-hosted web interact:

- the public operational guide remains in `docs/web-self-hosted.md`
- deeper contracts and change history remain in `spec/`

## Current Verification Gaps (2026-10-12)

- Portable restore still fails the selected Agent settings equality check: normal startup adds Gemini to the imported disabled-platform list. The imported explicit setting remains the required result; the failing assertion is retained.
- The combined nonempty Provider/Generation ZIP cases still fail stable mapping identity and generation artifact equality after reopen. Successful candidate publication does not establish complete restore fidelity.
- Private-folder integration tests still demonstrate a usable encryption key in the persisted verifier and plaintext content in durable storage. Password rotation/reopen passing does not establish encrypted-at-rest protection.
- Evidence: Desktop integration suites `release-acceptance-data-recovery-portable.test.ts` and `release-acceptance-data-recovery-privacy.test.ts`; isolated SQLite/filesystem and registered IPC, without GUI or release-package acceptance.
