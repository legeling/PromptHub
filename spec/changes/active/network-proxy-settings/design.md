# Design

## Ownership

- Shared contract: `packages/shared/types/settings.ts`
- Renderer source of truth: `apps/desktop/src/renderer/stores/settings.store.ts`
- Settings UI: `apps/desktop/src/renderer/components/settings/NetworkSettings.tsx`
- Main-process application point:
  `apps/desktop/src/main/services/network-proxy.ts`
- Main-process settings sync hook:
  `apps/desktop/src/main/ipc/settings.ipc.ts`

## Data Contract

Add `Settings.networkProxy?: NetworkProxySettings`.

The desktop renderer stores a normalized `networkProxy` object directly and
syncs that object to main whenever the user changes proxy settings. The UI is
exposed as a top-level Desktop Settings page instead of living inside General
Settings, because proxy settings are shared by multiple network workflows.

The existing `useUpdateMirror` setting remains unchanged as the source of truth
for update mirror fallback. Its control is rendered in the same Network Settings
page because it selects an alternate network source.

## Proxy Modes

- `system`: Electron session uses system proxy. Node/Git preserve startup
  process environment values.
- `direct`: Electron session uses direct mode. Node/Git restore startup process
  environment values.
- `manual`: Electron session uses `fixed_servers`. Node-owned HTTP(S) request
  helpers use proxy agents. Git child processes inherit manual proxy
  environment variables.

## Network Coverage

Covered in this change:

- Electron renderer/session traffic
- Skill remote content fetch helpers
- MCP remote content fetch, because it delegates to SkillInstaller
- Plugin marketplace fetches via injected main-process fetch function
- Git commands spawned by Skill and Plugin import helpers
- AI HTTP IPC requests for HTTP/HTTPS proxy modes
- Update mirror fallback configuration, using the existing `useUpdateMirror`
  settings field

Tracked limitation:

- S3 and updater may need dedicated adapters in a follow-up because they are
  owned by third-party client internals. The setting and session proxy still
  exist, but this change does not claim full S3/updater proxy coverage.
- SOCKS5 is applied to Node HTTP(S) request helpers through `socks-proxy-agent`.
  Main-process fetch/streaming paths currently use the HTTP(S) undici proxy
  dispatcher and need a dedicated SOCKS fetch adapter if SOCKS support is
  required for those paths.

## Security

Manual proxy passwords are persisted in the existing settings path. This matches
current WebDAV/S3/AI credential behavior and is called out as follow-up debt for
safeStorage migration.
