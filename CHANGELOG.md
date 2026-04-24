## [Unreleased]

## [0.5.5] - 2026-04-24

### 新增 / Added

- 🧩 **商店 Skill 更新检测与更新**：商店下载的 Skill 现在会保存安装时的规范化内容哈希与安装版本，可在详情页检查远端 `SKILL.md` 是否变化，并仅对商店来源 Skill 展示更新入口
  - **Store Skill Update Detection and Update**: Store-installed skills now persist the normalized install-time content hash and installed version, can check whether the remote `SKILL.md` changed from the detail view, and only expose update actions for store-origin skills
- 🚦 **稳定版 / 预览版更新通道**：系统设置新增“加入预览版本”开关；默认只检查 GitHub Latest 稳定版，用户主动加入后才会检查 Releases 中标记为 prerelease 的预览版
  - **Stable / Preview Update Channels**: System settings now include a “Join Preview Channel” toggle. By default PromptHub checks only the GitHub Latest stable release; prerelease preview builds are checked only after the user opts in
- 🛡️ **本地修改冲突保护**：更新前会同时比较“安装时哈希 / 当前本地哈希 / 最新远端哈希”，本地改过且远端也变化时标记为冲突；用户必须显式选择覆盖本地修改才会继续
  - **Local Edit Conflict Protection**: Updates compare the install-time hash, current local hash, and latest remote hash; if both local and remote changed, the update is marked as a conflict and requires an explicit overwrite action

### 修复 / Fixed

- 🌐 **网页版媒体上传与显示修复**：Web/Docker 环境中的图片、视频选择现在会通过媒体 API 上传，桌面同步来的 `local-image://` / `local-video://` 地址会自动解析为网页端可访问的 `/api/media/...` 地址
  - **Web Media Upload and Display Fixed**: Image/video selection in the Web/Docker build now uploads through the media API, and desktop-synced `local-image://` / `local-video://` URLs resolve to browser-accessible `/api/media/...` URLs
- 🔐 **网页同步私密状态修复**：Web 端导入/同步文件夹时不再把缺失 `visibility` 的桌面数据误判为私密，避免普通文件夹同步后全部上锁
  - **Web Sync Privacy State Fixed**: Web import/sync no longer treats desktop folders without `visibility` as private, preventing normal folders from becoming locked after sync
- 🔑 **网页版登录密码修改入口**：自托管 Web 设置页新增密码修改表单，支持输入当前密码并设置新密码
  - **Web Login Password Change Entry**: The self-hosted Web settings page now includes a password-change form that requires the current password and a new password
- 🔒 **桌面私密文件夹取消加密保护**：编辑私密文件夹时，取消私密状态同样需要先通过主密码解锁，避免未授权直接取消加密
  - **Desktop Private Folder Disable Protection**: Disabling privacy on an encrypted desktop folder now requires unlocking with the master password first

### 维护 / Maintenance

- 🔖 **版本与发版文档同步到 `v0.5.5`**：更新项目版本号、CHANGELOG、README/多语言 README 与官网 release metadata，并补齐 Skill 更新相关 i18n 与同步字段
  - **Version and Release Docs Synced to `v0.5.5`**: Updated project versions, changelog, README/localized READMEs, website release metadata, and added Skill-update i18n plus sync metadata fields

## [0.5.4] - 2026-04-21

### 修复 / Fixed

- 🧩 **GitHub Skill 仓库导入改为先扫描再选择**：`Install from GitHub` 不再把整个仓库误当成单个 Skill；现在会先扫描仓库中的多个 `SKILL.md`，支持多选导入，并在没有 `SKILL.md` 时回退到根目录 `README.md`
  - **GitHub Skill Repo Import Now Scans Before Selection**: `Install from GitHub` no longer treats the whole repository as a single Skill. It now scans for multiple `SKILL.md` entries, supports multi-select import, and falls back to the root `README.md` when no `SKILL.md` exists
- 🖼️ **Skill README 相对图片与链接修复**：来自 GitHub 仓库的 README / Markdown 相对图片和相对链接现在会自动解析成可访问的 GitHub/blob/raw 地址，商店详情页和已安装 Skill 预览都能正常显示
  - **Skill README Relative Images and Links Fixed**: Relative Markdown image/link paths from GitHub repositories are now resolved to accessible GitHub blob/raw URLs, so both store detail pages and installed Skill previews render correctly
- 🪟 **GitHub 导入弹窗布局修复**：扫描结果很多时，弹窗会切到标准宽弹窗，底部操作区固定可见，只让结果列表区域滚动，避免 footer 被内容挤出视口
  - **GitHub Import Dialog Layout Fix**: When many results are found, the dialog now uses a standard wide layout with a fixed footer and an independently scrollable results area, preventing actions from being pushed out of view
- 🌍 **Skill 多语言资源补齐**：补齐了 `skill.*` 命名空间在 6 个非英文 locale 中缺失的文案，修复删除弹窗、GitHub 扫描导入和安全报告出现中英混杂回退的问题，并新增 locale key 对齐回归测试
  - **Skill Localization Coverage Completed**: Filled missing `skill.*` keys across all 6 non-English locales, fixing mixed-language fallback in delete dialogs, GitHub import scanning, and safety reporting, with a regression test that enforces locale-key parity
- 🛡️ **安全扫描静态规则降噪**：修复 `process.env` / `import.meta.env` 被误判为读取 `.env` 文件、`export function` / `export type` 被误判为环境变量修改的问题；同时将脚本文件告警改为汇总展示，避免重复刷屏
  - **Static Safety Scan Noise Reduced**: Fixed false positives where `process.env` / `import.meta.env` were treated as `.env` file access and `export function` / `export type` were treated as environment mutation; script-file warnings are now aggregated instead of repeated per file
- 📋 **安全报告前端分组展示**：商店详情页与 Skill 详情页的安全 findings 改为按规则分组显示，突出问题类别、出现次数和受影响文件，降低重复告警对可读性的影响
  - **Frontend Safety Report Grouping**: Safety findings in store and skill detail views are now grouped by rule, surfacing issue category, occurrence count, and affected files instead of flooding the UI with repeated entries
- 🌙 **Skill 图标选择器暗色模式修复**：创建 / 编辑 Skill 时，图标选择器现在会根据主题切换深浅两套预设色板，自定义背景图标前景色也会自动计算，避免 dark mode 下整块区域看起来像未适配的亮色面板
  - **Skill Icon Picker Dark-Mode Fix**: The icon picker for create/edit Skill now switches between light and dark preset palettes, and custom icon backgrounds compute readable foreground colors automatically, preventing the dark-mode view from looking like an unadapted light panel

### 维护 / Maintenance

- 🔖 **版本与发版文档同步到 `v0.5.4`**：更新项目版本号、CHANGELOG、README/多语言 README 与官网 release metadata，统一本次修复说明和下载版本
  - **Version and Release Docs Synced to `v0.5.4`**: Updated the project version, changelog, README/localized READMEs, and website release metadata so release notes and download references align with this patch release

---

## [0.5.3] - 2026-04-17

### 修复 / Fixed

- 🚨 **修复 Windows 升级后"数据为空 + 应用无限重启"严重问题**：v0.5.2 在 Windows 从旧版升级后，如果新 `userData` 目录被检测为空，渲染进程会自动触发恢复流程，主进程随即 `app.relaunch() + app.quit()`；叠加 electron-updater 的 `autoInstallOnAppQuit=true`，会让每次退出都重装 pending 包并再次空库启动，形成无限重启循环。现移除渲染端自动恢复（必须由用户在 `DataRecoveryDialog` 点击确认），主进程对 `performRecovery` 增加会话级防抖，所有平台统一关闭 `autoInstallOnAppQuit`，并将 `bootstrapPromptWorkspace` 包裹为 try/catch，避免工作区初始化失败阻塞启动
  - **Fix Windows Infinite-Restart Loop After Upgrade**: In v0.5.2, upgrading on Windows could produce an empty detected `userData`, which triggered auto-recovery in the renderer, then `app.relaunch() + app.quit()` in the main process. Combined with electron-updater's `autoInstallOnAppQuit=true`, every quit reinstalled the pending package and re-entered the empty-DB branch, producing an infinite restart loop. Auto-recovery has been removed from the renderer (the user must now confirm in `DataRecoveryDialog`), the main process guards `performRecovery` with a session-level flag, `autoInstallOnAppQuit` is now `false` on every platform, and `bootstrapPromptWorkspace` is wrapped in try/catch so workspace errors no longer block startup
- 📝 **新增启动诊断日志**：关键启动事件（DB 初始化、恢复候选检测、恢复执行与结果）现会以 JSON 行写入 `<userData>/logs/startup.log`，便于用户在反馈升级/恢复问题时提供可分析的上下文；日志超过 512KB 自动轮转
  - **Startup Diagnostic Log**: Key startup events (DB init, recovery candidate detection, recovery execution and outcome) are now appended as JSON lines to `<userData>/logs/startup.log`, making upgrade/recovery issue reports diagnosable from user-shared logs; the file auto-rotates above 512 KB
- 🗂️ **工作区引导重构为"四象限 + 双向合并"**：`bootstrapPromptWorkspace` 不再无条件 `rmSync(promptsDir)` 再导出；现在按 `DB 空 / 工作区空` 组合分四种情形处理：两边都空时 noop；仅 DB 有数据按文件真源导出；仅工作区有数据反向导入 DB；两边都有数据则按 `updatedAt` 做 newer-wins 合并。DB 端 `updated_at` 的 INTEGER/string 类型不一致已由统一的 `toEpochMs()` 比较路径消除。工作区侧被删除/重命名的遗留目录不再直接 `rmSync`，而是移动到 `<workspace>/.trash/<ISO>/` 并保留最近 5 个快照，支持 `EXDEV` 跨卷降级
  - **Workspace Bootstrap Rewritten as "Four-Quadrant + Two-Way Merge"**: `bootstrapPromptWorkspace` no longer unconditionally `rmSync(promptsDir)` before re-export. It now handles four cases by `DB empty / workspace empty`: both empty is a noop, DB-only exports files, workspace-only imports into DB, and both-populated merges by `updatedAt` with newer-wins. The long-standing INTEGER/string mismatch on `updated_at` has been eliminated by a single `toEpochMs()` comparison helper. Orphan/renamed directories on the workspace side are moved to `<workspace>/.trash/<ISO>/` (keeping the last 5 snapshots, with `EXDEV` cross-device fallback) instead of being hard-deleted
- 🛟 **首次升级前自动快照 SQLite 文件**：从旧版本首次启动 0.5.3 时，会把 `prompthub.db` 复制为 `prompthub.db.backup-before-0.5.3.<timestamp>.db`，并写入 marker 文件保证幂等，避免合并逻辑万一出错时没有可回滚的索引层；新建或体积小于 4 KB 的全新 DB 不会写入 marker，避免污染首次启动路径
  - **Automatic Pre-Upgrade SQLite Snapshot**: On first 0.5.3 launch after upgrade, `prompthub.db` is copied to `prompthub.db.backup-before-0.5.3.<timestamp>.db` (guarded by an idempotent marker file), providing a rollback path for the SQLite index layer in case the new merge logic misbehaves; brand-new or sub-4 KB databases skip the marker to avoid polluting the first-launch path
- 🔁 **数据恢复后禁止"复活"**：`DataRecoveryDialog` 成功执行 `performRecovery` 后，会在 userData 下写入 `.restore-in-progress` 标记；下次启动时 `bootstrapPromptWorkspace` 检测到该标记会跳过 "WS→DB 反向导入" 阶段，改为以恢复后的 DB 为真源重建工作区，彻底避免旧工作区把已删除的数据又"导入"回来
  - **Prevent "Resurrection" After Data Recovery**: After `DataRecoveryDialog` successfully runs `performRecovery`, a `.restore-in-progress` marker is written into userData; on the next launch, `bootstrapPromptWorkspace` detects the marker and skips the "workspace→DB" import phase, rebuilding the workspace from the recovered DB instead, eliminating the risk of a stale workspace re-importing records the user explicitly restored away from
- 🧩 **同 id 冲突改为 newer-wins + 隔离而非删除**：工作区反向导入时若出现多个 Prompt 目录携带同一个 `id`，按 `updatedAt` 选胜者，其余副本会被移动到 `<workspace>/.trash/conflicts/` 下保留（仍受 `.trash` 保留策略约束），而不是被直接覆盖或丢弃
  - **Same-id Conflicts Resolved by newer-wins + Quarantine**: When workspace→DB import encounters multiple prompt directories sharing the same `id`, the newer `updatedAt` wins and losing copies are moved under `<workspace>/.trash/conflicts/` (subject to the existing `.trash` retention policy) instead of being overwritten or silently discarded
- 📉 **启动日志脱敏**：`startup.log` 中的用户数据路径、数据源路径、应用数据路径会把用户主目录前缀替换为 `~`，避免用户分享日志时泄露真实用户名
  - **Startup Log Path Redaction**: Paths written to `startup.log` (user data path, source data path, app data path) now have the home directory prefix replaced with `~`, so users can share logs without leaking their real usernames

### 升级注意事项 / Upgrade Notes

- ⚠️ **卡在 v0.5.2 无限重启的用户**：请下载 v0.5.3 安装包手动安装覆盖升级。启动后如果看到空的 Prompt 列表，**请在应用内点击"数据恢复"按钮**手动从旧数据目录恢复（`DataRecoveryDialog` 入口仍保留）。启动日志位于 `<userData>/logs/startup.log`，其中 `startup:bootstrap_workspace_empty` 事件表示 DB 与工作区均为空、需要手动恢复
  - **Users Stuck in v0.5.2 Infinite Restart**: Download the v0.5.3 installer and manually upgrade in place. If the Prompt list appears empty after launch, **click the "Data Recovery" button inside the app** to manually restore from a legacy data location (the `DataRecoveryDialog` entry point is preserved). Startup logs at `<userData>/logs/startup.log`; a `startup:bootstrap_workspace_empty` event indicates both DB and workspace were empty and manual recovery is required

### 维护 / Maintenance

- 🛡️ **发布流程改为 Draft 优先**：GitHub Release CI 现会把新 tag 的产物先发布为 Draft，经 Windows 真机验证后再手动 `--draft=false --latest` 推进，避免未验证版本被 auto-updater 立即推送给用户；Homebrew 更新步骤会在 Draft 状态下跳过
  - **Draft-First Release Pipeline**: The GitHub Release workflow now publishes new tag artifacts as Draft first and requires manual promotion (`--draft=false --latest`) after Windows real-device validation, preventing unverified builds from being pushed via auto-updater; Homebrew updates are skipped while the release remains a Draft

---

## [0.5.2] - 2026-04-16

### 新功能 / Added

- 🌐 **自部署 PromptHub Web**：新增轻量级 self-hosted 网页版，支持首次 `/setup` 初始化管理员、Prompt / Folder / Skill / Media / Settings 浏览器访问，以及 Docker、Docker Compose 与 GHCR 镜像部署
  - **Self-Hosted PromptHub Web**: Added a lightweight self-hosted web edition with first-run `/setup` bootstrap, browser access for Prompts / Folders / Skills / Media / Settings, plus Docker, Docker Compose, and GHCR image deployment
- 🔁 **桌面版直连自部署网页版备份 / 恢复**：桌面版 `设置 -> 数据` 现可直接连接 PromptHub Web，执行测试连接、上传、下载、启动拉取与定时推送，作为单用户场景下比 WebDAV 更直接的备份源 / 恢复源
  - **Desktop Backup / Restore via Self-Hosted Web**: Desktop can now connect directly to PromptHub Web from `Settings -> Data` for connection tests, upload, download, startup pull, and scheduled push, providing a simpler backup/restore target than WebDAV for single-user setups

### 修复 / Fixed

- 🛡️ **升级前自动备份 data 目录**：应用内安装更新前，现会自动为当前 `userData` 目录创建本地快照备份；备份失败时会阻止安装，避免升级过程中出现“没有任何兜底”的数据风险
  - **Automatic Pre-Upgrade Data Snapshot**: Before installing an in-app update, PromptHub now creates a local snapshot of the current `userData` directory; if the backup fails, installation is blocked so upgrades are never attempted without a rollback path
- 🔄 **旧数据恢复链路补强**：当当前数据库为空时，应用会继续扫描旧数据位置并提供一键恢复，覆盖 `0.4.7 -> 0.4.8` 这类因数据路径切换造成“看起来数据丢失”的升级场景
  - **Legacy Data Recovery Hardening**: When the current database is empty, the app scans known legacy data locations and offers one-click recovery, covering upgrade paths like `0.4.7 -> 0.4.8` where data appeared missing because the storage path changed
- 🧠 **自部署同步改为安全合并**：桌面版与自部署网页版的 Prompt / Folder / Skill 双向同步改为按稳定 `id` 和 `updatedAt` 合并，双方各自新增的内容会保留；同一条记录冲突时以更新时间更新的一端为准；删除不会自动传播，避免误删放大
  - **Merge-Safe Self-Hosted Sync**: Desktop and self-hosted web now merge Prompt / Folder / Skill data by stable `id` and `updatedAt`, preserving records added on either side; conflicts on the same record resolve to the newer update; deletions do not auto-propagate to avoid accidental data loss
- 🔗 **Symlink 安装失败自动回退复制模式**：在 Windows 或不支持符号链接的文件系统上，如果创建 Skill 平台软链接返回 `EPERM`、`EACCES` 或 `ENOTSUP`，现在会自动降级为复制安装，而不是直接失败
  - **Symlink Install Fallback to Copy Mode**: On Windows or filesystems that do not support symlinks, Skill deployment now falls back to copy mode when symlink creation returns `EPERM`, `EACCES`, or `ENOTSUP`, instead of failing the install outright

### 优化 / Improvements

- 🗂️ **文件真源 + SQLite 索引**：桌面版与自部署网页版的 Prompt 主数据链统一为 workspace 文件真源 + SQLite 索引，支持从 workspace 自动回灌数据库，并把 settings、media 等数据继续收敛到同一工作区结构
  - **File Truth + SQLite Index**: Desktop and self-hosted web now converge on workspace files as the source of truth with SQLite as the index layer, including automatic database rebuild from workspace files and a more unified workspace layout for settings and media
- 📦 **自部署交付链补齐**：补齐 web 专用 README、根脚本、CI 校验、GHCR 镜像发布与 compose 部署说明，self-hosted web 不再是“代码存在但没有正式交付链”的状态
  - **Self-Hosted Delivery Pipeline**: Added dedicated web docs, root scripts, CI verification, GHCR image publishing, and compose deployment guidance so the self-hosted web app now has a real delivery pipeline
- 🧪 **桌面版 ↔ 自部署网页版联调回归**：补齐桌面版与本地 self-hosted web 的连接、上传、下载、启动拉取与同步合并回归测试
  - **Desktop ↔ Self-Hosted Web Regression Coverage**: Added regression coverage for desktop-to-web connection, upload, download, startup pull, and merge-safe sync flows against a local self-hosted PromptHub Web instance

### 维护 / Maintenance

- 🔖 **版本与发版文档同步**：统一同步项目主版本、README/多语言 README、官网发布元数据与下载链接到 `v0.5.2`
  - **Version and Release Docs Sync**: Synced the project version, README/localized READMEs, website release metadata, and download links to `v0.5.2`

---

## [0.5.1] - 2026-04-10

### 新功能 / Added

- 🔄 **自动数据恢复**：应用启动时自动检测当前数据库是否为空，如果在其他已知路径（`%APPDATA%/PromptHub`、安装目录 `data/` 等）发现旧数据，弹出恢复对话框让用户一键恢复；支持数据库、图片/视频/技能目录和配置文件的完整迁移；恢复成功后应用自动重启
  - **Automatic Data Recovery**: On startup the app now detects whether the current database is empty and, if existing data is found at other known paths (`%APPDATA%/PromptHub`, install-scoped `data/`, etc.), shows a recovery dialog for one-click restoration; supports full migration of the database, image/video/skill directories, and config files; the app restarts automatically after successful recovery

---

## [0.5.0] - 2026-04-09

### 新功能 / Added

- 🛡️ **Skill 安全评估**：新增静态风险扫描器，可对已安装 Skill、商店 Skill 和 CLI 扫描结果输出 `safe / warn / high-risk / blocked` 风险等级与命中规则摘要
  - **Skill Safety Assessment**: Added a static risk scanner that evaluates installed Skills, store Skills, and CLI scan results with `safe / warn / high-risk / blocked` risk levels plus matched-rule summaries
- 🏪 **商店安装前安全检查**：商店详情页支持手动"先检查再添加"，设置里可选"添加前自动评估"，默认关闭；`high-risk` 需要二次确认，`blocked` 直接拦截
  - **Store Safety Check Before Install**: Store detail pages now support manual "scan before add", settings can optionally enable "auto-assess before install" (off by default), `high-risk` installs require explicit confirmation, and `blocked` installs are rejected
- 🖥️ **CLI 安全扫描输出**：`prompthub skill scan` 现在会返回安全评估结果，方便脚本化审查本地 skill 仓库
  - **CLI Safety Scan Output**: `prompthub skill scan` now returns safety assessment results so local skill repositories can be audited in scripts and automation

### 安全 / Security

- 🔒 **恶意模式检测**：扫描器会检查危险 shell 片段、提权与持久化命令、凭据路径读取、编码执行、可疑工作流文件与来源风险
  - **Malicious Pattern Detection**: The scanner inspects dangerous shell fragments, privilege-escalation and persistence commands, credential-path access, encoded execution, suspicious workflow files, and source risk signals
- 🔒 **商店高风险安装护栏**：对 `high-risk` 和 `blocked` 级别 skill 增加安装前护栏，避免"安装成功但用户毫无感知"的情况
  - **High-Risk Store Install Guardrails**: Added pre-install guardrails for `high-risk` and `blocked` Skills so unsafe installs are not silently accepted

### 修复 / Fixed

- 🔴 **Windows 自动更新后数据丢失修复**：修复从旧版本（<0.5.0）通过应用内自动更新到 0.5.0 后，数据路径解析可能错误地选择安装目录下的空 `data/` 子目录而忽略 `%APPDATA%/PromptHub` 中已有数据的严重 bug；`resolveInitialUserDataPath` 现在仅在 install-scoped 路径中已有用户数据时才选用它；`isPathWritable` 不再有创建目录的副作用；`initDatabase` 在运行迁移前会自动备份已有数据库
  - **Windows Auto-Update Data Loss Fix**: Fixed a critical bug where upgrading from pre-0.5.0 via in-app auto-update could incorrectly resolve the data path to an empty `data/` subdirectory next to the executable, ignoring existing data in `%APPDATA%/PromptHub`; `resolveInitialUserDataPath` now only selects the install-scoped path when it already contains user data; `isPathWritable` no longer creates directories as a side effect; `initDatabase` now backs up the existing database before running migrations

### 优化 / Improvements

- ⚙️ **批量复查与设置开关**：设置页新增"立即复查已安装 Skills"，并支持自动复查已安装 Skill 与安装前自动评估的独立开关
  - **Batch Rescan and Settings Toggles**: Added "Rescan Installed Skills Now" in settings plus separate toggles for automatic installed-skill rescans and pre-install store assessment
- 🛡️ **安全报告弹窗增加评分维度区块**：Safety Report 弹窗新增三个评分维度（内容模式 / 来源可信度 / 仓库结构），每个维度显示命中 findings 数量与 hover 说明，底部附评分公式说明（`blocked 0–10 · high-risk 20–40 · warn 50–70 · safe 80–100`）；扫描按钮文字随状态动态变化（未扫描 / 扫描中 / `风险等级 - Safe` 等）
  - **Safety Report Modal: Scoring Dimensions Panel**: The Safety Report modal now shows three scoring dimensions (Content patterns / Source trust / Repository structure), each with a finding count and hover description, plus a score-formula footer (`blocked 0–10 · high-risk 20–40 · caution 50–70 · safe 80–100`); the scan button label also updates dynamically based on scan state and result level
- 🌍 **文档与多语言同步到 `v0.5.0`**：更新 CHANGELOG、README、多语言 README 与官网发布元数据，补充 Skill 安全评估相关说明
  - **Docs and Localization Synced to `v0.5.0`**: Updated the changelog, README, localized READMEs, and website release metadata with the new Skill safety assessment details

---

## [0.4.9] - 2026-04-08

### 安全加固 / Security

- 🔒 **SSRF 防护重写**：`image.ipc.ts` 的 URL 校验从简单正则升级为 DNS 解析验证 (`resolvePublicAddress`) + 被封锁主机名检测 (`isBlockedHostname`)，防止 DNS rebinding 和 IPv6 绕过
  - **SSRF Protection Rewrite**: Upgraded URL validation in `image.ipc.ts` from regex-based to DNS resolution verification (`resolvePublicAddress`) + blocked hostname detection (`isBlockedHostname`), preventing DNS rebinding and IPv6 bypass
- 🔒 **deleteAll 确认参数**：`version-handlers.ts` 的 `deleteAll` 操作新增 `confirm: true` 必填参数，防止误删全部版本历史
  - **deleteAll Confirmation Parameter**: Added required `confirm: true` parameter to `deleteAll` in `version-handlers.ts`, preventing accidental deletion of all version history
- 🔒 **URL 协议校验**：`fetchRemoteContent` 新增 `https://` / `http://` 协议白名单校验，拒绝 `file://`、`data:` 等危险协议
  - **URL Protocol Validation**: Added `https://` / `http://` protocol whitelist to `fetchRemoteContent`, rejecting dangerous protocols like `file://` and `data:`
- 🔒 **版本字段验证**：`version-handlers.ts` 新增必填字段验证，拒绝缺失 `skillId` / `content` 的请求
  - **Version Field Validation**: Added required field validation in `version-handlers.ts`, rejecting requests missing `skillId` or `content`

### 架构重构 / Architecture

- 🏗️ **skill-installer God Class 拆分**：原 2173 行单体文件拆分为 6 个子模块 (`skill-installer-internal.ts`、`skill-installer-remote.ts`、`skill-installer-repo.ts`、`skill-installer-platform.ts`、`skill-installer-export.ts`、`skill-installer-utils.ts`) + 1 个 facade barrel，保持 `SkillInstaller` 类接口完全兼容
  - **skill-installer God Class Split**: Split the original 2173-line monolithic file into 6 sub-modules + 1 facade barrel, keeping the `SkillInstaller` class interface fully backward-compatible

### 修复 / Fixed

- 🐛 **Skill 元数据编辑后描述字段复原修复**：编辑 Skill 描述后，`useEffect` 触发 `syncSkillFromRepo()` 读取磁盘旧值覆盖 DB 的 bug 已修复；现在 `SKILL_UPDATE` handler 在检测到元数据变更时会自动 `syncFrontmatterToRepo()` 写回 SKILL.md
  - **Skill Metadata Edit Revert Fix**: Fixed a bug where editing a Skill description was reverted by `useEffect` triggering `syncSkillFromRepo()` which read the stale disk value; the `SKILL_UPDATE` handler now auto-calls `syncFrontmatterToRepo()` on metadata changes
- 🐛 **数据库迁移失败仍被标记为完成修复**：迁移失败时不再将版本标记为已完成，避免后续启动跳过失败的迁移
  - **Database Migration Failure Marking Fix**: Failed migrations no longer mark the version as completed, preventing subsequent launches from skipping failed migrations
- 🐛 **Electron 窗口 render frame disposed 崩溃修复**：`emitWindowVisibility()`、fullscreen 回调和 close 事件中新增 `isDestroyed()` guard
  - **Electron Window Render Frame Disposed Crash Fix**: Added `isDestroyed()` guards in `emitWindowVisibility()`, fullscreen callbacks, and close events

### 优化 / Improvements

- 🛡️ **文件夹工具函数循环引用防护**：`buildFolderTree` 和 `getMaxDescendantDepth` 新增 `visited` Set 防止无限递归
  - **Folder Utility Circular Reference Protection**: Added `visited` Set to `buildFolderTree` and `getMaxDescendantDepth` to prevent infinite recursion
- 🛡️ **数据库 seed 竞态条件修复**：`prompt.store.ts` 的 `_seeded` flag 改为 Promise singleton，避免并发多次 seed
  - **Database Seed Race Condition Fix**: Changed `_seeded` flag in `prompt.store.ts` to a Promise singleton, preventing concurrent multiple seeds
- ⚡ **异步化文件操作**：`image.ipc.ts` 的 `fs` 调用改为 `fs/promises`，`skill/shared.ts` 的 `statSync` 改为异步 `stat`
  - **Async File Operations**: Converted `fs` calls in `image.ipc.ts` to `fs/promises`, and `statSync` in `skill/shared.ts` to async `stat`
- 🧹 **代码质量清理**：消除 `as any` 类型（`PragmaColumnInfo` 接口）、`substr` → `substring` 废弃 API 替换、空 catch 补 `console.warn`、IPC 硬编码改为 `IPC_CHANNELS.*` 常量、`folder.store.ts` 乐观更新失败 rollback
  - **Code Quality Cleanup**: Eliminated `as any` types (`PragmaColumnInfo` interface), replaced deprecated `substr` with `substring`, added `console.warn` to empty catch blocks, replaced hardcoded IPC strings with `IPC_CHANNELS.*` constants, added optimistic update rollback in `folder.store.ts`
- 🤖 **AI 设置多选模型 UI**：AI 设置页面支持一次勾选多个模型批量添加，i18n 全部 7 个 locale 补齐
  - **AI Settings Multi-Select Model UI**: AI settings page now supports selecting and adding multiple models at once, with i18n for all 7 locales
- 📊 **测试覆盖**：63 文件 720 测试全绿，包含三轮白盒审计发现的安全/健壮性/性能问题的回归测试
  - **Test Coverage**: 63 files with 720 tests all passing, including regression tests for security/robustness/performance issues found in three rounds of white-box audits

---

## [0.4.8] - 2026-03-31

### 修复 / Fixed

- 🪟 **Windows 二次启动错误修复**：修复 Windows 上 PromptHub 已运行时再次点击桌面图标，虽然能唤起主窗口但第二实例仍继续执行启动流程，最终报 `loading file .../app.asar/out/renderer/index.html` 失败的问题
  - **Windows Relauch Error Fix**: Fixed the Windows case where launching PromptHub again while it was already running still let the second instance continue bootstrapping, causing a `loading file .../app.asar/out/renderer/index.html` startup error even though the main window was restored
- 🧭 **自定义 Skill 商店源支持本地仓库路径**：修复自定义商店源把 `git-repo` 和 `local-dir` 都错误限制为 HTTPS 地址的问题，现已支持本地 git 工作目录和 `file://` 路径
  - **Local Repository Support for Custom Skill Stores**: Fixed custom store source validation incorrectly forcing both `git-repo` and `local-dir` sources to use HTTPS URLs, and added support for local git working directories and `file://` paths
- 🔄 **本地 SKILL.md 手动修改后同步修复**：新增从本地 repo 回写 Skill 元数据的同步链路，重新打开详情页时会先同步 `SKILL.md` 的最新内容、描述、作者、版本、标签和兼容性，再刷新预览与列表摘要
  - **Local SKILL.md Resync Fix**: Added a repo-to-database sync path so reopening a Skill detail page now refreshes the latest `SKILL.md` content, description, author, version, tags, and compatibility before rendering the preview and list summary
- 🧱 **Skill 白屏容错增强**：为 Skill 详情页补上错误边界，并强化异常元数据清洗与预览渲染兜底，避免部分自定义导入 Skill 因格式脏数据直接把页面冲白
  - **Skill White Screen Hardening**: Added an error boundary around the Skill detail page and hardened malformed metadata normalization plus preview rendering fallbacks, preventing custom-imported skills with dirty metadata from blanking the whole page
- 🧼 **Skill 导入校验前移**：将本地扫描、`SKILL.md` 导入和 JSON 导入统一接入主进程清洗逻辑，在入库前就修正脏字符串、非法标签和异常类别字段
  - **Skill Import Validation Tightening**: Unified local scan, `SKILL.md` import, and JSON import behind a main-process sanitization step so dirty strings, invalid tags, and malformed category fields are cleaned before persistence
- 💾 **备份导入格式统一**：统一 `prompthub-backup`、`prompthub-export` 与旧裸 JSON 的恢复入口，修复“导出资料后无法重新导入”的问题
  - **Unified Backup Import Format**: Unified restore handling for `prompthub-backup`, `prompthub-export`, and legacy raw JSON payloads, fixing cases where exported data could not be imported back
- ☁️ **WebDAV Skill 同步修复**：修复 WebDAV 增量/旧版全量同步遗漏 Skill 数据的问题，`skills`、`skillVersions` 与 `skillFiles` 现在会一起上传并统一恢复
  - **WebDAV Skill Sync Fix**: Fixed WebDAV incremental and legacy full-sync flows dropping Skill data; `skills`, `skillVersions`, and `skillFiles` are now uploaded and restored together
- 📂 **数据目录状态与迁移表达修复**：设置页改为显示当前真实数据目录，并在迁移后明确提示“重启后切换到新目录”，避免把目标路径误显示为已生效路径
  - **Data Directory Status & Migration UX Fix**: The settings page now shows the real active data directory and explicitly marks pending migrations as “switch after restart”, avoiding confusing staged paths with active ones
- 🪟 **Windows 数据目录与升级路径修复**：修复 Windows 自定义安装目录升级时数据目录与安装目录策略不一致的问题，并持久化安装目录供升级安装器恢复
  - **Windows Data Directory & Upgrade Path Fix**: Fixed inconsistent data-directory behavior for custom Windows installs and persisted the install path so upgrade installers can recover it reliably
- ⌨️ **显示/隐藏应用快捷键修复**：修复全局与局部 `showApp` 快捷键只能唤起窗口、无法再次隐藏的问题；现在可见时会隐藏，隐藏/最小化时会恢复并聚焦
  - **Show/Hide App Shortcut Fix**: Fixed both global and local `showApp` shortcuts only bringing the window forward without hiding it again; visible windows now hide, while hidden or minimized windows restore and focus correctly

### 新功能 / Added

- 🗑️ **历史版本删除**：支持删除 Prompt 与 Skill 的单条历史快照，验证通过后可以主动清理不再需要保留的旧版本记录
  - **Version History Deletion**: Added per-entry deletion for both Prompt and Skill version history so users can clean up obsolete snapshots after validating changes
- 🌐 **skills.sh 社区商店接入**：社区商店现在会实时拉取 skills.sh 热门 Skill 榜单，并在卡片与详情中展示每周安装量、GitHub Star、商店页等信息，支持直接导入到 PromptHub
  - **skills.sh Community Store Integration**: The community store now pulls the live skills.sh leaderboard, surfaces weekly installs, GitHub stars, and store-page metadata, and supports direct import into PromptHub
- 🤖 **AI 工作台实装**：最新 AI 配置界面已接入真实模型管理、端点编辑、连接测试和场景默认模型选择，Quick Add、Prompt 测试、生图测试与翻译链路都会按场景默认模型执行
  - **AI Workbench Implementation**: The latest AI settings UI now drives real model management, endpoint editing, connectivity tests, and scenario-based default model selection for Quick Add, prompt testing, image testing, and translation

### 优化 / Improvements

- 🚀 **大规模 Skill 列表性能优化**：针对本地数百个 Skill 的场景，列表与画廊视图改为分批渲染，并将分发状态检测延后到空闲时执行，降低首次进入页面时的卡顿
  - **Large Skill Library Performance**: For libraries with hundreds of local skills, list and gallery views now render progressively in batches, while deployment status checks are deferred to idle time to reduce first-load jank
- 🧠 **列表状态缓存与视口级渲染优化**：Skill 列表平台状态增加缓存，避免分批渲染时重复查询；同时在列表行和画廊卡片启用 `content-visibility`，降低视口外内容的渲染开销
  - **Status Cache and Viewport Rendering Improvements**: Added cached platform install status for Skill lists to avoid repeated batch checks during progressive rendering, and enabled `content-visibility` on rows and gallery cards to cut offscreen rendering cost
- 🧪 **备份/同步测试矩阵补强**：补齐本地备份恢复、WebDAV 旧版/增量同步、Skill 版本文件恢复与多语言 smoke 的自动回归
  - **Backup/Sync Test Matrix Expansion**: Added automated regression coverage for local backup restore, WebDAV legacy/incremental sync, Skill version file restore, and multilingual smoke tests
- 📚 **发版文档同步到 `v0.4.8`**：更新 CHANGELOG、README 与英文 README，补齐备份、WebDAV、数据目录、性能与测试相关说明
  - **Release Docs Synced to `v0.4.8`**: Updated the changelog, README, and English README with the latest backup, WebDAV, data-directory, performance, and testing notes

---

## [0.4.7] - 2026-03-30

### 新功能 / Added

- 🖥️ **桌面版 CLI 命令**：桌面版安装后首次启动应用，会自动安装 `prompthub` 命令包装器；重新打开终端后即可直接执行 `prompthub --help`
  - **Desktop CLI Command**: The desktop app now installs the `prompthub` shell wrapper on first launch, so users can run `prompthub --help` directly after reopening their terminal
- 🤝 **平台支持扩展**：新增 Qoder、QoderWork 与 CodeBuddy 平台支持，并为 CodeBuddy 补齐亮色/暗色图标资源
  - **Platform Support Expansion**: Added Qoder, QoderWork, and CodeBuddy platform support, including dedicated light and dark CodeBuddy icons

### 修复 / Fixed

- 🌍 **Prompt 双语编辑修复**：修复中文界面下英文 Prompt 点击“添加本地语言版本”后仍然落到英文字段的问题，并修正翻译按钮在未显式设置默认模型时被错误禁用的情况
  - **Prompt Bilingual Editor Fix**: Fixed the Chinese UI flow where “Add Localized Version” still edited the English fields for English-first prompts, and corrected translation buttons being disabled when no explicit default model was set

### 优化 / Improvements

- 🗂️ **平台目标目录覆写**：新增每个平台的 Skills 目录覆写设置，扫描、分发、卸载和安装状态检测统一使用同一条解析路径
  - **Per-Platform Target Directory Overrides**: Added configurable Skills directory overrides per platform, and unified scan, deploy, uninstall, and install-status checks to use the same resolved path
- 📚 **发版文档与官网同步**：将 README、多语言 README、官网发布元数据与文档入口同步到 `v0.4.7`
  - **Release Docs & Website Sync**: Synced README, localized READMEs, website release metadata, and doc entry points to `v0.4.7`

---

## [0.4.6] - 2026-03-19

### 修复 / Fixed

- 🪟 **Skill 批量同步弹窗布局修复**：重做批量同步弹窗为更紧凑的单列流程，移除横向滚动并恢复整窗纵向滚动，避免目标平台和底部操作区被挤压
  - **Skill Batch Deploy Dialog Layout Fix**: Redesigned the bulk deploy dialog into a tighter single-column flow, removed horizontal scrolling, and restored full-dialog vertical scrolling so target platforms and footer actions stay accessible
- 🧭 **Skills 顶部工具栏布局修复**：将页面说明固定在左侧，操作工具统一收拢到右侧，修复顶部信息层级混乱的问题
  - **Skills Header Toolbar Layout Fix**: Kept page description anchored on the left and grouped actions on the right, fixing the awkward hierarchy in the Skills header

### 优化 / Improvements

- 🎯 **批量同步信息层级优化**：安装方式、目标平台、已选技能与摘要重排为更符合操作顺序的结构，批量同步流程更直观
  - **Bulk Deploy Information Hierarchy**: Reordered install mode, target platforms, selected skills, and summary into a clearer task flow for bulk deployment
- 📚 **发版文档与官网同步**：将 README、多语言 README、官网发布元数据与文档入口同步到 `v0.4.6`
  - **Release Docs & Website Sync**: Synced README, localized READMEs, website release metadata, and doc entry points to `v0.4.6`

---

## [0.4.5] - 2026-03-14

### 修复 / Fixed

- 🌐 **提示词复制语言修复** (closes #67)：修复图片/画廊视图在英文模式下复制内容仍落回中文的问题；复制弹窗与直接复制现在都会跟随当前显示语言
  - **Prompt Copy Language Fix** (closes #67): Fixed image/gallery copy using the Chinese prompt while the UI was showing English; both direct copy and variable modal now follow the visible language
- 🧩 **Skill 白屏修复** (closes #66)：修复部分旧 Skill 因标签/兼容性等元数据格式异常，点击后详情页直接白屏的问题；新增旧数据规范化与详情渲染容错
  - **Skill White Screen Fix** (closes #66): Fixed blank detail pages for legacy skills with malformed metadata such as tags/compatibility fields; added normalization for legacy data and safer detail rendering
- 🔄 **分发状态刷新修复**：修复 Skill 分发或卸载后，左侧菜单和过滤状态未及时同步，仍显示“未分发”的问题
  - **Deployment Status Refresh Fix**: Fixed sidebar/filter deployment state staying stale after install or uninstall operations and still showing skills as pending
- 📁 **本地托管目录扫描修复**：默认本地扫描现在会包含 PromptHub 自己托管的 `userData/skills` 目录，手动放入的 Skill 可被识别
  - **Managed Skill Folder Scan Fix**: Default local scan now includes PromptHub's managed `userData/skills` directory so manually added skills can be discovered
- 📸 **版本快照交互修复**：修复创建快照按钮依赖原生 `window.prompt()` 导致 Electron 环境下“点击没反应”的问题，改为应用内弹窗
  - **Snapshot Interaction Fix**: Replaced unstable native `window.prompt()` snapshot creation with an in-app modal after the button appeared unresponsive in Electron

### 优化 / Improvements

- 🚀 **Skill 批量工作流增强**：补齐批量分发与批量标签操作，选择态工具栏与分发弹窗交互更清晰
  - **Bulk Skill Workflow Improvements**: Expanded bulk distribution and bulk tagging flows with clearer selection toolbar and deploy dialog interactions
- 🔍 **导入体验优化**：本地导入预览支持搜索，标签改为可选操作，减少导入阻力
  - **Import UX Improvements**: Added search to local import preview and made tagging optional to reduce friction during import
- 🕓 **Skill 版本管理补齐**：支持版本历史预览、Diff 对比和恢复，文件编辑与 `SKILL.md` 变更会自动留快照
  - **Skill Versioning Enhancements**: Added version history preview, diff comparison, and restore flow; file edits and `SKILL.md` updates now create snapshots automatically

---

## [0.4.4] - 2026-03-08

### 修复 / Fixed

- 🍎 **macOS 更新体验修复**：macOS 绕过 Squirrel 自动更新（因无代码签名证书导致校验失败），改为直接下载 DMG 到 Downloads 文件夹，支持镜像加速与进度显示
  - **macOS Update UX Fix**: Bypassed Squirrel auto-update on macOS (code signature validation fails without Apple Developer certificate), now downloads DMG directly to Downloads folder with mirror fallback and progress display
- 🖥️ **全屏退出修复** (closes #63, #65)：修复 Windows 无边框窗口进入全屏后无法退出、macOS 通过菜单/绿色按钮进入全屏时 Escape 键无效的问题；新增全局 Escape 退出全屏监听，补齐 CreateSkillModal 缺失的全屏退出快捷键
  - **Fullscreen Exit Fix** (closes #63, #65): Fixed inability to exit fullscreen on Windows frameless windows and Escape key not working when entering fullscreen via macOS menu/green button; added global Escape-exits-fullscreen listener and missing keyboard handler in CreateSkillModal
- 🔐 **安全设置国际化修复**：修复 SecuritySettings 中 15 处硬编码中文 toast 提示，全部替换为 i18n 多语言 key
  - **Security Settings i18n Fix**: Replaced 15 hardcoded Chinese toast messages in SecuritySettings with i18n keys across all 7 locales
- 🖼️ **图片上传死循环修复**：修复 usePromptMediaManager 中因 `initialImages`/`initialVideos` 数组引用每次渲染变化导致的 `Maximum update depth exceeded` 无限循环
  - **Image Upload Infinite Loop Fix**: Fixed `Maximum update depth exceeded` in usePromptMediaManager caused by array reference changes on every render for `initialImages`/`initialVideos`

### 优化 / Improvements

- 🍺 **Homebrew 升级提示**：macOS 更新提示中新增 `brew upgrade --cask prompthub` 指引，方便 Homebrew 用户快速升级
  - **Homebrew Upgrade Guidance**: Added `brew upgrade --cask prompthub` instructions to macOS update prompt for Homebrew users
- 🌍 **更新提示多语言**：macOS 手动安装提示更新为 7 语言（zh/zh-TW/en/ja/de/es/fr），包含 DMG 安装和 Homebrew 升级两种方式
  - **Update Prompt i18n**: Updated macOS manual install instructions across all 7 locales with DMG and Homebrew upgrade paths
- 🔧 **CI/CD manifest 修正**：新增发布前 SHA512/size 校正脚本，修复 electron-builder 生成的 manifest 与实际二进制不一致的问题
  - **CI/CD Manifest Fix**: Added pre-release SHA512/size reconciliation script, fixing electron-builder manifest vs actual binary mismatch
- 🖼️ **绘图提示词 UI 优化**：`image` 类型提示词的"参考媒体"区域从折叠属性面板中提取出来，作为一级 UI 元素与 Prompt 编辑器同层展示
  - **Image Prompt UI Enhancement**: Extracted "Reference Media" section from collapsible Properties panel for `image` type prompts, displayed as a first-class UI element at the same level as the prompt editor
- 💡 **上传限制提示**：媒体上传区域新增格式与大小说明（图片 JPG/PNG/GIF/WebP，视频 MP4/WebM/MOV，单文件 ≤50MB）
  - **Upload Limit Hints**: Added format and size hints to media upload areas (Images: JPG/PNG/GIF/WebP, Videos: MP4/WebM/MOV, ≤50MB per file)

---

## [0.4.3] - 2026-03-07

### 修复 / Fixed

- 🔄 **自动更新一致性修复**：停止覆盖已发布的同版本 release/tag，修复 Windows 与 macOS 自动更新下载完成后 SHA512 校验失败的问题
  - **Auto-update Consistency Fix**: Stopped overwriting published releases/tags for the same version, fixing SHA512 mismatch errors after download on Windows and macOS
- 🍺 **Homebrew 发布修复**：Homebrew Cask 发布改为使用专用 token，并补充下载重试，解决跨仓库推送 `403` 失败
  - **Homebrew Publish Fix**: Switched Homebrew Cask publishing to a dedicated token with retry logic, fixing cross-repo `403` push failures
- 🗂️ **Skill 版本管理交互修复**：文件编辑器中的版本管理改为显式开关，切换版本历史时不再触发原生确认框，统一改为自定义未保存弹窗
  - **Skill Versioning UX Fix**: Skill file editor now uses an explicit version-management toggle and replaces native confirm dialogs with the app's custom unsaved-changes dialog
- 🌍 **Skill 多语言补齐**：修复 Skill 详情、侧边栏、平台安装区在日语/繁中/德语/西语/法语下残留英文的问题
  - **Skill i18n Completion**: Fixed remaining English strings in Skill detail, sidebar, and platform install panels for JA / ZH-TW / DE / ES / FR

### 新功能 / Added

- 🎨 **Skill 图标背景与预置图标**：支持为 Skill 图标单独设置背景色，并新增一批通用预置图标
  - **Skill Icon Backgrounds & Presets**: Added configurable icon background colors and a broader set of reusable preset icons for Skills
- 🏷️ **Skill 标签体系完善**：Skill 现支持 Prompt 同款标签交互，用户标签与导入来源标签分离，本地扫描时可直接填写导入标签
  - **Improved Skill Tag System**: Skills now support Prompt-style tag editing, with user tags separated from imported source tags and import-time tagging for local scan flows
- 🧭 **本地扫描卡片化**：本地扫描结果改为卡片式展示，便于批量筛选和导入
  - **Card-based Local Scan**: Local scan results now use a card layout for easier bulk selection and import

### 优化 / Improvements

- 📚 **README 与多语言文档同步**：主 README 及多语言 README 更新到 `v0.4.3`，并补充 Homebrew 升级说明与 Skill 相关截图
  - **README Sync**: Updated the main README and localized READMEs to `v0.4.3`, adding Homebrew upgrade guidance and Skill-related screenshots
- 🧪 **发布前校验增强**：新增 manifest/hash/架构检查脚本，发布前验证安装包与更新元数据一致性
  - **Release Verification**: Added manifest/hash/architecture verification scripts to validate installer assets and update metadata before release

---

## [0.4.2] - 2026-03-06

### 修复 / Fixed

- 🔒 **安全加固**：修复 FTS 搜索 rowid 映射、SSRF 漏洞、任意路径写入/打开风险
  - **Security Hardening**: Fixed FTS search rowid mapping, SSRF vulnerability, arbitrary path write/open risks
- 🔧 **数据库事务**：关键操作包裹事务，递归文件夹限制深度，deleteAll 原子化
  - **Database Transactions**: Wrapped critical operations in transactions, recursive folder depth limits, atomic deleteAll
- 🛡️ **IPC 输入验证**：所有 IPC 通道增加参数校验，GitHub URL 验证，移除 bypassCSP
  - **IPC Input Validation**: Added parameter validation to all IPC channels, GitHub URL validation, removed bypassCSP

### 优化 / Improvements

- 🏗️ **设置页面重构**：SettingsPage.tsx 从 ~4910 行拆分为 10 个独立标签页组件（127 行入口）
  - **Settings Refactor**: Split SettingsPage.tsx from ~4910 lines into 10 independent tab components (127-line entry)
- ✅ **MCP Schema 验证**：skill-installer.ts 增加运行时 MCP 配置验证
  - **MCP Schema Validation**: Added runtime MCP config schema validation in skill-installer.ts
- ⚡ **性能优化**：AISettings 组件 5x useMemo + 3x useCallback 优化
  - **Performance Optimization**: AISettings component optimized with 5x useMemo + 3x useCallback
- 🌐 **网站技能描述**：首页特性卡片从 6 扩展到 9，新增技能商店、多平台安装、本地扫描
  - **Website Skill Descriptions**: Expanded feature grid from 6 to 9 cards, added Skill Store, Multi-Platform Install, Local Scan
- 📄 **文档补充**：features.md 新增完整技能管理章节（商店、安装、扫描、翻译）
  - **Documentation**: Added complete Skill Management section to features.md (store, install, scan, translation)

---

## [0.4.1] - 2026-02-27

### 修复 / Fixed

- 🔧 **WASM SQLite 迁移**：从 better-sqlite3 迁移到 node-sqlite3-wasm (纯 WASM)，彻底解决 Windows x64/arm64 启动报错 "not a valid Win32 application" 的问题 (closes #55, #56)
  - **WASM SQLite Migration**: Replaced better-sqlite3 (native .node) with node-sqlite3-wasm (pure WASM), fixing "not a valid Win32 application" errors on Windows x64/arm64 (closes #55, #56)
- 🔧 **数据库初始化修复**：拆分 Schema 为表创建和索引创建两阶段，修复旧数据库升级时 "no such column: is_pinned" 错误
  - **Database Init Fix**: Split schema into table creation and index creation phases, fixing "no such column: is_pinned" error on existing databases
- 🔧 **CI/CD 简化**：移除 electron-rebuild 和原生模块架构验证步骤，所有平台构建流程统一
  - **CI/CD Simplification**: Removed electron-rebuild and native module architecture verification steps, unified build pipeline across all platforms

---

## [0.4.0] - 2026-02-12

### 新功能 / Added

- 🧩 **Skill 技能商店**：内建 20+ 精选 AI 代理技能，来自 Anthropic、OpenAI 等官方源
  - **Skill Store**: Built-in store with 20+ curated AI agent skills from Anthropic, OpenAI and more
- 🚀 **多平台一键安装**：支持将 SKILL.md 安装到 Claude Code、Cursor、Windsurf、Codex、Kiro、Gemini CLI 等 12+ 平台
  - **Multi-Platform Install**: One-click install SKILL.md to Claude Code, Cursor, Windsurf, Codex, Kiro, Gemini CLI and 12+ platforms
- 🔍 **本地扫描预览**：自动发现本地已有 SKILL.md，支持预览选擇后批量导入
  - **Local Scan Preview**: Auto-discover local SKILL.md files, preview and batch import
- 🔗 **Symlink/复制模式**：支持软链接同步编辑或独立复制到各平台
  - **Symlink/Copy Mode**: Symbolic link for synced editing or independent copy to each platform
- 🌐 **AI 技能翻译**：支持沉浸式翻译和全文翻译技能内容
  - **AI Skill Translation**: Immersive and full-text translation modes for skill content
- 🏷️ **技能标签筛选**：侧边栏标签快速过滤技能
  - **Skill Tag Filtering**: Sidebar tags for quick skill filtering
- 📦 **清晰的工作流**：「添加到库」→ 自动弹出「安装到平台」选择弹窗
  - **Clear Workflow**: "Add to Library" → auto-popup "Install to Platform" dialog

### 优化 / Improvements

- 🎨 **术语统一**：平台操作统一使用「安装」术语，更直观
  - **Terminology**: Unified platform operations to use "Install" terminology
- 🧩 **标签过滤优化**：自动过滤系统生成的无意义标签（local、discovered、平台 ID 等）
  - **Tag Filter Polish**: Auto-filter system-generated tags (local, discovered, platform IDs)

---

## [0.3.9] - 2026-01-24

### 新功能 / Added

- ⌨️ **局部快捷键模式**：新增局部快捷键支持，可在设置中为每个快捷键独立选择"全局"或"局部"模式，局部模式仅在应用窗口激活时生效，避免与其他应用冲突
  - **Local Shortcut Mode**: Added per-shortcut mode selection (Global/Local) in settings. Local shortcuts only work when the app window is focused, avoiding conflicts with other applications
- 📤 **分享为 JSON**：新增"分享为 JSON"功能，支持将 Prompt 序列化为 JSON 并复制到剪贴板，方便分享和迁移
  - **Share as JSON**: Added "Share as JSON" feature to serialize prompts for easy sharing and migration
- 📥 **剪贴板智能导入增强**：剪贴板导入现在打开完整的编辑窗口而非简单预览，支持导入前修改所有字段
  - **Enhanced Clipboard Import**: Clipboard import now opens the full editor instead of a preview modal, allowing field modifications before saving

### 优化 / Improvements

- 🎨 **右键菜单增强**：在列表、表格、看板视图的右键菜单中新增"分享为 JSON"选项
  - **Context Menu Enhancement**: Added "Share as JSON" option to context menus across all view modes
- ✨ **详情页分享按钮**：在 Prompt 详情页头部新增分享按钮，点击即可快速分享
  - **Detail View Share Button**: Added a share button in the prompt detail header for quick access
- 🔄 **防重复导入**：分享后会设置标记，防止立即将自己分享的内容再次导入
  - **Prevent Self-Import**: Shared content is marked to prevent immediate re-import of your own prompts

---

## [0.3.8] - 2026-01-15

### 新功能 / Added

- ✨ **JSON 输出支持**：AI 测试新增 JSON Mode 和 JSON Schema 输出格式支持，满足结构化数据生成需求
  - **Output Format Support**: Added support for JSON Mode and JSON Schema output formats in AI test, enabling structured data generation
- ⚡️ **英文模式优化**：在英文界面下自动精简 UI，隐藏不必要的"英文版"切换按钮
  - **English UI Optimization**: Automatically hides redundant "English Version" toggle buttons when using the English interface

### 修复 / Fixed

- 🐛 **WebDAV 修复**：修复同步过程中可能导致 WebDAV 用户名和密码丢失的问题
  - **WebDAV Credential Fix**: Fixed issues where WebDAV credentials could be lost during sync operations
- 🐛 **设置记忆修复**：修复窗口关闭行为设置（最小化/退出）无法持久化保存的问题
  - **Close Action Persistence**: Fixed issue where window close behavior preference (minimize/quit) was not saved
- 🐛 **API 路径修复**：修复部分非标准 API 路径在获取模型列表时报 404 的问题
  - **Model Fetch Logic**: Fixed 404 errors when fetching model lists from non-standard API endpoints
- 🌍 **国际化优化**：修复多处未翻译的文本和 fallback 逻辑
  - **i18n Polish**: Fixed various missing translations and fallback behaviors

## [0.3.7] - 2026-01-13

### 新功能 / Added

- 🛠️ **调试模式**：在"关于"页面新增开发者调试模式，开启后支持快捷键唤起控制台 (Ctrl+Shift+I)
  - **Debug Mode**: Added developer debug mode in About page with shortcut support
- 🧩 **侧边栏导航优化**：将顶部导航项整合为分段控制器，节省空间并优化视觉体验
  - **Sidebar Compact Nav**: Consolidated top navigation items into a segmented control for better space efficiency
- 📋 **看板/Bento 视图模式**：新增 Kanban 视图，支持响应式 Bento 网格布局，支持 2-4 列自由切换
  - **Kanban/Bento View**: Added a new Kanban view with responsive Bento grid layout
- 📌 **Prompt 置顶对比**：支持置顶多个 Prompt 到顶部独立区域，支持一键全部展开/收起
  - **Pinned Comparison**: Pin multiple prompts to a dedicated top section with quick "Expand/Collapse All" actions

### 优化 / Improvements

- 🍎 **macOS 全屏适配**：优化侧边栏在 macOS 全屏模式下的布局，自动隐藏红绿灯占位符
  - **macOS Fullscreen Layout**: Optimized sidebar layout in fullscreen mode by hiding traffic light placeholder
- 🎨 **UI 细节优化**：修复侧边栏按钮宽度对齐问题；修复弹窗操作按钮间距过大的问题
  - **UI Polish**: Fixed sidebar button alignment; fixed excessive button spacing in headers
- 🔗 **变量输入体验**：将变量图标从 `(x)` 替换为 `{}` (Braces)，消除视觉歧义
  - **Variable Input UX**: Replaced ambiguous `Variable` icon with `Braces`
- 📂 **属性字段归集**：将 "来源" 和 "备注" 字段逻辑归类
  - **Attribute Grouping**: Grouped "Source" and "Notes" fields for better hierarchy

### 修复 / Fixed

- 🍎 **macOS Intel 启动修复**：修复 macOS Intel 版本启动后白屏/无响应的问题，原因是 `better-sqlite3` 原生模块未针对 Electron 编译 (closes #35)
  - **macOS Intel Launch Fix**: Fixed blank screen on macOS Intel caused by `better-sqlite3` ABI mismatch with Electron
- 🚀 **自动更新修复**：禁用 NSIS 增量更新包，解决 Windows 平台更新时 SHA512 不匹配的问题
  - **Auto-update Fix**: Disabled NSIS differential packages to resolve SHA512 mismatch errors on Windows
- 🐛 **Lint 修复**：修复 GitHub Action 中的上下文访问校验警告
  - **Workflow Lint**: Fixed context access validation warnings in GitHub Actions

## [0.3.6] - 2026-01-07

### 新功能 / Added

- 🎥 **Prompt 视频预览**：支持为 Prompt 添加视频预览，适用于视频生成类 Prompt，支持 MP4/WebM/MOV 格式
  - **Prompt Video Preview**: Support generating video previews for prompts, suitable for video generation prompts (MP4/WebM/MOV)
- 📤 **视频文件支持**：支持上传、播放本地视频文件，均由本地加密存储
  - **Video File Support**: Support upload and playback of local video files, securely stored locally
- ☁️ **视频同步**：WebDAV 同步现已包含视频文件
  - **Video Sync**: WebDAV sync now includes video files

### 优化 / Improvements

- ⚡️ **Modal 动画加速**：大幅提升所有弹窗的打开/关闭速度，优化过渡体验
  - **Faster Modals**: Significantly improved modal animation speed for snappier interactions
- 🎨 **UI 一致性**：统一创建与编辑界面的按钮样式，添加保存图标
  - **UI Consistency**: Standardized button styles and icons across create/edit modals
- 🌍 **国际化完善**：补全法语、德语、西班牙语、日语、繁体中文的缺失翻译
  - **i18n Complete**: Added missing translations for FR, DE, ES, JA, and ZH-TW
- 🔄 **过渡动画优化**：优化从详情页到编辑页的切换动画，消除视觉跳动
  - **Transition Polish**: Smoother transition between detail and edit modals

### 修复 / Fixed

- 🎨 **下拉菜单 UI 优化**：修复新建下拉菜单的选中样式问题，采用悬浮圆角设计
  - **Dropdown UI Polish**: Fixed selection style in create dropdown with floating rounded design
- 🐛 **WebDAV 解析修复**：修复 manifest.json 解析错误问题，增强跨平台兼容性
  - **WebDAV Parse Fix**: Fixed manifest.json parsing error for better cross-platform compatibility
- 🐛 **更新检测修复**：修复 macOS 和 Windows ARM64 平台的更新检测逻辑
  - **Updater Fix**: Fixed update detection logic for macOS and Windows ARM64

---

## [0.3.5] - 2026-01-05

### 新功能 / Added

- 🚀 **新建按钮优化**：采用 Split Button 设计，支持持久化记忆上一次使用的新建模式（手动或快速录入），提升操作效率
  - **New Button Redesign**: Split button with persistent memory for preferred mode (Manual/Quick Add)
- 🤖 **快速录入 AI 标签识别**：快速录入时 AI 会从现有标签库中智能识别并提取匹配标签，保持数据一致性
  - **AI Tag Recognition**: Quick add mode now automatically identifies and matches existing tags using AI
- 📂 **智能文件夹分类**：快速录入新增 “AI 智能分类” 选项，让 AI 自动推荐最合适的存储位置
  - **AI Smart Categorization**: Added "AI Smart Match" option to automatically organize prompts into folders
- 📝 **来源记录**：新增"来源"字段，可记录 Prompt 的出处（如网站、书籍等），并支持历史自动补全
  - **Source Tracking**: New "Source" field to record where prompts came from (URL, book, etc.) with autocomplete history
- ⚡ **快速添加弹窗**：新增独立的快速添加组件，支持一键粘贴 Prompt 并由 AI 自动分析生成标题、描述、标签
  - **Quick Add Modal**: New standalone component for pasting prompts with AI-powered auto-analysis

### 修复 / Fixed

- 📁 **文件夹图标渲染**：修复了新建、编辑和快速录入弹窗中文件夹图标无法正确渲染的问题
  - **Folder Icon Fix**: Corrected folder icons not rendering in modal select lists
- 🎨 **表格滑动遮挡**：修复 Prompt 列表在横向滚动时操作列重叠与透明度问题，优化视觉层级
  - **Table Scrolling Fix**: Resolved z-index and transparency issues for sticky 'Actions' column during horizontal scroll
- 🌐 **多语言缺失**：补齐了快速录入功能相关的多语言翻译键值
  - **i18n Update**: Added missing localization keys for New Button modes and Smart Categorization
- 📏 **表格列宽调整**：修复了表格视图中部分列无法拖拽调整宽度的问题
  - **Column Resize Fix**: Fixed column resize handles being blocked by adjacent columns and sticky action column

### 优化 / Changed

- ⚡ **性能优化**：优化了 TopBar 组件中的 Hook 调用，解决了因条件渲染 Hook 导致的 React 渲染报错
  - **Hook Usage Optimization**: Refactored component hooks for consistent rendering and improved stability
- 🔧 **配置持久化改进**：表格列配置现在只保存用户可自定义的属性，关键属性始终使用默认值
  - **Config Persistence Improvement**: Table column config now only persists user-customizable properties
- 🎯 **拖拽手柄优化**：增大拖拽区域、提高 z-index、优化悬停视觉反馈，使列宽调整更易用
  - **Resize Handle UX**: Larger hit area, higher z-index, better hover feedback for column resizing

---

## [0.3.4] - 2025-12-29

### 修复 / Fixed

- 🧭 **Prompt 预览恢复**：卡片模式点击即可正常选中并在右侧预览/编辑
  - **Prompt Preview Restored**: Card view selection now opens preview/editor as expected
- 🤖 **Gemini 测试连接**：修正模型名与参数兼容，避免 API 400
  - **Gemini Test Fix**: Normalized model name/params to avoid 400 errors

### 优化 / Changed

- 🚫 **列表拖拽禁用**：Prompt 列表不再可拖动，避免误操作
  - **Disable Prompt Dragging**: Removed unintended drag behavior in prompt list
- ⌨️ **快捷键提示样式统一**：与 AI 模式提示一致，视觉更统一
  - **Shortcut Tips Style**: Unified tips styling with AI mode
- 🏷️ **标签区默认高度**：默认展示 3 行标签并升级旧设置
  - **Default Tag Height**: Show ~3 rows by default with migration for older settings
- 📦 **发布流程修复**：清理多余 blockmap，修正 Windows 更新通道与 latest 文件
  - **Release Pipeline Fix**: Cleaned extra blockmap and fixed Windows update channel/metadata

---

## [0.3.3] - 2025-12-27

### 新功能 / Added

- 📂 **多层级文件夹支持**：支持文件夹多级嵌套，通过拖拽即可轻松管理复杂的目录结构 (Closes #14)
  - **Multi-level Folder Support**: Added support for multi-level folder nesting with intuitive drag-and-drop management (Closes #14)
- 🚀 **GitHub 镜像源加速**：新增多个 GitHub 加速镜像源，显著提升国内用户下载更新的速度
  - **GitHub Mirror Support**: Added multiple GitHub accelerator mirrors to significantly speed up update downloads for users in restricted regions

### 修复 / Fixed

- 🤖 **模型修复**：适配 Google Gemini API 的原生响应格式，修复无法获取模型列表的问题 (#24)
  - **Model API Fix**: Adapted to native API response format, fixing model list fetching issues (#24)
- 🎨 **文件夹交互修复**：修复鼠标移入侧边栏时所有文件夹操作按钮同时显示的 UI 问题
  - **UI Interaction Fix**: Fixed issue where all folder action buttons were displayed simultaneously on sidebar hover
- 🌐 **多语言完善**：同步并补全了日、繁中、德、法、西语中缺失的翻译键值
  - **i18n Completion**: Synchronized and completed missing translation keys for JA, ZH-TW, DE, FR, and ES

### 优化 / Changed

- 🔧 **TypeScript 类型增强**：修复多处 TS 类型错误，提升代码健壮性
  - **TS Type Enhancement**: Fixed multiple TypeScript errors for better code stability

---

## [0.3.2] - 2025-12-22

### 优化 / Changed

- 🔍 **搜索展示优化**：优化搜索结果展示逻辑，提升搜索体验
  - **Search Display Optimization**: Improved search results display logic for better user experience
- 🎨 **文件夹图标扩展**：文件夹图标选择器新增 60+ Lucide 图标，支持 Emoji/Icon 双模式切换
  - **Folder Icon Expansion**: Added 60+ Lucide icons with Emoji/Icon mode switcher
- 📂 **侧边栏布局优化**：文件夹少时标签紧跟文件夹，文件夹多时标签固定底部，滚动条隐藏
  - **Sidebar Layout Optimization**: Tags follow folders when few, fixed at bottom when many, hidden scrollbar
- 🗑️ **删除文件夹确认**：删除包含 Prompt 的文件夹时，弹出自定义确认对话框，支持仅删除文件夹或删除所有内容
  - **Folder Deletion Confirmation**: Custom dialog when deleting folders with prompts, choose to keep or delete contents
- ⚠️ **文件夹名称检测**：创建文件夹时检测重复名称，弹出确认对话框
  - **Duplicate Name Detection**: Warns when creating folders with existing names

---

## [0.3.1] - 2025-12-20

### 优化 / Changed

- 🔍 **搜索体验优化**：引入权重评分机制，优先匹配标题，大幅提升搜索准确度 (Closes #18)
  - **Search Logic Improvement**: Introduced weighted scoring system prioritizing title matches for better accuracy (Closes #18)
- 🤖 **预制供应商优化**：核对并修正所有预制 AI 供应商地址，确保默认连接通用 (Closes #19)
  - **Preset Providers Fix**: Verified and corrected all preset AI API endpoints for better connectivity (Closes #19)
- 🎨 **分类图标识别**：优化模型列表的供应商图标识别逻辑，支持识别手动添加的模型
  - **Icon Recognition**: Improved icon detection logic for manually added models in the settings list
- 📝 **API 地址提示**：在输入框增加 # 禁用自动填充的引导提示，操作更透明
  - **API URL Hint**: Added guidance for using '#' to disable auto-fill in API endpoint settings

---

## [0.3.0] - 2025-12-18

### 优化 / Changed

- 🔄 **检查更新优化**：点击检查更新都会真正发起请求，不再使用缓存
  - **Update Check Improvement**: Every manual check now forces a fresh request without caching
- ⏰ **周期性检查更新**：启用自动检查后，每小时自动检查一次新版本
  - **Periodic Update Check**: Auto-check runs every hour when enabled
- 🎨 **更新提示样式优化**：移除闪烁动画，使用主题色虚线边框，与新建按钮增加间距
  - **Update Indicator Style**: Removed pulse animation, uses theme color with dashed border
- 📐 **更新对话框增大**：对话框尺寸从 max-w-md 增大到 max-w-xl，更新日志区域更大
  - **Larger Update Dialog**: Increased dialog size for better readability
- 📝 **精确版本更新日志**：更新日志现在精确显示从当前版本到新版本区间内的所有更新内容
  - **Precise Changelog**: Release notes now show all changes between current and new version

---

## [0.2.9] - 2025-12-18

### 新功能 / Added

- 📌 **Prompt 置顶功能**：支持将重要 Prompt 置顶显示，置顶项始终排在列表最前面
  - **Prompt Pinning**: Pin important prompts to the top of the list for quick access
- ✨ **切换动画**：Prompt 列表和详情区域添加平滑过渡动画，提升视觉体验
  - **Transition Animations**: Added smooth animations when switching prompts and views

### 优化 / Changed

- 🔒 **Windows 单实例模式**：防止多开应用窗口，从托盘恢复时聚焦已有窗口
  - **Windows Single Instance**: Prevents multiple app windows; focuses existing window when restoring from tray
- 🎨 **设置页面按钮间距**：优化设置菜单按钮间距，视觉更舒适
  - **Settings Button Spacing**: Improved spacing between settings menu buttons
- 🖼️ **关于页面图标**：移除图标阴影，更简洁
  - **About Page Icon**: Removed shadow for cleaner appearance
- 📝 **排序文案简化**：将"最新优先"简化为"最新"，更自然
  - **Sort Labels**: Simplified "Newest First" to "Newest" for cleaner UI

---

## [0.2.8] - 2025-12-18

### 新功能 / Added

- 🔔 **顶栏更新提醒入口**：在搜索框右侧以轻量提示展示可用更新，点击后才打开更新对话框
  - **Top-bar Update Indicator**: Shows a subtle "update available" pill next to the search bar and opens the dialog on demand

### 优化 / Changed

- 🍎 **macOS 升级逻辑调整**：下载完成后自动打开下载目录，引导用户手动安装并提供操作步骤
  - **macOS Update Flow**: Opens the Downloads folder after downloading so users can manually install unsigned builds
- 🌐 **更新对话框补充手动下载入口**：自动更新失败时直接给出 GitHub Releases 按钮，方便用户自行下载
  - **Manual Download Button**: Update dialog now links to GitHub Releases whenever auto-update fails

### 修复 / Fixed

- 🖼️ **本地图片占位与错误处理**：新增 `LocalImage` 组件并应用于详情/主内容，避免因文件缺失导致 ERR_FILE_NOT_FOUND
  - **Local Image Fallback**: Added `LocalImage` component with graceful degradation to prevent ERR_FILE_NOT_FOUND when images are missing

---

## [0.2.7] - 2025-12-16

### 新功能 / Added

- ⌨️ **全局快捷键功能**：支持自定义快捷键唤起应用、新建 Prompt、搜索、打开设置
  - **Global Shortcuts**: Customize hotkeys for showing app, new prompt, search, and settings
- ⌨️ **快捷键冲突检测**：自动检测并提示快捷键冲突
  - **Shortcut Conflict Detection**: Automatically detect and warn about conflicting shortcuts
- ⌨️ **跨平台适配**：快捷键显示自动适配 Windows/macOS/Linux
  - **Cross-platform Support**: Shortcut display adapts to Windows/macOS/Linux
- 🎨 **生图模型扩展**：新增 Google Gemini (Nano Banana) 和 Stability AI 图像生成模型
  - **Image Models**: Added Google Gemini (Nano Banana) and Stability AI image generation models
- 💾 **未保存更改提醒**：编辑 Prompt 时关闭会提示保存、放弃或取消
  - **Unsaved Changes Dialog**: Prompt to save, discard, or cancel when closing editor

### 优化 / Changed

- 🎨 图片下载失败使用自定义 Toast 提示替代系统弹窗
  - Image download failure now uses custom Toast instead of system alert
- 🌐 完善多语言翻译（快捷键相关的中/英/日/德/法/西/繁体中文）
  - Improved i18n translations for shortcuts in all supported languages

---

## [0.2.6] - 2025-12-15

### 新功能 / Added

- 🎨 **显示设置升级**：更现代的外观 UI + 更细腻的动效，并支持自定义主题色
  - **Display Settings Upgrade**: Modern UI with smoother animations and custom theme colors
- 🧰 **数据管理升级**：选择性导出（仅导出）+ 全量备份/恢复（`.phub.gz` 压缩，包含 prompts/图片/AI 配置/系统设置）
  - **Data Management Upgrade**: Selective export + full backup/restore (`.phub.gz` compressed, includes prompts/images/AI config/settings)
- ☁️ **WebDAV 同步升级**：同步范围扩展到 AI 配置与系统设置，换设备可更接近"一模一样"
  - **WebDAV Sync Upgrade**: Extended sync scope to AI config and system settings
- ☁️ **WebDAV 增量备份**：只上传有变化的文件，大幅减少流量消耗
  - **WebDAV Incremental Backup**: Only upload changed files, significantly reducing bandwidth
- 🔐 **支持 AES-256 加密备份**（实验性）
  - **AES-256 Encrypted Backup** (experimental)

### 修复 / Fixed

- 🐛 修复语言设置被错误重置为"仅中/英"导致多语言不生效的问题
  - Fixed language settings being incorrectly reset causing i18n issues
- 🐛 修复开启"流式输出 / 思考模式"后 AI 测试无表现差异的问题
  - Fixed AI test not showing streaming/thinking mode differences
- 🐛 修复多模型对比在卡片视图下未传入流式回调导致不流式的问题
  - Fixed multi-model compare not streaming in card view
- 🐛 修复变量检测正则状态问题导致 `systemPrompt` 变量未被识别
  - Fixed variable detection regex issue causing systemPrompt variables not recognized
- 🐛 修复 Windows 关闭窗口弹窗只显示一次的问题
  - Fixed Windows close dialog only showing once
- 🐛 修复部分页面缺少 React Hooks 导入导致的运行时报错/白屏问题
  - Fixed runtime errors/white screen due to missing React Hooks imports
- 🐛 修复右键菜单"取消收藏"多语言翻译缺失问题
  - Fixed missing i18n for "Unfavorite" in context menu
- 🐛 修复右键菜单点击"AI 测试"后黑屏问题
  - Fixed black screen after clicking "AI Test" in context menu
- 🐛 修复右键菜单"查看详情"翻译键名错误问题
  - Fixed wrong translation key for "View Details" in context menu
- 🐛 修复 WebDAV 同步失败问题 (#11)
  - Fixed WebDAV sync failure (#11)

### 优化 / Changed

- 🎨 Windows 关闭窗口弹窗的"记住偏好"勾选框改为自定义样式并适配暗黑模式
  - Custom styled "Remember choice" checkbox with dark mode support
- 📝 补齐多语言 README（en/de/fr/es/ja/zh-TW）内容结构与关键信息
  - Completed multi-language README (en/de/fr/es/ja/zh-TW)
- ☁️ 修复 WebDAV 在开发模式下的 CORS 问题（通过主进程 IPC 绕过）
  - Fixed WebDAV CORS issue in dev mode (bypassed via main process IPC)
- ☁️ 优化 WebDAV 上传兼容性（添加 Content-Length 头以支持坚果云等服务）
  - Improved WebDAV upload compatibility (added Content-Length header)
- 🎨 WebDAV 测试连接按钮添加旋转加载动画
  - Added spinning animation to WebDAV test connection button

---

## [0.2.5] - 2025-12-12

### 新功能 / Added

- 🌐 **添加多语言支持**（简体中文、繁体中文、英文、日语、西班牙语、德语、法语）
  - **Multi-language Support** (Simplified Chinese, Traditional Chinese, English, Japanese, Spanish, German, French)
- 🪟 **Windows 关闭窗口时可选择最小化到托盘或退出**（支持记住选择）
  - **Windows Close Action**: Choose minimize to tray or exit (with remember option)
- 💬 **关于页面添加问题反馈 Issue 按钮**
  - **About Page**: Added issue feedback button
- 🌍 **初始化数据根据用户语言自动选择对应语言版本**
  - **Auto Language Detection**: Initialize data based on user language
- 📥 **README 添加快速下载表格**，支持 Windows/macOS/Linux 各架构一键下载
  - **README Download Table**: Quick download for Windows/macOS/Linux
- 🔔 **优化软件更新功能**，支持 Markdown 渲染 Release Notes
  - **Update Feature**: Markdown rendering for Release Notes
- 🚀 **启动时自动检查更新**（可在设置中关闭）
  - **Auto Update Check**: Check for updates on startup (can be disabled)

### 优化 / Changed

- 🎨 双语对照提示文案优化，不再硬编码"中英"
  - Improved bilingual prompt text, no longer hardcoded "Chinese/English"

### 修复 / Fixed

- ☁️ 修复坚果云 WebDAV 同步失败问题（添加 MKCOL 目录创建和 User-Agent 头）
  - Fixed Nutstore WebDAV sync failure (added MKCOL and User-Agent header)

---

## [0.2.4] - 2025-12-10

### 新功能 / Added

- 🌐 **支持双语提示词**（中英文版本），详情页可切换显示
  - **Bilingual Prompts**: Support Chinese/English versions with toggle in detail view
- 📋 **复制和 AI 测试操作会根据当前语言模式使用对应版本**
  - **Language-aware Copy/Test**: Use corresponding version based on current language mode

### 优化 / Changed

- 🎨 优化视图切换动画，添加平滑淡入淡出效果 (Closes #13)
  - Improved view switch animation with smooth fade effect (Closes #13)
- 🎨 视图切换按钮添加滑动指示器动画
  - Added sliding indicator animation to view switch buttons

---

## [0.2.3] - 2025-12-10

### 修复 / Fixed

- 🐛 修复 Windows 删除 Prompt 后输入框无法输入的问题（原生 confirm 对话框焦点丢失）
  - Fixed Windows input focus lost after deleting Prompt (native confirm dialog issue)
- 🐛 修复 Windows 托盘图标显示为透明的问题
  - Fixed Windows tray icon showing as transparent
- 🐛 修复打包后关于页面图标不显示的问题
  - Fixed About page icon not showing after packaging
- 🐛 修复自动更新模块加载失败的问题（改为静态导入）
  - Fixed auto-update module loading failure (changed to static import)
- 🐛 修复新建 Prompt 时选择文件夹后保存丢失的问题
  - Fixed folder selection lost when creating new Prompt
- 🐛 修复 CI/CD 构建失败问题（EEXIST: file already exists）
  - Fixed CI/CD build failure (EEXIST: file already exists)

### 优化 / Changed

- 🎨 使用自定义确认对话框替代原生 confirm，提升 Windows 兼容性
  - Custom confirm dialog replacing native confirm for better Windows compatibility
- 🎨 优化托盘图标加载逻辑，添加备用路径
  - Improved tray icon loading with fallback paths
- 🎨 新建 Prompt 时默认选择当前所在文件夹
  - Default to current folder when creating new Prompt
- 🌐 修复"上传"按钮多语言适配
  - Fixed "Upload" button i18n

---

## [0.2.2] - 2025-12-08

### 修复 / Fixed

- 🐛 修复关于页面版本号硬编码问题（现在动态获取）
  - Fixed hardcoded version in About page (now dynamically fetched)
- 🐛 修复关于页面图标显示异常
  - Fixed About page icon display issue
- 🐛 修复检查更新功能失效（`cannot set properties of undefined`）
  - Fixed update check failure (`cannot set properties of undefined`)
- 🐛 修复自动更新模块加载失败时的错误处理
  - Fixed error handling when auto-update module fails to load

### 优化 / Changed

- 🎨 更新失败时显示手动下载链接
  - Show manual download link when update fails
- 🔒 清除数据现在需要输入主密码验证（高危操作保护）
  - Clear data now requires master password verification (high-risk operation protection)

---

## [0.2.1] - 2025-12-07

### 新功能 / Added

- ✨ **Markdown 全场景预览**：列表视图、详情弹窗、编辑弹窗均支持 Markdown 渲染与代码高亮
  - **Full Markdown Preview**: List view, detail modal, edit modal all support Markdown rendering with code highlighting
- ✨ **主密码与安全设置**：支持设置应用级主密码，锁定/解锁状态管理
  - **Master Password & Security**: App-level master password with lock/unlock management
- ✨ **私密文件夹（Beta）**：支持将文件夹设为私密，需主密码解锁后方可操作
  - **Private Folders (Beta)**: Set folders as private, requires master password to access
- ✨ **编辑体验优化**：编辑弹窗支持"编辑/预览"模式切换，支持全屏/宽屏模式
  - **Enhanced Editing**: Edit/Preview mode toggle, fullscreen/widescreen support
- ✨ **标签排序**：标签列表自动按字母/拼音排序
  - **Tag Sorting**: Tags auto-sorted alphabetically/by pinyin
- ✨ **图片上传与预览**：支持上传/粘贴本地图片，并在弹窗内预览
  - **Image Upload & Preview**: Upload/paste local images with in-modal preview

### 优化 / Changed

- 🔧 **Qwen/通义千问兼容**：修复非流式调用时的 `enable_thinking` 参数报错问题
  - **Qwen Compatibility**: Fixed `enable_thinking` parameter error in non-streaming calls
- 🔧 **UI 细节**：修复编辑弹窗全屏遮挡左上角按钮的问题
  - **UI Fix**: Fixed fullscreen modal covering top-left buttons
- 🔧 **性能优化**：优化 Markdown 渲染性能与依赖配置
  - **Performance**: Optimized Markdown rendering performance

---

## [0.2.0] - 2025-12-03

### 新功能 / Added

- ✨ **列表视图模式**：表格式展示所有 Prompt，支持横向滚动和分页
  - **List View Mode**: Table display for all Prompts with horizontal scroll and pagination
- ✨ **批量操作**：支持多选后批量收藏、移动到文件夹、删除
  - **Batch Operations**: Multi-select for batch favorite, move to folder, delete
- ✨ **AI 测试结果持久化**：每个 Prompt 保留最后一次测试结果
  - **AI Test Persistence**: Each Prompt keeps last test result
- ✨ **排序功能**：支持按时间、标题、使用次数排序
  - **Sorting**: Sort by time, title, usage count
- ✨ **视图切换**：卡片视图/列表视图一键切换
  - **View Toggle**: One-click switch between card/list view
- ✨ **详情弹窗显示 AI 响应**
  - **Detail Modal**: Shows AI response

### 优化 / Changed

- 🎨 全新列表视图 UI（圆角设计、美观的多选框、悬浮提示）
  - New list view UI (rounded design, beautiful checkboxes, hover tips)
- 🎨 分离单模型/多模型测试的 loading 状态
  - Separated single/multi-model test loading states
- 🎨 AI 测试弹窗支持变量填充
  - AI test modal supports variable filling

---

## [0.1.9] - 2025-12-01

### 新功能 / Added

- ✨ **AI 模型分类图标**：使用本地 SVG/PNG 资源，展示真实提供商 Logo
  - **AI Model Icons**: Local SVG/PNG resources showing real provider logos
- ✨ **Prompt 版本历史弹窗国际化** & 加宽展示，阅读体验更好
  - **Version History i18n**: Internationalized and widened for better reading

### 优化 / Changed

- 🔧 修复 Linux 打包缺少 author.email 导致构建失败
  - Fixed Linux build failure due to missing author.email
- 🔧 完整支持 macOS / Windows 自动更新增量包（dmg/zip/exe + blockmap）
  - Full support for macOS/Windows auto-update delta packages
- 🔧 更新弹窗支持纯文本 Release Notes、错误信息自动换行
  - Update modal supports plain text Release Notes with auto line wrap
- 🔧 修复检查更新弹窗每次打开都会重新请求的问题
  - Fixed update check modal re-requesting on every open

---

## [0.1.8] - 2025-12-01

### 新功能 / Added

- ✨ **最小化到系统托盘功能**（Windows/macOS/Linux）
  - **Minimize to System Tray** (Windows/macOS/Linux)
- ✨ **数据目录路径可点击打开**
  - **Clickable Data Directory Path**
- ✨ **编辑器支持行号显示**
  - **Editor Line Numbers**
- ✨ **新增 Linux 平台支持**（AppImage/deb）
  - **Linux Support** (AppImage/deb)
- ✨ **AI 模型动态获取**（从供应商 API 获取可用模型列表）
  - **Dynamic AI Model Fetching** (from provider API)
- ✨ **模型选择弹窗**（支持搜索、分类、批量添加）
  - **Model Selection Modal** (search, categorize, batch add)
- ✨ **多模型测试**

一键对比国内外主流大语言模型的回复质量，快速找到最佳 Prompt。

- **Multi-Model Testing**

Compare mainstream LLMs side-by-side to identify the best prompt for your needs.

- ✨ **模型分类图标**（每个类别显示对应的 SVG 图标）
  - **Category Icons** (SVG icon for each category)
- ✨ **API URL 智能预览**（自动补全 /v1/chat/completions）
  - **Smart API URL Preview** (auto-complete /v1/chat/completions)
- ✨ **已添加模型按供应商分组折叠显示**
  - **Collapsible Model Groups by Provider**

### 优化 / Changed

- 🎨 变量输入框支持自动变高（多行文本输入更友好）
  - Variable input auto-height for multi-line text
- 🎨 优化 macOS 托盘图标显示
  - Improved macOS tray icon display
- 🎨 AI 测试状态按 Prompt 独立管理（切换 Prompt 不影响测试）
  - AI test state managed per Prompt
- 🎨 测试结果持久化（切换 Prompt 后结果保留）
  - Test results persist when switching Prompts
- 🔧 检查更新支持多次点击
  - Update check supports multiple clicks
- 🔧 修复通知功能图标路径问题
  - Fixed notification icon path issue

---

## [0.1.7] - 2025-11-30

### 新功能 / Added

- ✨ **AI 测试支持变量填充**（与复制功能一致的体验）
  - **AI Test Variable Filling** (same experience as copy)
- ✨ **多模型对比支持变量填充**
  - **Multi-Model Compare Variable Filling**

### 优化 / Changed

- 🎨 深色模式主题色增强（提高饱和度和可见度）
  - Enhanced dark mode theme colors (increased saturation and visibility)
- 🎨 优化开关按钮深色模式样式（添加边框和更好的对比度）
  - Improved toggle button dark mode style (border and better contrast)
- 🎨 AI 测试按钮改用主题色
  - AI test button uses theme color
- 🎨 关于页面图标美化
  - Beautified About page icon
- 🔧 移除语言设置的"立即刷新"按钮（语言切换已即时生效）
  - Removed "Refresh Now" button (language switch takes effect immediately)

---

## [0.1.6] - 2025-11-30

### 优化 / Changed

- 🔧 修复自动更新元数据文件缺失问题（CI 上传 latest-mac.yml）
  - Fixed missing auto-update metadata file (CI uploads latest-mac.yml)
- 🔧 优化 Release 说明格式
  - Improved Release notes format

---

## [0.1.5] - 2025-11-30

### 新功能 / Added

- ✨ **变量填充界面**（复制时自动检测变量，弹出填充界面）
  - **Variable Filling UI** (auto-detect variables when copying, show filling dialog)

### 优化 / Changed

- 🎨 文件夹选择下拉框改用自定义样式组件
  - Custom styled folder selection dropdown
- 🎨 编辑/新建 Prompt 弹窗加宽
  - Widened Edit/Create Prompt modal
- 🔧 修复版本对比问题（当前版本加入版本列表）
  - Fixed version compare (current version added to version list)
- 🔧 生产环境禁止打开开发者工具
  - Disabled DevTools in production

---

## [0.1.4] - 2025-11-30

### 新功能 / Added

- ✨ **多模型配置管理**（支持添加无限数量的 AI 模型）
  - **Multi-Model Config** (support unlimited AI models)
- ✨ **多模型对比改为选择模式**（从已配置模型中选择）
  - **Multi-Model Compare Selection Mode** (select from configured models)
- ✨ **自定义下拉选择框组件**（优化原生样式）
  - **Custom Dropdown Component** (improved native style)
- ✨ **全面国际化支持**（主页、编辑器、弹窗等全部适配多语言）
  - **Full i18n Support** (home, editor, modals all internationalized)
- ✨ **应用内自动更新**（检查、下载、安装一体化）
  - **In-App Auto Update** (check, download, install integrated)

### 优化 / Changed

- 🎨 Prompt 卡片压缩（移除时间和版本显示）
  - Compressed Prompt cards (removed time and version display)
- 🎨 多模型对比按钮移至右侧
  - Moved multi-model compare button to right
- 🎨 优化 README 文档和截图展示
  - Improved README documentation and screenshots
- 🔧 修复 MAC 顶部区域无法拖动窗口问题（整个顶部栏可拖动）
  - Fixed MAC top area window drag issue (entire top bar draggable)
- 🔧 修复语言设置显示不同步问题
  - Fixed language settings display sync issue
- 🔧 修复切换 Prompt 时对比结果残留问题
  - Fixed compare results persisting when switching Prompts
- 🔧 移除 macOS zip 构建包，只保留 dmg
  - Removed macOS zip build, keeping only dmg

---

## [0.1.3] - 2025-11-29

### 新功能 / Added

- ✨ **AI 模型配置**（支持 18+ 国内外服务商）
  - **AI Model Config** (supports 18+ domestic and international providers)
- ✨ **AI 连接测试功能**（异步测试，显示响应时间）
  - **AI Connection Test** (async test with response time display)
- ✨ **AI 模型对比测试**（并行测试多个模型效果）
  - **AI Model Compare Test** (parallel test multiple models)
- ✨ **图像生成模型支持**（DALL-E 3 等）
  - **Image Generation Model Support** (DALL-E 3 etc.)
- ✨ **完整的多语言支持**（设置页面全面国际化）
  - **Full i18n Support** (settings page fully internationalized)
- ✨ **Git 风格版本对比**（行级差异、添加/删除统计）
  - **Git-style Version Compare** (line-level diff, add/delete stats)

### 优化 / Changed

- 🎨 优化设置页面 UI
  - Improved settings page UI
- 🔧 移除 Prompt 卡片拖拽（修复点击问题）
  - Removed Prompt card drag (fixed click issue)

---

## [0.1.2] - 2025-11-29

### 新功能 / Added

- ✨ **WebDAV 同步功能**（上传/下载数据到远程服务器）
  - **WebDAV Sync** (upload/download data to remote server)
- ✨ **文件夹拖拽排序**
  - **Folder Drag Sort**
- ✨ **Prompt 拖拽到文件夹**
  - **Drag Prompt to Folder**
- ✨ **新建 Prompt 时可选择文件夹**
  - **Folder Selection When Creating Prompt**
- ✨ **版本恢复确认提示**
  - **Version Restore Confirmation**

### 优化 / Changed

- 🎨 修复深色模式下开关按钮不可见问题
  - Fixed toggle button invisible in dark mode
- 🎨 设置开关添加操作反馈提示
  - Added feedback toast for settings toggles
- 🎨 优化语言切换体验（添加刷新按钮）
  - Improved language switch experience (added refresh button)
- 🔧 开机自启动功能实现
  - Implemented auto-launch on startup

---

## [0.1.1] - 2025-11-29

### 新功能 / Added

- ✨ **文件夹创建/编辑/删除功能**
  - **Folder Create/Edit/Delete**
- ✨ **标签筛选功能**
  - **Tag Filtering**
- ✨ **检查更新功能**
  - **Check for Updates**
- ✨ **Windows 自定义标题栏**
  - **Windows Custom Title Bar**

### 优化 / Changed

- 🎨 扁平化 UI 设计
  - Flat UI design
- 🎨 移除卡片阴影和缩放效果
  - Removed card shadow and scale effects
- 🔧 WebDAV 同步配置界面
  - WebDAV sync configuration UI

---

## [0.1.0] - 2025-11-29

### 新功能 / Added

- 🎉 **首次发布** / **Initial Release**
- ✨ **Prompt CRUD 管理** / **Prompt CRUD Management**
- ✨ **文件夹和标签系统** / **Folder and Tag System**
- ✨ **收藏功能** / **Favorites**
- ✨ **版本历史** / **Version History**
- ✨ **数据导入导出** / **Data Import/Export**
- ✨ **主题定制** / **Theme Customization**
- ✨ **多语言支持** / **Multi-language Support**
