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

- Web 的架构与数据布局参考 `spec/knowledge/structure/data-layout-v0.5.5-zh.md`。
- Web 的长期实施规划与布局迁移历史保存在 `spec/changes/legacy/docs-08-todo/`。

### 4. Self-Hosted Runtime Packaging

- Web 自部署 runtime 在 Docker 或其他生产构建中必须能完整启动认证验证码服务。
- 如果服务端依赖像 `svg-captcha` 这样会在运行时读取包内静态资源的库，SSR 构建不得把它错误内联到 bundle 中，否则会破坏其字体或资源的相对路径读取。

### 5. Cloudflare Worker Packaging

- `apps/web-cloudflare` 是独立于 `apps/web` 的 Cloudflare Workers 自部署实现，但它仍必须作为 monorepo 内可重复安装、可重复 typecheck、可重复 lint、可重复测试的 workspace package 存在。
- Cloudflare worker 若通过 `wrangler` 生成运行时类型，应优先使用生成的 `worker-configuration.d.ts`，避免长期维护与真实平台 API 漂移的手写声明。
- Cloudflare worker 的辅助脚本只能调用仓库内真实存在的构建命令；公开同步脚本不得依赖失效命令名。
- Cloudflare worker 的 500 响应不得向客户端透传内部异常 message；详细异常仅记录在服务端日志。

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

### 9. Web Prompt Workspace Files

- Prompt workspace exports under `data/prompts/` must publish complete
  snapshots: folder metadata, prompt markdown files, and prompt version files
  are written into a sibling staging directory before replacing the live
  workspace.
- If staging writes fail, the previous live prompt workspace must remain
  readable and unchanged.

### 10. Web Skill Workspace Files

- Skill workspace exports under `data/skills/` must publish complete
  snapshots: `skill.json`, `SKILL.md`, version files, and preserved sidecar
  files are written into a sibling staging directory before replacing the live
  workspace.
- If staging writes fail, the previous live skill workspace must remain
  readable and unchanged.
- Interrupted skill workspace export scratch directories must not be treated as
  valid skill directories during bootstrap/import scans.

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

## Stable Scenarios

### Scenario: Contributor updates web architecture

When a contributor changes web data layout, sync semantics, or deployment model:

- they update an active change under `spec/changes/active/`
- they encode behavioral delta in `specs/web/spec.md` inside that change
- they sync long-lived truth back into `spec/knowledge/behavior/web.md` and `spec/knowledge/structure/`

### Scenario: User wants self-hosting help

When a user needs deployment instructions:

- the public entry remains `docs/web-self-hosted.md`
- internal planning and migration detail stays in `spec/`

### Scenario: Contributor updates Cloudflare worker integration

When a contributor changes `apps/web-cloudflare` runtime bindings, scripts, or shared package imports:

- they keep the package installable from the monorepo root
- they rerun Cloudflare type generation after wrangler binding changes
- they verify `typecheck`, `lint`, `test`, and `build:web:cf`
