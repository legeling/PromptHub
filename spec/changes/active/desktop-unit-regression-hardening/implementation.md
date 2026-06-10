# Implementation

## Shipped

- Hardened `apps/desktop/src/renderer/components/UpdateDialog.tsx` so manual pre-upgrade backup failures are caught and surfaced as dialog error state instead of leaking an unhandled rejection.
- Restored the `rules:rewrite` IPC contract in `apps/desktop/src/main/ipc/rules.ipc.ts` by always returning a non-empty human-readable `summary` together with rewritten content.
- Fixed `apps/desktop/src/renderer/components/skill/SkillFileEditor.tsx` so reopening/bootstrap effects only reset editor state when the active skill source actually changes, preventing async re-renders from clearing unsaved edits and disabling the save action mid-edit.
- Updated desktop unit fixtures and assertions to match current runtime behavior:
  - `apps/desktop/tests/helpers/window.ts` now exposes `window.api.upgradeBackup` by default.
  - `apps/desktop/tests/unit/components/skill-settings.test.tsx` includes the current `githubToken` store shape.
  - `apps/desktop/tests/unit/components/skill-file-editor.test.tsx` exercises the inline editor mode that exposes the real textarea/save shortcut flow.
  - `apps/desktop/tests/setup.ts` now restores real timers after each test so fake-timer based suites do not leak clock state into later component tests.
  - `apps/desktop/tests/unit/components/rules-manager.test.tsx` matches the current rewrite summary copy and snapshot diff UI.
  - `apps/desktop/tests/unit/components/update-dialog.test.tsx` now wraps the flicker-regression render path in `act(...)` so the async updater/bootstrap state settles without test warnings.
  - `apps/desktop/tests/unit/cli/bin-entry.test.ts` accepts the current desktop runtime dependency set, including `@aws-sdk/client-s3`.
- Hardened remote skill store cache handling:
  - Added `apps/desktop/src/renderer/services/remote-store-entry.ts` to centralize compatible reads of remote store cache entries.
  - `apps/desktop/src/renderer/stores/skill.store.ts` no longer assumes persisted `remoteStoreEntries[*].skills` is always present while filtering cache entries for zustand persistence.
  - `apps/desktop/src/renderer/components/layout/Sidebar.tsx` treats legacy or malformed remote store entries without a `skills` array as zero loaded skills when rendering source counts.
  - `apps/desktop/src/renderer/components/skill/SkillStore.tsx`, `SkillStoreCustomSources.tsx`, `SkillManager.tsx`, and `store-remote-sync.ts` now treat missing or non-array `skills` cache fields as empty lists for store counts, selected store state, update indicators, and cache reuse decisions.
  - `apps/desktop/tests/unit/components/sidebar.test.tsx`, `skill-store-custom-sources.test.tsx`, `skill-i18n-smoke.test.tsx`, and `apps/desktop/tests/unit/services/remote-store-entry.test.ts` now cover legacy remote store cache entries without `skills` arrays.
- Stabilized `apps/desktop/tests/unit/components/sidebar.test.tsx` around the lazy `RulesSidebarPanel` split by waiting for asynchronously rendered Rules items and wrapping the classic combined-layout render path in `act(...)`, removing the React test warning.
- Removed the unused legacy `apps/desktop/src/renderer/components/layout/Header.tsx` export. The old component had an unimplemented create-prompt handler and hardcoded development logging, while the live app shell uses `TopBar`.
- Tightened desktop media IPC filename validation in
  `apps/desktop/src/main/ipc/image.ipc.ts` by rejecting empty names, traversal
  markers, path separators, NTFS alternate-stream separators, and control
  characters before resolving the path under the image/video media directory.
- Changed `video:getPath` to return `null` for invalid filenames instead of
  rejecting the IPC call, matching the safe-failure behavior used by other media
  path handlers.
- Updated the preload type for `getVideoPath()` to include `null`, and added
  unit coverage for unsafe video filenames.
- Added desktop media IPC content validation so `image:save-buffer`,
  `image:saveBase64`, and `video:saveBase64` reject empty/oversized media
  payloads over 20 MiB before writing. Base64 saves now use strict base64
  validation and estimate decoded size before running regex validation, avoiding
  expensive checks on oversized payloads.
- Normalized `image:save-buffer` payloads from `Buffer`, `ArrayBuffer`, or typed
  array inputs before writing, matching the preload `ArrayBuffer` contract.
- Hardened `apps/desktop/src/main/local-media-protocol.ts` so `local-image` and
  `local-video` only resolve supported media extensions for their protocol type
  and reject decoded path segments containing control characters or `:`.
- Hardened `apps/desktop/src/renderer/components/skill/detail-utils.ts` so skill
  markdown URL resolution never returns unsafe protocols such as `javascript:`,
  `file:`, or `data:` for rendered links and images. Unsafe absolute URLs now
  resolve to an empty string instead of being passed through.
- Added `apps/desktop/src/renderer/components/prompt/prompt-markdown-url.ts` and
  wired it into prompt markdown renderers so unsafe link protocols are rendered
  as visible non-clickable text instead of anchors. The shared prompt markdown
  component, prompt editor preview, prompt detail modal, and edit prompt modal now
  share the same URL protocol boundary.
- Reused the prompt URL protocol boundary for prompt source fields in
  `MainContent` and `PromptDetailModal`, replacing `startsWith("http")` checks
  with explicit protocol validation before rendering clickable source anchors.
- Hardened `apps/desktop/src/renderer/components/prompt/AiTestModal.tsx` so image
  generation results are filtered before rendering. Only HTTP(S) URLs and
  supported `data:image/*;base64` URLs can be displayed, downloaded, or saved
  back to a Prompt; unsafe generated URLs are treated as empty image results.
- Extracted generated image URL validation into
  `apps/desktop/src/renderer/utils/generated-image-url.ts` and reused it from the
  AI test workbench, `AISettings` image-test result modal, and
  `downloadGeneratedImage()`. The settings modal no longer renders unsafe
  generated image URLs, and the download helper no longer fetches or clicks
  unsupported URLs.
- Hardened skill source URL handling in
  `apps/desktop/src/renderer/components/skill/detail-utils.ts` so explicit unsafe
  protocols such as `javascript:`, `file:`, and `data:` are not treated as remote
  sources or local folders. Windows absolute paths remain valid local source
  paths.
- Hardened `apps/desktop/src/renderer/components/skill/SkillStoreDetail.tsx` so
  unsafe `source_url` and `store_url` values remain visible as text instead of
  rendering clickable anchors.
- Hardened `apps/desktop/src/renderer/components/skill/SkillIcon.tsx` so
  `icon_url` values are resolved through an image-source whitelist before being
  assigned to `<img src>`. Unsafe explicit protocols now fall back to the
  existing emoji/initial/default icon behavior while HTTP(S), relative app
  assets, and supported base64 image data icons continue to render.
- Hardened `apps/desktop/src/renderer/components/prompt/ImagePromptReverseModal.tsx`
  so dropped or pasted reference images larger than 20 MiB are rejected before
  `arrayBuffer()` reads them into renderer memory or the Electron image save
  bridge is called. Added localized `imageReverse.tooLarge` strings across all
  desktop locales.
- Hardened `apps/desktop/src/renderer/components/prompt/VariableInputModal.tsx`
  so AI test image attachments rejected for unsupported MIME type, size, or
  count now surface the same localized toast feedback as the primary AI test
  surfaces. Unsupported and oversized selections are rejected before any
  `FileReader` is created.
- Hardened `apps/desktop/src/renderer/services/skill-variant-badges.ts` so
  Community source badges are inferred only from parseable HTTP(S) source labels
  instead of loose `http` string prefixes. Labels such as `httpx://...` and
  `http-local-team` now fall through to the existing Git/local/official rules.
- Hardened `apps/desktop/src/main/updater.ts` so macOS direct DMG downloads and
  redirects are normalized through one HTTP(S)-only URL resolver. Non-HTTP(S)
  `Location` values such as `file:` or `httpx:` are rejected before another
  request is issued.
- Standardized desktop renderer external links so remaining
  `target="_blank"` anchors now use explicit `rel="noopener noreferrer"` instead
  of relying on `noreferrer` alone. This covers prompt markdown/source links,
  skill markdown/source links, and store/source detail links while preserving
  existing URL protocol filtering.
- Hardened the legacy `AISettings` endpoint group header so invalid configured
  model API URLs no longer throw during render. The header now falls back to the
  original `apiUrl` text when `new URL(apiUrl)` fails, matching the image-model
  and newer workbench behavior.
- Hardened desktop `image:download` remote media inference so a response is only
  persisted when the final URL has a supported image extension or the upstream
  response provides a supported `image/*` Content-Type. Responses without either
  signal now return `null` and do not write a default `.png` file.

## Verification

- `pnpm --filter @prompthub/desktop test:run tests/unit/components/rules-manager.test.tsx tests/unit/components/skill-file-editor.test.tsx tests/unit/components/skill-settings.test.tsx tests/unit/components/update-dialog.test.tsx tests/unit/cli/bin-entry.test.ts tests/unit/main/rules-ipc.test.ts tests/unit/stores/rules.store.test.ts`
- `pnpm --filter @prompthub/desktop test:run tests/unit/components/update-dialog.test.tsx`
- `pnpm --filter @prompthub/desktop test:unit`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop build`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run -t "tolerates legacy remote store cache entries"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run -t "shows preconfigured community store sources|tolerates legacy remote store cache entries|keeps many skill store sources|collapses the expanded skill store source list|keeps skill store sources expanded|switches to the store view"`（6 条 skill-store source 相关用例通过）
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run -t "filters the rules sidebar"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run -t "switches to the Rules module|keeps Rules visible|updates the selected rule|does not let a stale initial rules read"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/sidebar.test.tsx --run`（28 条 Sidebar 用例通过，且无 React `act(...)` 警告）
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/remote-store-entry.test.ts --run`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run -t "legacy cache entries"`
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-store-custom-sources.test.tsx --run`（9 条 custom source 用例通过）
- `pnpm --filter @prompthub/desktop test -- tests/unit/components/skill-i18n-smoke.test.tsx --run -t "update pulse|legacy remote store cache entries|local-only"`
- `rg -n "cachedEntry\\.skills|entry\\.skills|visibleRemoteEntry\\?\\.skills|remoteStoreEntries\\[[^\\]]+\\]\\?\\.skills|flatMap\\(\\(entry\\) => entry\\.skills\\)" apps/desktop/src/renderer/components apps/desktop/src/renderer/stores apps/desktop/src/renderer/services -g '*.ts' -g '*.tsx'`（无 remote store 缓存直取残留，除统一 helper 自身）
- `pnpm --filter @prompthub/desktop test -- tests/unit/services/renderer-i18n-hardcode-regression.test.ts --run`
- `rg -n "Header\\b|components/layout" apps/desktop/src apps/desktop/tests -g '*.ts' -g '*.tsx'`（确认没有 live `Header` 组件导入，layout barrel 使用 `Sidebar` / `TopBar` / `MainContent` / `TitleBar`）
- `rg -n "FolderTree\\b|layout/FolderTree|from ['\\\"].*FolderTree" apps/desktop/src apps/desktop/tests spec docs -g '*.ts' -g '*.tsx' -g '*.md'`（确认没有 live `FolderTree` 组件导入，剩余命中为 `folder.store.ts` 的 `buildFolderTree` 数据 helper 和变更记录）
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/image-ipc.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/image-ipc.test.ts -t "base64 media"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/local-media-protocol.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-detail-utils.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-store-remote.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/prompt-markdown-content.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/prompt-markdown-content.test.tsx tests/unit/components/prompt-detail-modal.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-test-workbench.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/utils/generated-image-url.test.ts tests/unit/utils/download-generated-image.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-settings-legacy.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-icon.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-icon-picker.test.tsx tests/unit/components/skill-store-card.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/image-prompt-reverse-modal.test.tsx -t "rejects oversized"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/image-prompt-reverse-modal.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/variable-input-modal.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/services/skill-variant-badges.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-store-card.test.tsx tests/unit/components/skill-store-remote.test.tsx -t "source|badge|store detail|unsafe"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/updater.test.ts -t "resolves updater download redirects"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/updater.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/updater-install.test.ts`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/prompt-markdown-content.test.tsx tests/unit/components/prompt-detail-modal.test.tsx tests/unit/components/skill-store-remote.test.tsx -t "unsafe|source|markdown|link"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/skill-detail-utils.test.ts`
- `node - <<'NODE' ... NODE` target-blank check: all `target="_blank"` anchors include `noopener`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-settings-legacy.test.tsx -t "invalid API URL"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/components/ai-settings-legacy.test.tsx`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/image-ipc.test.ts -t "without an image extension"`
- `pnpm --filter @prompthub/desktop test -- --run tests/unit/main/image-ipc.test.ts`
- `pnpm --filter @prompthub/desktop typecheck`
- `pnpm --filter @prompthub/desktop lint`
- `git diff --check`

## Synced Docs

- `spec/knowledge/behavior/desktop.md`
- `spec/knowledge/behavior/rules-workspace.md`

## Follow-ups

- None.
