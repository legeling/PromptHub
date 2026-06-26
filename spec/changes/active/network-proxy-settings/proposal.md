# Network Settings

## Why

PromptHub Desktop has multiple network-dependent workflows: Skill remote
imports, GitHub/custom stores, MCP remote source import, Plugin marketplace
fetches, WebDAV/S3 sync, image downloads, updater checks, and AI endpoints.
Users in restricted network environments need one visible setting that controls
whether PromptHub uses direct, system, or manual proxy routing.
The same settings entry should also own release mirror acceleration because it
is a network source selection, not product/about metadata.

## Scope

- Add a desktop settings contract for network proxy configuration.
- Expose the setting in the Settings UI as a dedicated Network Settings page.
- Move the existing update mirror toggle from About into the Network Settings
  page without changing the persisted `useUpdateMirror` contract.
- Sync the setting from renderer settings to the main process settings store.
- Apply the setting to Electron session proxy configuration.
- Apply manual proxy configuration to main-process Node HTTP(S) requests where
  PromptHub owns the request layer.
- Apply manual proxy environment variables for spawned Git commands used by
  Skill and Plugin imports.

## Non-Goals

- Do not add account-level or per-store proxy overrides in this change.
- Do not change Web/Cloudflare runtime proxy behavior.
- Do not guarantee OS system proxy detection for Node-only request paths. The
  `system` mode is applied to Electron session traffic and preserves existing
  process environment proxy variables for Node and Git.

## Risks

- Proxy credentials are persisted using the same current settings storage path
  as WebDAV/S3/AI credentials. This is consistent with existing behavior but
  should be migrated to safeStorage in a future security hardening task.
- Some third-party libraries, especially AWS SDK S3 request handling and
  electron-updater internals, may require dedicated adapter work beyond this
  first centralized proxy pass.

## Rollback

Setting the proxy mode to `direct` disables the Electron session proxy and
restores process proxy environment variables to their startup values.
