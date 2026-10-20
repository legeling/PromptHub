# Release Spec

## Purpose

本规范定义 PromptHub 发布流程、发布门禁与文档同步的稳定真相源。

## Stable Requirements

### 1. Release Sync

- 发布前必须同步版本、更新日志和必要的用户/贡献者文档。
- 内部架构或行为变化完成后，相关稳定 spec 和 architecture 文档也必须同步。

### 1.1 Public Release Notes

- `CHANGELOG.md` 的目标版本章节是公开更新内容的唯一来源；GitHub Release、应用内更新说明和官网复用该章节，不各写一套摘要。
- 按新增、改进、修复等用户可理解的类别组织。每条写清功能或问题，以及升级后的实际行为；只在影响使用时说明限制、升级步骤或破坏性变化。中英文条目含义保持一致。
- 不写聊天引用、内部对话、用户指令、Agent 工作过程、计划讨论或“根据反馈/按要求”等来源叙述。不把提交标题、内部实现术语、测试数量、CI 流水账或维护者签名操作直接当作产品更新。
- 内部决策、实现和验证证据保存在对应 `spec/` 记录。公开日志只保留已实现且有证据的用户变化，不把计划或未完成验证写成已发布能力。
- 发布前逐条对照目标版本 diff 和功能证据，合并重复项，删除过程叙述；新增草稿与正式发布使用相同的已审阅正文，禁止 `--generate-notes` 自动追加提交或 PR 摘要。
- 未发布状态写在版本索引及 Unreleased 区域；具体版本章节保持可直接用于发布的产品说明。发布日期只在实际发布后确认。

### 2. Release Verification

- 发布相关改动应通过对应的 lint、测试、构建与必要的 smoke gate。
- 不应依赖聊天上下文来记住发布前需要同步哪些文档或检查项。

### 3. Stable Internal Sources

- 历史发布准备与质量门禁演进记录保存在 `spec/changes/legacy/docs-08-todo/`。

### 4. Desktop Update Channels

- 桌面端必须默认使用稳定版更新通道。
- 只有在用户显式选择加入后，应用才可以检查或下载预览版 / prerelease 发布。
- 开启预览版前，界面必须明确提示不稳定风险与备份建议，并要求用户再次确认。

### 5. Stable vs Preview Version Semantics

- 稳定版必须使用纯 semver 版本号，例如 `0.5.5`。
- 预览版 / beta / alpha 必须使用 semver prerelease 版本号，例如 `0.5.6-beta.1`。
- 面向用户的“最新稳定版”下载链接、官网版本徽标和默认安装说明必须继续指向最新 stable，而不是被 prerelease 覆盖。

### 6. Historical Backfill Prerelease Exception

- 如果某条历史发布线因为早期策略问题需要补发一个 prerelease 版本，且其 semver 顺序低于已发布 stable（例如 `0.5.5-beta.1 < 0.5.5`），则必须在文档中明确标注它是手动下载 / 测试用途。
- 这类历史补发 prerelease 不应被描述成稳定版用户的正常自动升级目标。

### 7. Repository Entry Docs

- 根 `README.md` 必须清晰区分桌面版、自部署 Web 与 CLI 的入口路径，不应把用户下载、部署路径与内部 SSD 说明混排成同一主线。
- GitHub 可发现的贡献入口文件必须存在，并指向当前有效的 canonical 贡献指南。
- 贡献指南中的开发命令、monorepo 目录结构与 SSD 工作流说明必须与当前仓库实际状态一致。

### 8. macOS Developer ID Signing

- macOS desktop release artifacts must be built with Hardened Runtime enabled and notarized by Apple before publication.
- Direct-install macOS in-app updates must publish the signed and notarized ZIP
  payload plus matching `latest-mac*.yml` metadata; the DMG remains the
  first-install distribution artifact.
- GitHub Actions macOS jobs must require Developer ID Application signing credentials and App Store Connect notarization credentials before packaging.
- macOS signing credentials must be scoped to macOS jobs and must not be exported as generic signing variables for Windows or Linux builds.
- Release verification must check the packaged macOS app with `codesign`, `xcrun stapler validate`, and `spctl`.

### 9. Release Procedure Entry

- The reusable execution procedure lives only at
  `.agents/skills/release-sync/SKILL.md`.
- The skill must defer policy to this stable release spec and current
  repository commands; it must not be copied into `.agents/rules/` or
  `.agents/workflows/`.
- Release-impacting local changes use `pnpm verify:release:quick`; tagging or
  publishing a release candidate requires the full `pnpm verify:release` gate.

### 10. Packaged Desktop Startup

- A desktop release cannot be approved from source tests and packaging success
  alone. The release workflow must launch the packaged application on each
  natively executable release platform required by the current gate.
- Windows x64 candidates must pass two isolated packaged starts against the
  same profile that follows a supported stable-to-candidate upgrade path. The
  first start must create the pre-upgrade safety snapshot, durably complete the
  renderer persistence handoff, and exit normally; the second must publish or
  reconcile canonical authority and load the window without a startup error.
- A build job that cannot execute its target architecture must be reported as
  packaging-only evidence and must not be described as startup validation.
- A startup failure blocks release publication even when all installers and
  update manifests were generated successfully.

### 11. Draft Distribution Boundary

- Preparing a version tag must not publish self-hosted container images or
  update public stable download channels while its GitHub Release is a draft.
- Automatic self-hosted image publication is triggered by `release.published`;
  the explicit manual workflow remains a separate maintainer action.
- Desktop draft creation and asset upload do not authorize promotion, Homebrew
  updates, or the stable R2 mirror. Their published-release checks remain required.

### 12. Windows SignPath Integration Test

- `.github/workflows/signpath-test.yml` is a manual, non-publishing integration
  test. It builds one Windows x64 NSIS installer on a GitHub-hosted runner and
  submits the uploaded ZIP artifact to the fixed `test-signing` policy.
- Repository variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`, and
  `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` identify the existing SignPath setup.
  `SIGNPATH_API_TOKEN` is a repository Actions secret belonging to the SignPath
  CI submitter. Never store the token in workflow files, logs, or documentation.
- The selected artifact configuration must accept a ZIP with root-level
  `PromptHub*.exe` entries. This test signs the outer installer only; it does not
  establish signing coverage for the installed executable or third-party binaries.
- `scripts/verify-signpath-test.ps1` checks the returned filename, changed bytes,
  Authenticode digest validity, and timestamp. The self-signed test certificate
  is trusted only in the disposable Windows runner's current-user certificate
  store and removed in `finally`. The reported certificate identity is evidence
  of the test result, not a publicly trusted publisher or production acceptance.
- Test artifacts are retained in Actions for seven days with explicit test-only
  names. They must never enter GitHub Releases, updater manifests, or mirrors.
  `release.yml` is unchanged; production signing remains a separate integration.
- Before dispatch, configure the secret and variables, then run
  `gh workflow run signpath-test.yml --repo legeling/PromptHub --ref main`.
  Acceptance requires a completed SignPath request plus successful Windows
  verification and a downloadable test artifact. Workflow syntax checks alone
  do not establish that acceptance.
- To withdraw this test, disable its workflow and remove its dedicated
  repository configuration when no longer used. No product data migration or
  published artifact rollback is involved.

## Stable Scenarios

### Scenario: Contributor prepares a release-impacting change

When a change affects release artifacts or public-facing version contracts:

- they update the relevant public docs under `docs/` or `README.md`
- they sync durable internal conclusions into `spec/`

### Scenario: Contributor adds a new release rule

When a new release gate or release-sync expectation becomes stable behavior:

- it should be reflected in this stable spec and, when appropriate, in contributor-facing docs

### Scenario: Desktop user enables preview updates

When a desktop user attempts to join the preview update channel:

- the app warns that preview builds can be unstable
- the app recommends creating a backup before updating
- the app keeps the stable channel unless the user explicitly confirms the change

### Scenario: Maintainer publishes a beta release

When a maintainer prepares a beta / preview desktop release:

- the release version uses a prerelease suffix such as `-beta.N`
- stable-facing docs keep pointing to the latest stable download links
- preview / beta docs can point to the explicit prerelease tag page or tag-specific artifacts

### Scenario: Maintainer republishes a historical prerelease below stable

When a maintainer republishes a historical prerelease that sorts below an already released stable version:

- the docs must explicitly say it is a historical beta / preview build
- the docs must recommend manual download for testing instead of presenting it as the default upgrade path

### Scenario: Visitor reads repository entry docs

When a visitor opens the repository root documentation:

- the README should help them choose between desktop, self-hosted web, and CLI quickly
- deeper contributor and SSD details should remain available through explicit follow-up links

### Scenario: Contributor discovers contribution guidance from GitHub

When a contributor looks for contribution instructions via the repository UI:

- GitHub should surface a root contribution entry file
- that entry file should route them to the canonical guide with current monorepo and SSD instructions

### Scenario: Maintainer publishes macOS desktop artifacts

When a tag release builds macOS DMG and ZIP artifacts:

- the workflow requires Developer ID and notarization secrets before packaging
- the packaged app passes signature, stapling, and Gatekeeper assessment checks
- the release includes matching ZIP metadata for direct-install in-app updates
- public install notes present the notarized artifact as the normal install path

### Scenario: Maintainer builds Windows desktop artifacts

When the workflow packages the Windows x64 desktop candidate:

- it seeds an isolated profile representing an upgrade from the supported
  stable release
- it launches the unpacked packaged executable twice rather than the source
  Electron entry, reusing the same isolated profile
- the first launch requires the upgrade safety snapshot, renderer persistence
  migration, and loaded renderer window before a normal exit
- the second launch requires canonical authority publication or reconciliation
  and a loaded renderer window
- it fails the build before artifact upload when either launch exits early,
  reports a startup error, or times out
