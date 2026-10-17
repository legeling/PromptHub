# Design

## Overview

本次修复要把“版本语义、release 语义、manifest 语义、UI 状态语义”统一起来，而不是继续在单个报错点上打补丁。

设计原则：

1. 稳定版与预览版必须有可判定的版本语义，客户端要能知道自己当前运行的是哪一条线。
2. 运行时不再混用两套不完整的 preview 机制；要么完整采用 electron-updater channel 体系，要么完整采用 GitHub provider prerelease 体系。
3. 检查更新永远不能把“旧版本”当成可用更新展示给用户。
4. 后台自动检查不能覆盖用户当前已经看到的可更新状态。

## Affected Areas

- Data model:
  - `settings.store` 需要区分“推断默认通道”和“用户显式选择通道”
- IPC / API:
  - `updater:check` / `updater:download` 需要支持更明确的 channel/source 语义
- Filesystem / sync:
  - release workflow 需要保证 runtime 期望的 manifest 一定存在，或改为不再依赖额外 preview manifest
- UI / UX:
  - `TopBar`、`App.tsx`、`UpdateDialog.tsx` 需要共享单一更新状态机，避免 `available <-> checking` 抢状态

## Runtime Strategy

### 1. 版本与通道语义

建议采用以下稳定规则：

- 稳定版使用纯 semver：`0.5.5`
- 预览版使用 semver prerelease：`0.5.6-beta.1`、`0.5.6-beta.2`

原因：

- `electron-updater` 会根据当前版本的 prerelease 组件自动推断 `allowPrerelease` 默认值。
- 只有版本本身带 prerelease 组件时，客户端才可以可靠知道“自己当前运行的是 preview build”。
- 如果 preview 与 stable 共用 `0.5.5`，那么“把 prerelease 直接转正”后客户端无法区分自己原先安装的是 preview 还是 stable，只能靠外部状态猜测。

因此，对你最后那个关键问题，我的建议是：

- 不要把 `0.5.5` preview 直接改成正式版并长期延续这种共版号策略。
- 正确做法是：未来 preview 必须使用独立的 prerelease 版本号，例如 `0.5.6-beta.1`。
- 当某个 preview 被验证稳定后，发布一个新的正式版本 `0.5.6`，不要直接把 `0.5.6-beta.1` 改标题当 stable。

只有在“这个 preview 从一开始就错误地用了纯稳定版号”的历史包袱场景下，才可以补发一个历史 prerelease 作为手动下载入口，但不应继续沿用该策略。

本次 `0.5.5-beta.1` 就属于这种历史例外：它的主要目标是恢复机器可判定的 beta 语义，而不是成为高于 `0.5.5` stable 的自动升级目标。

### 2. Provider 与 manifest 策略

当前实现的问题是：

- stable 走 GitHub provider
- preview 走 generic provider + `preview.yml`
- 但 CI 并没有产出 `preview.yml`

收敛方案：

- stable 与 preview 都统一走 GitHub provider
- stable：`allowPrerelease=false`，只看 GitHub latest 正式发布
- preview：`allowPrerelease=true`，并基于当前 prerelease 版本 / 显式 channel 选择 prerelease feed

这样做的好处：

- 不再额外依赖 `download/preview/preview.yml` 这种自定义路径
- 避免 generic provider 与 GitHub release 语义重复建模
- 更符合 electron-updater 原生设计

如果保留 channel 文件方案，则必须完整引入 `generateUpdatesFilesForAllChannels` 并为 preview/beta 产出成套 manifest；这条路径实现成本更高，而且会自动启用 `allowDowngrade`，不适合当前需求。

### 3. 降级保护

必须新增一层显式保护：

- 如果检查结果 `remoteVersion <= currentVersion`，UI 一律视为 `not-available`
- 不允许将旧 stable 结果显示为 `available`

这层保护要独立于 provider 行为存在，不能完全依赖 electron-updater 的内部判定。

### 4. 默认通道推断

新增规则：

- 若用户从未显式选择过更新通道：
  - 当前版本是稳定版 -> 默认 stable
  - 当前版本带 prerelease 组件 -> 默认 preview
- 若用户已经显式选择过，则始终尊重用户设置

建议在 settings 中增加一个显式标记，例如：

- `updateChannelExplicitlySet: boolean`

### `DES-UPDATER-005`: macOS Install Strategy

The release workflow now proves that direct-install macOS ZIP artifacts are
Developer ID signed, notarized, stapled, and Gatekeeper-accepted. Direct macOS
installs can therefore use `electron-updater.downloadUpdate()` and
`quitAndInstall(false, true)`, the same controlled restart path used by the
other desktop targets. This keeps update metadata validation and downloaded
artifact handling inside `electron-updater`; it removes the duplicate DMG
runtime path and its manual Finder hand-off.

Homebrew remains an ownership boundary: an executable resolved under a
Homebrew Caskroom must continue to direct users to `brew upgrade --cask
prompthub` and must never be replaced by the in-app updater.

The renderer treats direct macOS updates as in-app installs. The manual DMG
guidance and folder-opening primary action are removed; the existing backup
acknowledgement and explicit install action remain in place.

## UI / UX State Model

需要一个单一更新状态源，至少满足：

- `idle`
- `checking (background | manual)`
- `available`
- `downloading`
- `downloaded`
- `error`

规则：

- 后台检查只在 `idle` / `not-available` 时可刷新状态
- 当前已经是 `available` 或 `downloaded` 时，后台检查不能把 UI 拉回 `checking`
- 手动打开更新弹窗时，可以使用现有 `available` 状态作为初始值，但不应立即清空顶栏提示并重新进入闪烁竞争

### `DES-UPDATER-006`: Remove runtime demo status injection

`UpdateDialog` is a production workflow component, including when rendered by
the unpackaged development app. It must subscribe to the updater IPC once and
render only that state stream. Visual state examples belong in component tests
or an explicit story harness; the runtime component must not create delayed
demo timers. This removes the three competing development states that replaced
the real `Update check disabled in development mode` result after one click.

### `DES-UPDATER-007`: Rich release notes and continuous download layout

Preview channel discovery already requests the GitHub Releases API to identify
the newest prerelease tag. That bounded response also contains the exact
published Release body, so `FeedContext` carries it alongside the tag and uses
it only when the candidate version matches that tag. This adds no request,
retry, or unbounded cache. Stable checks keep the existing packaged changelog
and manifest fallback.

The renderer continues to sanitize Markdown. Release-note images are restricted
to HTTPS hosts owned by GitHub or Shields, load lazily, and send no referrer;
blocked images degrade to alt text. The dialog retains the last available update
metadata locally while progress events arrive, avoiding repeated IPC
serialization of a large release body. The progress track spans the content
width and the right-aligned value is the only visible percentage.

### `DES-UPDATER-008`: Explicit source policy and cancellable replacement

Updater requests accept `automatic`, `official`, or `mirror` while retaining
the legacy boolean input for compatibility. Automatic mode is a bounded linear
sequence: one official candidate followed by the configured mirrors. Network
settings supplies a typed mirror ID from the shared built-in catalog; `automatic`
retains all four candidates and a concrete ID selects only that mirror. Unknown
IDs normalize to `automatic` rather than being interpreted as arbitrary URLs.
SQLite renderer settings persist the additive `updateMirrorSource` preference;
the existing IPC requests carry it as `mirror` for both checks and downloads. A source
change cancels the current `electron-updater` `CancellationToken`, waits for the
old promise to settle, resets progress, refreshes metadata for the replacement
provider, and starts a new verified download. This adds at most one metadata
request per attempted source and keeps memory constant.

Renderer state owns only the user's current source selection and formatting of
the existing `bytesPerSecond`, `transferred`, and `total` progress fields. The
main process remains authoritative for transfer lifecycle and provider state.

### `DES-UPDATER-009`: Native macOS update affordance

`initUpdater` forwards its existing status stream to one trusted main-process
consumer in addition to renderer IPC. The tray controller retains only the
last actionable `{ status, version }` value: `available` and `downloaded`
activate it, `not-available` clears it, and transient checking, downloading,
or error states leave the last known result unchanged.

The macOS tray loads one additional fixed Template Image next to the current
icon. It is a deterministic black/transparent 16px and 32px Retina asset with
an upward-arrow badge, so macOS still owns light, dark, selected, and
accessibility tinting. The native menu uses one clickable item with a macOS
`sublabel`; it opens the existing update dialog rather than duplicating update
logic. State changes are constant-time, allocate one small object, and add no
polling, network request, cache, or unbounded work.

## Tradeoffs

- 采用 semver prerelease 版本号后，preview 版本编号会变长，但换来更稳定的更新语义与自动推断能力。
- 统一回 GitHub provider 后，镜像加速场景需要重新核对是否还能通过 generic mirror URL 平滑工作；可能需要对“检查元数据”和“下载二进制”分开建模。

## Traceability

| Requirement      | Design            | Verification                           | Task                             |
| ---------------- | ----------------- | -------------------------------------- | -------------------------------- |
| `FR-UPDATER-005` | `DES-UPDATER-005` | `TEST-UPDATER-005`, `TEST-UPDATER-006` | `T-UPDATER-009`, `T-UPDATER-010` |
| `FR-UPDATER-006` | `DES-UPDATER-006` | `TEST-UPDATER-007`                     | `T-UPDATER-011`                  |
| `FR-UPDATER-007` | `DES-UPDATER-007` | `TEST-UPDATER-008`, `TEST-UPDATER-009` | `T-UPDATER-012`, `T-UPDATER-013` |
| `FR-UPDATER-008` | `DES-UPDATER-008` | `TEST-UPDATER-010`, `TEST-UPDATER-011` | `T-UPDATER-014`, `T-UPDATER-015` |
| `FR-UPDATER-009` | `DES-UPDATER-009` | `TEST-UPDATER-012`                     | `T-UPDATER-016`                  |
