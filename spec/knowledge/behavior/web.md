# Web Spec

## Purpose

本规范定义 PromptHub Web / self-hosted 方向的稳定产品与工程边界。

## Stable Requirements

### 1. Product Role

- `apps/web` 的目标是可自部署网页版 PromptHub，而不只是纯 API helper。
- Web 版本应支持浏览器访问、认证、核心 Prompt/Folder/Skill 管理，以及作为 desktop 的同步目标。

### 2. Documentation Ownership

- 面向部署者的公开说明放在 `docs/web-self-hosted.md`。
- 更细的内部设计、布局迁移、REST API 规划与实施任务放在 `spec/`。

### 3. Stable Internal Sources

- Web 的架构与数据布局参考 `spec/knowledge/structure/storage-architecture.md`。
- Web 的长期实施规划与布局迁移历史保存在 `spec/changes/legacy/docs-08-todo/`。

### 4. Self-Hosted Runtime Packaging

- Web 自部署 runtime 在 Docker 或其他生产构建中必须能完整启动认证验证码服务。
- 如果服务端依赖像 `svg-captcha` 这样会在运行时读取包内静态资源的库，SSR 构建不得把它错误内联到 bundle 中，否则会破坏其字体或资源的相对路径读取。

### 5. Cloudflare Worker Packaging

独立 Worker 的运行时、打包与验收已归入 [Cloudflare](cloudflare.md)；本文件只维护自托管 Web。

### 6. Web Auth Client Identity

- `apps/web` authentication rate limits must not trust caller-supplied
  `X-Forwarded-For` or `X-Real-IP` headers by default.
- Self-hosted deployments may set `TRUST_PROXY_HEADERS=true` only when their
  reverse proxy strips untrusted incoming forwarding headers and writes trusted
  client IP values.
- When trusted proxy headers are disabled, auth rate limits intentionally use a
  coarse fallback client bucket rather than a spoofable header-derived identity.

### 6.1 Web Auth Captcha Configuration

- Web auth captcha is enabled by default for setup and login.
- Self-hosted deployments may set `AUTH_CAPTCHA_ENABLED=false` only for trusted private/LAN personal deployments where captcha friction is not useful.
- When captcha is disabled, `/api/auth/bootstrap` must report `captchaEnabled: false`, setup/login UI must not request or render captcha, and register/login routes must not require `captchaId` or `captchaAnswer`.
- `AUTH_CAPTCHA_ENABLED=false` must not disable password validation, JWT cookie behavior, registration restrictions, or auth rate limits.
- `apps/web-cloudflare` must mirror the same `AUTH_CAPTCHA_ENABLED` contract for captcha issue, register, login, and bootstrap behavior.
- Public or internet-reachable deployments should leave `AUTH_CAPTCHA_ENABLED=true`.

### 7. Web Runtime JSON State

- Small Web runtime JSON state files that mirror active server state should use
  same-directory temporary writes followed by rename when an interrupted direct
  overwrite could destroy the previous durable state.
- Device registry files under `config/devices/<userId>.json` must preserve the
  previous readable registry if a heartbeat write is interrupted before the
  replacement JSON is complete.
- Settings mirror files under `config/settings/<userId>.json` must preserve the
  previous readable settings snapshot if a mirror write is interrupted before
  the replacement JSON is complete.

### 8. Web Media Files

- The media upload response owns the stored filename. Browser clipboard uploads
  and file selections must retain that returned name for previews and saved
  Prompt references, including HTTP environments without `crypto.randomUUID`.
  A failed upload must reject without returning an unpersisted filename.
  This changes no storage layout; previously broken references cannot be mapped
  to randomly named files safely and must not be guessed or silently rewritten.
- Uploaded and remotely downloaded media files under
  `data/assets/<userId>/{images,videos}/` must be written to a same-directory
  temporary file first and renamed into place only after the full payload is
  written.
- Pulled sync media files written from import/sync payloads must follow the
  same temporary-file publication rule.
- Failed media writes must not leave an allowed-extension partial file visible
  to media list/read APIs.
- Sync/import flows must keep pulled media files and imported records
  consistent: if pulled media cannot be written, imported prompts/folders/rules
  must not become visible; if a later import step fails after pulled media was
  written, those media writes must be rolled back.

### 8.1 Web Rule Storage

- Rule metadata and version identity/order live in SQLite under the authenticated
  user. Different users may keep the same public Rule and version IDs. Current
  and historical content live under `data/rule-files/<userId>/`.
- Startup converts the previous `data/rules/<userId>/` metadata/index once with
  exact recovery copies. Unknown owners, conflicts and missing content fail
  without adopting an empty workspace. Normal writes never recreate JSON metadata.
- The [Rules persistence contract](rules-workspace.md#9-persistence-model) owns
  migration, publication, version retention and external-path behavior. Server
  imports and edits do not touch a client's external project directory.

### 9. Web Prompt Workspace Files

- SQLite owns Prompt, Folder, hierarchy and version state. Startup and normal
  CRUD do not export Markdown or replay an exported snapshot. SQL imports and
  sync are not constrained by Markdown export path lengths.
- Before writable services open, `web-prompt-workspace-v1` converts historical
  `data/prompts/`, including its nested `.versions/`, once. It preserves stable
  identities, owner/visibility, usage and AI response fields. Same-ID conflicts
  and unknown user references fail without dropping ownership or overwriting SQL.
  Truly ownerless records retain the existing first-administrator claim contract.
- Conversion preserves exact source bytes under
  `recovery/web-prompt-workspace-v1/<inventory-hash>/`, records completion in the
  migration ledger, and retires the source using the shared publication journal.
  SQL or filesystem failure rolls back; retry must preserve the same graph.
  A recreated historical source after completion requires explicit recovery.
- Explicit `POST /api/prompts/workspace/sync` exports a complete snapshot to
  `cache/prompt-workspace/`, including folder metadata and version files. Staging
  failures preserve the previous export. This cache is not a startup authority.
  Frontmatter retains `parentId`, `order`, owner and visibility.
- Prompt/Folder changes and ownership assignment share a SQL transaction.
  Direct insertion of an existing ID checks write ownership before updating it
  in place. It preserves existing versions, descendants, Prompt placement,
  relationships and output-format items. Explicit snapshot replacement owns
  deletion of the selected scope; row insertion cannot imply those deletions.
- Direct version import is idempotent only when identity, owner, version number
  and normalized content match the existing snapshot. Conflicting history returns
  409/CONFLICT and preserves existing rows; a successful response contains the
  stored snapshot rather than echoing uncommitted input.
- Rollback requires a paired pre-migration database safety point and the preserved
  source tree in an isolated root. Do not copy old Markdown into an active upgraded
  root; preserve post-upgrade writes before restoring a previous version.
- Hierarchy moves must keep parent and child in the same folder: moving a
  prompt under another prompt adopts the parent's `folderId` for the whole
  subtree; moving to the root keeps the prompt's own `folderId`. Folder views
  must not silently flatten a persisted parent-child link.
- Historical migration must restore prompts in parent-before-child order inside a
  transaction. A missing or cyclic parent reference must fail without making a
  partial prompt hierarchy visible.

### 9.1 Prompt Folder Visibility (#219)

- When an administrator creates a Prompt in a folder or moves it to another
  folder without explicit `visibility`, the destination folder determines
  visibility. Edits that keep the folder unchanged keep the stored visibility.
- Explicit mismatches still fail validation; inference never grants a normal
  user permission to create or edit shared records. The existing non-admin
  implicit mismatch remains a 422 response, not an elevated shared write.
- The fix in `f783066e` changes no schema or data layout. HTTP regressions in
  `apps/web/src/routes/prompts.test.ts` use the report's `{name, isPrivate:false}`
  folder body and omitted Prompt visibility for both create and move, then
  close/reopen SQLite and reconstruct routes before checking list/detail and
  authorization. These sequential lifecycle tests intentionally exceed 50 lines.
- 2026-10-14: reverting only the two inference expressions in an isolated
  copy reproduces the exact 422 visibility error in both cases. Current code
  passes both new HTTP regressions, the existing 17 route tests and 11 real
  service tests; Web typecheck passes. This verifies authenticated Hono requests
  and disk persistence, not browser interaction or the reporter's Docker image.

### 10. Web Skill Package Storage

- SQLite owns Skill metadata, visibility, ownership and version records. Normal
  writes do not emit `skill.json` or JSON version mirrors.
- Actual packages use `data/skill-files/<encoded-id>/files/`. Renaming a Skill
  does not rename its package; client `local_repo_path` is never a server read path.
- Changes publish only the affected package and SQL rows using the existing
  receipt journal. Failure restores both. Metadata-only edits do not scan packages.
- Startup converts historical `data/skills/` once, preserving the complete old
  tree under recovery and a database safety point. Unknown owners, missing files,
  divergent metadata or conflicting version identities fail without discarding
  either source. Downgrades require the matching pre-upgrade database and tree.
- Backups read real package bytes, include binary files and do not synthesize a
  missing package from SQL text. Restores match stable IDs and enforce ownership;
  timestamp selection applies to metadata, versions and files together. File
  publication participates in the same transaction decision as imported rows.
- Current body and historical snapshot blobs remain in SQL in this first
  conversion batch; their retirement remains part of the Foundation work.

### 11. Web Remote HTTP Streams

- `apps/web` remote HTTP helpers must enforce configured response byte limits
  for both buffered and streamed responses.
- `requestRemoteStream()` must count bytes while the returned stream is read;
  if the upstream sends more than `maxBytes`, the returned stream fails with
  `Remote response exceeds size limit` and the upstream response is closed.
- Stream size-limit failures must not expose unbounded upstream bytes through
  AI stream proxy routes or future remote stream callers.

### 12. Web Client Bootstrap And Workspace Loading

- The web client owns the setup/login/auth shell and embeds the desktop renderer
  only for the authenticated workspace route.
- Web client i18n must finish initialization before the React root mounts so
  setup, login, loading, and embedded desktop UI surfaces all render against the
  same initialized i18next instance.
- Web i18n resources are built by merging the desktop renderer locale for the
  active language with web-specific locale additions. English must also be
  loaded as the fallback resource when the active language is not English.
- The authenticated desktop workspace route must stay lazy-loaded so
  unauthenticated setup/login flows do not eagerly download or evaluate the
  desktop workspace bundle.
- Desktop renderer modal surfaces that are not visible during normal
  authenticated workspace render, including update, close, recovery, and backup
  import confirmation dialogs, should stay lazy-loaded behind local Suspense
  boundaries.
- AI execution helpers used by prompt testing, image generation, multi-model
  comparison, generated-image download, and skill translation should load on
  demand instead of being evaluated with the authenticated workspace shell.

### 13. Browser Workspace Capability Boundary

- The authenticated browser workspace supports server-backed Prompt, Folder,
  Rules, media, settings, and browser-safe Skill workflows.
- Worker `POST /api/prompts/:id/render-copy` matches variable keys literally
  and inserts values as literal text, including dollar replacement sequences.
  Rendering increments usage once and preserves the saved template and versions.
- Prompt hierarchy moves, graph relations, and output-format sequences must
  use authenticated Web APIs backed by the existing SQLite contracts; browser
  code must not fall back to IndexedDB for these records.
- MCP and Plugin synchronized libraries are browseable from the self-hosted Web
  Agent service pages. Browser actions must not project them into the viewer's
  local Agent configuration or fabricate distribution success.
- Local repository copy/symlink operations, installation into the viewer's
  Agent, process launch, tray/window behavior, and native dialogs remain
  Desktop-only. Self-hosted Web may inspect server-owned Agent paths only
  through bounded, authenticated server adapters.
- The browser Agents workspace uses the authenticated `GET /api/agents`
  contract. Administrators receive bounded, read-only, shallow existence checks
  for roots on the self-hosted server process account. Other users receive a
  per-user logical inventory and must not trigger server filesystem probes.
- Agent inventory is bounded to canonical built-ins plus at most 32 validated
  custom Agents. Root existence checks run concurrently through a five-second,
  256-entry cache and must not traverse Agent subtrees.
- Agent service discovery uses `GET /api/agents/:agentId/services`; individual
  domains use `GET /api/agents/:agentId/services/:domain`. Service results are
  capped at 200 items and report native action availability separately from
  the owning service.
- Administrators manage server-owned Provider profiles through Agent-scoped
  authenticated routes. Provider secrets stay in the encrypted server secret
  store and never appear in list, export, or mutation responses.
- Native Agent config read/write uses the shared bounded config-file service:
  reads redact secrets, writes require an expected revision, structured formats
  are validated, and atomic replacement is preceded by an encrypted rollback
  backup. Writes remain unavailable until the deployment provides a stable
  32-byte `AGENT_SECRET_KEY`; no JWT-derived or plaintext fallback is allowed.
- Session browsing uses the shared SQLite session index with bounded source and
  page limits. The browser may show only indexed redacted previews; native
  transcript parsing and resume/launch actions remain platform adapters rather
  than arbitrary server file reads.
- Config declarations use a fixed concurrency cap, and Appearance/Definition
  directories use bounded visits without following symbolic links. Initial
  Agent inventory performs no recursive service scan.
- Per-user Web settings remain the source of truth for built-in Agent
  overrides, custom Agent definitions, disabled IDs, legacy custom roots, and
  identity preferences. Desktop snapshot normalization must preserve those
  portable fields.
- A persisted browser UI module of `mcp` or `plugin` must resolve to Prompt;
  their Agent-scoped service pages remain available inside the persisted
  `agents` module and load only server-declared capabilities.

## Stable Scenarios

### Scenario: Contributor updates web architecture

When a contributor changes web data layout, sync semantics, or deployment model:

- they update the owning Web or shared topic, explicitly identifying implementation gaps
- they keep an activity plan only when needed under the documentation routing rule

### Scenario: User wants self-hosting help

When a user needs deployment instructions:

- the public entry remains `docs/web-self-hosted.md`
- internal planning and migration detail stays in `spec/`

## Current Verification Gap (2026-10-12)

The stale Provider mapping case in `tests/release-acceptance-cross-surface-agents.test.ts` returns HTTP 500 where the conflict contract requires 409. The real HTTP regression remains failing; successful profile persistence and rule rewrite tests do not establish this error mapping.

### Web Settings authority

- `user_settings` is the sole durable settings authority, isolated by user ID.
  GET supplies shared defaults without writing rows or files; PATCH and snapshot
  imports commit SQL changes transactionally. Null clears remain SQL deletions.
- `web-settings-sqlite-v1` imports historical `config/settings/<userId>.json`
  only at startup for users without SQL settings. Existing SQL snapshots retain
  precedence. Exact source bytes and unknown fields survive conversion; unsafe
  files, malformed known fields and unknown owners stop the upgrade.
- The converter retires the JSON directory with the existing SQL/file journal
  and preserves a private recovery tree and pre-migration database safety point.
  Completed conversion never replays backups or resurrects deleted rows. Restore
  the paired old database and sources in an isolated root to downgrade, preserving
  later writes first. Reintroduced legacy files require explicit recovery.
- Invalid persisted JSON is an error, not an alternate string-valued contract.
  Web credentials keep the existing server policy, without ordinary JSON mirrors.
